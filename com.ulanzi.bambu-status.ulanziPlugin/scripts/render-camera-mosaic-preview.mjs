import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CAMERA_MOSAIC_KEYS, cameraMosaicPosition } from "../plugin/camera-mosaic.js";
import { renderCameraMosaicTile } from "../plugin/icon-renderer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const inputPath = path.resolve(process.argv[2] || path.join(root, "..", "bambu-camera-latest.jpg"));
const outputPath = path.resolve(process.argv[3] || path.join(root, "camera-mosaic-preview.svg"));
const frame = fs.readFileSync(inputPath);
const frameDataUrl = `data:image/jpeg;base64,${frame.toString("base64")}`;
const tileSize = 144;
const gap = 14;
const margin = 30;
const panelWidth = margin * 2 + tileSize * 5 + gap * 4;
const panelHeight = margin * 2 + tileSize * 3 + gap * 2;

const tiles = CAMERA_MOSAIC_KEYS.map((key) => {
  const position = cameraMosaicPosition(key);
  const x = margin + position.column * (tileSize + gap);
  const y = margin + position.row * (tileSize + gap);
  const dataUrl = renderCameraMosaicTile({
    active: true,
    connected: true,
    frameDataUrl,
    frameId: 1
  }, position);
  return `<image href="${dataUrl}" x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" clip-path="url(#tile-${key})"/>`;
}).join("\n  ");

const clips = CAMERA_MOSAIC_KEYS.map((key) => {
  const position = cameraMosaicPosition(key);
  const x = margin + position.column * (tileSize + gap);
  const y = margin + position.row * (tileSize + gap);
  return `<clipPath id="tile-${key}"><rect x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" rx="10"/></clipPath>`;
}).join("\n    ");

const wideX = margin + 3 * (tileSize + gap);
const wideY = margin + 2 * (tileSize + gap);
const wideWidth = tileSize * 2 + gap;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${panelWidth}" height="${panelHeight}" viewBox="0 0 ${panelWidth} ${panelHeight}">
  <defs>
    <linearGradient id="panel" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#33373c"/>
      <stop offset="1" stop-color="#181b1f"/>
    </linearGradient>
    ${clips}
  </defs>
  <rect width="${panelWidth}" height="${panelHeight}" rx="28" fill="url(#panel)"/>
  ${tiles}
  <rect x="${wideX}" y="${wideY}" width="${wideWidth}" height="${tileSize}" rx="12" fill="#090b0f" stroke="#555b62" stroke-width="3"/>
  <text x="${wideX + wideWidth / 2}" y="${wideY + 67}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="20" font-weight="700" fill="#f8fafc">SYSTEM DISPLAY</text>
  <text x="${wideX + wideWidth / 2}" y="${wideY + 96}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="15" font-weight="600" fill="#94a3b8">UNCHANGED</text>
</svg>\n`;

fs.writeFileSync(outputPath, svg);
console.log(outputPath);
