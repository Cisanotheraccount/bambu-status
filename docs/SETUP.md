# Setup

## Requirements

- USB-connected Ulanzi D200X and Ulanzi Studio 3.0.11+; newer host builds may expose different import controls.
- macOS 12+ or Windows 10+; see the compatibility evidence before treating a configuration as validated.
- A Bambu printer reachable on a trusted local network, its serial, and its current LAN Access Code.

## Pairing

Install the release bundle, add one action, open its settings, choose **Find**, select a discovered device, then enter its LAN Access Code and pair. Pairing waits for a matching printer report instead of interpreting a successful socket connection as success. The code is then saved to the OS-protected credential backend.

If discovery returns nothing, enter the local IP or `.local` hostname and serial manually. Match the model, especially for X1 camera transport. The plugin listens to local discovery announcements for eight seconds; it does not scan every IP or bridge VLANs.

An IP change is not automatically trusted. Use Find/manual entry to pair to the confirmed device again. The saved code is not shown in the settings. This preview does not import secrets from another application's files.

## Recommended layout

The separate D200X Profile asset uses these assignments. Import it explicitly as a new profile and verify your host's device assignment; no physical device UUID is embedded. The exported-format structure has been checked, but Studio import acceptance is not claimed until verified. Manual assignment remains available:

| Row | Column 1 | Column 2 | Column 3 | Column 4 | Column 5 |
| --- | --- | --- | --- | --- | --- |
| 1 | Status | Progress | ETA | Layers | Errors |
| 2 | Bed | Nozzle | Fans | AMS (four-slot unit) | AMS (HT unit) |
| 3 | Connection | Light | Camera | System wide display | System wide display |

Other choices are valid. All 13 square positions must contain active Bambu Status actions for the full-page camera view; a system or unrelated plugin key cannot be overwritten by this plugin. Existing pages are never rearranged automatically.

## Bed calibration

Wait for an idle printer. Inspect and completely clear the bed, set the light on, then choose **Capture: light on** and confirm. Set the light off, then choose **Capture: light off** and confirm. Both actions wait for a fresh frame; the plugin does not switch the light while capturing. A matching reference bank preserves up to six confirmed frames for variations in bed height and lighting.

Never capture a print as an empty reference. Recalibrate after changing the camera, plate or lighting. Detection can be disabled without disabling MQTT tiles.

## Data and updates

macOS data: `~/Library/Application Support/BambuStatus/`.
Windows data: `%LOCALAPPDATA%\BambuStatus\`.
Per-printer image directories use a hash of the serial. The serial and address remain in local metadata; the Access Code does not. macOS secrets use Keychain; Windows uses current-user DPAPI with restricted file permissions.

Release installation includes runtime dependencies and macOS universal helpers. Close and reopen Ulanzi Studio to ensure a replaced plugin process loads the new version. Installing files alone does not prove the new version is active. This preview leaves old private 0.3.5 files and reference photos alone; re-pair and recalibrate on the public version.

To uninstall, remove the plugin in Studio. Local images and a Keychain entry may remain. Remove only the BambuStatus data directory and the specific Bambu Status credential entry if you also want to erase the pairing; do not delete global Ulanzi configuration or other profiles.
