# Troubleshooting

| Symptom | Check |
| --- | --- |
| All tiles OFFLINE | Printer power, local address, current Access Code, serial, firmware LAN reachability and WiFi isolation. An off printer is not proof that its IP changed. |
| Find returns nothing | Wait through the discovery window. Use manual entry if multicast/broadcast is blocked or the device is on another VLAN. No network-wide brute-force scan is performed. |
| Pairing fails | Pair waits for an actual print report. Connection success alone does not confirm serial or usable access. The code may have changed after a printer setting/account change. |
| Saved pairing unavailable | Check OS credential access and helper installation. Re-pair explicitly; no plaintext credential fallback is used. |
| Camera WAIT / CAM BUSY | A connected TLS socket may still not receive JPEG frames. Other applications can compete for camera sessions. The plugin waits on one connection and backs off; busy is a heuristic, not proof of the cause. |
| X1 camera error | Check model, FFmpeg path, firmware RTSPS availability and local access. Do not expect the P1 JPEG port to work for every model. |
| Full-page camera refuses to start | All 13 square key positions need active Bambu Status actions. The wide display is intentionally untouched. |
| Video tiles are not perfectly simultaneous | One frame is sent as one 13-tile batch; this does not provide hardware-level synchronized scanout. |
| REMOVE on an empty plate | Use a fresh manual check, inspect light and plate height, and recapture the relevant empty reference only after confirming the plate is clear. |
| CLEAR despite a visible part | Detection can miss objects. Inspect the plate, check reference calibration, and report a sanitized reproduction. Do not rely on green as permission to print. |
| CHECK ERR | No fresh camera frame, unavailable image, or local processing error. It is not an empty-bed result. |
| Capture does nothing while printing | Reference capture and bed detection are intentionally blocked during active/paused prints. |
| AMS unit missing | Wait for a full report; check the real unit list. A missing selected ID remains unavailable instead of silently binding another unit. |
| Humidity shows a level | The printer reported a level rather than a raw percentage. No invented conversion is made. |
| Light FAIL | A published request was not confirmed by lights_report. Do not assume all printer controls share the same permission. |
| Old version still on the deck | Fully quit and reopen Studio. Copying files, closing a window or switching pages does not prove the plugin process reloaded. |

For an issue include plugin/Studio versions, operating system, model and firmware, action used, expected result, and a sanitized diagnostic. Do not attach Access Code, account tokens, an entire global settings file, or private camera photos without reviewing them.
