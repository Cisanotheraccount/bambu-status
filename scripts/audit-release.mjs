import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const ignored = new Set(["node_modules", ".git", "dist", "artifacts", ".build"]);
async function inspect(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await inspect(file); continue; }
    if (/^bambu-.*(?:reference|dump|latest|diagnostic)/.test(entry.name) || /node_modules\.broken|\.env$/.test(entry.name)) errors.push(`Private artifact: ${path.relative(root, file)}`);
    if (!/\.(js|mjs|json|md|html|css|ps1|swift|yml|yaml)$/.test(entry.name)) continue;
    const text = await fs.readFile(file, "utf8");
    if (/\/Users\/[a-z][^/]*\//i.test(text)) errors.push(`Personal path: ${path.relative(root, file)}`);
    if (/(gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,}|sk-[a-zA-Z0-9]{24,})/.test(text)) errors.push(`Potential credential: ${path.relative(root, file)}`);
    if (/global_settings\.json|\/usr\/bin\/sips/.test(text)) errors.push(`Private runtime dependency: ${path.relative(root, file)}`);
  }
}
await inspect(root);
const plugin = path.join(root, "com.ulanzi.bambu-status.ulanziPlugin");
const manifest = JSON.parse(await fs.readFile(path.join(plugin, "manifest.json"), "utf8"));
const pkg = JSON.parse(await fs.readFile(path.join(plugin, "package.json"), "utf8"));
if (manifest.Version !== pkg.version) errors.push("Plugin versions disagree");
for (const relative of [manifest.CodePath, manifest.Icon, ...manifest.Banner, ...manifest.Actions.flatMap((action) => [action.Icon, action.PropertyInspectorPath, ...action.States.map((state) => state.Image)])]) {
  if (path.isAbsolute(relative) || relative.includes("..")) errors.push(`Unsafe resource path: ${relative}`);
  if (!await fs.stat(path.join(plugin, relative)).catch(() => null)) errors.push(`Missing resource: ${relative}`);
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("Release audit passed: versions, resources, source paths, and credential patterns.");
