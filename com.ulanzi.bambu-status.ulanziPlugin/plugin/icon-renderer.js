import {
  CAMERA_MOSAIC_COLUMNS,
  CAMERA_MOSAIC_ROWS,
  cameraMosaicPosition
} from "./camera-mosaic.js";

const WIDTH = 144;
const HEIGHT = 144;

export function renderTileIcon(tile) {
  const color = tile.color || "#38bdf8";
  const progressColor = tile.progressColor || color;
  const labelColor = tile.labelColor || color;
  const frameColor = tile.warning ? color : "#00AE42";
  const progressStrokeColor = tile.progressColor || "#00AE42";
  const label = labelForTile(tile);
  const lines = Array.isArray(tile.lines) ? tile.lines.filter(Boolean).slice(0, 3) : [];
  const main = String(tile.text || "").toUpperCase();
  const sub = String(tile.subtext || "").toUpperCase();
  const pct = Math.max(0, Math.min(100, Number(tile.progress) || 0));
  const showStandardProgress = !tile.hideProgress && !(tile.role === "ams" && tile.amsMode === "slot");
  const progressWidth = Math.round(120 * pct / 100);
  const mainSize = tile.mainSize || mainFontSize(main);
  const subSize = subFontSize(sub);
  const body = tile.role === "ams" ? renderAmsTileBody(tile) : tile.role === "fans" ? renderFansBody(tile) : tile.role === "errors" ? renderErrorBody(tile) : tile.role === "layers" ? renderLayerCount(main) : tile.role === "stage" ? renderStageText(main) : isTemperatureRole(tile.role) ? renderTemperatureBody(tile) : lines.length ? renderLines(lines) : `
  <text x="72" y="${sub ? 72 : 78}" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${mainSize}" font-weight="790" fill="#f8fafc">${escapeXml(main)}</text>
  ${sub ? `<text x="72" y="104" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${subSize}" font-weight="720" fill="#dbeafe">${escapeXml(sub)}</text>` : ""}`;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#121826"/>
      <stop offset="1" stop-color="#070b12"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" x2="1">
      <stop offset="0" stop-color="${escapeXml(progressColor)}"/>
      <stop offset="1" stop-color="${escapeXml(softenColor(progressColor))}"/>
    </linearGradient>
  </defs>
  <rect width="144" height="144" rx="0" fill="#050a12"/>
  <rect x="3" y="3" width="138" height="138" rx="15" fill="url(#bg)"/>
  <rect x="3" y="3" width="138" height="138" rx="15" fill="none" stroke="${escapeXml(frameColor)}" stroke-opacity="0.98" stroke-width="5"/>
  <text x="72" y="24" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="14" font-weight="780" letter-spacing="0" fill="${escapeXml(labelColor)}">${escapeXml(label)}</text>
  ${body}
  ${showStandardProgress ? `
  <rect x="11" y="118" width="122" height="12" rx="6" fill="#07140f" stroke="${escapeXml(progressStrokeColor)}" stroke-opacity="0.72" stroke-width="1.2"/>
  <rect x="12" y="119" width="${progressWidth}" height="10" rx="5" fill="url(#accent)"/>` : ""}
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function renderCameraIcon(cameraState = {}, printerView = {}) {
  const frame = cameraState.connected && !cameraState.error ? cameraState.frameDataUrl || "" : "";
  const busy = isCameraBusy(cameraState);
  const retrying = cameraState.phase === "retrying";
  const color = printerView?.bedOccupancy?.occupied
    ? printerView.bedOccupancy.color || "#facc15"
    : cameraState.connected || frame ? "#00AE42" : "#64748b";
  const pct = Math.max(0, Math.min(100, Number(printerView.progress) || 0));
  const progressWidth = Math.round(108 * pct / 100);
  const status = cameraOverlayText(printerView, cameraState);

  if (cameraState.active === false) {
    return renderTileIcon({
      role: "camera",
      label: "Camera",
      text: "OFF",
      subtext: "PRESS ON",
      color: "#64748b",
      progress: pct,
      warning: false
    });
  }

  if (!frame) {
    return renderTileIcon({
      role: "camera",
      label: "Camera",
      text: busy ? "WAIT" : cameraState.error ? "CAM ERR" : retrying ? "RETRY" : "WAIT",
      subtext: busy ? "CAM BUSY" : cameraState.error ? shortCameraError(cameraState.error) : cameraPhaseText(cameraState),
      color: busy || cameraState.error ? "#f59e0b" : color,
      progress: pct,
      warning: busy || Boolean(cameraState.error)
    });
  }

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <clipPath id="cameraClip">
      <rect x="10" y="10" width="124" height="124" rx="10"/>
    </clipPath>
    <linearGradient id="shade" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#020617" stop-opacity="0"/>
      <stop offset="0.62" stop-color="#020617" stop-opacity="0.2"/>
      <stop offset="1" stop-color="#020617" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <rect width="144" height="144" fill="#020617"/>
  <rect x="5" y="5" width="134" height="134" rx="14" fill="#06100c"/>
  <image href="${escapeXml(frame)}" x="10" y="10" width="124" height="124" preserveAspectRatio="xMidYMid slice" clip-path="url(#cameraClip)"/>
  <rect x="10" y="10" width="124" height="124" rx="10" fill="url(#shade)" clip-path="url(#cameraClip)"/>
  <rect x="5" y="5" width="134" height="134" rx="14" fill="none" stroke="${escapeXml(color)}" stroke-opacity="0.98" stroke-width="5"/>
  <circle cx="18" cy="19" r="4.5" fill="${escapeXml(color)}"/>
  <text x="28" y="23" font-family="${fontStack()}" font-size="11" font-weight="750" fill="#f8fafc">LIVE</text>
  <rect x="10" y="105" width="124" height="29" rx="0" fill="#020617" opacity="0.72" clip-path="url(#cameraClip)"/>
  <text x="72" y="123" text-anchor="middle" font-family="${fontStack()}" font-size="15" font-weight="760" fill="#f8fafc">${escapeXml(status)}</text>
  <rect x="18" y="130" width="108" height="5" rx="2.5" fill="#0f2419" stroke="#00AE42" stroke-opacity="0.65" stroke-width="0.8"/>
  <rect x="18" y="130" width="${progressWidth}" height="5" rx="2.5" fill="#00AE42"/>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function renderCameraMosaicTile(cameraState = {}, contextOrPosition = {}) {
  const position = typeof contextOrPosition === "string"
    ? cameraMosaicPosition(contextOrPosition)
    : contextOrPosition;
  if (!position || !Number.isInteger(position.column) || !Number.isInteger(position.row)) {
    throw new Error("Camera mosaic tile requires a valid D200X grid position");
  }

  const canvasWidth = WIDTH * CAMERA_MOSAIC_COLUMNS;
  const canvasHeight = HEIGHT * CAMERA_MOSAIC_ROWS;
  const viewX = position.column * WIDTH;
  const viewY = position.row * HEIGHT;
  const frame = cameraState.connected && !cameraState.error ? cameraState.frameDataUrl || "" : "";
  const placeholder = mosaicPlaceholder(cameraState, canvasWidth, canvasHeight, viewX, viewY);
  const body = frame
    ? `<rect x="${-viewX}" y="${-viewY}" width="${canvasWidth}" height="${canvasHeight}" fill="#020617"/>
  <image href="${escapeXml(frame)}" x="${-viewX}" y="${-viewY}" width="${canvasWidth}" height="${canvasHeight}" preserveAspectRatio="xMidYMid slice"/>`
    : placeholder;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" overflow="hidden" data-mode="camera-mosaic">
  ${body}
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function mosaicPlaceholder(cameraState, canvasWidth, canvasHeight, viewX, viewY) {
  const busy = isCameraBusy(cameraState);
  const hasError = Boolean(cameraState.error) && !busy;
  const color = hasError ? "#ef4444" : busy ? "#f59e0b" : "#00AE42";
  const detail = busy
    ? "CAMERA SLOT BUSY"
    : hasError
      ? shortMosaicError(cameraState.error)
      : cameraState.active === false
        ? "STARTING"
        : cameraState.phase === "waiting" || cameraState.connected
          ? "WAITING FOR VIDEO"
          : cameraState.phase === "retrying"
            ? "RECONNECTING"
            : "CONNECTING";

  return `<defs>
    <linearGradient id="mosaicBg" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#101827"/>
      <stop offset="1" stop-color="#03070d"/>
    </linearGradient>
  </defs>
  <rect x="${-viewX}" y="${-viewY}" width="${canvasWidth}" height="${canvasHeight}" fill="url(#mosaicBg)"/>
  <rect x="${canvasWidth / 2 - 92 - viewX}" y="${canvasHeight / 2 - 62 - viewY}" width="184" height="5" rx="2.5" fill="${color}"/>
  <text x="${canvasWidth / 2 - viewX}" y="${canvasHeight / 2 - 16 - viewY}" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="38" font-weight="790" fill="#f8fafc">CAMERA</text>
  <text x="${canvasWidth / 2 - viewX}" y="${canvasHeight / 2 + 30 - viewY}" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="20" font-weight="720" fill="${color}">${escapeXml(detail)}</text>`;
}

function isCameraBusy(cameraState = {}) {
  return cameraState.phase === "waiting" && /stream busy/i.test(String(cameraState.error || ""));
}

function cameraPhaseText(cameraState = {}) {
  if (cameraState.phase === "connecting") return "CONNECTING";
  if (cameraState.phase === "waiting") return "WAIT VIDEO";
  if (cameraState.phase === "retrying") return "RECONNECT";
  return "LIVEVIEW";
}

function shortMosaicError(error) {
  const text = String(error || "CAMERA OFFLINE")
    .replace(/^Camera\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return text.length > 28 ? `${text.slice(0, 25)}...` : text || "CAMERA OFFLINE";
}

function labelForTile(tile) {
  if (tile.role === "eta") return String(tile.label || "Left").toUpperCase().slice(0, 10);
  if (tile.role === "progress") return "PROGRESS";
  if (tile.role === "errors") return "ERRORS";
  if (tile.role === "fans") return "FANS";
  if (tile.role === "connection") return "MQTT";
  if (tile.role === "camera") return "CAMERA";
  if (tile.role === "ams" && tile.amsMode === "env") return "HUMIDITY";
  if (tile.role === "ams") return String(tile.label || "AMS").toUpperCase().slice(0, 10);
  return String(tile.label || tile.role || "").toUpperCase().slice(0, 10);
}

function mainFontSize(text) {
  const length = String(text || "").length;
  if (length <= 3) return 44;
  if (length <= 5) return 39;
  if (length <= 7) return 31;
  if (length <= 9) return 26;
  return 23;
}

function subFontSize(text) {
  const length = String(text || "").length;
  if (length <= 8) return 17;
  if (length <= 11) return 16;
  if (length <= 13) return 15;
  return 14;
}

function isTemperatureRole(role) {
  return role === "bed" || role === "nozzle";
}

function renderTemperatureBody(tile) {
  const current = String(tile.text || "--").toUpperCase();
  const target = String(tile.subtext || "").toUpperCase();
  const detail = String(tile.detail || "").toUpperCase();
  const currentSize = mainFontSize(current);
  const targetSize = subFontSize(target);
  const detailSize = detail.length <= 10 ? 12.5 : detail.length <= 14 ? 11.5 : 10.5;

  return `
  <text x="72" y="72" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${currentSize}" font-weight="790" fill="#f8fafc">${escapeXml(current)}</text>
  ${target ? `<text x="72" y="${detail ? 96 : 104}" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${targetSize}" font-weight="720" fill="#dbeafe">${escapeXml(target)}</text>` : ""}
  ${detail ? `<text x="72" y="110" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${detailSize}" font-weight="700" fill="#94a3b8">${escapeXml(detail)}</text>` : ""}`;
}

function renderFansBody(tile) {
  const fans = Array.isArray(tile.fans) ? tile.fans.slice(0, 3) : [];
  if (!fans.length || fans.every((fan) => fan.percent === null || fan.percent === undefined)) {
    return `
  <text x="72" y="72" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="31" font-weight="790" fill="#f8fafc">--</text>
  <text x="72" y="104" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="16" font-weight="720" fill="#dbeafe">NO DATA</text>`;
  }

  return fans.map((fan, index) => {
    const y = 38 + index * 26;
    const percent = fan.percent === null || fan.percent === undefined ? null : Math.max(0, Math.min(100, Number(fan.percent) || 0));
    const fillWidth = percent === null ? 0 : Math.round(52 * percent / 100);
    const color = fan.color || "#a78bfa";
    const label = String(fan.shortLabel || fan.label || "?").toUpperCase().slice(0, 2);
    const text = percent === null ? "--" : `${percent}%`;
    return `
  <g>
    <text x="21" y="${y + 8}" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="14" font-weight="800" fill="${escapeXml(color)}">${escapeXml(label)}</text>
    <rect x="37" y="${y + 3}" width="54" height="10" rx="5" fill="#07140f" stroke="#134e4a" stroke-width="1.1"/>
    ${percent === null ? `<rect x="38" y="${y + 4}" width="12" height="8" rx="4" fill="#475569"/>` : `<rect x="38" y="${y + 4}" width="${fillWidth}" height="8" rx="4" fill="${escapeXml(color)}"/>`}
    <text x="119" y="${y + 8}" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="15" font-weight="760" fill="#f8fafc">${escapeXml(text)}</text>
  </g>`;
  }).join("");
}

function renderErrorBody(tile) {
  if (!tile.warning) {
    const main = String(tile.text || "OK").toUpperCase();
    const sub = String(tile.subtext || "").toUpperCase();
    return `
  <text x="72" y="${sub ? 72 : 78}" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${mainFontSize(main)}" font-weight="790" fill="#f8fafc">${escapeXml(main)}</text>
  ${sub ? `<text x="72" y="104" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${subFontSize(sub)}" font-weight="720" fill="#dbeafe">${escapeXml(sub)}</text>` : ""}`;
  }

  const lines = Array.isArray(tile.errorLines) && tile.errorLines.length
    ? tile.errorLines.slice(0, 3)
    : [String(tile.subtext || "ERROR")];
  const ys = lines.length === 1 ? [78] : lines.length === 2 ? [66, 94] : [56, 80, 104];
  return lines.map((line, index) => {
    const text = String(line || "").toUpperCase();
    const size = index === lines.length - 1 && /\d/.test(text) ? 12.5 : text.length <= 9 ? 18 : 15.5;
    const fill = index === lines.length - 1 && /\d/.test(text) ? "#fecaca" : "#f8fafc";
    return `<text x="72" y="${ys[index]}" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${size}" font-weight="760" fill="${fill}">${escapeXml(text)}</text>`;
  }).join("");
}

function renderLines(lines) {
  const ys = lines.length === 1 ? [78] : lines.length === 2 ? [67, 93] : [56, 80, 104];
  return lines.map((line, index) => {
    const text = String(line || "").toUpperCase();
    const size = text.length <= 8 ? 18 : 16;
    return `<text x="72" y="${ys[index]}" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${size}" font-weight="740" fill="#f8fafc">${escapeXml(text)}</text>`;
  }).join("");
}

function renderAmsTileBody(tile) {
  if (tile.amsMode === "slot" && tile.amsSlot) {
    return renderAmsSlotDetail(tile.amsSlot);
  }
  if (tile.amsMode === "env" && tile.amsUnit) {
    return renderAmsEnvironment(tile.amsUnit);
  }
  return renderAmsOverview(Array.isArray(tile.amsSlots) ? tile.amsSlots : [], tile);
}

function renderAmsOverview(slots, tile = {}) {
  if (!slots.length) {
    return `
  <text x="72" y="75" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="30" font-weight="790" fill="#f8fafc">NO AMS</text>
  <text x="72" y="102" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="15" font-weight="720" fill="#94a3b8">WAIT</text>`;
  }

  const positions = [
    { x: 12, y: 32 },
    { x: 74, y: 32 },
    { x: 12, y: 76 },
    { x: 74, y: 76 }
  ];
  const page = Number(tile.amsPage || 0);
  const totalPages = Number(tile.amsTotalPages || 1);
  const startIndex = page * 4;
  const pageMarker = totalPages > 1
    ? `<text x="124" y="25" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="9.5" font-weight="760" fill="#64748b">${page + 1}/${totalPages}</text>`
    : "";

  return `${pageMarker}${slots.slice(0, 4).map((slot, index) => {
    const pos = positions[index];
    const color = slot.empty ? "#1f2937" : slot.color || "#334155";
    const remain = slot.remainPercent;
    const fillWidth = remain === null ? 0 : Math.round(48 * Math.max(0, Math.min(100, remain)) / 100);
    const stroke = slot.active ? "#f8fafc" : "#134e4a";
    const material = slot.material === "EMPTY" ? "--" : slot.material.slice(0, 7);
    const materialSize = material.length <= 3 ? 14 : material.length <= 4 ? 13 : material.length <= 6 ? 11.5 : 10.5;
    return `
  <g>
    <rect x="${pos.x}" y="${pos.y}" width="58" height="40" rx="8" fill="#07111d" stroke="${stroke}" stroke-width="${slot.active ? 2.7 : 1.25}" opacity="0.98"/>
    <circle cx="${pos.x + 10}" cy="${pos.y + 10}" r="5.2" fill="${escapeXml(color)}" stroke="#0f172a" stroke-width="1.2"/>
    <text x="${pos.x + 33}" y="${pos.y + 10}" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="10.5" font-weight="800" fill="#f8fafc">${escapeXml(slot.label)}</text>
    <text x="${pos.x + 29}" y="${pos.y + 27}" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${materialSize}" font-weight="820" fill="#f8fafc">${escapeXml(material)}</text>
    <rect x="${pos.x + 5}" y="${pos.y + 34}" width="48" height="4.2" rx="2.1" fill="#10231b"/>
    ${remain === null ? `<rect x="${pos.x + 5}" y="${pos.y + 34}" width="12" height="4.2" rx="2.1" fill="#475569"/>` : `<rect x="${pos.x + 5}" y="${pos.y + 34}" width="${fillWidth}" height="4.2" rx="2.1" fill="${escapeXml(color)}"/>`}
    ${slot.active ? `<text x="${pos.x + 51}" y="${pos.y + 10}" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="8.5" font-weight="850" fill="#f8fafc">${startIndex + index + 1}</text>` : ""}
  </g>`;
  }).join("")}`;
}

function renderAmsSlotDetail(slot) {
  const color = slot.empty ? "#334155" : slot.color || "#334155";
  const material = String(slot.material || "--").toUpperCase();
  const detail = String(slot.materialDetail || "").toUpperCase();
  const remain = slot.remainText || "--";
  const remainPercent = slot.remainPercent ?? Number.parseInt(String(remain).replace(/[^\d]/g, ""), 10);
  const fillWidth = Number.isFinite(remainPercent) ? Math.round(120 * Math.max(0, Math.min(100, remainPercent)) / 100) : 0;
  const materialSize = material.length <= 4 ? 42 : material.length <= 6 ? 35 : 28;
  const detailSize = detail.length <= 8 ? 15 : detail.length <= 12 ? 13 : 11.5;
  return `
  <text x="72" y="${detail ? 72 : 78}" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${materialSize}" font-weight="810" fill="#f8fafc">${escapeXml(material)}</text>
  ${detail ? `<text x="72" y="96" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${detailSize}" font-weight="760" fill="#94a3b8">${escapeXml(detail)}</text>` : ""}
  <rect x="11" y="118" width="122" height="12" rx="6" fill="#07140f" stroke="#00AE42" stroke-opacity="0.72" stroke-width="1.2"/>
  <rect x="12" y="119" width="${fillWidth}" height="10" rx="5" fill="${escapeXml(color)}"/>`;
}

function renderAmsEnvironment(unit) {
  const humidity = String(unit.humidityText || unit.dryText || "--").toUpperCase();
  const temperature = String(unit.temperatureText || "--").toUpperCase();
  const humiditySize = humidity.length <= 3 ? 44 : humidity.length <= 4 ? 39 : 34;
  return `
  <text x="72" y="74" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${humiditySize}" font-weight="790" fill="#f8fafc">${escapeXml(humidity)}</text>
  <text x="72" y="104" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${subFontSize(temperature)}" font-weight="720" fill="#dbeafe">${escapeXml(temperature)}</text>`;
}

function renderLayerCount(text) {
  const value = String(text || "--/--").toUpperCase();
  const [current = "--", total = "--"] = value.split("/");
  const currentText = current || "--";
  const totalText = total || "--";

  const topSize = mainFontSize(currentText);
  const bottomSize = subFontSize(totalText);
  return `
  <text x="72" y="72" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${topSize}" font-weight="790" fill="#f8fafc">${escapeXml(currentText)}</text>
  <text x="72" y="104" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${bottomSize}" font-weight="720" fill="#dbeafe">${escapeXml(totalText)}</text>`;
}

function renderStageText(text) {
  const parts = splitStageText(text);
  if (parts.length === 1) {
    const size = parts[0].length <= 8 ? 28 : 23;
    return `<text x="72" y="78" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${size}" font-weight="760" fill="#f8fafc">${escapeXml(parts[0])}</text>`;
  }

  return parts.map((part, index) => {
    const size = part.length <= 8 ? 24 : 21;
    const y = index === 0 ? 66 : 94;
    return `<text x="72" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="${fontStack()}" font-size="${size}" font-weight="750" fill="#f8fafc">${escapeXml(part)}</text>`;
  }).join("");
}

function splitStageText(text) {
  const value = String(text || "--").toUpperCase().replace(/\s+/g, " ").trim();
  if (value.length <= 9) return [value];
  const words = value.split(" ");
  if (words.length > 1) {
    const first = words[0];
    const second = words.slice(1).join(" ");
    return [first, second.length > 12 ? `${second.slice(0, 11)}…` : second];
  }
  return [value.slice(0, 8), value.slice(8, 19)];
}

function cameraOverlayText(view, cameraState) {
  if (view?.bedOccupancy?.checking) return "CHECKING";
  if (view?.bedOccupancy?.occupied) return "PART ON BED";
  if (view?.bedOccupancy?.checkedAt && !view?.bedOccupancy?.error) return "BED EMPTY";
  if (view?.connected && view.status === "RUNNING") {
    const remaining = view.remainingText ? ` ${view.remainingText}` : "";
    return `${view.progress}%${remaining}`;
  }
  if (view?.statusLabel) return String(view.statusLabel).toUpperCase().slice(0, 10);
  if (cameraState?.connected) return "CAM LIVE";
  return "CAMERA";
}

function shortCameraError(error) {
  const text = String(error || "").replace(/^Camera\s+/i, "").trim();
  if (!text) return "OFFLINE";
  return text.length > 10 ? `${text.slice(0, 7)}...` : text.toUpperCase();
}

function softenColor(color) {
  return {
    "#00ae42": "#14b8a6",
    "#22c55e": "#00ae42",
    "#16a34a": "#00ae42",
    "#38bdf8": "#0ea5e9",
    "#22d3ee": "#06b6d4",
    "#facc15": "#fde047",
    "#f59e0b": "#f97316",
    "#dc2626": "#ef4444",
    "#64748b": "#94a3b8",
    "#8b5cf6": "#a78bfa",
    "#a78bfa": "#c084fc",
    "#c084fc": "#f472b6",
    "#f472b6": "#fb7185"
  }[String(color).toLowerCase()] || color;
}

function fontStack() {
  return "-apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, Arial, sans-serif";
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
