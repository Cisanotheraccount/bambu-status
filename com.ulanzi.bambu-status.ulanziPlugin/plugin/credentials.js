import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { dataDirectory } from "./platform.js";

const native = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "native");

export function runHelper(command, args, request, options = {}) {
  return new Promise((resolve, reject) => {
    const child = (options.spawn || spawn)(command, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Credential store timed out")); }, 15000);
    child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > 65536) child.kill(); });
    child.stderr.on("data", () => {});
    child.on("error", () => { clearTimeout(timer); reject(new Error("System credential helper unavailable")); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error("System credential store denied access"));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error("Invalid credential response")); }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(request));
  });
}

export class CredentialStore {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.baseDir = options.baseDir || dataDirectory();
    this.run = options.run || runHelper;
  }
  async request(operation, id, secret = "") {
    if (!/^[a-f0-9]{16}$/.test(id)) throw new Error("Invalid credential ID");
    if (process.env.NODE_ENV === "test" && !this.run.testDouble) throw new Error("Real credentials are disabled in tests");
    await fs.mkdir(this.baseDir, { recursive: true, mode: 0o700 });
    const request = { operation, id, secret, baseDir: this.baseDir };
    if (this.platform === "darwin") return this.run(path.join(native, "credential-helper"), [], request);
    if (this.platform === "win32") return this.run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(native, "credentials.ps1")], request);
    throw new Error("Pairing is supported on macOS and Windows");
  }
  async set(id, secret) { await this.request("set", id, secret); }
  async get(id) { return (await this.request("get", id)).secret || ""; }
  async delete(id) { await this.request("delete", id); }
}
