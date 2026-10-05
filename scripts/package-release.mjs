import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWriteStream } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import yazl from "yazl";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const name = "com.ulanzi.bambu-status.ulanziPlugin";
const source = path.join(root, name);
const manifest = JSON.parse(await fs.readFile(path.join(source, "manifest.json"), "utf8"));
const platform = process.argv[2] || process.platform;
if (!["darwin", "win32"].includes(platform)) throw new Error("Build on macOS or Windows, or specify the package target");
const staging = path.join(root, ".build", `package-${platform}`);
await fs.rm(staging, { recursive: true, force: true }); await fs.mkdir(staging, { recursive: true });
const target = path.join(staging, name);
await fs.mkdir(target);
for (const entry of ["manifest.json", "package.json", "package-lock.json", "plugin", "libs", "assets", "property-inspector", "native", "en.json", "zh_CN.json"]) {
  await fs.cp(path.join(source, entry), path.join(target, entry), { recursive: true, filter: (file) => ![".git", ".DS_Store", ".gitignore"].includes(path.basename(file)) });
}
if (platform === "darwin") {
  for (const helper of ["credential-helper", "bed-vision"]) if (!await fs.stat(path.join(target, "native", helper)).catch(() => null)) throw new Error("Build the macOS native helpers before packaging");
} else {
  for (const helper of ["credential-helper", "bed-vision"]) await fs.rm(path.join(target, "native", helper), { force: true });
}
for (const entry of ["LICENSE", "THIRD_PARTY_NOTICES.md", "README.md", "README.zh-CN.md"]) await fs.copyFile(path.join(root, entry), path.join(target, entry));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const install = spawnSync(npm, ["ci", "--omit=dev", "--ignore-scripts", "--workspaces=false"], { cwd: target, stdio: "inherit", shell: process.platform === "win32" });
if (install.status !== 0) throw new Error("Runtime dependency installation failed");
const audit = spawnSync(npm, ["audit", "--omit=dev", "--audit-level=high", "--workspaces=false"], { cwd: target, stdio: "inherit", shell: process.platform === "win32" });
if (audit.status !== 0) throw new Error("Runtime dependency audit failed");
const dist = path.join(root, "dist"); await fs.mkdir(dist, { recursive: true });
const filename = `Bambu-Status-${manifest.Version}-${platform === "darwin" ? "macOS-universal" : "Windows"}.ulanziPlugin.zip`;
const file = path.join(dist, filename);
const zip = new yazl.ZipFile();
async function append(directory) {
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".bin") continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await append(absolute);
    else if (entry.isFile()) {
      const relative = path.relative(staging, absolute).split(path.sep).join("/");
      const stat = await fs.stat(absolute);
      zip.addFile(absolute, relative, { mode: stat.mode, mtime: new Date("2026-10-05T00:00:00Z") });
    } else throw new Error("Unexpected symlink in release bundle");
  }
}
await append(target);
await new Promise((resolve, reject) => {
  const stream = createWriteStream(file);
  zip.outputStream.on("error", reject); stream.on("error", reject); stream.on("close", resolve);
  zip.outputStream.pipe(stream); zip.end();
});
const data = await fs.readFile(file);
if (data.length > 50 * 1024 * 1024) throw new Error("Bundle exceeds the Ulanzi upload limit");
await fs.writeFile(`${file}.sha256`, `${createHash("sha256").update(data).digest("hex")}  ${filename}\n`);
await fs.rm(staging, { recursive: true, force: true });
console.log(`Packaged ${filename} (${(data.length / 1048576).toFixed(2)} MiB), with SHA-256.`);
