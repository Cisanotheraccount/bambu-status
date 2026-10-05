# Bambu Status

**A local-first Bambu Lab dashboard for Ulanzi D200X.**

Keep progress, finish time, temperatures, AMS materials and a camera preview on your desk. Tap to change what a tile shows. A local finished-part reminder helps you notice a print left on the plate.

![Code-rendered monitoring preview with synthetic data](docs/images/banner-monitor.png)

[中文说明](README.zh-CN.md) · [Download 0.4.0](https://github.com/Cisanotheraccount/bambu-status/releases/tag/v0.4.0) · [Setup](docs/SETUP.md) · [Compatibility](docs/COMPATIBILITY.md) · [Troubleshooting](docs/TROUBLESHOOTING.md)

## Community Preview 0.4.0

This is a community project, not an official Ulanzi or Bambu Lab product. The original P1S/macOS/D200X setup was used during development. The public onboarding and Windows paths are new: automated checks are not a claim that every printer, firmware or physical Windows setup has been tested. Consult the compatibility table before installing.

## Install & pair

1. Download the **macOS universal** or **Windows** `.ulanziPlugin.zip` from the release. Runtime dependencies are included; end users do not need Node.js, npm or Xcode.
2. Install/import it using Ulanzi Studio's plugin import facility. If your Studio build requires a directory, extract the archive and import the contained `.ulanziPlugin` folder. Do not replace any existing pages.
3. Add a Bambu Status action to a free D200X key, then open its settings. Choose **Find**, select your printer, enter its **LAN Access Code**, and choose **Pair printer**. Manual IP/serial entry is available when discovery is blocked.
4. Add the tiles you want, or optionally import the separate **D200X Profile** release asset. It creates a generic 13-key layout with no printer identity. Verify import behavior on your Studio version; automatic installation is intentionally disabled. [Recommended layout](docs/SETUP.md#recommended-layout)
5. For optional bed reminders, confirm the plate is empty and idle, then capture light-on and light-off references with the light in the matching state.

Your computer and Ulanzi Studio must remain running. Discovery normally needs the same local network; VLANs, VPNs, client isolation and firmware LAN access restrictions can affect it. The plugin does not require a Bambu cloud login and does not silently change your printer's LAN Only or Developer Mode settings.

## Features

| Tile | Display / interaction |
| --- | --- |
| Status | Printer state and readable stage; tap while idle to check the plate |
| Progress | Print percentage; tap to switch remaining time / first-observed finish estimate |
| ETA | Finish time in 24-hour format, with +1D / +2D; tap to swap with remaining time |
| Layers | White current layer, smaller total layer, no slash |
| Bed / Nozzle | Current and target temperatures; reported plate or nozzle details |
| Fans | Three reported fan percentages plus an average bar |
| AMS | Four-slot overview pages, material details and reported humidity/temperature; tap to cycle, hold to return home |
| File / Errors / Connection | Task name, limited readable error mapping, MQTT health |
| Light | Chamber-light state and toggle, confirmed from the printer report |
| Camera | Tap preview off/on; hold 0.8s for a 13-key L-shaped image; hold any participating key to return |
| Custom Tile | Choose a role, WiFi report or last-update age |

AMS choices are generated from received units and saved by stable unit ID. Percent remaining is the printer's estimate, not grams. Humidity uses a reported percentage when available; a level-only sensor stays a level, not an invented percentage.

![Code-rendered AMS and humidity preview](docs/images/banner-ams.png)

## Local finished-part reminder

Detection uses local image comparison against user-confirmed empty references, with optional Apple Vision feature matching on macOS. Windows uses the portable pixel path. It runs once at an idle startup, once after an observed completion, or when requested with Status. It skips active printing and paused jobs. Manual checks require a fresh frame; failure does not mean the plate is clear.

**Yellow REMOVE** means a part may still be present; **green CLEAR** means the last check looked empty. Results are advisory. Lighting, plate height, shadows and small or transparent objects can cause errors. This is not a safety interlock or guaranteed object detector: inspect the plate before starting another print.

![Code-rendered empty and occupied plate reminders](docs/images/banner-reminder.png)

## Privacy & boundaries

- No cloud image analysis, model API token or automatic image upload.
- Access Code is stored in macOS Keychain or Windows user-bound DPAPI, not in ordinary plugin preferences.
- Reference images and cache are local and isolated per printer. The cache holds the latest **three snapshots**, not three complete print sessions.
- MQTT and JPEG camera TLS support self-signed printer certificates. Strict MQTT checking is optional; use a trusted LAN, not an exposed Internet service.
- Only chamber-light control is included. No stop, calibration, RFID rescan, slicing, heater, fan or motion commands.
- X1 RTSP camera mode needs a user-provided FFmpeg executable; it is not bundled. Other monitoring works without it. [Details](docs/COMPATIBILITY.md)

## Development

Node.js 20.12.2+ is required for development. From the repository root:

```sh
npm ci --ignore-scripts
npm run assets
npm run check
npm run package -- darwin
npm run package -- win32
```

macOS native helpers are compiled as universal arm64/x86_64 during `check`/`build`. Building them requires Apple's command-line developer tools; installing the release does not. Tests use mocks and do not import your existing Ulanzi credentials. The install bundle contains only runtime code and dependencies; developer graphics libraries and private photos are excluded.

See [architecture and history](docs/ARCHITECTURE.md), [privacy](docs/PRIVACY.md), [contributing](CONTRIBUTING.md), [security](SECURITY.md), [changelog](CHANGELOG.md), and [third-party notices](THIRD_PARTY_NOTICES.md).

Own code: MIT. Bundled Ulanzi SDK components retain Apache-2.0 notices. Bambu Lab and Ulanzi names identify supported ecosystems and do not imply endorsement.
