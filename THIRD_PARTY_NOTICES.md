# Third-party notices

Own project code is MIT licensed. Vendor libraries keep their original licenses.

## Ulanzi SDK

Source: https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK

The bundled `libs/` and `plugin/ulanzi-api/` are the SDK snapshot used by the project's private 0.3.5 baseline, not a claim of an unmodified current upstream checkout. Their Apache-2.0 license files are retained in both directories. Local changes include 13-tile batch updates, event payload privacy, and redacted logging. Ulanzi's original copyright notices remain applicable. This project is not endorsed by Ulanzi or Bambu Lab.

## Runtime dependencies

| Package | Purpose | License |
| --- | --- | --- |
| mqtt | Local MQTT connection | MIT |
| ws | Ulanzi Studio WebSocket | MIT |
| jpeg-js | Portable JPEG decode | BSD-3-Clause |
| pngjs | Portable PNG decode | MIT |

Dependencies and their own license files are included in the installable bundle. Transitive dependency versions are pinned by the package lock. The repository's developer-only sharp, Playwright and yazl packages are not bundled into the plugin. Generated graphics contain only synthetic values and code-rendered UI; no private camera image or bundled proprietary font is included.

## Optional FFmpeg

FFmpeg is not included, downloaded, or installed by this plugin. X1 RTSP camera mode invokes a user-provided FFmpeg executable as a separate process. Its license depends on that executable's build; obtain it through https://ffmpeg.org/ and follow its applicable license. Its absence does not disable MQTT monitoring. The RTSP URL includes the local Access Code in that subprocess's arguments, which can be inspected by processes with sufficient local privileges; it is never logged by this plugin. Use the JPEG camera path on supported P1/A1 models when available.

Apple Vision and Keychain are operating-system frameworks, not downloaded cloud models. Windows credential encryption uses the current user's DPAPI via PowerShell.

The optional generic profile is authored by this project. Its JSON structure was researched using public Ulanzi-format exports, including https://github.com/vu2cpl/ulanzi-d100h-aethersdr/tree/main/profile ; none of that project's device IDs, action settings, artwork or program code is bundled.
