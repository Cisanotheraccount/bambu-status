import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

import { CAMERA_MOSAIC_KEYS } from "../plugin/camera-mosaic.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pluginPath = path.join(root, "plugin", "app.js");
const pluginUuid = "com.ulanzi.ulanzistudio.bambustatus";
const roles = {
  "0_0": "status",
  "1_0": "progress",
  "2_0": "eta",
  "3_0": "layers",
  "4_0": "errors",
  "0_1": "ams",
  "1_1": "ams",
  "2_1": "fans",
  "3_1": "nozzle",
  "4_1": "bed",
  "0_2": "ams",
  "1_2": "light",
  "2_2": "camera"
};

test("camera long press enters 13-tile mosaic and any Bambu tile long press exits", {
  timeout: 12_000
}, async (t) => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const messages = [];
  let socket;
  server.on("connection", (client) => {
    socket = client;
    client.on("message", (data) => messages.push(JSON.parse(data.toString("utf8"))));
  });

  const child = spawn(process.execPath, [pluginPath, "127.0.0.1", String(server.address().port), "en"], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "test" },
    stdio: "ignore"
  });

  t.after(async () => {
    if (!child.killed) child.kill("SIGTERM");
    for (const client of server.clients) client.terminate();
    await new Promise((resolve) => server.close(resolve));
  });

  await waitFor(() => socket && messages.some((message) => message.cmd === "connected"));
  socket.send(JSON.stringify({
    cmd: "didReceiveGlobalSettings",
    cmdType: "REQUEST",
    uuid: pluginUuid,
    key: "0",
    actionid: "mosaic-test",
    settings: {}
  }));

  for (const key of CAMERA_MOSAIC_KEYS) {
    sendActionEvent(socket, "add", key, roles[key]);
  }
  await waitFor(() => latestTileSvgs(messages).size === 13);

  messages.length = 0;
  sendActionEvent(socket, "keydown", "2_2", "camera");
  await waitFor(() => mosaicTileCount(messages) === 13, 3_000);
  assert.equal(mosaicBatchCount(messages), 1, "one camera frame must use one 13-tile state message");
  sendActionEvent(socket, "keyup", "2_2", "camera");
  sendActionEvent(socket, "run", "2_2", "camera");
  await delay(120);
  assert.equal(mosaicTileCount(messages), 13, "post-long-press run must not toggle the camera tile");

  messages.length = 0;
  sendActionEvent(socket, "keydown", "0_0", "status");
  await waitFor(() => latestTileSvgs(messages).size === 13 && mosaicTileCount(messages) === 0, 3_000);
  sendActionEvent(socket, "keyup", "0_0", "status");
  sendActionEvent(socket, "run", "0_0", "status");
  await delay(120);
  assert.equal(mosaicTileCount(messages), 0, "post-exit events must not reopen or preserve the mosaic");

  messages.length = 0;
  sendActionEvent(socket, "keydown", "2_2", "camera");
  await delay(80);
  sendActionEvent(socket, "keyup", "2_2", "camera");
  sendActionEvent(socket, "run", "2_2", "camera");
  await waitFor(() => latestTileSvgs(messages).get("2_2")?.includes(">OFF<"));
  assert.equal(latestTileSvgs(messages).get("2_2")?.includes(">PRESS ON<"), true);
});

function sendActionEvent(socket, cmd, key, role) {
  socket.send(JSON.stringify({
    cmd,
    cmdType: "REQUEST",
    uuid: `${pluginUuid}.${role}`,
    key,
    actionid: `mosaic-${key}`,
    param: {}
  }));
}

function latestTileSvgs(messages) {
  const latest = new Map();
  for (const message of messages) {
    if (message.cmd !== "state") continue;
    for (const state of message.param?.statelist || []) {
      if (!CAMERA_MOSAIC_KEYS.includes(state.key) || !state.data) continue;
      latest.set(state.key, Buffer.from(state.data.split(",")[1], "base64").toString("utf8"));
    }
  }
  return latest;
}

function mosaicTileCount(messages) {
  return Array.from(latestTileSvgs(messages).values())
    .filter((svg) => svg.includes('data-mode="camera-mosaic"'))
    .length;
}

function mosaicBatchCount(messages) {
  return messages.filter((message) => {
    if (message.cmd !== "state") return false;
    const states = message.param?.statelist || [];
    return states.length === 13 && states.every((state) => {
      if (!CAMERA_MOSAIC_KEYS.includes(state.key) || !state.data) return false;
      const svg = Buffer.from(state.data.split(",")[1], "base64").toString("utf8");
      return svg.includes('data-mode="camera-mosaic"');
    });
  }).length;
}

async function waitFor(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(20);
  }
  throw new Error("Timed out waiting for camera mosaic state");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
