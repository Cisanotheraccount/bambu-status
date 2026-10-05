import { promises as fs } from "fs";
import { spawn } from "child_process";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { dataDirectory } from "./platform.js";
import { samplePortableImage } from "./image-sampling.js";

const DEFAULT_BASE_DIR = path.join(dataDirectory(), "unpaired");
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REFERENCE_NAME = "bambu-empty-bed-reference.jpg";
const REFERENCE_META_NAME = "bambu-empty-bed-reference.json";
const LIGHT_OFF_REFERENCE_NAME = "bambu-empty-bed-reference-light-off.jpg";
const LIGHT_OFF_REFERENCE_META_NAME = "bambu-empty-bed-reference-light-off.json";
const REFERENCE_BANK_DIR_NAME = "bambu-empty-bed-references";
const CURRENT_NAME = "bambu-bed-check-current.jpg";
const LAST_CHECK_META_NAME = "bambu-bed-check-last.json";
const LATEST_CAMERA_NAME = "bambu-camera-latest.jpg";
const LATEST_CAMERA_META_NAME = "bambu-camera-latest.json";
const CAMERA_CACHE_DIR_NAME = "bambu-camera-cache";
const SAMPLE_WIDTH = 96;
const SAMPLE_HEIGHT = 54;
const CHECK_MIN_MS = 10_000;
const LATEST_FRAME_MIN_MS = 5_000;
const DEFAULT_CAMERA_CACHE_INTERVAL_MS = 60_000;
const DEFAULT_CAMERA_CACHE_LIMIT = 3;
const DEFAULT_REFERENCE_BANK_LIMIT = 6;
const CHANGE_THRESHOLD = 28;
const OCCUPIED_RATIO_THRESHOLD = 0.06;
const OCCUPIED_AVG_THRESHOLD = 5.5;
const OCCUPIED_COLOR = "#facc15";
const VISION_HELPER_PATH = path.resolve(MODULE_DIR, "..", "native", "bed-vision");
const VISION_CLEAR_MARGIN = 0.05;
const VISION_OCCUPIED_MARGIN = 0.05;
const VISION_CLEAR_MAX_PIXEL_SCORE = 4.5;

export class BedOccupancyDetector {
  constructor(options = {}) {
    this.baseDir = options.baseDir || DEFAULT_BASE_DIR;
    this.referencePath = options.referencePath || path.join(this.baseDir, REFERENCE_NAME);
    this.referenceMetaPath = options.referenceMetaPath || path.join(this.baseDir, REFERENCE_META_NAME);
    this.referenceBankDir = options.referenceBankDir || path.join(this.baseDir, REFERENCE_BANK_DIR_NAME);
    this.referenceBankLimit = options.referenceBankLimit || DEFAULT_REFERENCE_BANK_LIMIT;
    this.referenceVariants = options.referenceVariants || [
      { id: "light-on", path: this.referencePath, metaPath: this.referenceMetaPath },
      {
        id: "light-off",
        path: path.join(this.baseDir, LIGHT_OFF_REFERENCE_NAME),
        metaPath: path.join(this.baseDir, LIGHT_OFF_REFERENCE_META_NAME)
      }
    ];
    this.currentPath = options.currentPath || path.join(this.baseDir, CURRENT_NAME);
    this.lastCheckMetaPath = options.lastCheckMetaPath || path.join(this.baseDir, LAST_CHECK_META_NAME);
    this.latestCameraPath = options.latestCameraPath || path.join(this.baseDir, LATEST_CAMERA_NAME);
    this.latestCameraMetaPath = options.latestCameraMetaPath || path.join(this.baseDir, LATEST_CAMERA_META_NAME);
    this.cameraCacheDir = options.cameraCacheDir || path.join(this.baseDir, CAMERA_CACHE_DIR_NAME);
    this.visionHelperPath = options.visionHelperPath || VISION_HELPER_PATH;
    this.enabled = true;
    this.autoCapture = true;
    this.cameraCacheEnabled = true;
    this.cameraCacheLimit = options.cameraCacheLimit || DEFAULT_CAMERA_CACHE_LIMIT;
    this.cameraCacheIntervalMs = options.cameraCacheIntervalMs || DEFAULT_CAMERA_CACHE_INTERVAL_MS;
    this.latestFrameMinMs = options.latestFrameMinMs || LATEST_FRAME_MIN_MS;
    this.referenceSamples = new Map();
    this.lastCheckAt = 0;
    this.lastLatestFrameSaveAt = 0;
    this.lastCacheFrameSaveAt = 0;
    this.checking = false;
    this.printWasActive = false;
    this.monitorAfterComplete = false;
    this.completionCheckDone = false;
    this.startupCheckPending = true;
    this.state = {
      enabled: true,
      hasReference: false,
      occupied: false,
      checking: false,
      checkedAt: null,
      capturedAt: null,
      changedRatio: 0,
      avgDiff: 0,
      score: 0,
      matchedReference: "",
      matchedReferencePath: "",
      referenceCount: 0,
      error: "",
      color: OCCUPIED_COLOR
    };
  }

  configure(settings = {}) {
    this.enabled = settings.bedCheckEnabled !== "false";
    this.autoCapture = false;
    this.cameraCacheEnabled = settings.cameraCacheEnabled !== "false";
    this.cameraCacheIntervalMs = clampInteger(settings.cameraCacheInterval, 10, 3600, 60) * 1000;
    this.cameraCacheLimit = clampInteger(settings.cameraCacheLimit, 1, 12, DEFAULT_CAMERA_CACHE_LIMIT);
    this.state.enabled = this.enabled;
  }

  getState() {
    return {
      ...this.state,
      enabled: this.enabled,
      color: OCCUPIED_COLOR
    };
  }

  resetForPrinter(baseDir) {
    const settings = { enabled: this.enabled, cameraCacheEnabled: this.cameraCacheEnabled, cameraCacheLimit: this.cameraCacheLimit, cameraCacheIntervalMs: this.cameraCacheIntervalMs };
    Object.assign(this, new BedOccupancyDetector({ baseDir }), settings);
    this.autoCapture = false;
    this.state.enabled = this.enabled;
  }

  recordFailure(error) {
    this.state = { ...this.state, occupied: false, checking: false, checkedAt: null, error: String(error || "CHECK_FAILED") };
    return this.getState();
  }

  updatePrintLifecycle(view = {}) {
    const status = String(view.status || "").toUpperCase();
    if (isActivePrintStatus(view)) {
      this.state.checkedAt = null;
      this.state.checking = false;
      this.printWasActive = true;
      this.monitorAfterComplete = false;
      this.completionCheckDone = false;
      this.startupCheckPending = false;
      if (this.state.occupied || this.state.error) {
        this.state = {
          ...this.state,
          occupied: false,
          error: "",
          changedRatio: 0,
          avgDiff: 0,
          score: 0
        };
      }
      return;
    }

    const completed = status === "FINISH" || Number(view.progress || 0) >= 100 || (this.printWasActive && status === "IDLE");
    if (completed && !this.completionCheckDone) {
      this.monitorAfterComplete = true;
      this.printWasActive = false;
    }
  }

  shouldUseCamera(view = {}) {
    if (!this.enabled) return false;
    if (this.autoCapture && !this.state.hasReference) return true;
    return this.shouldAnalyze(view);
  }

  shouldAnalyze(view = {}) {
    if (!this.enabled || !this.state.hasReference) return false;
    const status = String(view.status || "").toUpperCase();
    if (isActivePrintStatus(view)) return false;
    if (this.startupCheckPending && isKnownNotPrintingStatus(status)) return true;
    return this.monitorAfterComplete;
  }

  async refreshReferenceState() {
    const references = await this.listReferenceStats();
    if (!references.length) {
      this.state.hasReference = false;
      this.referenceSamples.clear();
      this.state.referenceCount = 0;
      return false;
    }

    const newest = references.reduce((latest, ref) => (
      !latest || ref.mtimeMs > latest.mtimeMs ? ref : latest
    ), null);
    this.state.hasReference = true;
    this.state.capturedAt = this.state.capturedAt || newest.mtime.toISOString();
    this.state.referenceCount = references.length;
    return true;
  }

  async captureReferenceFromCameraState(cameraState = {}, reason = "manual", options = {}) {
    const frame = jpegBufferFromDataUrl(cameraState.frameDataUrl);
    if (!frame) {
      throw new Error("No camera frame available");
    }

    const variant = this.referenceVariantFor(options.referenceId || options.variant || "light-on");
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.writeFile(variant.path, frame);
    const capturedAt = new Date().toISOString();
    await fs.writeFile(variant.metaPath, `${JSON.stringify({
      capturedAt,
      reason,
      referenceId: variant.id,
      localOnly: true,
      source: "local-printer-camera",
      transport: cameraState.transport || "unknown",
      bytes: frame.length
    }, null, 2)}\n`);
    const bankReference = await this.saveReferenceBankFrame(frame, {
      capturedAt,
      reason,
      referenceId: variant.id,
      bytes: frame.length
    });

    this.referenceSamples.delete(variant.path);
    this.state = {
      ...this.state,
      hasReference: true,
      occupied: false,
      checking: false,
      checkedAt: null,
      capturedAt,
      matchedReference: variant.id,
      matchedReferencePath: variant.path,
      changedRatio: 0,
      avgDiff: 0,
      score: 0,
      error: ""
    };
    return {
      path: variant.path,
      bankPath: bankReference.path,
      referenceId: variant.id,
      capturedAt,
      bytes: frame.length
    };
  }

  async saveReferenceBankFrame(frame, metadata = {}) {
    const capturedAt = metadata.capturedAt || new Date().toISOString();
    const stamp = timestampForFile(new Date(capturedAt));
    const referenceId = safeFilePart(metadata.referenceId || "empty");
    const basename = `empty-${stamp}-${referenceId}`;
    const imagePath = path.join(this.referenceBankDir, `${basename}.jpg`);
    const metaPath = path.join(this.referenceBankDir, `${basename}.json`);

    await fs.mkdir(this.referenceBankDir, { recursive: true });
    await fs.writeFile(imagePath, frame);
    await fs.writeFile(metaPath, `${JSON.stringify({
      ...metadata,
      capturedAt,
      referenceId,
      localOnly: true,
      source: "P1S camera tcp-6000"
    }, null, 2)}\n`);
    await this.pruneReferenceBank();
    return { path: imagePath, metaPath };
  }

  async pruneReferenceBank() {
    const entries = await fs.readdir(this.referenceBankDir, { withFileTypes: true }).catch(() => []);
    const images = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".jpg")) continue;
      const imagePath = path.join(this.referenceBankDir, entry.name);
      const stat = await fs.stat(imagePath).catch(() => null);
      if (stat) images.push({ path: imagePath, mtimeMs: stat.mtimeMs });
    }

    images.sort((a, b) => b.mtimeMs - a.mtimeMs);
    await Promise.all(images.slice(this.referenceBankLimit).map(async (image) => {
      this.referenceSamples.delete(image.path);
      await fs.rm(image.path, { force: true }).catch(() => {});
      await fs.rm(image.path.replace(/\.jpg$/i, ".json"), { force: true }).catch(() => {});
    }));
  }

  async saveLatestCameraFrame(cameraState = {}, view = {}) {
    const now = Date.now();
    if (now - this.lastLatestFrameSaveAt < this.latestFrameMinMs) return false;

    const frame = jpegBufferFromDataUrl(cameraState.frameDataUrl);
    if (!frame) return false;

    this.lastLatestFrameSaveAt = now;
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.writeFile(this.latestCameraPath, frame);
    await fs.writeFile(this.latestCameraMetaPath, `${JSON.stringify({
      savedAt: new Date().toISOString(),
      localOnly: true,
      source: "local-printer-camera",
      transport: cameraState.transport || "unknown",
      frameId: cameraState.frameId || null,
      bytes: frame.length
    }, null, 2)}\n`);
    await this.saveCachedCameraFrame(frame, cameraState, view, now);
    return true;
  }

  async saveCachedCameraFrame(frame, cameraState = {}, view = {}, now = Date.now()) {
    if (!this.cameraCacheEnabled) return false;
    if (!isActivePrintStatus(view)) return false;
    if (now - this.lastCacheFrameSaveAt < this.cameraCacheIntervalMs) return false;

    this.lastCacheFrameSaveAt = now;
    await fs.mkdir(this.cameraCacheDir, { recursive: true });
    const stamp = timestampForFile(new Date(now));
    const frameId = String(cameraState.frameId || "0").padStart(6, "0");
    const basename = `camera-${stamp}-${frameId}`;
    const imagePath = path.join(this.cameraCacheDir, `${basename}.jpg`);
    const metaPath = path.join(this.cameraCacheDir, `${basename}.json`);
    await fs.writeFile(imagePath, frame);
    await fs.writeFile(metaPath, `${JSON.stringify({
      savedAt: new Date(now).toISOString(),
      localOnly: true,
      source: "P1S camera tcp-6000",
      frameId: cameraState.frameId || null,
      status: view.status || "",
      progress: view.progress ?? null,
      bytes: frame.length
    }, null, 2)}\n`);
    await this.pruneCameraCache();
    return true;
  }

  async pruneCameraCache() {
    const entries = await fs.readdir(this.cameraCacheDir, { withFileTypes: true }).catch(() => []);
    const images = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jpg")) continue;
      const imagePath = path.join(this.cameraCacheDir, entry.name);
      const stat = await fs.stat(imagePath).catch(() => null);
      if (stat) images.push({ name: entry.name, path: imagePath, mtimeMs: stat.mtimeMs });
    }

    images.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const stale = images.slice(this.cameraCacheLimit);
    await Promise.all(stale.map(async (image) => {
      await fs.rm(image.path, { force: true }).catch(() => {});
      await fs.rm(image.path.replace(/\.jpg$/i, ".json"), { force: true }).catch(() => {});
    }));
  }

  async autoCaptureIfMissing(cameraState = {}, view = {}) {
    if (!this.enabled || !this.autoCapture) return false;
    if (await this.refreshReferenceState()) return false;
    const status = String(view.status || "").toUpperCase();
    if (["RUNNING", "PREPARE"].includes(status)) return false;
    await this.captureReferenceFromCameraState(cameraState, "auto-empty-bed-reference");
    return true;
  }

  async analyzeCameraState(cameraState = {}, view = {}, options = {}) {
    const force = options.force === true;
    this.updatePrintLifecycle(view);
    if (!force && !this.shouldAnalyze(view)) return this.getState();
    if (force && !this.enabled) return this.getState();
    if (!cameraState.frameDataUrl) return this.getState();
    const startupCheck = this.startupCheckPending && isKnownNotPrintingStatus(String(view.status || "").toUpperCase());
    const completionCheck = this.monitorAfterComplete;

    const now = Date.now();
    if (this.checking || (!force && now - this.lastCheckAt < CHECK_MIN_MS)) {
      return this.getState();
    }

    this.lastCheckAt = now;
    this.checking = true;
    this.state.checking = true;

    try {
      const currentFrame = jpegBufferFromDataUrl(cameraState.frameDataUrl);
      if (!currentFrame) throw new Error("No camera frame available");
      await fs.mkdir(this.baseDir, { recursive: true });
      await fs.writeFile(this.currentPath, currentFrame);

      const current = await sampleImage(this.currentPath, {
        width: SAMPLE_WIDTH,
        height: SAMPLE_HEIGHT
      });
      const references = await this.loadReferenceSamples();
      const pixelResult = compareAgainstReferences(references, current);
      const visionResult = await this.compareWithLocalVision(
        this.currentPath,
        references.map((reference) => reference.path)
      );
      const decision = resolveHybridOccupancy(pixelResult, visionResult);
      const result = {
        ...pixelResult,
        occupied: decision.occupied,
        decisionSource: decision.source,
        vision: visionResult
      };
      await this.writeLastCheckMeta({
        checkedAt: new Date().toISOString(),
        reason: options.reason || (force ? "forced" : "automatic"),
        frameId: cameraState.frameId || null,
        occupied: result.occupied,
        changedRatio: result.changedRatio,
        avgDiff: result.avgDiff,
        score: result.score,
        roi: result.roi,
        thresholds: result.thresholds,
        matchedReference: result.matchedReference,
        referencePath: result.referencePath,
        referenceCount: references.length,
        referenceResults: result.referenceResults,
        decisionSource: result.decisionSource,
        vision: result.vision,
        currentPath: this.currentPath,
        localOnly: true
      }).catch(() => {});
      this.state = {
        ...this.state,
        hasReference: true,
        occupied: result.occupied,
        checking: false,
        checkedAt: new Date().toISOString(),
        changedRatio: result.changedRatio,
        avgDiff: result.avgDiff,
        score: result.score,
        matchedReference: result.matchedReference,
        matchedReferencePath: result.referencePath,
        referenceCount: references.length,
        decisionSource: result.decisionSource,
        error: ""
      };
    } catch (err) {
      await this.writeLastCheckMeta({
        checkedAt: new Date().toISOString(),
        reason: options.reason || (force ? "forced" : "automatic"),
        frameId: cameraState.frameId || null,
        occupied: false,
        error: err.message || "Bed check failed",
        referencePath: this.referencePath,
        referencePaths: this.referenceVariants.map((variant) => variant.path),
        currentPath: this.currentPath,
        localOnly: true
      }).catch(() => {});
      this.recordFailure(err.message || "Bed check failed");
    } finally {
      if (startupCheck) this.startupCheckPending = false;
      if (completionCheck) {
        this.monitorAfterComplete = false;
        this.completionCheckDone = true;
      }
      this.checking = false;
    }

    return this.getState();
  }

  async writeLastCheckMeta(payload) {
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.writeFile(this.lastCheckMetaPath, `${JSON.stringify(payload, null, 2)}\n`);
  }

  async listReferenceStats() {
    const references = [];
    for (const variant of this.referenceVariants) {
      const stat = await fs.stat(variant.path).catch(() => null);
      if (!stat) continue;
      references.push({
        id: variant.id,
        path: variant.path,
        metaPath: variant.metaPath,
        mtime: stat.mtime,
        mtimeMs: stat.mtimeMs
      });
    }

    const bankEntries = await fs.readdir(this.referenceBankDir, { withFileTypes: true }).catch(() => []);
    for (const entry of bankEntries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".jpg")) continue;
      const imagePath = path.join(this.referenceBankDir, entry.name);
      const stat = await fs.stat(imagePath).catch(() => null);
      if (!stat) continue;
      references.push({
        id: `bank-${path.basename(entry.name, path.extname(entry.name))}`,
        path: imagePath,
        metaPath: imagePath.replace(/\.jpg$/i, ".json"),
        mtime: stat.mtime,
        mtimeMs: stat.mtimeMs
      });
    }
    return references;
  }

  async loadReferenceSamples() {
    const references = await this.listReferenceStats();
    const samples = [];
    for (const reference of references) {
      const cached = this.referenceSamples.get(reference.path);
      if (cached && cached.mtimeMs === reference.mtimeMs) {
        samples.push({ ...reference, sample: cached.sample });
        continue;
      }

      const sample = await sampleImage(reference.path, {
        width: SAMPLE_WIDTH,
        height: SAMPLE_HEIGHT
      });
      this.referenceSamples.set(reference.path, {
        mtimeMs: reference.mtimeMs,
        sample
      });
      samples.push({ ...reference, sample });
    }

    if (!samples.length) {
      throw new Error("No empty-bed reference available");
    }

    this.state.hasReference = true;
    this.state.referenceCount = samples.length;
    return samples;
  }

  async compareWithLocalVision(currentPath, emptyReferencePaths) {
    if (process.platform !== "darwin") return null;
    const helperStat = await fs.stat(this.visionHelperPath).catch(() => null);
    if (!helperStat?.isFile()) return null;

    const occupiedReferencePaths = await this.listOccupiedReferencePaths();
    if (!occupiedReferencePaths.length) return null;

    const args = ["--current", currentPath];
    for (const referencePath of emptyReferencePaths) {
      args.push("--empty", referencePath);
    }
    for (const referencePath of occupiedReferencePaths) {
      args.push("--occupied", referencePath);
    }

    try {
      return await runJsonCommand(this.visionHelperPath, args, 10_000);
    } catch {
      return null;
    }
  }

  async listOccupiedReferencePaths() {
    const entries = await fs.readdir(this.cameraCacheDir, { withFileTypes: true }).catch(() => []);
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".jpg")) continue;
      const imagePath = path.join(this.cameraCacheDir, entry.name);
      const metaPath = imagePath.replace(/\.jpg$/i, ".json");
      const metadata = await readJsonFile(metaPath);
      if (!isActivePrintStatus(metadata || {})) continue;
      const stat = await fs.stat(imagePath).catch(() => null);
      if (stat) candidates.push({ path: imagePath, mtimeMs: stat.mtimeMs });
    }

    return candidates
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, this.cameraCacheLimit)
      .map((candidate) => candidate.path);
  }

  referenceVariantFor(id) {
    const normalized = String(id || "").trim().toLowerCase();
    return this.referenceVariants.find((variant) => variant.id === normalized) || this.referenceVariants[0];
  }
}

export async function sampleImage(imagePath, options = {}) {
  return samplePortableImage(imagePath, options);
}

export function compareSamples(reference, current, options = {}) {
  if (!reference || !current || reference.width !== current.width || reference.height !== current.height) {
    throw new Error("Image samples do not match");
  }

  const width = reference.width;
  const height = reference.height;
  const roi = options.roi || {
    x0: Math.round(width * 0.14),
    x1: Math.round(width * 0.86),
    y0: Math.round(height * 0.23),
    y1: Math.round(height * 0.88)
  };

  let count = 0;
  let deltaR = 0;
  let deltaG = 0;
  let deltaB = 0;

  forEachRoiPixel(width, height, roi, (index) => {
    deltaR += current.pixels[index] - reference.pixels[index];
    deltaG += current.pixels[index + 1] - reference.pixels[index + 1];
    deltaB += current.pixels[index + 2] - reference.pixels[index + 2];
    count += 1;
  });

  if (!count) throw new Error("Image ROI is empty");

  deltaR /= count;
  deltaG /= count;
  deltaB /= count;

  let changed = 0;
  let totalDiff = 0;
  forEachRoiPixel(width, height, roi, (index) => {
    const diff = (
      Math.abs((current.pixels[index] - reference.pixels[index]) - deltaR) +
      Math.abs((current.pixels[index + 1] - reference.pixels[index + 1]) - deltaG) +
      Math.abs((current.pixels[index + 2] - reference.pixels[index + 2]) - deltaB)
    ) / 3;
    totalDiff += diff;
    if (diff >= (options.changeThreshold || CHANGE_THRESHOLD)) {
      changed += 1;
    }
  });

  const changedRatio = changed / count;
  const avgDiff = totalDiff / count;
  const ratioThreshold = options.occupiedRatioThreshold || OCCUPIED_RATIO_THRESHOLD;
  const avgThreshold = options.occupiedAvgThreshold || OCCUPIED_AVG_THRESHOLD;
  const score = Math.max(changedRatio / ratioThreshold, avgDiff / avgThreshold);

  return {
    occupied: changedRatio >= ratioThreshold && avgDiff >= avgThreshold,
    changedRatio: round(changedRatio, 4),
    avgDiff: round(avgDiff, 2),
    score: round(score, 2),
    roi,
    thresholds: {
      change: options.changeThreshold || CHANGE_THRESHOLD,
      ratio: ratioThreshold,
      avg: avgThreshold
    }
  };
}

export function compareAgainstReferences(references, current, options = {}) {
  const list = Array.isArray(references) ? references : [];
  if (!list.length) throw new Error("No empty-bed reference available");

  const results = list.map((reference, index) => {
    const sample = reference.sample || reference;
    return {
      ...compareSamples(sample, current, options),
      matchedReference: reference.id || `reference-${index + 1}`,
      referencePath: reference.path || ""
    };
  }).sort((a, b) => a.score - b.score);

  const emptyMatch = results.find((result) => !result.occupied);
  const best = emptyMatch || results[0];

  return {
    ...best,
    occupied: !emptyMatch,
    referenceResults: results.map((result) => ({
      matchedReference: result.matchedReference,
      referencePath: result.referencePath,
      occupied: result.occupied,
      changedRatio: result.changedRatio,
      avgDiff: result.avgDiff,
      score: result.score
    }))
  };
}

export function resolveHybridOccupancy(pixelResult = {}, visionResult = null) {
  const pixelOccupied = pixelResult.occupied === true;
  const pixelScore = Number(pixelResult.score);
  const emptyDistance = Number(visionResult?.emptyDistance);
  const occupiedDistance = Number(visionResult?.occupiedDistance);
  const hasVisionDistances = Number.isFinite(emptyDistance) && Number.isFinite(occupiedDistance);

  if (!hasVisionDistances) {
    return { occupied: pixelOccupied, source: "pixel" };
  }

  if (occupiedDistance + VISION_OCCUPIED_MARGIN < emptyDistance) {
    return { occupied: true, source: "vision-occupied" };
  }

  const moderatePixelChange = pixelOccupied
    && Number.isFinite(pixelScore)
    && pixelScore <= VISION_CLEAR_MAX_PIXEL_SCORE;
  if (moderatePixelChange && emptyDistance + VISION_CLEAR_MARGIN < occupiedDistance) {
    return { occupied: false, source: "vision-empty" };
  }

  return { occupied: pixelOccupied, source: "pixel" };
}

export function decodeBmpPixels(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.toString("ascii", 0, 2) !== "BM") {
    throw new Error("Unsupported image sample");
  }

  const dataOffset = buffer.readUInt32LE(10);
  const width = buffer.readInt32LE(18);
  const rawHeight = buffer.readInt32LE(22);
  const height = Math.abs(rawHeight);
  const bpp = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);
  if (width <= 0 || height <= 0 || ![24, 32].includes(bpp) || ![0, 3].includes(compression)) {
    throw new Error("Unsupported BMP format");
  }

  const bytesPerPixel = bpp / 8;
  const stride = Math.floor((bpp * width + 31) / 32) * 4;
  const topDown = rawHeight < 0;
  const pixels = new Uint8Array(width * height * 3);

  for (let y = 0; y < height; y += 1) {
    const sourceY = topDown ? y : height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const source = dataOffset + sourceY * stride + x * bytesPerPixel;
      const target = (y * width + x) * 3;
      pixels[target] = buffer[source + 2];
      pixels[target + 1] = buffer[source + 1];
      pixels[target + 2] = buffer[source];
    }
  }

  return { width, height, pixels };
}

function forEachRoiPixel(width, height, roi, callback) {
  const x0 = Math.max(0, Math.min(width - 1, roi.x0));
  const x1 = Math.max(x0 + 1, Math.min(width, roi.x1));
  const y0 = Math.max(0, Math.min(height - 1, roi.y0));
  const y1 = Math.max(y0 + 1, Math.min(height, roi.y1));

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      callback((y * width + x) * 3);
    }
  }
}

function jpegBufferFromDataUrl(dataUrl) {
  const text = String(dataUrl || "");
  const match = text.match(/^data:image\/jpe?g;base64,(.+)$/i);
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `${command} exited with ${code}`));
      }
    });
  });
}

function runJsonCommand(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Local vision check timed out"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Local vision helper exited with ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Local vision helper returned invalid data"));
      }
    });
  });
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function isActivePrintStatus(view = {}) {
  const status = String(view.status || "").toUpperCase();
  return ["RUNNING", "PREPARE", "PAUSED"].includes(status) && Number(view.progress || 0) < 100;
}

function isKnownNotPrintingStatus(status) {
  return ["IDLE", "FINISH", "FAILED"].includes(String(status || "").toUpperCase());
}

function timestampForFile(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
    String(date.getMilliseconds()).padStart(3, "0")
  ].join("");
}

function safeFilePart(value) {
  return String(value || "empty")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "empty";
}

function clampInteger(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}
