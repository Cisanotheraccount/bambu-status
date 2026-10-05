import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import yazl from "yazl";
import sharp from "sharp";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profileId = "f1f093ac-9b2f-489e-a1b7-114ae1fe26f0";
const pageId = "0f041ce0-283b-4474-8430-ed6c837c9fa4";
const name = `${profileId}.ulanziProfile`;
const directory = path.join(root, "profiles", name);
await fs.mkdir(path.join(directory, "Profiles", pageId), { recursive: true });
const roles = ["status", "progress", "eta", "layers", "errors", "bed", "nozzle", "fans", "ams", "ams", "connection", "light", "camera"];
function actionId(index) {
  const hash = createHash("sha256").update(`${pageId}:${index}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
const actions = Object.fromEntries(roles.map((role, index) => [`${index % 5}_${Math.floor(index / 5)}`, {
  Action: `com.ulanzi.ulanzistudio.bambustatus.${role}`,
  ActionID: actionId(index),
  ActionParam: { tileRole: "auto", showText: "true", amsUnit: "auto" },
  LinkedTitle: false, Name: role === "ams" ? `AMS ${index === 8 ? "1" : "2"}` : role,
  Plugin: {}, State: 0, ViewParam: [{ IconRel: "", Text: "" }]
}]));
await fs.writeFile(path.join(directory, "manifest.json"), JSON.stringify({ App: "", Device: { Model: "D200X", UUID: "" }, Icon: "preview.png", Name: "Bambu Status", Pages: { Current: pageId, Pages: [pageId] }, Version: "2.0" }, null, 2) + "\n");
await fs.writeFile(path.join(directory, "Profiles", pageId, "manifest.json"), JSON.stringify({ Controllers: [{ Actions: actions, Type: "Keypad" }], Icon: "", Name: "Bambu Status" }, null, 2) + "\n");
await sharp(path.join(root, "docs", "images", "banner-monitor.png")).resize(480, 320).png().toFile(path.join(directory, "preview.png"));
const dist = path.join(root, "dist"); await fs.mkdir(dist, { recursive: true });
const filename = "Bambu-Status-D200X.ulanziProfile.zip";
const output = path.join(dist, filename);
const zip = new yazl.ZipFile();
for (const relative of ["manifest.json", `Profiles/${pageId}/manifest.json`, "preview.png"]) zip.addFile(path.join(directory, relative), `${name}/${relative}`);
await new Promise((resolve, reject) => { const stream = createWriteStream(output); stream.on("close", resolve); stream.on("error", reject); zip.outputStream.on("error", reject); zip.outputStream.pipe(stream); zip.end(); });
await fs.writeFile(output + ".sha256", `${createHash("sha256").update(await fs.readFile(output)).digest("hex")}  ${filename}\n`);
console.log("Built a generic D200X profile: 13 keys, no device UUID or credentials. Import acceptance still needs Studio verification.");
