# Contributing

Run `npm ci --ignore-scripts`, `npm run assets`, and `npm run check`. Keep tests isolated from real printer credentials. Add regression coverage for state parsing, unknown fields, display overflow and connection lifecycles.

For model support, supply permitted, sanitized MQTT fixtures with firmware/model information and a physical acceptance report. Do not manufacture humidity percentages, remaining grams or a successful command acknowledgement. Adding a model name to a selector is not compatibility evidence.

Keep the existing display language: white primary value, smaller secondary value, colored short title, full rounded border and inset bar. Use the renderer for preview images. Screenshots must be explicitly safe to publish and must not contain real printer identity or credentials.

New printer-changing controls require a separate discussion, documented authorization behavior, actual execution confirmation and safety testing. Do not add arbitrary MQTT publish, movement, heater or stop commands under a display-only change.

Preserve third-party licenses. Open a targeted issue or pull request; describe tests and any remaining hardware gap clearly.
