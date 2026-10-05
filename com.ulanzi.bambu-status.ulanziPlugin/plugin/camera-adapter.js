import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { BambuCameraClient } from "./bambu-camera.js";

export function cameraTransport(model) {
  return /^X1/i.test(String(model || "")) ? "rtsp" : "tcp-6000";
}

export class CameraAdapter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.jpeg = options.jpeg || new BambuCameraClient();
    this.spawn = options.spawn || spawn;
    this.process = null;
    this.active = false;
    this.settings = {};
    this.retryTimer = null;
    this.watchdog = null;
    this.buffer = Buffer.alloc(0);
    this.state = { active: false, connected: false, phase: "disabled", error: "", frameId: 0, lastFrameAt: null, frameDataUrl: "", transport: "tcp-6000" };
    this.jpeg.on("frame", (state) => { if (this.transport() !== "rtsp") this.emit("frame", state); });
    this.jpeg.on("status", (state) => { if (this.transport() !== "rtsp") this.emit("status", state); });
  }
  transport() { return cameraTransport(this.settings.model); }
  configure(settings) {
    const changed = ["host", "accessCode", "model", "ffmpegPath"].some((key) => this.settings[key] !== settings[key]);
    const wasActive = this.active;
    if (changed) this.stop();
    this.settings = { ...settings };
    this.jpeg.configure(settings);
    if (changed && wasActive) this.setEnabled(true);
  }
  setEnabled(enabled) {
    this.active = Boolean(enabled);
    if (this.transport() !== "rtsp") return this.jpeg.setEnabled(this.active);
    this.jpeg.setEnabled(false);
    if (!this.active) return this.stop();
    if (!this.process && !this.retryTimer) this.startRtsp();
  }
  getState() { return this.transport() === "rtsp" ? { ...this.state, active: this.active } : this.jpeg.getState(); }
  setState(phase, error = "") {
    this.state = { ...this.state, phase, error, connected: phase === "streaming", active: this.active, transport: this.transport() };
    if (phase !== "streaming") this.state.frameDataUrl = "";
    this.emit("status", this.getState());
  }
  startRtsp() {
    if (!this.settings.host || !this.settings.accessCode) return this.setState("missing-config", "Pair printer first");
    this.buffer = Buffer.alloc(0);
    this.setState("connecting");
    const url = `rtsps://bblp:${encodeURIComponent(this.settings.accessCode)}@${this.settings.host}:322/streaming/live/1`;
    const child = this.spawn(this.settings.ffmpegPath || "ffmpeg", ["-nostdin", "-loglevel", "error", "-rtsp_transport", "tcp", "-i", url, "-an", "-vf", "fps=1,scale=1280:-2", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    this.process = child;
    let missing = false;
    child.stdout.on("data", (chunk) => {
      if (this.process !== child) return;
      this.buffer = Buffer.concat([this.buffer, chunk]);
      if (this.buffer.length > 8 * 1024 * 1024) { this.buffer = Buffer.alloc(0); return; }
      let start;
      while ((start = this.buffer.indexOf(Buffer.from([0xff, 0xd8]))) >= 0) {
        const end = this.buffer.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
        if (end < 0) { this.buffer = this.buffer.subarray(start); break; }
        const image = this.buffer.subarray(start, end + 2);
        this.buffer = this.buffer.subarray(end + 2);
        this.state = { ...this.state, frameDataUrl: `data:image/jpeg;base64,${image.toString("base64")}`, frameId: this.state.frameId + 1, lastFrameAt: new Date().toISOString(), transport: "rtsp" };
        this.setState("streaming"); this.armWatchdog(child); this.emit("frame", this.getState());
      }
    });
    child.stderr.on("data", () => {});
    child.once("error", (error) => { missing = error.code === "ENOENT"; this.setState("error", missing ? "FFmpeg required for X1 camera" : "RTSP camera unavailable"); });
    child.once("close", () => {
      if (this.process !== child) return;
      this.process = null; clearTimeout(this.watchdog);
      if (!this.active || missing) return;
      this.setState("retrying", "RTSP camera unavailable");
      this.retryTimer = setTimeout(() => { this.retryTimer = null; if (this.active) this.startRtsp(); }, 30000);
      this.retryTimer.unref?.();
    });
    this.armWatchdog(child);
  }
  armWatchdog(child) {
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => { if (this.process === child) child.kill(); }, 45000);
    this.watchdog.unref?.();
  }
  stop() {
    this.active = false; this.jpeg.setEnabled(false);
    clearTimeout(this.retryTimer); this.retryTimer = null; clearTimeout(this.watchdog);
    const child = this.process; this.process = null;
    if (child) child.kill();
    this.buffer = Buffer.alloc(0); this.setState("disabled");
  }
}
