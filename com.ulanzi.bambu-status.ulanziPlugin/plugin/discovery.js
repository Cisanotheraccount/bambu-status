import dgram from "node:dgram";
import net from "node:net";

const GROUP = "239.255.255.250";
const MODEL_NAMES = { C11: "P1P", C12: "P1S", C13: "X1E", "BL-P001": "X1 Carbon", "BL-P002": "X1", N1: "A1 mini", N2S: "A1", O1D: "H2D" };

export function isLocalAddress(host) {
  if (net.isIP(host) !== 4) return /^[a-z0-9][a-z0-9.-]*\.local$/i.test(host);
  const [a, b] = host.split(".").map(Number);
  return a === 10 || a === 127 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31 || a === 169 && b === 254;
}

export function parsePrinterAnnouncement(packet, remoteAddress) {
  const text = packet.toString("utf8");
  if (packet.length > 8192 || !/bambu/i.test(text) || !isLocalAddress(remoteAddress)) return null;
  const headers = {};
  for (const line of text.split(/\r?\n/).slice(1)) {
    const separator = line.indexOf(":");
    if (separator > 0) headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  }
  const serial = (headers.usn || "").replace(/^uuid:/i, "").split("::")[0];
  if (!/^[a-z0-9_-]{6,40}$/i.test(serial)) return null;
  const code = (headers["devmodel.bambu.com"] || "").slice(0, 40);
  return {
    host: remoteAddress,
    serial,
    name: (headers["devname.bambu.com"] || MODEL_NAMES[code] || "Bambu printer").slice(0, 80),
    model: MODEL_NAMES[code] || code || "Unknown",
    modelCode: code,
    source: "local-announcement"
  };
}

export function discoverPrinters(options = {}) {
  const durationMs = Math.max(500, Math.min(15000, options.durationMs || 8000));
  const createSocket = options.createSocket || dgram.createSocket;
  return new Promise((resolve) => {
    const results = new Map();
    const sockets = [];
    const errors = new Set();
    const timer = setTimeout(() => {
      for (const socket of sockets) { try { socket.close(); } catch {} }
      resolve({ printers: [...results.values()].sort((a, b) => a.name.localeCompare(b.name)), errors: [...errors] });
    }, durationMs);
    for (const port of [2021, 1990]) {
      const socket = createSocket({ type: "udp4", reuseAddr: true });
      sockets.push(socket);
      socket.on("error", (error) => errors.add(error.code || "DISCOVERY_ERROR"));
      socket.on("message", (packet, info) => {
        const printer = parsePrinterAnnouncement(packet, info.address);
        if (printer) results.set(printer.serial, printer);
      });
      socket.bind(port, () => {
        try {
          socket.addMembership(GROUP);
          socket.setMulticastTTL(1);
          const probe = Buffer.from(`M-SEARCH * HTTP/1.1\r\nHOST: ${GROUP}:${port}\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: urn:bambulab-com:device:3dprinter:1\r\n\r\n`);
          socket.send(probe, port, GROUP, (error) => { if (error) errors.add(error.code || "SEND_ERROR"); });
        } catch (error) { errors.add(error.code || "MULTICAST_UNAVAILABLE"); }
      });
    }
    options.signal?.addEventListener("abort", () => { clearTimeout(timer); for (const socket of sockets) { try { socket.close(); } catch {} } resolve({ printers: [], errors: ["CANCELLED"] }); }, { once: true });
  });
}
