import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";

export function dataDirectory(options = {}) {
  const platform = options.platform || process.platform;
  const home = options.home || os.homedir();
  const env = options.env || process.env;
  if (env.BAMBU_STATUS_DATA_DIR) return path.resolve(env.BAMBU_STATUS_DATA_DIR);
  if (env.NODE_ENV === "test") return path.join(process.cwd(), ".build", "test-data", String(process.pid));
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "BambuStatus");
  if (platform === "win32") return path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "BambuStatus");
  return path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "bambu-status");
}

export function printerId(serial) {
  return createHash("sha256").update(String(serial).trim().toUpperCase()).digest("hex").slice(0, 16);
}

export function printerDirectory(serial, base = dataDirectory()) {
  return path.join(base, "printers", printerId(serial));
}

export async function writePrivateJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temp, file);
}

export async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

export function redactDiagnostic(value) {
  if (Array.isArray(value)) return value.map(redactDiagnostic);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/host|serial|access.?code|password|token|frameDataUrl|path|file.?name|subtask|project|ipcam/i.test(key))
      .map(([key, item]) => [key, redactDiagnostic(item)]));
  }
  if (typeof value === "string") {
    return value.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[address]")
      .replace(/(?:\/[\w .-]+){2,}/g, "[path]").replace(/[A-Za-z]:\\[^\n]+/g, "[path]");
  }
  return value;
}
