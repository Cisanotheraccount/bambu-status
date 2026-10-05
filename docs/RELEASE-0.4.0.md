# Bambu Status 0.4.0 Community Preview

A local-first Bambu Lab dashboard for Ulanzi D200X. This is an independent community project, not an official Ulanzi or Bambu Lab product.

## Download and install

- Choose the macOS universal or Windows `.ulanziPlugin.zip` asset. Runtime dependencies are included; end users do not need Node.js, npm or Xcode.
- Import it in Ulanzi Studio, add an action to a free key, then use Find, select a printer and enter its LAN Access Code. Manual IP/serial entry is available.
- The separate D200X `.ulanziProfile.zip` is optional. Import it explicitly; it is not installed automatically and contains no printer identity. Profile import still needs acceptance on the user's Studio version.
- Each archive has a SHA-256 companion file. Follow [Setup](https://github.com/Cisanotheraccount/bambu-status/blob/main/docs/SETUP.md) and [Compatibility](https://github.com/Cisanotheraccount/bambu-status/blob/main/docs/COMPATIBILITY.md).

## Included

- Progress, 24-hour ETA with +1D offsets, layers, temperatures, fans, readable status/errors, task and MQTT health.
- Real-report AMS choices saved by unit ID, materials, estimated remaining filament, humidity and temperature where reported.
- Camera preview and shared-frame 13-key L-shaped view; the wide system display remains unchanged.
- Optional local finished-part reminders, confirmed empty references for different lighting, fresh-frame checks and a three-snapshot cache.
- Local pairing metadata, macOS Keychain or Windows DPAPI credentials, per-printer storage and first-observed ETA persistence.
- Chamber-light toggle with report confirmation. No stop, calibration, RFID rescan, slicing, motion, fan or heater control.

## Evidence and limits

Local macOS release checks passed on 2026-10-05: manifest/syntax, smoke test, release-source audit, 89 passing tests and one Windows-only skipped test. The two plugin ZIPs passed integrity checks and dependency audits. Responsive settings checks passed at 260, 360 and 560 pixels. These checks are not physical printer acceptance tests.

P1S + macOS + D200X is the development baseline. The new 0.4.0 pairing flow, Windows/Intel hardware combinations and other printers still need physical acceptance. X1 RTSPS is experimental and requires a user-provided FFmpeg executable; FFmpeg is not bundled. macOS native helpers are ad-hoc signed, not Developer ID notarized.

Bed reminders are advisory, not guaranteed object recognition or a safety interlock. Missing data stays unavailable; humidity levels are not invented percentages. The saved ETA is the first estimate observed by this plugin, not necessarily the actual print-start estimate.

Own code is MIT. Ulanzi SDK notices remain Apache-2.0. No Access Codes, personal printer configuration or reference photographs are included in the release.

## 中文说明

这是 Bambu Status 的社区预览版。下载对应系统的插件 ZIP，在 Ulanzi Studio 导入并添加按键，查找打印机后首次输入 LAN Access Code。发现失败可手动填写 IP 和序列号。可选 D200X 布局需要主动导入，不会自动覆盖原页面。

保留现有显示设计，新增公开版配对、系统数据目录、系统凭据存储、真实 AMS 选择以及跨重启的首次观察 ETA。图片识别完全在本地运行，仅作取件提醒；开始新打印前仍需检查盘面。Windows 与其他机型的代码路径不等于实机已验收。详见 [中文 README](https://github.com/Cisanotheraccount/bambu-status/blob/main/README.zh-CN.md)。
