# Compatibility and evidence

Updated 2026-10-05. Community preview: declarations, automated checks, and physical tests are different.

macOS helpers are locally ad-hoc signed universal binaries, not Developer ID notarized applications. Platform security checks may still require review; the project does not advise bypassing security warnings. Verify checksums and source before installing. No Apple developer identity is claimed.

| Configuration | Code path | Physical evidence |
| --- | --- | --- |
| P1S + D200X + macOS arm64 | Local MQTT, JPEG camera, Vision-assisted local detection, Keychain | The private 0.3.5 baseline was used by the project owner; 0.4.0 public onboarding still needs a fresh physical acceptance run |
| macOS Intel | Universal native helpers; portable decode | Cross-built; no Intel/D200X physical acceptance claim |
| Windows 10+ | Portable JPEG/PNG comparison, DPAPI via PowerShell | Automated runner checks only; no Windows/D200X physical acceptance claim |
| P1P / A1 / A1 mini | Shared MQTT fields; experimental local JPEG path | Needs model and firmware reports plus physical camera validation |
| X1 / X1 Carbon / X1E | MQTT fields; experimental RTSPS-to-JPEG through external FFmpeg | Needs physical validation; FFmpeg is not included |
| H2 / other models | Shared fields may work; dual-nozzle and new capabilities not explicitly adapted | Not supported as a validated combination in this preview |
| Four-slot AMS + AMS HT | Real-unit list, stable-ID binding, overview/detail/environment pages | Prior owner usage; public dynamic selection needs a fresh physical acceptance run |
| Other Ulanzi hardware | Actions target D200X only | Not supported |

Missing fields display as unavailable or an explicitly reported level. A single reported slot is not alone proof that the device is AMS HT. Fans are normalized report percentages, not RPM. Remaining filament is not a scale measurement. A low-temperature green bar is only a sensor-based cooling cue, not a guarantee that touching parts is safe.

## X1 camera

Set the printer model accurately and provide an FFmpeg executable on PATH or in settings. The process requests `rtsps://...:322/streaming/live/1` and returns a low-rate JPEG pipe. No FFmpeg binary is downloaded or shipped. Missing dependency returns a camera error, not a fake LIVE frame. The local authentication URL is visible to sufficiently privileged local process inspection; do not use an untrusted executable. RTSP transport has mock tests, not a tested physical X1 stream in this release.

## Firmware and access

LAN reachability, authentication and printer execution permissions can differ by firmware. Monitoring, requesting a report, and performing a control are separate capabilities. This project does not claim a complete officially supported Bambu API. It does not tell all users to disable cloud mode. Only chamber-light control is exposed, with report confirmation.

Primary implementation references: [ha-bambulab camera](https://github.com/greghesp/ha-bambulab/blob/main/custom_components/bambu_lab/camera.py), [Bambu Studio machine definitions](https://github.com/bambulab/BambuStudio/tree/master/resources/printers), [Ulanzi SDK manifest](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK/blob/main/manifest.md). These references are not substitutes for this project's device tests.
