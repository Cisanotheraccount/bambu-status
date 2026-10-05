import test from "node:test";
import assert from "node:assert/strict";

import { renderCameraIcon, renderCameraMosaicTile, renderTileIcon } from "../plugin/icon-renderer.js";

test("renderTileIcon returns a compact SVG data URL with embedded text", () => {
  const dataUrl = renderTileIcon({
    role: "status",
    text: "RUN 42%",
    color: "#22c55e",
    progress: 42
  });

  assert.equal(dataUrl.startsWith("data:image/svg+xml;base64,"), true);
  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
  assert.match(svg, /RUN 42%/);
  assert.match(svg, /PROGRESS|STATUS/);
  assert.match(svg, /00AE42/);
  assert.match(svg, /x="3" y="3" width="138" height="138"/);
  assert.match(svg, /stroke-width="5"/);
  assert.match(svg, /font-size="14"/);
  assert.match(svg, /y="78"/);
  assert.doesNotMatch(svg, /width="124" height="7"/);
  assert.match(svg, /x="11" y="118" width="122" height="12"/);
});

test("renderTileIcon keeps the chamber light tile aligned with the existing design", () => {
  const dataUrl = renderTileIcon({
    role: "light",
    label: "Light",
    text: "ON",
    subtext: "CHAMBER",
    color: "#facc15",
    progressColor: "#facc15",
    progress: 100,
    warning: false
  });

  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
  assert.match(svg, />LIGHT</);
  assert.match(svg, />ON</);
  assert.match(svg, />CHAMBER</);
  assert.match(svg, /stroke="#00AE42"/);
  assert.match(svg, /stop-color="#facc15"/);
  assert.match(svg, /y="72"/);
  assert.match(svg, /y="104"/);
  assert.match(svg, /x="11" y="118" width="122" height="12"/);
});

test("renderTileIcon renders file names as compact multiple lines", () => {
  const dataUrl = renderTileIcon({
    role: "file",
    label: "File",
    lines: ["dragon", "phone", "stand"],
    color: "#00AE42",
    progress: 12
  });

  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
  assert.match(svg, /DRAGON/);
  assert.match(svg, /PHONE/);
  assert.match(svg, /STAND/);
});

test("renderTileIcon makes ETA completion time readable", () => {
  const dataUrl = renderTileIcon({
    role: "eta",
    label: "Left",
    text: "47m",
    subtext: "16:19",
    color: "#00AE42",
    progress: 58
  });

  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
  assert.match(svg, />LEFT</);
  assert.match(svg, />16:19</);
  assert.doesNotMatch(svg, /END|AM|PM/);
  assert.match(svg, /font-size="17"/);
});

test("renderTileIcon wraps long layer counts with current layer emphasized", () => {
  const dataUrl = renderTileIcon({
    role: "layers",
    text: "383/429",
    color: "#00AE42",
    progress: 89
  });

  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
  assert.match(svg, />383</);
  assert.match(svg, />429</);
  assert.doesNotMatch(svg, />383\/429</);
  assert.match(svg, /fill="#f8fafc"/);
  assert.match(svg, /fill="#dbeafe"/);
  assert.match(svg, /y="72"/);
  assert.match(svg, /y="104"/);
  assert.doesNotMatch(svg, />\/429</);
});

test("renderTileIcon lays out compact layers like other metric tiles", () => {
  const dataUrl = renderTileIcon({
    role: "layers",
    text: "17/99",
    color: "#00AE42",
    progress: 17
  });

  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
  assert.match(svg, />17</);
  assert.match(svg, />99</);
  assert.match(svg, /x="72" y="72" text-anchor="middle"/);
  assert.match(svg, /x="72" y="104" text-anchor="middle"/);
  assert.doesNotMatch(svg, /<tspan/);
  assert.doesNotMatch(svg, />\/99</);
});

test("renderTileIcon centers compact layer count with short current layer", () => {
  const dataUrl = renderTileIcon({
    role: "layers",
    text: "1/429",
    color: "#00AE42",
    progress: 1
  });

  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
  assert.match(svg, /x="72" y="72" text-anchor="middle"/);
  assert.match(svg, />1</);
  assert.match(svg, />429</);
  assert.doesNotMatch(svg, />\/429</);
  assert.doesNotMatch(svg, /text-anchor="end"/);
});

test("renderTileIcon wraps long stage text", () => {
  const dataUrl = renderTileIcon({
    role: "stage",
    text: "Nozzle Clean",
    color: "#00AE42",
    progress: 58
  });

  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
  assert.match(svg, />NOZZLE</);
  assert.match(svg, />CLEAN</);
  assert.doesNotMatch(svg, />NOZZLE CLEAN</);
  assert.match(svg, /y="66"/);
  assert.match(svg, /y="94"/);
});

test("renderTileIcon gives temperature tiles a layered layout", () => {
  const dataUrl = renderTileIcon({
    role: "nozzle",
    label: "Nozzle",
    text: "245",
    subtext: "245°C",
    detail: "0.4MM HARDENED",
    color: "#f97316",
    progress: 100
  });

  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
  assert.match(svg, />245</);
  assert.match(svg, />245°C</);
  assert.match(svg, />0.4MM HARDENED</);
  assert.doesNotMatch(svg, /SET/);
  assert.match(svg, /font-size="44"/);
  assert.match(svg, /font-size="17"/);
  assert.match(svg, /x="72" y="72"/);
  assert.match(svg, /x="72" y="96"/);
  assert.match(svg, /x="72" y="110"/);
  assert.match(svg, /fill="#dbeafe"/);
  assert.match(svg, /fill="#94a3b8"/);
  assert.doesNotMatch(svg, /245\/245/);
});

test("renderTileIcon can color only the bottom progress bar", () => {
  const dataUrl = renderTileIcon({
    role: "bed",
    label: "Bed",
    text: "35",
    subtext: "0°C",
    color: "#eab308",
    progressColor: "#38bdf8",
    progress: 100
  });

  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
  assert.match(svg, /fill="#eab308">BED/);
  assert.match(svg, /stroke="#38bdf8"/);
  assert.match(svg, /stop-color="#38bdf8"/);
  assert.match(svg, /width="120" height="10"/);
});

test("renderTileIcon draws fan rows with compact percentages", () => {
  const dataUrl = renderTileIcon({
    role: "fans",
    label: "Fans",
    color: "#a78bfa",
    progress: 40,
    fans: [
      { shortLabel: "P", percent: 80, color: "#a78bfa" },
      { shortLabel: "A", percent: 40, color: "#c084fc" },
      { shortLabel: "C", percent: 0, color: "#f472b6" }
    ]
  });

  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
  assert.match(svg, />P</);
  assert.match(svg, />80%/);
  assert.match(svg, />A</);
  assert.match(svg, />40%/);
  assert.match(svg, />C</);
  assert.match(svg, />0%/);
  assert.doesNotMatch(svg, /#38bdf8|#60a5fa/);
  assert.match(svg, /x="11" y="118" width="122" height="12"/);
  assert.match(svg, /x="12" y="119" width="48" height="10"/);
});

test("renderTileIcon renders human-readable error messages", () => {
  const dataUrl = renderTileIcon({
    role: "errors",
    label: "Errors",
    color: "#dc2626",
    progress: 100,
    warning: true,
    errorLines: ["FAN TOO", "SLOW", "0300-0400"]
  });

  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
  assert.match(svg, />FAN TOO</);
  assert.match(svg, />SLOW</);
  assert.match(svg, />0300-0400</);
});

test("renderTileIcon draws AMS overview and slot detail", () => {
  const overview = renderTileIcon({
    role: "ams",
    label: "AMS",
    color: "#00AE42",
    progress: 53,
    amsMode: "overview",
    amsSlots: [
      { label: "A1", material: "PLA", color: "#FF0000", remainPercent: 72, remainText: "72%" },
      { label: "A2", material: "PETG", color: "#00AAFF", remainPercent: 34, remainText: "34%", active: true },
      { label: "A3", material: "ABS", color: "#111111", remainPercent: null, remainText: "--" },
      { label: "A4", material: "EMPTY", color: "#334155", remainPercent: null, remainText: "--", empty: true }
    ]
  });
  const overviewSvg = Buffer.from(overview.split(",")[1], "base64").toString("utf8");
  assert.match(overviewSvg, />A1</);
  assert.match(overviewSvg, />A2</);
  assert.match(overviewSvg, /#FF0000/);
  assert.match(overviewSvg, /#00AAFF/);

  const detail = renderTileIcon({
    role: "ams",
    label: "A2",
    text: "PETG",
    subtext: "34%",
    color: "#00AE42",
    progress: 34,
    amsMode: "slot",
    amsSlot: { label: "A2", material: "PETG", materialDetail: "HF", color: "#00AAFF", remainPercent: 34, remainText: "34%", brand: "Bambu" }
  });
  const detailSvg = Buffer.from(detail.split(",")[1], "base64").toString("utf8");
  assert.match(detailSvg, />A2</);
  assert.match(detailSvg, />PETG</);
  assert.match(detailSvg, />HF</);
  assert.doesNotMatch(detailSvg, />34%/);
  assert.match(detailSvg, /#00AAFF/);

  const env = renderTileIcon({
    role: "ams",
    label: "AMS B",
    text: "78%",
    subtext: "38°C",
    color: "#00AE42",
    labelColor: "#38bdf8",
    progress: 78,
    amsMode: "env",
    amsUnit: { label: "AMS B", model: "AMS HT", humidityText: "78%", temperatureText: "38°C" }
  });
  const envSvg = Buffer.from(env.split(",")[1], "base64").toString("utf8");
  assert.match(envSvg, />HUMIDITY</);
  assert.match(envSvg, /fill="#38bdf8">HUMIDITY/);
  assert.match(envSvg, />78%/);
  assert.match(envSvg, />38°C</);
  assert.match(envSvg, /<text x="72" y="74" text-anchor="middle"/);
  assert.doesNotMatch(envSvg, /c-3.2 4.2/);
  assert.doesNotMatch(envSvg, />AMS B</);
  assert.doesNotMatch(envSvg, />AMS HT</);
  assert.doesNotMatch(envSvg, />DRY</);
});

test("renderCameraIcon embeds the latest JPEG frame", () => {
  const jpegDataUrl = "data:image/jpeg;base64,/9j/2Q==";
  const dataUrl = renderCameraIcon({
    connected: true,
    frameDataUrl: jpegDataUrl,
    frameId: 1
  }, {
    connected: true,
    status: "RUNNING",
    progress: 42,
    remainingText: "1h02"
  });

  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
  assert.match(svg, /data:image\/jpeg;base64/);
  assert.match(svg, /42% 1h02/);
  assert.match(svg, /x="5" y="5" width="134" height="134" rx="14" fill="none"/);
  assert.match(svg, /x="10" y="10" width="124" height="124"/);
  assert.doesNotMatch(svg, /x="0" y="0" width="144" height="144" preserveAspectRatio/);
  assert.match(svg, /stroke-width="5"/);
});

test("renderCameraIcon shows off state when camera is manually disabled", () => {
  const dataUrl = renderCameraIcon({
    active: false,
    connected: false,
    frameDataUrl: "data:image/jpeg;base64,/9j/2Q==",
    frameId: 1
  }, {
    connected: true,
    status: "RUNNING",
    progress: 42,
    remainingText: "1h02"
  });

  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
  assert.match(svg, />OFF</);
  assert.match(svg, />PRESS ON</);
  assert.doesNotMatch(svg, /data:image\/jpeg;base64/);
});

test("renderCameraIcon distinguishes a busy P1 camera slot from a hard error", () => {
  const dataUrl = renderCameraIcon({
    active: true,
    connected: false,
    phase: "waiting",
    error: "Camera stream busy"
  }, {
    connected: true,
    status: "IDLE",
    progress: 0,
    remainingText: ""
  });

  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
  assert.match(svg, />WAIT</);
  assert.match(svg, />CAM BUSY</);
  assert.match(svg, /#f59e0b/);
  assert.doesNotMatch(svg, />CAM ERR</);
});

test("renderCameraIcon does not present a stale frame as live while reconnecting", () => {
  const dataUrl = renderCameraIcon({
    active: true,
    connected: false,
    phase: "retrying",
    error: "",
    frameDataUrl: "data:image/jpeg;base64,/9j/2Q==",
    frameId: 8
  }, {
    connected: true,
    status: "IDLE",
    progress: 0,
    remainingText: ""
  });

  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
  assert.match(svg, />RETRY</);
  assert.match(svg, />RECONNECT</);
  assert.doesNotMatch(svg, /data:image\/jpeg;base64/);
  assert.doesNotMatch(svg, />LIVE</);
});

test("renderCameraMosaicTile crops one continuous camera canvas into D200X grid cells", () => {
  const cameraState = {
    active: true,
    connected: true,
    frameDataUrl: "data:image/jpeg;base64,/9j/2Q==",
    frameId: 12
  };
  const topLeft = renderCameraMosaicTile(cameraState, "plugin___0_0___action");
  const middleRight = renderCameraMosaicTile(cameraState, "plugin___4_1___action");
  const bottom = renderCameraMosaicTile(cameraState, "plugin___2_2___action");
  const topLeftSvg = Buffer.from(topLeft.split(",")[1], "base64").toString("utf8");
  const middleRightSvg = Buffer.from(middleRight.split(",")[1], "base64").toString("utf8");
  const bottomSvg = Buffer.from(bottom.split(",")[1], "base64").toString("utf8");

  assert.match(topLeftSvg, /viewBox="0 0 144 144"/);
  assert.match(middleRightSvg, /viewBox="0 0 144 144"/);
  assert.match(bottomSvg, /viewBox="0 0 144 144"/);
  assert.match(topLeftSvg, /<image[^>]+x="0" y="0" width="720" height="432"/);
  assert.match(middleRightSvg, /<image[^>]+x="-576" y="-144" width="720" height="432"/);
  assert.match(bottomSvg, /<image[^>]+x="-288" y="-288" width="720" height="432"/);
  assert.notEqual(topLeftSvg, middleRightSvg);
  assert.notEqual(middleRightSvg, bottomSvg);
  for (const svg of [topLeftSvg, middleRightSvg, bottomSvg]) {
    assert.match(svg, /data:image\/jpeg;base64/);
    assert.match(svg, /preserveAspectRatio="xMidYMid slice"/);
    assert.doesNotMatch(svg, /stroke-width|PROGRESS|CAM LIVE/);
  }
});

test("renderCameraMosaicTile shows one coordinated waiting surface without a frame", () => {
  const dataUrl = renderCameraMosaicTile({
    active: true,
    connected: false,
    error: ""
  }, "plugin___2_1___action");
  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");

  assert.match(svg, /viewBox="0 0 144 144"/);
  assert.match(svg, /<rect x="-288" y="-144" width="720" height="432"/);
  assert.match(svg, />CAMERA</);
  assert.match(svg, />CONNECTING</);
  assert.doesNotMatch(svg, /data:image\/jpeg;base64/);
});

test("renderCameraMosaicTile shows camera-slot contention as waiting instead of failure", () => {
  const dataUrl = renderCameraMosaicTile({
    active: true,
    connected: false,
    phase: "waiting",
    error: "Camera stream busy"
  }, "plugin___2_1___action");
  const svg = Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");

  assert.match(svg, />CAMERA SLOT BUSY</);
  assert.match(svg, /#f59e0b/);
  assert.doesNotMatch(svg, /#ef4444/);
});
