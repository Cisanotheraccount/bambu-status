import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { buildPrinterView, buildTilePayload } from "../com.ulanzi.bambu-status.ulanziPlugin/plugin/state.js";
import { renderTileIcon, renderCameraIcon } from "../com.ulanzi.bambu-status.ulanziPlugin/plugin/icon-renderer.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = path.join(root, "com.ulanzi.bambu-status.ulanziPlugin");
const output = path.join(plugin, "assets", "banners");
const publicImages = path.join(root, "docs", "images");
await fs.mkdir(output, { recursive: true }); await fs.mkdir(publicImages, { recursive: true });
const connection = { connected: true, lastMessageAt: new Date().toISOString() };
const view = buildPrinterView({ gcode_state: "RUNNING", mc_percent: 58, mc_remaining_time: 93, layer_num: 951, total_layer_num: 1636,
  subtask_name: "SAMPLE PRINT", stg_cur: 0, nozzle_temper: 220, nozzle_target_temper: 220, nozzle_diameter: "0.4", nozzle_type: "HARDENED", bed_temper: 60, bed_target_temper: 60,
  cooling_fan_speed: 12, big_fan1_speed: 40, big_fan2_speed: 30,
  lights_report: [{ node: "chamber_light", mode: "on" }],
  ams: { tray_now: 1, ams: [{ id: 0, ams_type: "AMS", humidity_raw: 17, temp: 31, tray: [
    { id: 0, tray_type: "PLA", tray_color: "F8F8F8FF", remain: 76 }, { id: 1, tray_type: "PETG HF", tray_color: "44AADDFF", remain: 62 },
    { id: 2, tray_type: "PLA Silk", tray_color: "B18AFFff", remain: 45 }, { id: 3, tray_type: "TPU", tray_color: "F5C451FF", remain: 81 }] },
    { id: 128, ams_type: "AMS HT", humidity_raw: 12, temp: 38, tray: [{ id: 0, tray_type: "PETG", tray_color: "98DD9BFF", remain: 55 }] }] }
}, connection);
view.finishText = "18:42";
const mockFrameSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#24282c"/><rect x="30" y="20" width="580" height="190" fill="#3b4245"/><path d="M75 250L390 170L600 260L330 350Z" fill="#767e7b"/><path d="M245 242L340 219L400 252L312 278Z" fill="#e7e9e8"/><path d="M245 242v-58l67 34v60Z" fill="#c5d3db"/><path d="M312 218l88-24v58l-88 26Z" fill="#93aebc"/><text x="30" y="334" font-family="Arial" font-size="19" fill="#f8fafc">SYNTHETIC CAMERA DEMO</text></svg>`;
const mockFrame = await sharp(Buffer.from(mockFrameSvg)).jpeg().toBuffer();
const camera = { connected: true, active: true, phase: "streaming", frameDataUrl: `data:image/jpeg;base64,${mockFrame.toString("base64")}` };
function tile(role, runtime = {}) { return renderTileIcon(buildTilePayload(role, view, {}, runtime)); }
function image(data, x, y, size = 126) { return `<image href="${data}" x="${x}" y="${y}" width="${size}" height="${size}"/>`; }
function deck() {
  const roles = ["status", "progress", "eta", "layers", "file", "bed", "nozzle", "fans", "ams", "ams", "connection", "light", "camera"];
  return roles.map((role, index) => {
    const runtime = role === "ams" ? { amsMode: { mode: "overview", unitIndex: index === 9 ? "id:128" : "id:0" } } : {};
    return image(role === "camera" ? renderCameraIcon(camera, view) : tile(role, runtime), 243 + (index % 5) * 144, 260 + Math.floor(index / 5) * 144);
  }).join("") + `<rect x="675" y="548" width="270" height="126" rx="8" fill="#15171a" stroke="#565b61" stroke-width="2"/><text x="810" y="602" text-anchor="middle" font-family="Arial" font-size="20" fill="#e5e7eb">SYSTEM DISPLAY</text><text x="810" y="630" text-anchor="middle" font-family="Arial" font-size="14" fill="#a5aab5">UNCHANGED</text>`;
}
function poster(title, subtitle, body, width = 1200, height = 800) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#1e2024"/><rect x="58" y="54" width="7" height="40" fill="#00ae42"/><text x="85" y="88" font-family="Arial" font-size="36" font-weight="700" fill="#f8fafc">Bambu Status</text><text x="60" y="160" font-family="Arial" font-size="26" fill="#f8fafc">${title}</text><text x="60" y="200" font-family="Arial" font-size="18" fill="#b9c0cb">${subtitle}</text>${body}<text x="60" y="${height - 35}" font-family="Arial" font-size="13" fill="#949ca9">COMMUNITY PREVIEW · D200X LAYOUT · CODE-RENDERED UI · SYNTHETIC DATA</text></svg>`;
}
const monitor = poster("Your print, at a glance.", "Progress · ETA · temperatures · AMS · local camera", deck());
const ams = poster("Materials, colors, and conditions.", "Real unit IDs. Four-slot overview, slot details, and humidity.",
  image(tile("ams", { amsMode: { mode: "overview", unitIndex: "id:0" } }), 95, 302, 240) +
  image(tile("ams", { amsMode: { mode: "slot", unitIndex: "id:0", slotIndex: 1 } }), 390, 302, 240) +
  image(tile("ams", { amsMode: { mode: "env", unitIndex: "id:128" } }), 685, 302, 240) +
  `<text x="215" y="590" text-anchor="middle" font-family="Arial" font-size="20" fill="#cad0da">Overview</text><text x="510" y="590" text-anchor="middle" font-family="Arial" font-size="20" fill="#cad0da">Filament</text><text x="805" y="590" text-anchor="middle" font-family="Arial" font-size="20" fill="#cad0da">Environment</text>`);
const idle = buildPrinterView({ gcode_state: "FINISH", mc_percent: 100 }, connection);
const status = (occupied) => renderTileIcon(buildTilePayload("status", idle, {}, { bedOccupancy: { occupied, checkedAt: "sample", color: "#facc15" } }));
const reminder = poster("Finished does not mean cleared.", "Local image comparison. No image upload. Advisory reminders, not a safety interlock.",
  image(status(false), 220, 300, 240) + image(status(true), 630, 300, 240) + `<text x="340" y="590" text-anchor="middle" font-family="Arial" font-size="20" fill="#cad0da">Bed looks clear</text><text x="750" y="590" text-anchor="middle" font-family="Arial" font-size="20" fill="#cad0da">Remove the finished part</text>`);
for (const [name, svg] of [["banner-monitor", monitor], ["banner-ams", ams], ["banner-reminder", reminder]]) {
  const data = await sharp(Buffer.from(svg)).png().toBuffer();
  await fs.writeFile(path.join(output, `${name}.png`), data);
  await fs.writeFile(path.join(publicImages, `${name}.png`), data);
}
const cover = poster("Local-first print monitoring.", "A Bambu Lab dashboard for Ulanzi D200X.", image(tile("status"), 595, 260, 165) + image(tile("eta"), 790, 260, 165) + image(tile("ams", { amsMode: { mode: "overview", unitIndex: "id:0" } }), 985, 260, 165), 1200, 600);
await sharp(Buffer.from(cover)).png().toFile(path.join(publicImages, "cover-2x1.png"));
await sharp(Buffer.from(monitor)).resize(1000, 1000, { fit: "contain", background: "#1e2024" }).png().toFile(path.join(publicImages, "cover-square.png"));
for (const entry of await fs.readdir(path.join(plugin, "assets", "icons"))) {
  if (!entry.endsWith(".svg")) continue;
  await sharp(path.join(plugin, "assets", "icons", entry)).resize(196, 196).png().toFile(path.join(plugin, "assets", "icons", entry.replace(/\.svg$/, ".png")));
}
console.log("Rendered covers, three banners, and 196px icons from synthetic UI data.");
