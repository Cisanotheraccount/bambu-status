import { EventEmitter } from "events";
import tls from "tls";

const USERNAME = "bblp";
const CAMERA_PORT = 6000;
const FRAME_HEADER_TAIL = Buffer.from([
  0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00
]);
const MAX_FRAME_BYTES = 5 * 1024 * 1024;
const CONNECT_TIMEOUT_MS = 10_000;
const BUSY_NOTICE_MS = 12_000;
const FIRST_FRAME_RECYCLE_MS = 22 * 60_000;
const STALLED_FRAME_MS = 45_000;
const GRACEFUL_CLOSE_MS = 1_500;
const RECONNECT_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 120_000];

export class BambuCameraClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.settings = {
      host: "",
      accessCode: ""
    };
    this.tlsConnect = options.tlsConnect || tls.connect;
    this.connectTimeoutMs = options.connectTimeoutMs || CONNECT_TIMEOUT_MS;
    this.busyNoticeMs = options.busyNoticeMs || BUSY_NOTICE_MS;
    this.firstFrameRecycleMs = options.firstFrameRecycleMs || FIRST_FRAME_RECYCLE_MS;
    this.stalledFrameMs = options.stalledFrameMs || STALLED_FRAME_MS;
    this.gracefulCloseMs = options.gracefulCloseMs || GRACEFUL_CLOSE_MS;
    this.reconnectDelaysMs = options.reconnectDelaysMs || RECONNECT_DELAYS_MS;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.active = false;
    this.reconnectTimer = null;
    this.connectTimeoutTimer = null;
    this.busyNoticeTimer = null;
    this.firstFrameRecycleTimer = null;
    this.frameWatchdogTimer = null;
    this.frameDataUrl = "";
    this.frameId = 0;
    this.lastFrameAt = null;
    this.connected = false;
    this.error = "";
    this.phase = "disabled";
    this.connectAttempt = 0;
    this.retryIndex = 0;
    this.connectStartedAt = null;
    this.nextRetryAt = null;
  }

  configure(settings = {}) {
    const next = {
      host: String(settings.host || "").trim(),
      accessCode: String(settings.accessCode || "").trim()
    };
    const changed = next.host !== this.settings.host || next.accessCode !== this.settings.accessCode;
    this.settings = next;

    if (changed && this.active) {
      this.restart(750);
    }
  }

  setEnabled(enabled) {
    const shouldEnable = Boolean(enabled);
    if (shouldEnable === this.active) return;

    this.active = shouldEnable;
    if (this.active) {
      this.retryIndex = 0;
      this.connect();
    } else {
      this.disconnect();
    }
  }

  getState() {
    return {
      active: this.active,
      connected: this.connected,
      error: this.error,
      frameDataUrl: this.active ? this.frameDataUrl : "",
      frameId: this.frameId,
      lastFrameAt: this.lastFrameAt,
      phase: this.phase,
      connectAttempt: this.connectAttempt,
      connectStartedAt: this.connectStartedAt,
      nextRetryAt: this.nextRetryAt,
      transport: "tcp-6000"
    };
  }

  connect() {
    if (!this.active || this.socket) return;
    if (!this.settings.host || !this.settings.accessCode) {
      this.setStatus(false, "Configure IP and Access Code", "missing-config");
      return;
    }

    this.clearReconnectTimer();
    this.clearConnectionTimers();
    this.buffer = Buffer.alloc(0);
    this.connectAttempt += 1;
    this.connectStartedAt = new Date().toISOString();
    this.nextRetryAt = null;
    this.setStatus(false, "", "connecting");

    const socket = this.tlsConnect({
      host: this.settings.host,
      port: CAMERA_PORT,
      rejectUnauthorized: false
    });

    this.socket = socket;
    socket.setKeepAlive(true, 1_000);
    this.connectTimeoutTimer = setTimeout(() => {
      if (this.socket !== socket) return;
      this.retireSocket(socket, new Error("Camera TLS timeout"));
    }, this.connectTimeoutMs);
    this.connectTimeoutTimer.unref?.();

    socket.once("secureConnect", () => {
      if (this.socket !== socket) return;
      this.clearTimer("connectTimeoutTimer");
      socket.write(buildCameraAuthPacket(this.settings.accessCode));
      this.setStatus(false, "", "waiting");
      this.armFirstFrameTimers(socket);
    });

    socket.on("data", (chunk) => {
      if (this.socket !== socket) return;
      this.handleData(chunk, socket);
    });
    socket.on("error", (err) => this.retireSocket(socket, err));
    socket.on("close", () => this.retireSocket(socket));
  }

  disconnect() {
    this.clearReconnectTimer();
    this.clearConnectionTimers();
    const socket = this.socket;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.nextRetryAt = null;
    if (socket) this.closeSocketGracefully(socket);
    this.setStatus(false, this.active ? this.error : "", this.active ? "idle" : "disabled");
  }

  restart(delayMs = 750) {
    this.clearReconnectTimer();
    this.clearConnectionTimers();
    const socket = this.socket;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    if (socket) this.closeSocketGracefully(socket);
    if (!this.active) {
      this.setStatus(false, "", "disabled");
      return;
    }
    this.setStatus(false, "", "retrying");
    this.scheduleReconnect(delayMs, { preserveBackoff: true });
  }

  handleData(chunk, socket = this.socket) {
    if (!socket || this.socket !== socket) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const result = extractCameraFrames(this.buffer);
    this.buffer = result.rest;

    for (const frame of result.frames) {
      this.clearTimer("busyNoticeTimer");
      this.clearTimer("firstFrameRecycleTimer");
      this.frameId += 1;
      this.lastFrameAt = new Date().toISOString();
      this.frameDataUrl = `data:image/jpeg;base64,${frame.toString("base64")}`;
      this.retryIndex = 0;
      this.setStatus(true, "", "streaming");
      this.armFrameWatchdog(socket);
      this.emit("frame", this.getState());
    }
  }

  armFirstFrameTimers(socket) {
    this.clearTimer("busyNoticeTimer");
    this.clearTimer("firstFrameRecycleTimer");

    this.busyNoticeTimer = setTimeout(() => {
      if (this.socket !== socket || this.frameId > 0 && this.connected) return;
      this.setStatus(false, "Camera stream busy", "waiting");
    }, this.busyNoticeMs);
    this.busyNoticeTimer.unref?.();

    // P1 firmware can retain an orphaned camera slot for roughly 20 minutes.
    // Keep one queued connection alive instead of creating more orphaned slots.
    this.firstFrameRecycleTimer = setTimeout(() => {
      if (this.socket !== socket || this.connected) return;
      this.retireSocket(socket, new Error("Camera stream unavailable"), { retryDelayMs: 60_000 });
    }, this.firstFrameRecycleMs);
    this.firstFrameRecycleTimer.unref?.();
  }

  armFrameWatchdog(socket) {
    this.clearTimer("frameWatchdogTimer");
    this.frameWatchdogTimer = setTimeout(() => {
      if (this.socket !== socket) return;
      this.retireSocket(socket, new Error("Camera stream stalled"), { retryDelayMs: 15_000 });
    }, this.stalledFrameMs);
    this.frameWatchdogTimer.unref?.();
  }

  retireSocket(socket, err, options = {}) {
    if (!socket || this.socket !== socket) return;

    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.clearConnectionTimers();
    this.closeSocketGracefully(socket);

    const message = err?.message || "Camera disconnected";
    this.setStatus(false, message, this.active ? "retrying" : "disabled");
    if (this.active) {
      this.scheduleReconnect(options.retryDelayMs);
    }
  }

  scheduleReconnect(delayMs, options = {}) {
    if (!this.active || this.socket || this.reconnectTimer) return;
    const delays = this.reconnectDelaysMs.length ? this.reconnectDelaysMs : RECONNECT_DELAYS_MS;
    const fallbackDelay = delays[Math.min(this.retryIndex, delays.length - 1)];
    const delay = Math.max(0, Number.isFinite(delayMs) ? delayMs : fallbackDelay);
    if (!options.preserveBackoff) {
      this.retryIndex = Math.min(this.retryIndex + 1, delays.length - 1);
    }
    this.nextRetryAt = new Date(Date.now() + delay).toISOString();
    this.setStatus(false, this.error, "retrying");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.nextRetryAt = null;
      this.connect();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  closeSocketGracefully(socket) {
    if (!socket || socket.destroyed) return;
    let forceTimer = null;
    const clearForceTimer = () => {
      if (!forceTimer) return;
      clearTimeout(forceTimer);
      forceTimer = null;
    };
    socket.once("close", clearForceTimer);
    try {
      socket.end();
      forceTimer = setTimeout(() => {
        forceTimer = null;
        if (!socket.destroyed) socket.destroy();
      }, this.gracefulCloseMs);
      forceTimer.unref?.();
    } catch {
      clearForceTimer();
      socket.destroy();
    }
  }

  clearReconnectTimer() {
    this.clearTimer("reconnectTimer");
    this.nextRetryAt = null;
  }

  clearConnectionTimers() {
    this.clearTimer("connectTimeoutTimer");
    this.clearTimer("busyNoticeTimer");
    this.clearTimer("firstFrameRecycleTimer");
    this.clearTimer("frameWatchdogTimer");
  }

  clearTimer(name) {
    if (!this[name]) return;
    clearTimeout(this[name]);
    this[name] = null;
  }

  setStatus(connected, error, phase = this.phase) {
    const changed = this.connected !== connected || this.error !== error || this.phase !== phase;
    this.connected = connected;
    this.error = error;
    this.phase = phase;
    if (changed) this.emit("status", this.getState());
  }
}

export function buildCameraAuthPacket(accessCode) {
  const packet = Buffer.alloc(80);
  packet.writeUInt32LE(0x40, 0);
  packet.writeUInt32LE(0x3000, 4);
  writePaddedAscii(packet, USERNAME, 16, 32);
  writePaddedAscii(packet, accessCode, 48, 32);
  return packet;
}

export function extractCameraFrames(buffer) {
  let rest = Buffer.from(buffer);
  const frames = [];

  while (rest.length >= 16) {
    const length = rest.readUInt32LE(0);
    const headerTail = rest.subarray(4, 16);

    if (!headerTail.equals(FRAME_HEADER_TAIL) || length <= 0 || length > MAX_FRAME_BYTES) {
      rest = rest.subarray(1);
      continue;
    }

    if (rest.length < 16 + length) break;

    const frame = rest.subarray(16, 16 + length);
    rest = rest.subarray(16 + length);

    if (isJpeg(frame)) {
      frames.push(Buffer.from(frame));
    }
  }

  return { frames, rest };
}

function writePaddedAscii(buffer, value, offset, length) {
  buffer.write(String(value || "").slice(0, length), offset, length, "ascii");
}

function isJpeg(frame) {
  return frame.length >= 4 &&
    frame[0] === 0xff &&
    frame[1] === 0xd8 &&
    frame[frame.length - 2] === 0xff &&
    frame[frame.length - 1] === 0xd9;
}
