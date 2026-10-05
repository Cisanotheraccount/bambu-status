import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { dataDirectory, printerId, printerDirectory, redactDiagnostic } from "../plugin/platform.js";
import { parsePrinterAnnouncement, isLocalAddress } from "../plugin/discovery.js";
import { CredentialStore } from "../plugin/credentials.js";
import { runHelper } from "../plugin/credentials.js";
import { fileURLToPath } from "node:url";
import { PrinterProfiles, validatePrinter, probePrinter } from "../plugin/pairing.js";
import { PrintEstimate } from "../plugin/print-estimate.js";
import { isFreshCameraFrame } from "../plugin/frame-check.js";
import { decodeImage, resizeSample } from "../plugin/image-sampling.js";
import { BedOccupancyDetector } from "../plugin/bed-occupancy.js";
import { buildPrinterView, buildTilePayload } from "../plugin/state.js";

test("data paths follow each OS and allow isolated test directories", () => {
  assert.equal(dataDirectory({ platform: "darwin", home: "/test-home", env: {} }), path.join("/test-home", "Library", "Application Support", "BambuStatus"));
  assert.equal(dataDirectory({ platform: "win32", home: "/test-home", env: { LOCALAPPDATA: "/local-appdata" } }), path.join("/local-appdata", "BambuStatus"));
  assert.equal(dataDirectory({ env: { BAMBU_STATUS_DATA_DIR: "/isolated" } }), path.resolve("/isolated"));
  assert.equal(printerId("testprinter01"), printerId("TESTPRINTER01"));
  assert.notEqual(printerDirectory("TESTPRINTER01"), printerDirectory("TESTPRINTER02"));
});
test("diagnostics recursively remove private fields and image data", () => {
  const safe = redactDiagnostic({ host: "example", nested: { serial: "TESTPRINTER01", accessCode: "EXAMPLE1", password: "not-real", frameDataUrl: "data:", phase: "streaming" }, error: "host 192.0.2.1" });
  assert.deepEqual(safe.nested, { phase: "streaming" });
  assert.equal(JSON.stringify(safe).includes("EXAMPLE1"), false);
  assert.equal(safe.error, "host [address]");
});
test("discovery uses sender address, not an untrusted Location URL", () => {
  const packet = Buffer.from("NOTIFY * HTTP/1.1\r\nUSN: TESTPRINTER01\r\nLocation: http://attacker.invalid\r\nDevModel.bambu.com: C12\r\nDevName.bambu.com: Workshop\r\n\r\n");
  const printer = parsePrinterAnnouncement(packet, "127.0.0.1");
  assert.equal(printer.host, "127.0.0.1"); assert.equal(printer.model, "P1S"); assert.equal(printer.name, "Workshop");
  assert.equal(parsePrinterAnnouncement(Buffer.from("NOTIFY * HTTP/1.1\r\nUSN: unrelated"), "127.0.0.1"), null);
  assert.equal(parsePrinterAnnouncement(packet, "192.0.2.1"), null);
});
test("pairing validates local destination and credentials", () => {
  assert.equal(isLocalAddress("printer.local"), true);
  assert.equal(isLocalAddress("example.com"), false);
  assert.throws(() => validatePrinter({ host: "example.com" }), /local/);
  assert.throws(() => validatePrinter({ host: "127.0.0.1", serial: "TESTPRINTER01", accessCode: "bad" }), /eight/);
});
test("pairing requires a matching printer report, not just connection success", async () => {
  const client = new EventEmitter();
  let ended = false;
  client.end = () => { ended = true; };
  client.subscribe = (topic, callback) => callback();
  client.publish = () => setImmediate(() => client.emit("message", "device/TESTPRINTER01/report", Buffer.from('{"print":{"gcode_state":"IDLE"}}')));
  const config = await probePrinter({ host: "127.0.0.1", serial: "TESTPRINTER01", accessCode: "EXAMPLE1" }, { connect: () => { setImmediate(() => client.emit("connect")); return client; } });
  assert.equal(config.serial, "TESTPRINTER01"); assert.equal(ended, true);
});
test("printer metadata never contains the saved Access Code", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bambu-profile-test-"));
  try {
    const saved = new Map();
    const store = new PrinterProfiles({ baseDir: directory, credentials: { set: async (id, secret) => saved.set(id, secret), get: async (id) => saved.get(id) } });
    await store.save({ host: "127.0.0.1", serial: "TESTPRINTER01", accessCode: "EXAMPLE1" });
    assert.equal((await fs.readFile(store.file, "utf8")).includes("EXAMPLE1"), false);
    assert.equal((await store.load()).accessCode, "EXAMPLE1");
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test("credential helper receives secret on stdin data, not command arguments", async () => {
  const calls = [];
  const run = async (...args) => { calls.push(args); return { secret: "EXAMPLE1" }; };
  run.testDouble = true;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bambu-secret-test-"));
  try {
    const store = new CredentialStore({ baseDir: directory, platform: "darwin", run });
    await store.set(printerId("TESTPRINTER01"), "EXAMPLE1");
    assert.equal(JSON.stringify(calls[0][1]).includes("EXAMPLE1"), false);
    assert.equal(calls[0][2].secret, "EXAMPLE1");
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test("manual check requires a newer, connected, timestamped frame", () => {
  const now = Date.now();
  const request = { frameId: 10, startedAt: now - 1000 };
  const fresh = { connected: true, frameDataUrl: "data:", frameId: 11, lastFrameAt: new Date(now).toISOString() };
  assert.equal(isFreshCameraFrame(fresh, request, now), true);
  assert.equal(isFreshCameraFrame({ ...fresh, frameId: 10 }, request, now), false);
  assert.equal(isFreshCameraFrame({ ...fresh, connected: false }, request, now), false);
  assert.equal(isFreshCameraFrame({ ...fresh, lastFrameAt: new Date(now - 20000).toISOString() }, request, now), false);
});
test("JPEG and PNG decode without platform commands", () => {
  const raw = { width: 32, height: 18, data: Buffer.alloc(32 * 18 * 4, 110) };
  const jpg = jpeg.encode(raw, 80).data;
  assert.equal(resizeSample(decodeImage(jpg)).pixels.length, 96 * 54 * 3);
  const png = PNG.sync.write(raw);
  assert.equal(decodeImage(png).width, 32);
  assert.throws(() => decodeImage(Buffer.from("not an image")), /JPEG or PNG/);
});
test("detection failures and new printing invalidate a previous clear result", () => {
  const detector = new BedOccupancyDetector();
  detector.state.checkedAt = "old"; detector.state.occupied = true;
  detector.recordFailure("NO_FRESH_FRAME");
  assert.equal(detector.state.occupied, false); assert.equal(detector.state.checkedAt, null);
  detector.state.checkedAt = "old";
  detector.updatePrintLifecycle({ status: "RUNNING", progress: 5 });
  assert.equal(detector.state.checkedAt, null);
  const view = buildPrinterView({ gcode_state: "IDLE" }, { connected: true, lastMessageAt: new Date().toISOString() });
  assert.equal(buildTilePayload("status", view, {}, { bedOccupancy: detector.recordFailure("NO_FRESH_FRAME") }).text, "CHECK ERR");
});
test("AMS stable IDs survive reordering and never merge another unit by array index", () => {
  const view = buildPrinterView({ gcode_state: "IDLE", ams: { ams: [{ id: 1, tray: [{ id: 0, tray_type: "PLA" }] }, { id: 128, ams_type: "AMS HT", humidity_raw: 17, tray: [{ id: 0, tray_type: "PETG" }] }] } }, { connected: true, lastMessageAt: new Date().toISOString() });
  const selected = buildTilePayload("ams", view, {}, { amsMode: { mode: "overview", unitIndex: "id:128" } });
  assert.equal(selected.amsSlots.length, 1); assert.equal(selected.amsSlots[0].material, "PETG");
  const environment = buildTilePayload("ams", view, {}, { amsMode: { mode: "env", unitIndex: "id:128" } });
  assert.equal(environment.text, "17%");
  const missing = buildTilePayload("ams", view, {}, { amsMode: { mode: "overview", unitIndex: "id:999" } });
  assert.equal(missing.amsSlots.length, 0);
});
test("first observed ETA persists across restart with day context", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bambu-eta-test-"));
  try {
    const file = path.join(directory, "estimate.json");
    const now = new Date(2026, 9, 5, 23, 30).getTime();
    const estimate = new PrintEstimate(file);
    const view = { status: "RUNNING", progress: 10, remainingMinutes: 120, fileName: "example", totalLayers: 10 };
    estimate.observe(view, { task_id: "example-task" }, now); await estimate.write;
    assert.equal(estimate.text(now), "+1D 01:30");
    const restored = new PrintEstimate(file); await restored.load();
    restored.observe({ ...view, progress: 50, remainingMinutes: 100 }, { task_id: "example-task" }, now + 60000);
    assert.equal(restored.text(now), "+1D 01:30");
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("Windows DPAPI protects and round-trips a disposable fixture", { skip: process.platform !== "win32" }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bambu-dpapi-test-"));
  try {
    const script = fileURLToPath(new URL("../native/credentials.ps1", import.meta.url));
    const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script];
    const request = { id: printerId("DISPOSABLE-FIXTURE"), baseDir: directory };
    let diagnostic = "";
    const fixtureSpawn = (...params) => {
      const child = spawn(...params);
      child.stderr.on("data", (chunk) => { diagnostic += chunk; });
      return child;
    };
    const invoke = async (operation, secret = "") => {
      diagnostic = "";
      try { return await runHelper("powershell.exe", args, { ...request, operation, secret }, { spawn: fixtureSpawn }); }
      catch { throw new Error(`Disposable DPAPI fixture ${operation} failed: ${diagnostic}`); }
    };
    await invoke("set", "EXAMPLE1");
    const file = path.join(directory, "credentials", `${request.id}.dpapi`);
    assert.equal((await fs.readFile(file, "utf8")).includes("EXAMPLE1"), false);
    assert.equal((await invoke("get")).secret, "EXAMPLE1");
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
