import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, "com.ulanzi.bambu-status.ulanziPlugin");
const file = path.join(directory, "manifest.json");
const manifest = JSON.parse(await fs.readFile(file, "utf8"));
Object.assign(manifest, {
  Version: "0.4.0", Author: "Ci (Cisanotheraccount)", Name: "Bambu Status",
  Description: "Local Bambu Lab monitoring, AMS, camera and finished-part reminders for Ulanzi D200X.",
  Overview: "A local-first Bambu Lab dashboard on your Ulanzi D200X.",
  Detail: "Community plugin. Discover and pair a local printer using its LAN Access Code. View progress, ETA, layers, temperatures, AMS and camera. Local bed reminders are advisory. Only chamber-light control is included. See the GitHub compatibility table before installing.",
  Banner: ["assets/banners/banner-monitor.png", "assets/banners/banner-ams.png", "assets/banners/banner-reminder.png"],
  Icon: "assets/icons/plugin.png", CategoryIcon: "assets/icons/plugin.png"
});
for (const action of manifest.Actions) {
  action.PropertyInspectorPath = "property-inspector/setup/inspector.html";
  action.Controllers = ["Keypad"];
  action.DisableAutomaticStates = true;
  action.Icon = action.Icon.replace(/\.svg$/, ".png");
  for (const state of action.States) state.Image = state.Image.replace(/\.svg$/, ".png");
}
await fs.writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
for (const [name, localization] of [["en.json", { "Bambu Status": "Bambu Status", "Description": manifest.Description, "Overview": manifest.Overview, "Detail": manifest.Detail }], ["zh_CN.json", { "Bambu Status": "Bambu Status", "Description": "Ulanzi D200X 上的 Bambu Lab 本地监控、AMS、摄像头与取件提醒。", "Overview": "把打印进度、耗材和画面留在桌面上。", "Detail": "社区插件。局域网发现打印机，使用 LAN Access Code 首次配对。显示进度、预计结束时间、层数、温度、AMS 与画面。盘面检测为本地辅助提醒，仅保留仓内灯控制。安装前请查看 GitHub 兼容矩阵。" }]]) {
  await fs.writeFile(path.join(directory, name), `${JSON.stringify({ Localization: localization }, null, 2)}\n`);
}
console.log("Prepared public manifest and two language resources.");
