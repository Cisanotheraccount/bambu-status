# Architecture and project history

```text
Printer MQTT/TLS -> delta merge -> normalized view -> SVG -> Studio WebSocket -> USB D200X
Printer camera  -> one shared frame -> camera / mosaic / local bed check / bounded cache
Key press       -> display mode, fresh check, or confirmed chamber-light toggle
```

The code began as a personal P1S monitor. Iteration standardized white main text, lower-contrast secondary values, colored labels, full borders and inset bottom bars. Layers and temperatures were split into current/total or current/target rows. ETA moved to finish-time-first with 24-hour formatting and +1D markers. Progress gained a first-observed ETA alternate view.

AMS evolved from a count to a four-slot color/material overview, paginated slot details and humidity/temperature. Stage was merged into Status; known numerical stages became short readable labels. Fans received three reported percentages and an average bar. Error interpretation is a finite local mapping, not complete official decoding.

Stop, calibration, RFID reread, slicing, UI automation and camera page-jumping attempts did not become reliable controls and were removed. Only the light command is retained, with returned-state confirmation. A sent MQTT message is not proof of execution.

Local bed checks gained confirmed references, light-on/off variants, a small bank for plate-height variation, brightness correction and Apple Vision feature matching. New public code rejects old frames, clears old results when printing starts, distinguishes processing failures and isolates references by printer. This is an advisory comparison pipeline, not a trained universal object detector.

The camera changed from repeated per-tile images to unique crops of one 5×3 canvas with the two lower-right cells omitted. One frozen frame is sent in one batch, capped near one update per second. Connection recovery keeps one queued JPEG socket, closes gracefully, rejects stale-socket events and distinguishes waiting from hard failure.

Public 0.4.0 adds code-only packaging, OS data paths, protected pairing, bounded local discovery, stable AMS IDs, persisted observed ETA, portable JPEG/PNG decoding and a transport adapter. The private installed version and user pages are not rewritten by the release preparation tools.

Native macOS helpers are universal builds. Windows uses the current user's DPAPI and portable pixel comparison. Optional X1 RTSPS requires external FFmpeg. Node runtime compatibility targets the host SDK's documented 20.12.2 baseline; development tests should also run on that line.
