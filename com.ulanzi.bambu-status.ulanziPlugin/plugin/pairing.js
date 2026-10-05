import mqtt from "mqtt";
import path from "node:path";
import { dataDirectory, printerId, readJson, writePrivateJson } from "./platform.js";
import { isLocalAddress } from "./discovery.js";
import { CredentialStore } from "./credentials.js";

export function validatePrinter(input) {
  const host = String(input.host || "").trim();
  const serial = String(input.serial || "").trim().toUpperCase();
  const accessCode = String(input.accessCode || "").trim();
  if (!isLocalAddress(host)) throw new Error("Enter a local IP address or a .local hostname");
  if (!/^[a-z0-9_-]{6,40}$/i.test(serial)) throw new Error("Enter the printer serial number");
  if (!/^[a-z0-9]{8}$/i.test(accessCode)) throw new Error("Enter the eight-character LAN Access Code");
  return { id: printerId(serial), host, serial, accessCode, model: String(input.model || "Auto").slice(0, 40), name: String(input.name || "Bambu printer").slice(0, 80) };
}

export function probePrinter(input, options = {}) {
  const config = validatePrinter(input);
  return new Promise((resolve, reject) => {
    const client = (options.connect || mqtt.connect)(`mqtts://${config.host}:8883`, {
      username: "bblp", password: config.accessCode, rejectUnauthorized: input.tlsVerify === "true",
      connectTimeout: 8000, reconnectPeriod: 0, keepalive: 15,
      clientId: `bambu-status-pair-${Math.random().toString(16).slice(2)}`
    });
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true; clearTimeout(timer); client.end(true);
      error ? reject(new Error(error)) : resolve(config);
    };
    const timer = setTimeout(() => finish("No printer report received. Check serial, Access Code, network, and firmware LAN access."), options.timeoutMs || 10000);
    client.on("error", () => finish("Printer connection or authentication failed"));
    client.on("close", () => { if (!done) finish("Printer closed the pairing connection"); });
    client.on("connect", () => client.subscribe(`device/${config.serial}/report`, (error) => {
      if (error) return finish("Printer report subscription failed");
      client.publish(`device/${config.serial}/request`, JSON.stringify({ pushing: { sequence_id: "0", command: "pushall" } }));
    }));
    client.on("message", (topic, payload) => {
      if (topic !== `device/${config.serial}/report` || payload.length > 2 * 1024 * 1024) return;
      try { const report = JSON.parse(payload); if (report.print && typeof report.print === "object") finish(); } catch {}
    });
  });
}

export class PrinterProfiles {
  constructor(options = {}) {
    this.baseDir = options.baseDir || dataDirectory();
    this.file = path.join(this.baseDir, "printer.json");
    this.credentials = options.credentials || new CredentialStore({ baseDir: this.baseDir });
  }
  async save(input) {
    const config = validatePrinter(input);
    await this.credentials.set(config.id, config.accessCode);
    const { accessCode: _secret, ...profile } = config;
    await writePrivateJson(this.file, profile);
    return config;
  }
  async load() {
    const profile = await readJson(this.file);
    if (!profile) return null;
    if (profile.id !== printerId(profile.serial)) throw new Error("Invalid saved printer profile");
    const accessCode = await this.credentials.get(profile.id);
    return accessCode ? validatePrinter({ ...profile, accessCode }) : null;
  }
}
