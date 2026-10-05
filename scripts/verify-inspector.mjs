import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mockSdk = `
const callbacks = {};
const sampleStatus = { type: 'setup-status', paired: true, connected: true, printer: { host: 'printer.local', serial: 'DEMO-PRINTER', model: 'P1S', name: 'Demo printer' }, amsUnits: [{ value: 'id:0', label: 'AMS A · AMS · 4 slots' }, { value: 'id:128', label: 'AMS B · AMS HT · 1 slots' }], bed: { hasReference: true }, camera: { phase: 'streaming' } };
window.mockCalls = [];
window.$UD = { uuid: 'com.ulanzi.ulanzistudio.bambustatus.ams', language: 'en',
connect() { setTimeout(() => callbacks.connected?.(), 10); },
onConnected(fn) { callbacks.connected = fn; }, onAdd(fn) {}, onParamFromApp(fn) {},
onDidReceiveGlobalSettings(fn) { callbacks.global = fn; }, onSendToPropertyInspector(fn) { callbacks.reply = fn; },
getGlobalSettings() { setTimeout(() => callbacks.global?.({ settings: {} }), 1); },
setGlobalSettings(value) { window.mockCalls.push({ global: value }); }, sendParamFromPlugin(value) { window.mockCalls.push({ action: value }); },
sendToPlugin(value) { window.mockCalls.push({ rpc: value }); setTimeout(() => callbacks.reply?.({ payload: { ...sampleStatus, requestId: value.requestId } }), 10); }
};`;
const server = http.createServer(async (request, response) => {
  const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const file = path.resolve(root, `.${relative}`);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
  try {
    const data = await fs.readFile(file);
    const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png" };
    response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }); response.end(data);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const output = path.join(root, "artifacts"); await fs.mkdir(output, { recursive: true });
try {
  for (const width of [260, 360, 560]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/libs/js/ulanziApi.js", (route) => route.fulfill({ contentType: "application/javascript", body: mockSdk }));
    await page.goto(`http://127.0.0.1:${server.address().port}/com.ulanzi.bambu-status.ulanziPlugin/property-inspector/setup/inspector.html`);
    await page.getByText("Printer online", { exact: true }).waitFor();
    assert.equal(await page.locator('[name="amsUnit"] option').count(), 3);
    await page.locator('[name="amsUnit"]').selectOption("id:128");
    await page.locator('[name="refreshInterval"]').selectOption("5");
    const calls = await page.evaluate(() => window.mockCalls);
    assert.equal(calls.some((call) => call.action?.amsUnit === "id:128"), true);
    assert.equal(calls.filter((call) => call.global).some((call) => "accessCode" in call.global), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(output, `setup-${width}.png`), fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Inspector verified at 260/360/560px: dynamic units, no secret preferences, no overflow or JS errors.");
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
