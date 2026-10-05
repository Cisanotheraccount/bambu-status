import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { CameraAdapter, cameraTransport } from "../plugin/camera-adapter.js";

test("camera transport separates X1 RTSPS from JPEG models", () => {
  assert.equal(cameraTransport("X1 Carbon"), "rtsp");
  assert.equal(cameraTransport("P1S"), "tcp-6000");
});
test("RTSP adapter shares JPEG frames and never logs FFmpeg stderr", () => {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
  const adapter = new CameraAdapter({ spawn: () => child });
  adapter.configure({ host: "127.0.0.1", model: "X1 Carbon", accessCode: "EXAMPLE1" });
  const frames = []; adapter.on("frame", (frame) => frames.push(frame));
  adapter.setEnabled(true);
  child.stdout.write(Buffer.from([0xff, 0xd8, 1, 2, 0xff, 0xd9]));
  assert.equal(frames.length, 1); assert.equal(frames[0].connected, true); assert.equal(frames[0].transport, "rtsp");
  adapter.setEnabled(false);
  assert.equal(adapter.getState().frameDataUrl, "");
});
test("missing FFmpeg reports unavailable, not a LIVE stream", () => {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
  const adapter = new CameraAdapter({ spawn: () => child });
  adapter.configure({ host: "127.0.0.1", model: "X1", accessCode: "EXAMPLE1" }); adapter.setEnabled(true);
  child.emit("error", Object.assign(new Error("missing"), { code: "ENOENT" })); child.emit("close", 1);
  assert.equal(adapter.getState().connected, false); assert.match(adapter.getState().error, /FFmpeg required/);
  adapter.setEnabled(false);
});
