import { EventEmitter } from "events";
import mqtt from "mqtt";

const DEFAULT_PORT = 8883;
const PUSH_ALL = Object.freeze({ pushing: { sequence_id: "0", command: "pushall" } });
const LIGHT_MODES = new Set(["on", "off"]);

export class BambuMqttClient extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.config = null;
    this.connected = false;
    this.sequenceId = Math.floor(Date.now() % 1_000_000_000);
  }

  configure(config) {
    const next = normalizeConfig(config);
    if (!hasRequiredConfig(next)) {
      this.disconnect();
      this.config = next;
      this.emit("status", { connected: false, reason: "missing_config" });
      return;
    }

    if (this.config && sameConfig(this.config, next) && this.client) {
      return;
    }

    this.disconnect();
    this.config = next;
    this.connect();
  }

  connect() {
    if (!this.config || !hasRequiredConfig(this.config)) return;

    const { host, serial, accessCode, tlsVerify } = this.config;
    const reportTopic = `device/${serial}/report`;

    this.client = mqtt.connect(`mqtts://${host}:${DEFAULT_PORT}`, {
      username: "bblp",
      password: accessCode,
      clientId: `ulanzi-bambu-status-${Math.random().toString(16).slice(2)}`,
      protocolVersion: 4,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 3000,
      connectTimeout: 8000,
      rejectUnauthorized: tlsVerify === "true"
    });

    this.client.on("connect", () => {
      this.connected = true;
      this.emit("status", { connected: true });
      this.client.subscribe(reportTopic, (err) => {
        if (err) {
          this.emit("errorStatus", `Subscribe failed: ${err.message}`);
        } else if (this.config.autoPushAll !== "false") {
          this.requestPushAll();
        }
      });
    });

    this.client.on("reconnect", () => {
      this.connected = false;
      this.emit("status", { connected: false, reason: "reconnect" });
    });

    this.client.on("close", () => {
      this.connected = false;
      this.emit("status", { connected: false, reason: "closed" });
    });

    this.client.on("offline", () => {
      this.connected = false;
      this.emit("status", { connected: false, reason: "offline" });
    });

    this.client.on("error", (err) => {
      this.emit("errorStatus", err.message || String(err));
    });

    this.client.on("message", (topic, payload) => {
      if (topic !== reportTopic) return;
      try {
        const json = JSON.parse(payload.toString("utf8"));
        this.emit("report", json);
      } catch (err) {
        this.emit("errorStatus", `Bad MQTT JSON: ${err.message}`);
      }
    });
  }

  requestPushAll() {
    return this.publishRequest(PUSH_ALL);
  }

  setChamberLight(mode) {
    const normalizedMode = String(mode || "").trim().toLowerCase();
    if (!LIGHT_MODES.has(normalizedMode)) return false;

    return this.publishRequest({
      system: {
        sequence_id: this.nextSequenceId(),
        command: "ledctrl",
        led_node: "chamber_light",
        led_mode: normalizedMode,
        led_on_time: 500,
        led_off_time: 500,
        loop_times: 1,
        interval_time: 1000
      }
    });
  }

  nextSequenceId() {
    this.sequenceId = (this.sequenceId + 1) % 2_147_483_647;
    return String(this.sequenceId);
  }

  publishRequest(payload, options = {}) {
    if (!this.client || !this.connected || !this.config) return false;
    this.client.publish(`device/${this.config.serial}/request`, JSON.stringify(payload), options);
    return true;
  }

  disconnect() {
    if (!this.client) return;
    const old = this.client;
    this.client = null;
    this.connected = false;
    old.end(true);
  }
}

function normalizeConfig(config = {}) {
  return {
    host: String(config.host || "").trim(),
    serial: String(config.serial || "").trim(),
    accessCode: String(config.accessCode || "").trim(),
    autoPushAll: String(config.autoPushAll ?? "true"),
    tlsVerify: String(config.tlsVerify ?? "false")
  };
}

function hasRequiredConfig(config) {
  return Boolean(config.host && config.serial && config.accessCode);
}

function sameConfig(a, b) {
  return a.host === b.host &&
    a.serial === b.serial &&
    a.accessCode === b.accessCode &&
    a.autoPushAll === b.autoPushAll &&
    a.tlsVerify === b.tlsVerify;
}
