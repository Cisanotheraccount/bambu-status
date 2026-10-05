import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pluginPath = path.join(root, "plugin", "app.js");
const pluginUuid = "com.ulanzi.ulanzistudio.bambustatus";
const actionUuid = `${pluginUuid}.progress`;
const instanceId = "instance-progress-1";

let server;
const port = await new Promise((resolve, reject) => {
  server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  server.once("error", reject);
  server.once("listening", () => resolve(server.address().port));
}).catch((err) => {
  if (err.code === "EPERM" || err.code === "EACCES") {
    console.log(`Skipping smoke test: local listen blocked (${err.code}).`);
    process.exit(0);
  }
  throw err;
});
const messages = [];
let child;

try {
  const stateMessage = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Plugin did not render a state message in time")), 7000);

    server.on("connection", (socket) => {
      socket.on("message", (data) => {
        const message = JSON.parse(data.toString("utf8"));
        messages.push(message);

        if (message.cmd === "connected") {
          socket.send(JSON.stringify({
            cmd: "didReceiveGlobalSettings",
            cmdType: "REQUEST",
            uuid: pluginUuid,
            key: "0",
            actionid: instanceId,
            settings: {}
          }));

          socket.send(JSON.stringify({
            cmd: "add",
            cmdType: "REQUEST",
            uuid: actionUuid,
            key: "1",
            actionid: instanceId,
            param: { showText: "true" }
          }));
        }

        if (message.cmd === "state") {
          clearTimeout(timer);
          resolve(message);
        }
      });
    });

    child = spawn(process.execPath, [pluginPath, "127.0.0.1", String(port), "en"], {
      cwd: root,
      env: { ...process.env, NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.once("exit", (code, signal) => {
      if (code !== null && code !== 0) {
        reject(new Error(`Plugin exited early with code ${code}`));
      } else if (signal && signal !== "SIGTERM") {
        reject(new Error(`Plugin exited early with signal ${signal}`));
      }
    });
  });

  assert.equal(messages.some((message) => message.cmd === "connected"), true);
  assert.equal(stateMessage.param.statelist.length, 1);

  const state = stateMessage.param.statelist[0];
  assert.equal(state.type, 1);
  assert.equal(state.textData, "");
  assert.equal(state.data.startsWith("data:image/svg+xml;base64,"), true);
  assert.equal(state.uuid, actionUuid);
  assert.equal(state.actionid, instanceId);
} finally {
  if (child && !child.killed) child.kill("SIGTERM");
  if (server) await new Promise((resolve) => server.close(resolve));
}
