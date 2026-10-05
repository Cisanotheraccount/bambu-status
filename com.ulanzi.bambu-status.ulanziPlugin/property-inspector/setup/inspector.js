const form = document.getElementById("settings");
const byId = (id) => document.getElementById(id);
let action = { tileRole: "status", showText: "true", amsUnit: "auto" };
let preferences = { refreshInterval: "2", autoPushAll: "true", tlsVerify: "false", bedCheckEnabled: "true", cameraCacheEnabled: "true", cameraCacheInterval: "60", cameraCacheLimit: "3", bedCheckAutoCapture: "false", ffmpegPath: "" };
let role = "status";
let printers = [];
let currentStatus = null;
let printerDirty = false;
let zh = false;
let requestNumber = 0;
const pending = new Map();
const text = (en, cn) => zh ? cn : en;

$UD.connect("com.ulanzi.ulanzistudio.bambustatus.status");
$UD.onConnected(() => {
  zh = String($UD.language || "").startsWith("zh");
  document.documentElement.lang = zh ? "zh-CN" : "en";
  document.querySelectorAll("[data-en]").forEach((element) => { element.textContent = zh ? element.dataset.zh : element.dataset.en; });
  role = String($UD.uuid).split(".").pop();
  updateRole();
  $UD.getGlobalSettings();
  rpc("setup-status");
});
$UD.onAdd((message) => { role = String(message.uuid || $UD.uuid).split(".").pop(); loadAction(message.param || {}); rpc("setup-status"); });
$UD.onParamFromApp((message) => loadAction(message.param || {}));
$UD.onDidReceiveGlobalSettings((message) => {
  const settings = message.settings || message.param || message.payload || message;
  for (const key of Object.keys(preferences)) if (settings[key] !== undefined) preferences[key] = settings[key];
  for (const key of Object.keys(preferences)) {
    const field = form.elements[key];
    if (field) field.type === "checkbox" ? field.checked = preferences[key] !== "false" : field.value = preferences[key];
  }
});
$UD.onSendToPropertyInspector((message) => {
  const result = message.payload || {};
  if (result.requestId && pending.has(result.requestId)) { clearTimeout(pending.get(result.requestId)); pending.delete(result.requestId); }
  if (result.type === "setup-status" || result.type === "pair-result" && result.ok) showStatus(result);
  if (result.type === "discover-result") {
    printers = result.printers || [];
    byId("printers").replaceChildren(new Option(text("Select a printer", "选择打印机"), ""), ...printers.map((printer, index) => new Option(`${printer.name} · ${printer.model}`, String(index))));
    feedback("discovery-status", printers.length ? text(`${printers.length} found`, `找到 ${printers.length} 台`) : text("No announcements. Enter local IP and serial manually.", "未收到广播，请手动输入本地 IP 和序列号。"));
    byId("discover").disabled = false;
  }
  if (result.type === "pair-result" || result.ok === false) {
    if (result.type === "pair-result" && result.ok) { printerDirty = false; showStatus(result); }
    byId("pair").disabled = false;
    byId("access-code").value = "";
    feedback("pair-status", result.ok ? text("Paired. Code stored by your system.", "配对成功，Access Code 由系统保护保存。") : result.message || text("Pairing failed", "配对失败"), !result.ok);
  }
});

function rpc(type, data = {}) {
  const requestId = String(++requestNumber);
  $UD.sendToPlugin({ type, requestId, ...data });
  pending.set(requestId, setTimeout(() => {
    pending.delete(requestId);
    if (type === "discover") { byId("discover").disabled = false; feedback("discovery-status", text("Discovery timed out. Use manual pairing.", "查找超时，可手动配对。"), true); }
    if (type === "pair") { byId("pair").disabled = false; byId("access-code").value = ""; feedback("pair-status", text("Pairing timed out", "配对超时"), true); }
  }, type === "pair" ? 35000 : 12000));
}
function feedback(id, value, error = false) { byId(id).textContent = value; byId(id).classList.toggle("error", error); }
function loadAction(settings) {
  action = { ...action, ...settings };
  form.elements.tileRole.value = action.tileRole === "auto" ? "status" : action.tileRole;
  form.elements.showText.checked = action.showText !== "false";
  updateRole();
  if (currentStatus) showStatus(currentStatus);
}
function updateRole() {
  byId("role-row").hidden = role !== "custom";
  byId("ams-row").hidden = (role === "custom" ? form.elements.tileRole.value : role) !== "ams";
}
function showStatus(status) {
  currentStatus = status;
  if (status.printer && !printerDirty) {
    for (const key of ["host", "serial", "model"]) if (document.activeElement !== byId(key)) byId(key).value = status.printer[key] || "";
  }
  const options = status.amsUnits || [];
  const selected = action.amsUnit;
  const choices = [new Option(text("Auto / All", "自动 / 全部"), "auto"), ...options.map((unit) => new Option(unit.label, unit.value))];
  if (selected !== "auto" && !options.some((unit) => unit.value === selected)) choices.push(new Option(text("Selected unit unavailable", "已选单元不可用"), selected));
  form.elements.amsUnit.replaceChildren(...choices);
  form.elements.amsUnit.value = selected;
  byId("connection-status").textContent = status.connected ? text("Printer online", "打印机在线") : status.paired ? text("Reconnecting to printer", "正在重连打印机") : text("Not paired", "尚未配对");
  const bed = status.bed || {};
  feedback("bed-status", bed.checking ? text("Checking / capturing…", "正在检测 / 采集…") : bed.error ? text("Check failed: ", "检测失败：") + bed.error : !bed.hasReference ? text("No empty-bed reference", "尚无空床参考图") : bed.checkedAt ? (bed.occupied ? text("Part on bed", "盘面有物体") : text("Bed looks clear", "盘面看起来为空")) : text("Reference saved", "参考图已保存"), Boolean(bed.error));
}
byId("discover").addEventListener("click", () => { byId("discover").disabled = true; feedback("discovery-status", text("Listening for printers…", "正在查找打印机…")); rpc("discover"); });
byId("printers").addEventListener("change", () => {
  if (byId("printers").value === "") return;
  const printer = printers[Number(byId("printers").value)];
  if (!printer) return;
  printerDirty = true;
  for (const key of ["host", "serial", "model"]) byId(key).value = printer[key] || "Auto";
});
for (const key of ["host", "serial", "model"]) byId(key).addEventListener("input", () => { printerDirty = true; });
byId("pair").addEventListener("click", () => {
  byId("pair").disabled = true;
  feedback("pair-status", text("Authenticating and waiting for a printer report…", "正在验证并等待打印机返回状态…"));
  rpc("pair", { printer: { host: byId("host").value, serial: byId("serial").value, model: byId("model").value || "Auto", accessCode: byId("access-code").value, name: printers[Number(byId("printers").value)]?.name || "Bambu printer" } });
});
for (const [id, variant] of [["capture-on", "light-on"], ["capture-off", "light-off"]]) byId(id).addEventListener("click", () => {
  if (confirm(text("Is the printer idle and the bed completely empty? This replaces the selected reference. Set the light to the selected state first.", "请确认打印机已停止打印、盘面完全为空，并已把灯调到所选状态。这会替换对应参考图。"))) rpc("capture", { variant });
});
byId("check-bed").addEventListener("click", () => rpc("check-bed"));
form.addEventListener("change", (event) => {
  if (!event.target.name) return;
  for (const key of Object.keys(preferences)) {
    const field = form.elements[key];
    if (field) preferences[key] = field.type === "checkbox" ? String(field.checked) : field.value;
  }
  action = { tileRole: role === "custom" ? form.elements.tileRole.value : "auto", showText: String(form.elements.showText.checked), amsUnit: form.elements.amsUnit.value || "auto" };
  $UD.setGlobalSettings(preferences);
  $UD.sendParamFromPlugin(action);
  updateRole();
});
