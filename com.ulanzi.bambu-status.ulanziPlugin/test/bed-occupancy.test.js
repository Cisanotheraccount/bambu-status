import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

import {
  BedOccupancyDetector,
  compareAgainstReferences,
  compareSamples,
  resolveHybridOccupancy
} from "../plugin/bed-occupancy.js";

test("bed comparison ignores uniform brightness changes", () => {
  const reference = makeSample(96, 54, 90);
  const current = makeSample(96, 54, 112);
  const result = compareSamples(reference, current);

  assert.equal(result.occupied, false);
  assert.equal(result.changedRatio, 0);
});

test("bed comparison detects a changed object in the bed area", () => {
  const reference = makeSample(96, 54, 90);
  const current = makeSample(96, 54, 90);
  fillRect(current, 35, 22, 30, 18, [220, 220, 220]);

  const result = compareSamples(reference, current);

  assert.equal(result.occupied, true);
  assert.equal(result.changedRatio > 0.06, true);
  assert.equal(result.avgDiff > 5.5, true);
});

test("bed comparison accepts a matching light-off empty reference", () => {
  const lightOn = makeSample(96, 54, 150);
  const lightOff = makeSample(96, 54, 28);
  const current = makeSample(96, 54, 28);
  addFixedTexture(lightOn, 12);
  addFixedTexture(lightOff, 4);
  addFixedTexture(current, 4);

  const result = compareAgainstReferences([
    { id: "light-on", path: "light-on.jpg", sample: lightOn },
    { id: "light-off", path: "light-off.jpg", sample: lightOff }
  ], current);

  assert.equal(result.occupied, false);
  assert.equal(result.matchedReference, "light-off");
  assert.equal(result.referenceResults.length, 2);
});

test("local vision clears only moderate pixel changes that resemble an empty reference", () => {
  const result = resolveHybridOccupancy({
    occupied: true,
    score: 3.33
  }, {
    emptyDistance: 0.445,
    occupiedDistance: 0.54
  });

  assert.deepEqual(result, {
    occupied: false,
    source: "vision-empty"
  });
});

test("strong pixel changes remain occupied even when vision leans empty", () => {
  const result = resolveHybridOccupancy({
    occupied: true,
    score: 7.61
  }, {
    emptyDistance: 0.508,
    occupiedDistance: 0.783
  });

  assert.deepEqual(result, {
    occupied: true,
    source: "pixel"
  });
});

test("local vision can recover a small occupied part missed by pixel comparison", () => {
  const result = resolveHybridOccupancy({
    occupied: false,
    score: 0.8
  }, {
    emptyDistance: 0.55,
    occupiedDistance: 0.31
  });

  assert.deepEqual(result, {
    occupied: true,
    source: "vision-occupied"
  });
});

test("camera cache keeps only the latest three print snapshots", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bambu-cache-test-"));
  try {
    const detector = new BedOccupancyDetector({
      baseDir: tempDir,
      latestFrameMinMs: 0,
      cameraCacheIntervalMs: 0,
      cameraCacheLimit: 3
    });
    detector.configure({
      cameraCacheEnabled: "true",
      cameraCacheInterval: "10",
      cameraCacheLimit: "3"
    });
    detector.lastLatestFrameSaveAt = -Infinity;
    detector.lastCacheFrameSaveAt = -Infinity;

    for (let frameId = 1; frameId <= 5; frameId += 1) {
      detector.lastLatestFrameSaveAt = -Infinity;
      detector.lastCacheFrameSaveAt = -Infinity;
      await detector.saveLatestCameraFrame({
        frameId,
        frameDataUrl: `data:image/jpeg;base64,${Buffer.from(`frame-${frameId}`).toString("base64")}`
      }, {
        status: "RUNNING",
        progress: 50
      });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const cacheDir = path.join(tempDir, "bambu-camera-cache");
    const images = (await fs.readdir(cacheDir)).filter((name) => name.endsWith(".jpg")).sort();
    assert.equal(images.length, 3);
    assert.equal(images.some((name) => name.includes("000001")), false);
    assert.equal(images.some((name) => name.includes("000002")), false);
    assert.equal(images.some((name) => name.includes("000005")), true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("startup detection runs once when the printer is not printing", () => {
  const detector = new BedOccupancyDetector();
  detector.state.hasReference = true;

  assert.equal(detector.shouldUseCamera({ status: "IDLE", progress: 0 }), true);
  assert.equal(detector.shouldAnalyze({ status: "IDLE", progress: 0 }), true);

  detector.startupCheckPending = false;
  assert.equal(detector.shouldUseCamera({ status: "IDLE", progress: 0 }), false);
});

test("startup detection is skipped while printing or paused", () => {
  const detector = new BedOccupancyDetector();
  detector.state.hasReference = true;

  detector.updatePrintLifecycle({ status: "RUNNING", progress: 42 });
  assert.equal(detector.startupCheckPending, false);
  assert.equal(detector.shouldUseCamera({ status: "RUNNING", progress: 42 }), false);

  const paused = new BedOccupancyDetector();
  paused.state.hasReference = true;
  paused.updatePrintLifecycle({ status: "PAUSED", progress: 42 });
  assert.equal(paused.startupCheckPending, false);
  assert.equal(paused.shouldUseCamera({ status: "PAUSED", progress: 42 }), false);
});

test("finished-print detection is armed once per completed print", () => {
  const detector = new BedOccupancyDetector();
  detector.state.hasReference = true;

  detector.updatePrintLifecycle({ status: "RUNNING", progress: 50 });
  detector.updatePrintLifecycle({ status: "FINISH", progress: 100 });
  assert.equal(detector.shouldUseCamera({ status: "FINISH", progress: 100 }), true);

  detector.monitorAfterComplete = false;
  detector.completionCheckDone = true;
  detector.updatePrintLifecycle({ status: "FINISH", progress: 100 });
  assert.equal(detector.shouldUseCamera({ status: "FINISH", progress: 100 }), false);

  detector.updatePrintLifecycle({ status: "RUNNING", progress: 10 });
  detector.updatePrintLifecycle({ status: "FINISH", progress: 100 });
  assert.equal(detector.shouldUseCamera({ status: "FINISH", progress: 100 }), true);
});

test("empty-bed reference is not auto-captured from the first camera frame", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bambu-reference-test-"));
  try {
    const detector = new BedOccupancyDetector({
      baseDir: tempDir
    });
    detector.configure({
      bedCheckEnabled: "true",
      bedCheckAutoCapture: "true"
    });
    const captured = await detector.autoCaptureIfMissing({
      frameDataUrl: `data:image/jpeg;base64,${Buffer.from("not-really-jpeg").toString("base64")}`
    }, {
      status: "IDLE",
      progress: 0
    });

    assert.equal(captured, false);
    await assert.rejects(fs.stat(path.join(tempDir, "bambu-empty-bed-reference.jpg")));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("manual empty-bed reference capture clears checking state", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bambu-reference-capture-test-"));
  try {
    const detector = new BedOccupancyDetector({
      baseDir: tempDir
    });
    detector.state.checking = true;

    await detector.captureReferenceFromCameraState({
      frameDataUrl: `data:image/jpeg;base64,${Buffer.from("not-really-jpeg").toString("base64")}`
    }, "manual-test");

    assert.equal(detector.getState().hasReference, true);
    assert.equal(detector.getState().checking, false);
    await fs.stat(path.join(tempDir, "bambu-empty-bed-reference.jpg"));
    const bankFiles = await fs.readdir(path.join(tempDir, "bambu-empty-bed-references"));
    assert.equal(bankFiles.filter((name) => name.endsWith(".jpg")).length, 1);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

function makeSample(width, height, value) {
  const pixels = new Uint8Array(width * height * 3);
  pixels.fill(value);
  return { width, height, pixels };
}

function fillRect(sample, x, y, width, height, rgb) {
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      const index = (row * sample.width + col) * 3;
      sample.pixels[index] = rgb[0];
      sample.pixels[index + 1] = rgb[1];
      sample.pixels[index + 2] = rgb[2];
    }
  }
}

function addFixedTexture(sample, amount) {
  for (let row = 0; row < sample.height; row += 1) {
    for (let col = 0; col < sample.width; col += 1) {
      const index = (row * sample.width + col) * 3;
      const offset = ((row * 17 + col * 11) % 7) * amount;
      sample.pixels[index] = Math.min(255, sample.pixels[index] + offset);
      sample.pixels[index + 1] = Math.min(255, sample.pixels[index + 1] + offset);
      sample.pixels[index + 2] = Math.min(255, sample.pixels[index + 2] + offset);
    }
  }
}
