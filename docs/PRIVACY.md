# Privacy

Normal monitoring connects to the selected local printer and to Ulanzi Studio on localhost. There is no cloud account login, analytics, token-based model API, image upload, or automatic online updater.

Pairing uses a transient Studio message to deliver the LAN Access Code to the plugin. It is saved only in macOS Keychain or Windows user-bound DPAPI, not in ordinary Studio plugin settings. The bundled SDK was changed not to log raw incoming payloads or echo secrets in acknowledgements. Ulanzi Studio itself remains a trusted part of this local transport; this project cannot guarantee the logging behavior of every host version.

The local printer metadata file contains IP/hostname, serial, model and display name. Reference images, the latest frame, last check and three sampled print frames remain on disk. They are never included in packages or sent to GitHub/Ulanzi. First-observed ETA metadata can contain a local task name. Detection compares against confirmed references and recent in-print samples; it does not train an uploaded model.

Camera diagnostics omit serial, host, code and image bytes. Review any support attachment before sharing it. Tests use isolated mocks and must not load a real saved profile or attach a second camera stream.

The local JPEG camera accepts the printer's self-signed certificate; optional strict MQTT certificate checks do not enable certificate validation for every camera transport. Use a trusted LAN. Optional FFmpeg receives an authenticated RTSPS URL in its process arguments; local users/processes with sufficient privileges may inspect it. Never configure an untrusted FFmpeg executable.

Removing the plugin does not automatically delete local photos or Keychain entries. See setup instructions for targeted cleanup. Do not erase unrelated Studio pages, global settings, or credentials.
