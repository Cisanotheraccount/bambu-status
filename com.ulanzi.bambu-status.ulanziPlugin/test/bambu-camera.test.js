import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "events";

import {
  BambuCameraClient,
  buildCameraAuthPacket,
  extractCameraFrames
} from "../plugin/bambu-camera.js";

test("buildCameraAuthPacket creates the P1 camera auth packet", () => {
  const packet = buildCameraAuthPacket("fa87d82f");

  assert.equal(packet.length, 80);
  assert.equal(packet.readUInt32LE(0), 0x40);
  assert.equal(packet.readUInt32LE(4), 0x3000);
  assert.equal(packet.subarray(16, 20).toString("ascii"), "bblp");
  assert.equal(packet.subarray(48, 56).toString("ascii"), "fa87d82f");
});

test("extractCameraFrames reads JPEG frames from chunked camera data", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0xff, 0xd9]);
  const header = Buffer.alloc(16);
  header.writeUInt32LE(jpeg.length, 0);
  Buffer.from([
    0x00, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00
  ]).copy(header, 4);

  const first = extractCameraFrames(Buffer.concat([header, jpeg.subarray(0, 3)]));
  assert.equal(first.frames.length, 0);
  assert.equal(first.rest.length, 19);

  const second = extractCameraFrames(Buffer.concat([first.rest, jpeg.subarray(3)]));
  assert.equal(second.frames.length, 1);
  assert.deepEqual(second.frames[0], jpeg);
  assert.equal(second.rest.length, 0);
});

test("camera state hides stale frames while disabled", () => {
  const camera = new BambuCameraClient();
  camera.frameDataUrl = "data:image/jpeg;base64,old";
  camera.active = false;

  const state = camera.getState();
  assert.equal(state.active, false);
  assert.equal(state.frameDataUrl, "");
});

test("camera keeps one waiting socket instead of reconnecting every few seconds", async () => {
  const socket = new MockSocket();
  let connectCount = 0;
  const camera = new BambuCameraClient({
    tlsConnect: () => {
      connectCount += 1;
      return socket;
    },
    connectTimeoutMs: 100,
    busyNoticeMs: 5,
    firstFrameRecycleMs: 1_000,
    gracefulCloseMs: 5,
    reconnectDelaysMs: [5]
  });

  camera.configure({ host: "192.168.1.10", accessCode: "12345678" });
  camera.setEnabled(true);
  socket.emit("secureConnect");
  await wait(20);

  assert.equal(connectCount, 1);
  assert.equal(camera.socket, socket);
  assert.equal(camera.getState().phase, "waiting");
  assert.equal(camera.getState().error, "Camera stream busy");
  assert.equal(socket.endCalled, false);
  camera.setEnabled(false);
});

test("a stale socket close cannot clear a newer camera connection", async () => {
  const sockets = [];
  const camera = new BambuCameraClient({
    tlsConnect: () => {
      const socket = new MockSocket();
      sockets.push(socket);
      return socket;
    },
    connectTimeoutMs: 1_000,
    busyNoticeMs: 1_000,
    firstFrameRecycleMs: 2_000,
    gracefulCloseMs: 5,
    reconnectDelaysMs: [5]
  });

  camera.configure({ host: "192.168.1.10", accessCode: "12345678" });
  camera.setEnabled(true);
  const oldSocket = sockets[0];
  oldSocket.emit("secureConnect");
  camera.restart(1);
  await wait(10);

  const newSocket = sockets[1];
  assert.equal(camera.socket, newSocket);
  oldSocket.emit("close");
  assert.equal(camera.socket, newSocket);
  camera.setEnabled(false);
});

test("the first valid JPEG marks the camera stream live", () => {
  const socket = new MockSocket();
  const camera = new BambuCameraClient({
    tlsConnect: () => socket,
    connectTimeoutMs: 1_000,
    busyNoticeMs: 1_000,
    firstFrameRecycleMs: 2_000,
    stalledFrameMs: 1_000
  });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0xff, 0xd9]);
  const header = Buffer.alloc(16);
  header.writeUInt32LE(jpeg.length, 0);
  Buffer.from([
    0x00, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00
  ]).copy(header, 4);

  camera.configure({ host: "192.168.1.10", accessCode: "12345678" });
  camera.setEnabled(true);
  socket.emit("secureConnect");
  socket.emit("data", Buffer.concat([header, jpeg]));

  const state = camera.getState();
  assert.equal(state.connected, true);
  assert.equal(state.phase, "streaming");
  assert.equal(state.error, "");
  assert.equal(state.frameId, 1);
  assert.match(state.frameDataUrl, /^data:image\/jpeg;base64,/);
  camera.setEnabled(false);
});

class MockSocket extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.endCalled = false;
    this.writes = [];
  }

  setKeepAlive() {}

  write(value, callback) {
    this.writes.push(Buffer.from(value));
    callback?.();
    return true;
  }

  end() {
    this.endCalled = true;
  }

  destroy() {
    this.destroyed = true;
    this.emit("close");
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
