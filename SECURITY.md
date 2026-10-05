# Security

Do not publish Access Codes, account tokens, private images, complete Studio settings or unredacted local logs in issues. For a sensitive report, use the repository owner's private GitHub contact or GitHub private vulnerability reporting if enabled; verify that the chosen channel is private before sending details.

This preview uses trusted local printer services with self-signed certificates, OS-protected credential storage and local image processing. It is not a safety interlock or an Internet-facing printer gateway. Tests must not load live credentials or change a physical printer.

The only exposed printer-changing operation is chamber-light toggling, with state confirmation. This release does not promise stop, calibration, temperature, fan, motion or RFID control. Review optional FFmpeg executables and their process-argument exposure before enabling RTSPS.
