# Ulanzi submission materials

Prepared 2026-10-05. Submission and platform approval must be recorded separately. The preview does not claim official endorsement.

## Assets

- Category: Plugins; supported device: D200X.
- Unique ID: `com.ulanzi.ulanzistudio.bambustatus`.
- Name: Bambu Status; author: Ci; version: 0.4.0.
- Link: https://github.com/Cisanotheraccount/bambu-status
- Cover: `docs/images/cover-square.png` (1:1, confirmed against the live plugin form).
- Banners: `banner-monitor.png`, `banner-ams.png`, `banner-reminder.png` (3:2).
- Images are code-rendered previews with synthetic data, not photos or physical test evidence.
- The macOS universal ZIP includes both macOS helpers and the Windows DPAPI script. Runtime JavaScript dependencies are portable; Windows ignores the macOS helpers. GitHub also offers a smaller Windows-only ZIP.

## English

Summary:

Local-first Bambu Lab monitoring for Ulanzi D200X: progress, ETA, temperatures, AMS, camera and optional local finished-part reminders. Community Preview.

Detailed introduction:

Community Preview, not an official Ulanzi or Bambu Lab product. View progress, 24-hour ETA (+1D), layers, temperatures, fans, AMS materials and reported humidity. Tap tiles to change views; hold Camera for a shared-frame 13-key L-shaped preview. Optional local bed checks help remind you to remove finished parts; they are advisory, not a safety interlock. Install in Ulanzi Studio, add a tile, then Find/select a printer and enter its LAN Access Code. Manual connection is available. Credentials and photos stay local. The optional D200X layout is a separate GitHub download. P1S/macOS/D200X is the development baseline; new pairing, Windows/Intel and other printers need physical acceptance. X1 camera is experimental and needs user-provided FFmpeg. Only chamber-light control is included. Read setup and compatibility on GitHub before installing. Showcase images use synthetic data.

## 中文

摘要：

面向 Ulanzi D200X 的本地 Bambu Lab 状态插件：进度、预计完成时间、温度、AMS、摄像头及可选的本地取件提醒。社区预览版。

详细介绍：

社区预览版，非 Ulanzi 或 Bambu Lab 官方产品。显示进度、24 小时预计完成时间（+1D）、层数、温度、风扇、AMS 材料与机器实际报告的湿度。短按切换信息，长按 Camera 进入 13 格 L 形共享画面，横屏保持原样。可选空床检测仅作取件辅助提醒，不是打印安全联锁。导入插件并添加按键后，查找/选择打印机，首次输入 LAN Access Code；发现失败可手动连接。凭据、参考图和识别保留在本机。可选 D200X 布局在 GitHub 单独下载，需主动导入。P1S + macOS + D200X 是开发基础，新增配对、Windows/Intel 和其他机型仍需实机验收；X1 摄像头为实验功能，需自行提供 FFmpeg。目前仅保留灯光控制，不含停止、校准或 AMS 重读。安装前请阅读 GitHub 安装说明与兼容矩阵。展示图由代码和模拟数据渲染。
