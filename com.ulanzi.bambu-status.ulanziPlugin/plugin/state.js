import { describePrinterErrors } from "./error-codes.js";

export const DEFAULT_GLOBAL_SETTINGS = Object.freeze({
  host: "",
  serial: "",
  accessCode: "",
  model: "Auto",
  emptyBedCaptureVariant: "light-on",
  ffmpegPath: "",
  refreshInterval: "2",
  autoPushAll: "true",
  tlsVerify: "false",
  bedCheckEnabled: "true",
  bedCheckAutoCapture: "false",
  emptyBedCaptureRequest: "",
  cameraCacheEnabled: "true",
  cameraCacheInterval: "60",
  cameraCacheLimit: "3"
});

export const DEFAULT_ACTION_SETTINGS = Object.freeze({
  tileRole: "",
  showText: "true",
  amsUnit: "auto"
});

const SAFE_TOUCH_TEMP_C = 40;
const SAFE_TOUCH_COLOR = "#00AE42";

export const TILE_ROLES = Object.freeze([
  "status",
  "progress",
  "eta",
  "layers",
  "nozzle",
  "bed",
  "fans",
  "file",
  "errors",
  "connection",
  "wifi",
  "updated",
  "ams",
  "light",
  "camera",
  "custom"
]);

const ACTION_ROLE_SUFFIXES = Object.freeze({
  status: "status",
  progress: "progress",
  eta: "eta",
  layers: "layers",
  nozzle: "nozzle",
  bed: "bed",
  fans: "fans",
  ams: "ams",
  file: "file",
  stage: "status",
  errors: "errors",
  connection: "connection",
  light: "light",
  camera: "camera",
  custom: "custom"
});

export const STAGE_LABELS = Object.freeze({
  "-1": "Idle",
  "0": "Printing",
  "1": "Bed Level",
  "2": "Bed Heat",
  "3": "XY Sweep",
  "4": "Filament",
  "5": "Paused",
  "6": "Runout",
  "7": "Nozzle Heat",
  "8": "Extrusion",
  "9": "Bed Scan",
  "10": "First Layer",
  "11": "Plate ID",
  "12": "LiDAR",
  "13": "Homing",
  "14": "Nozzle Clean",
  "15": "Temp Check",
  "16": "User Pause",
  "19": "Flow Cal",
  "20": "Nozzle Fault",
  "21": "Bed Fault",
  "22": "Unloading",
  "23": "Skipped Step",
  "24": "Loading",
  "25": "Noise Cal",
  "26": "AMS Lost",
  "27": "Fan Fault",
  "28": "Chamber Fault",
  "29": "Cooling",
  "30": "G-code Pause",
  "33": "Cutter Fault",
  "34": "Layer Fault",
  "35": "Nozzle Clog",
  "51": "Prime Line",
  "54": "Bed Level Prep",
  "58": "Chamber Heat",
  "66": "Air Purifying",
  "255": "Idle"
});

export function sanitizeGlobalSettings(settings = {}) {
  return {
    ...DEFAULT_GLOBAL_SETTINGS,
    ...pickStrings(settings, Object.keys(DEFAULT_GLOBAL_SETTINGS))
  };
}

export function sanitizeActionSettings(settings = {}) {
  return {
    ...DEFAULT_ACTION_SETTINGS,
    ...pickStrings(settings, Object.keys(DEFAULT_ACTION_SETTINGS))
  };
}

export function actionRoleFromContext(context, settings = {}, ...actionRefs) {
  const contextParts = String(context || "").split("___");
  const candidates = [
    ...actionRefs,
    contextParts[0],
    contextParts[2]
  ].filter(Boolean);

  for (const candidate of candidates) {
    const role = roleFromActionRef(candidate);
    if (role && role !== "custom") {
      return role;
    }
  }

  const configuredRole = settings.tileRole || "";
  if (configuredRole && configuredRole !== "auto" && TILE_ROLES.includes(configuredRole)) {
    return configuredRole;
  }

  for (const candidate of candidates) {
    const role = roleFromActionRef(candidate);
    if (role && role !== "custom") {
      return role;
    }
  }

  return "status";
}

export function mergeBambuReport(currentState = {}, report = {}) {
  const incoming = report.print && typeof report.print === "object" ? report.print : report;
  return deepMerge(currentState, incoming);
}

export function buildPrinterView(rawState = {}, connection = {}) {
  const gcodeState = normalizeState(rawState.gcode_state);
  const progress = clampNumber(rawState.mc_percent, 0, 100, 0);
  const remainingMinutes = optionalNumber(rawState.mc_remaining_time);
  const currentLayer = optionalNumber(rawState.layer_num);
  const totalLayers = optionalNumber(rawState.total_layer_num);
  const stageId = rawState.stg_cur ?? rawState.mc_print_stage ?? rawState.stg_cd;
  const stage = stageLabel(stageId, gcodeState);
  const printErrorValue = firstPresent(rawState.print_error, rawState.mc_print_error_code);
  const printError = optionalNumber(rawState.print_error) || optionalNumber(rawState.mc_print_error_code) || 0;
  const hms = Array.isArray(rawState.hms) ? rawState.hms : [];
  const errorInfo = describePrinterErrors(printErrorValue, hms);
  const hasNotice = errorInfo.hasError;
  const hasError = isCriticalPrintError(gcodeState, hasNotice);
  const stateColor = colorForState(gcodeState, connection.connected, hasError);
  const remainingText = formatMinutes(remainingMinutes);
  const finish = finishEstimate(remainingMinutes);
  const elapsedMinutes = elapsedMinutesFromRaw(rawState);
  const totalMinutes = totalMinutesFromRaw(elapsedMinutes, remainingMinutes, progress, gcodeState);
  const totalTimeText = formatMinutes(totalMinutes);
  const fileName = rawState.subtask_name || rawState.gcode_file || rawState.project_name || "";
  const amsSlots = normalizeAmsSlots(rawState.ams);
  const amsUnits = normalizeAmsUnits(rawState.ams, amsSlots);
  const lightMode = chamberLightMode(rawState.lights_report);

  return {
    connected: Boolean(connection.connected),
    lastMessageAt: connection.lastMessageAt || null,
    stale: isStale(connection.lastMessageAt),
    status: gcodeState,
    statusLabel: labelForState(gcodeState),
    stateColor,
    progress,
    remainingMinutes,
    remainingText,
    finishText: finish.text,
    finishDayOffset: finish.dayOffset,
    elapsedMinutes,
    totalMinutes,
    totalTimeText,
    currentLayer,
    totalLayers,
    layerText: layerText(currentLayer, totalLayers),
    fileName,
    shortFileName: shortFileName(fileName),
    stage,
    stageId: stageId ?? null,
    nozzle: {
      current: optionalNumber(rawState.nozzle_temper),
      target: optionalNumber(rawState.nozzle_target_temper),
      detail: nozzleDetail(rawState)
    },
    bed: {
      current: optionalNumber(rawState.bed_temper),
      target: optionalNumber(rawState.bed_target_temper),
      detail: bedDetail(rawState)
    },
    fans: normalizeFans(rawState),
    wifi: rawState.wifi_signal || "",
    printType: rawState.print_type || "",
    printError,
    hms,
    errorInfo,
    hasNotice,
    hasError,
    amsText: amsText(rawState.ams),
    amsLines: amsLines(amsSlots),
    amsSlots,
    amsUnits,
    amsUnitCount: amsUnitCount(rawState.ams),
    lightMode,
    lightOn: lightMode === "on" || lightMode === "flashing"
  };
}

export function buildTilePayload(role, printerView, actionSettings = {}, runtime = {}) {
  const showText = actionSettings.showText !== "false";
  const unavailable = !printerView.connected;
  const stale = printerView.stale && printerView.connected;
  const bedOccupancy = runtime.bedOccupancy || printerView.bedOccupancy || {};

  if (unavailable) {
    return {
      role,
      label: "Offline",
      text: showText ? "OFFLINE" : "",
      color: "#64748b",
      progress: 0,
      warning: true
    };
  }

  if (stale) {
    return {
      role,
      label: "Stale",
      text: showText ? "STALE" : "",
      color: "#f59e0b",
      progress: printerView.progress,
      warning: true
    };
  }

  switch (role) {
    case "progress":
      return progressTile(printerView, runtime.progressMode, runtime.originalFinishText);
    case "eta":
      return etaTile(printerView, runtime.etaMode);
    case "layers":
      return tile("Layers", printerView.layerText || "--/--", printerView.stateColor, layerProgress(printerView));
    case "nozzle":
      return temperatureTile("Nozzle", printerView.nozzle, "#f97316", showText, printerView.status);
    case "bed":
      return temperatureTile("Bed", printerView.bed, "#eab308", showText, printerView.status);
    case "fans":
      return fanTile(printerView);
    case "file":
      return tile("File", printerView.shortFileName || "No file", printerView.stateColor, printerView.progress, "", false, fileDisplayLines(printerView.fileName || printerView.shortFileName || "No file"));
    case "stage":
      return statusTile(printerView, showText);
    case "errors":
      return errorTile(printerView);
    case "connection":
      return tile("MQTT", printerView.connected ? "LIVE" : "OFF", printerView.connected ? "#00AE42" : "#64748b", printerView.connected ? 100 : 0);
    case "light":
      return lightTile(printerView, runtime.lightControl);
    case "wifi":
      return tile("WiFi", printerView.wifi || "--", "#38bdf8", wifiProgress(printerView.wifi));
    case "updated":
      return tile("Updated", ageText(printerView.lastMessageAt), "#38bdf8", 100);
    case "ams":
      return amsTile(printerView, runtime.amsMode);
    case "camera":
      return tile("Camera", "CAM", printerView.stateColor, printerView.progress);
    case "status":
    default:
      return statusTile(printerView, showText);
  }

  function tile(label, text, color, progress, subtext = "", warning = false, lines = []) {
    return {
      role,
      label,
      text: showText ? text : "",
      color,
      progress: clampNumber(progress, 0, 100, 0),
      subtext,
      warning,
      lines
    };
  }

  function lightTile(view, control = {}) {
    if (control?.pendingTarget) {
      return {
        role,
        label: "Light",
        text: showText ? "WAIT" : "",
        subtext: "SWITCHING",
        color: "#facc15",
        progressColor: "#facc15",
        progress: 50,
        warning: false
      };
    }

    if (control?.failed) {
      return {
        role,
        label: "Light",
        text: showText ? "FAIL" : "",
        subtext: "NO REPLY",
        color: "#ef4444",
        progressColor: "#ef4444",
        progress: 100,
        warning: true
      };
    }

    if (view.lightMode === "on" || view.lightMode === "flashing") {
      return {
        role,
        label: "Light",
        text: showText ? "ON" : "",
        subtext: "CHAMBER",
        color: "#facc15",
        progressColor: "#facc15",
        progress: 100,
        warning: false
      };
    }

    if (view.lightMode === "off") {
      return {
        role,
        label: "Light",
        text: showText ? "OFF" : "",
        subtext: "CHAMBER",
        color: "#94a3b8",
        progressColor: "#64748b",
        progress: 0,
        warning: false
      };
    }

    return {
      role,
      label: "Light",
      text: showText ? "--" : "",
      subtext: "NO DATA",
      color: "#64748b",
      progressColor: "#64748b",
      progress: 0,
      warning: false
    };
  }

  function statusTile(view, showStatusText = true) {
    if (view.hasError) return tile("Status", "ERR", "#dc2626", view.progress, statusSubtext(view), true);
    if (bedOccupancy.checking) {
      return {
        role,
        label: "Status",
        text: showStatusText ? "CHECK" : "",
        color: "#00AE42",
        progress: 40,
        subtext: "SCANNING",
        warning: false
      };
    }

    if (bedOccupancy.error === "NO_REFERENCE") {
      return {
        role,
        label: "Status",
        text: showStatusText ? "NO REF" : "",
        color: "#00AE42",
        progress: 0,
        subtext: "SET EMPTY",
        warning: false
      };
    }

    if (bedOccupancy.error) return {
      role, label: "Status", text: showStatusText ? "CHECK ERR" : "", color: "#dc2626", progress: 0,
      subtext: "RETRY", warning: true
    };

    if (bedOccupancy.occupied) {
      return {
        role,
        label: "Status",
        text: showStatusText ? "REMOVE" : "",
        color: bedOccupancy.color || "#facc15",
        progress: 100,
        subtext: "PART ON BED",
        warning: true,
        mainSize: 25
      };
    }

    if (bedOccupancy.checkedAt) {
      return {
        role,
        label: "Status",
        text: showStatusText ? "CLEAR" : "",
        color: "#00AE42",
        progress: 100,
        subtext: "BED EMPTY",
        warning: false
      };
    }

    return tile(
      "Status",
      showStatusText ? compactStatusText(view) : "",
      view.hasError ? "#dc2626" : view.stateColor,
      view.progress,
      statusSubtext(view),
      view.hasError
    );
  }

  function etaTile(view, mode = "finish") {
    const remaining = view.remainingText || "--";
    const finish = view.finishText || "--:--";
    const dayPrefix = finishDayPrefix(view.finishDayOffset);
    if (mode === "finish") {
      return tile(dayPrefix ? `${dayPrefix} End` : "End", finish, view.stateColor, view.progress, remaining);
    }
    return tile("Left", remaining, view.stateColor, view.progress, dayPrefix ? `${dayPrefix} ${finish}` : finish);
  }

  function progressTile(view, mode = "remaining", originalFinishText = "") {
    if (mode === "original") {
      return tile("Progress", `${view.progress}%`, view.stateColor, view.progress, originalFinishText || "--:--");
    }
    return tile("Progress", `${view.progress}%`, view.stateColor, view.progress, view.remainingText);
  }

  function amsTile(view, mode = {}) {
    const unitIndex = mode.unitIndex ?? null;
    const slots = selectedAmsSlots(view, unitIndex);
    const unit = selectedAmsUnit(view, unitIndex);
    const selectedIndex = clampSlotIndex(mode.slotIndex, slots.length);
    const pageSize = 4;
    const totalPages = Math.max(1, Math.ceil(slots.length / pageSize));
    const overviewPage = clampPage(
      mode.page ?? 0,
      totalPages
    );
    if (mode.mode === "slot" && slots[selectedIndex]) {
      const slot = slots[selectedIndex];
      return {
        role: "ams",
        label: slot.label,
        text: showText ? slot.material : "",
        color: "#00AE42",
        progress: slot.remainPercent ?? 0,
        subtext: slot.remainText,
        amsTotalSlots: slots.length,
        amsMode: "slot",
        amsSlot: slot,
        warning: false
      };
    }

    if (mode.mode === "env" && unit) {
      return {
        role: "ams",
        label: "",
        text: showText ? unit.humidityText : "",
        color: "#38bdf8",
        labelColor: "#38bdf8",
        progress: unit.humidityProgress,
        subtext: unit.temperatureText,
        amsTotalSlots: slots.length,
        amsMode: "env",
        amsUnit: unit,
        warning: false
      };
    }

    return {
      role: "ams",
      label: unit ? unit.shortLabel : "AMS",
      text: showText ? (unit ? `${unit.slotCount} SLOT` : view.amsText || "--") : "",
      color: "#00AE42",
      progress: amsAverageRemain(slots),
      subtext: unit ? unit.model : "",
      lines: unit ? amsLines(slots) : view.amsLines,
      amsMode: "overview",
      amsPage: overviewPage,
      amsTotalPages: totalPages,
      amsTotalSlots: slots.length,
      amsSlots: slots.slice(overviewPage * pageSize, overviewPage * pageSize + pageSize),
      amsUnit: unit,
      warning: false
    };
  }

  function fanTile(view) {
    const fans = Array.isArray(view.fans) ? view.fans : [];
    const knownFans = fans.filter((fan) => fan.percent !== null);
    const maxFan = knownFans.length
      ? Math.max(...knownFans.map((fan) => fan.percent))
      : 0;
    const averageFan = knownFans.length
      ? clampNumber(knownFans.reduce((sum, fan) => sum + fan.percent, 0) / knownFans.length, 0, 100, 0)
      : 0;
    const activeFans = knownFans.filter((fan) => fan.percent > 0).length;
    return {
      role: "fans",
      label: "Fans",
      text: showText ? (knownFans.length ? `${averageFan}%` : "--") : "",
      subtext: knownFans.length ? "AVG" : "NO DATA",
      color: activeFans ? "#a78bfa" : "#64748b",
      progress: averageFan,
      fans,
      warning: false
    };
  }

  function errorTile(view) {
    const errorInfo = view.errorInfo?.hasError
      ? view.errorInfo
      : view.status === "FAILED"
        ? { message: "PRINT FAILED", lines: ["PRINT", "FAILED"] }
        : view.errorInfo || {};
    if (!view.hasNotice && !view.hasError) {
      return tile("Errors", "OK", "#00AE42", 0, "CLEAR");
    }

    return {
      role: "errors",
      label: "Errors",
      text: showText ? "ERR" : "",
      color: "#dc2626",
      progress: 100,
      subtext: errorInfo.message || errorText(view),
      errorLines: errorInfo.lines || wrapWords(errorInfo.message || errorText(view), 3, 10),
      warning: true
    };
  }
}

function pickStrings(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      out[key] = String(source[key]);
    }
  }
  return out;
}

function roleFromActionRef(actionRef) {
  const suffix = String(actionRef || "").split(".").pop();
  return ACTION_ROLE_SUFFIXES[suffix] || "";
}

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && base[key] && typeof base[key] === "object" && !Array.isArray(base[key])) {
      out[key] = deepMerge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function chamberLightMode(lightsReport) {
  const entries = Array.isArray(lightsReport)
    ? lightsReport
    : lightsReport && typeof lightsReport === "object"
      ? [lightsReport]
      : [];
  const chamberLight = entries.find((item) => String(item?.node || "").toLowerCase() === "chamber_light");
  const mode = String(chamberLight?.mode || "").trim().toLowerCase();
  return ["on", "off", "flashing"].includes(mode) ? mode : "unknown";
}

function normalizeState(state) {
  const text = String(state || "UNKNOWN").toUpperCase();
  if (text === "PAUSE") return "PAUSED";
  if (text === "FINISHED") return "FINISH";
  if (["IDLE", "PREPARE", "RUNNING", "PAUSED", "FINISH", "FAILED"].includes(text)) return text;
  return text === "UNKNOWN" ? "UNKNOWN" : text;
}

function labelForState(state) {
  return {
    IDLE: "Idle",
    PREPARE: "Prep",
    RUNNING: "Run",
    PAUSED: "Pause",
    FINISH: "Done",
    FAILED: "Fail",
    UNKNOWN: "Unknown"
  }[state] || titleCase(state);
}

function colorForState(state, connected, hasError) {
  if (!connected) return "#64748b";
  if (hasError) return "#dc2626";
  return {
    IDLE: "#64748b",
    PREPARE: "#38bdf8",
    RUNNING: "#00AE42",
    PAUSED: "#f59e0b",
    FINISH: "#00AE42",
    FAILED: "#dc2626"
  }[state] || "#8b5cf6";
}

function isCriticalPrintError(state, hasNotice) {
  if (state === "FAILED") return true;
  if (!hasNotice) return false;
  return !["RUNNING", "PREPARE"].includes(state);
}

function stageLabel(stageId, gcodeState) {
  if (stageId === undefined || stageId === null || stageId === "") {
    return labelForState(gcodeState);
  }
  return STAGE_LABELS[String(stageId)] || labelForState(gcodeState);
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampNumber(value, min, max, fallback) {
  const n = optionalNumber(value);
  if (n === null) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined) return "";
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export function finishEstimate(minutes, now = new Date()) {
  if (minutes === null || minutes === undefined) {
    return { text: "", dayOffset: null };
  }

  const start = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (Number.isNaN(start.getTime())) {
    return { text: "", dayOffset: null };
  }

  const finish = new Date(start.getTime() + Math.max(0, Number(minutes) || 0) * 60_000);
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const finishDay = Date.UTC(finish.getFullYear(), finish.getMonth(), finish.getDate());
  const dayOffset = Math.max(0, Math.round((finishDay - startDay) / 86_400_000));

  return {
    text: `${String(finish.getHours()).padStart(2, "0")}:${String(finish.getMinutes()).padStart(2, "0")}`,
    dayOffset
  };
}

function finishDayPrefix(dayOffset) {
  const days = Math.max(0, Math.floor(Number(dayOffset) || 0));
  return days > 0 ? `+${days}D` : "";
}

function layerText(current, total) {
  if (current === null && total === null) return "";
  return `${current ?? "--"}/${total ?? "--"}`;
}

function layerProgress(view) {
  if (!view.currentLayer || !view.totalLayers) return view.progress;
  return clampNumber((view.currentLayer / view.totalLayers) * 100, 0, 100, view.progress);
}

function temperatureTile(label, temp, color, showText = true, status = "UNKNOWN") {
  const current = temp.current === null ? "--" : `${Math.round(temp.current)}`;
  const target = temp.target === null ? "--" : `${Math.round(temp.target)}°C`;
  const progress = temp.target ? (Number(temp.current) / Number(temp.target)) * 100 : 0;
  const safeTouch = isSafeTouchTemperature(temp, status);
  return {
    role: label.toLowerCase(),
    label,
    text: showText ? current : "",
    subtext: showText ? target : "",
    detail: showText ? temp.detail || "" : "",
    color,
    progressColor: safeTouch ? SAFE_TOUCH_COLOR : color,
    progress: safeTouch ? 100 : clampNumber(progress, 0, 100, 0),
    safeTouch,
    warning: false
  };
}

function isSafeTouchTemperature(temp, status) {
  const current = optionalNumber(temp.current);
  const target = optionalNumber(temp.target);
  if (current === null || current > SAFE_TOUCH_TEMP_C) return false;
  if (target !== null && target > SAFE_TOUCH_TEMP_C) return false;
  return !["RUNNING", "PREPARE"].includes(String(status || "").toUpperCase());
}

function nozzleDetail(rawState) {
  const diameter = normalizeNozzleDiameter(firstPresent(
    rawState.nozzle_diameter,
    rawState.nozzle_diameter_mm,
    rawState.nozzle_dia,
    rawState.nozzle_size
  ));
  const material = normalizeHardwareText(firstPresent(
    rawState.nozzle_type,
    rawState.nozzle_material,
    rawState.nozzle_matl,
    rawState.nozzle_name,
    rawState.hotend_type,
    rawState.hotend_material
  ));
  return [diameter, material].filter(Boolean).join(" ").slice(0, 16);
}

function bedDetail(rawState) {
  return normalizeHardwareText(firstPresent(
    rawState.curr_bed_type,
    rawState.bed_type,
    rawState.plate_type,
    rawState.curr_plate,
    rawState.build_plate_type,
    rawState.bed_name,
    rawState.plate_name
  )).slice(0, 16);
}

function normalizeFans(rawState) {
  return [
    {
      key: "part",
      label: "PART",
      shortLabel: "P",
      color: "#a78bfa",
      percent: fanPercent(firstPresent(
        rawState.cooling_fan_speed,
        rawState.part_fan_speed,
        rawState.part_cooling_fan_speed,
        rawState.fan_gear,
        rawState.fan_speed
      ))
    },
    {
      key: "aux",
      label: "AUX",
      shortLabel: "A",
      color: "#c084fc",
      percent: fanPercent(firstPresent(
        rawState.big_fan1_speed,
        rawState.aux_fan_speed,
        rawState.auxiliary_fan_speed,
        rawState.big_fan_speed
      ))
    },
    {
      key: "chamber",
      label: "CHAM",
      shortLabel: "C",
      color: "#f472b6",
      percent: fanPercent(firstPresent(
        rawState.big_fan2_speed,
        rawState.chamber_fan_speed,
        rawState.chamber_fan,
        rawState.exhaust_fan_speed
      ))
    }
  ];
}

function fanPercent(value) {
  const n = optionalNumber(value);
  if (n === null) return null;

  const gearMap = {
    0: 0,
    1: 10,
    2: 20,
    4: 30,
    5: 40,
    7: 50,
    9: 60,
    10: 70,
    12: 80,
    13: 90,
    15: 100
  };

  if (Number.isInteger(n) && Object.hasOwn(gearMap, n)) return gearMap[n];
  if (n >= 0 && n <= 100) return clampNumber(n, 0, 100, 0);
  if (n > 100 && n <= 255) return clampNumber((n / 255) * 100, 0, 100, 0);
  return clampNumber(n, 0, 100, 0);
}

function shortFileName(fileName) {
  if (!fileName) return "";
  const clean = String(fileName).split(/[\\/]/).pop().replace(/\.(3mf|gcode)$/i, "");
  return clean.length > 16 ? `${clean.slice(0, 13)}...` : clean;
}

function fileDisplayLines(fileName) {
  const clean = String(fileName || "No file")
    .split(/[\\/]/)
    .pop()
    .replace(/\.(3mf|gcode)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim() || "No file";
  return wrapWords(clean, 3, 10);
}

function wrapWords(value, maxLines, maxChars) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let overflow = false;

  const parts = words.length ? words : [String(value || "")];
  for (let index = 0; index < parts.length; index += 1) {
    const word = parts[index];
    let remaining = word;
    while (remaining.length > maxChars) {
      pushLine(remaining.slice(0, maxChars));
      remaining = remaining.slice(maxChars);
      if (lines.length >= maxLines) {
        overflow = true;
        return trimFinalLine(lines, maxChars, overflow);
      }
    }
    pushLine(remaining);
    if (lines.length >= maxLines) {
      overflow = index < parts.length - 1;
      break;
    }
  }

  return trimFinalLine(lines, maxChars, overflow);

  function pushLine(part) {
    if (!part) return;
    const last = lines[lines.length - 1] || "";
    if (last && `${last} ${part}`.length <= maxChars) {
      lines[lines.length - 1] = `${last} ${part}`;
    } else {
      lines.push(part);
    }
  }
}

function trimFinalLine(lines, maxChars, overflow = false) {
  const trimmed = lines.slice(0, 3);
  if (overflow && trimmed.length === 3) {
    trimmed[2] = trimmed[2].length > maxChars - 3
      ? `${trimmed[2].slice(0, maxChars - 3)}...`
      : `${trimmed[2]}...`;
  }
  return trimmed;
}

function errorText(view) {
  if (view.printError) return `ERR ${view.printError}`;
  if (view.hms.length) return `HMS ${view.hms.length}`;
  return "OK";
}

function compactStatusText(view) {
  if (view.hasError) return "ERR";
  if (view.status === "RUNNING") return "RUN";
  if (view.status === "PREPARE") return "PREP";
  if (view.status === "PAUSED") return "PAUSE";
  if (view.status === "FINISH") return "DONE";
  if (view.status === "IDLE") return "IDLE";
  return view.statusLabel.toUpperCase().slice(0, 8);
}

function statusSubtext(view) {
  const stage = String(view.stage || "").trim();
  const status = String(view.statusLabel || "").trim();
  if (stage && stage.toUpperCase() !== status.toUpperCase()) {
    return stage;
  }
  return view.totalTimeText || view.remainingText;
}

function elapsedMinutesFromRaw(rawState) {
  const seconds = firstNumber(rawState.cost_time, rawState.print_duration, rawState.mc_print_duration);
  if (seconds !== null && seconds > 0) return seconds / 60;
  return firstNumber(rawState.elapsed_time, rawState.mc_print_time);
}

function totalMinutesFromRaw(elapsedMinutes, remainingMinutes, progress, status) {
  if (elapsedMinutes !== null && elapsedMinutes > 0) {
    if (remainingMinutes !== null && remainingMinutes !== undefined) {
      return elapsedMinutes + remainingMinutes;
    }
    if (status === "FINISH") return elapsedMinutes;
  }
  if (remainingMinutes !== null && remainingMinutes !== undefined && progress > 0 && progress < 100) {
    return remainingMinutes / (1 - progress / 100);
  }
  return null;
}

function firstNumber(...values) {
  for (const value of values) {
    const n = optionalNumber(value);
    if (n !== null) return n;
  }
  return null;
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function normalizeNozzleDiameter(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return normalizeHardwareText(text);
  return `${Number(match[0]).toString()}MM`;
}

function normalizeHardwareText(value) {
  return String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function wifiProgress(wifi) {
  const match = String(wifi || "").match(/-?\d+/);
  if (!match) return 0;
  const dbm = Number(match[0]);
  return clampNumber(((dbm + 90) / 60) * 100, 0, 100, 0);
}

function ageText(lastMessageAt) {
  if (!lastMessageAt) return "--";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(lastMessageAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function amsText(ams) {
  if (!ams || typeof ams !== "object") return "";
  const units = amsUnitCount(ams);
  if (!units) return "None";
  return `${units} AMS`;
}

function amsUnitCount(ams) {
  if (Array.isArray(ams?.ams) && ams.ams.length) return ams.ams.length;
  const bits = Number.parseInt(String(ams?.ams_exist_bits || ""), 16);
  if (!Number.isFinite(bits) || bits <= 0) return 0;
  return bits.toString(2).split("").filter((bit) => bit === "1").length;
}

function selectedAmsSlots(view, unitIndex) {
  const slots = Array.isArray(view.amsSlots) ? view.amsSlots : [];
  if (unitIndex === null || unitIndex === undefined || unitIndex === "") return slots;
  if (String(unitIndex).startsWith("id:")) return slots.filter((slot) => String(slot.unitId) === String(unitIndex).slice(3));
  const n = Number(unitIndex);
  if (!Number.isFinite(n)) return slots;
  return slots.filter((slot) => slot.unitIndex === n || slot.unitId === n);
}

function selectedAmsUnit(view, unitIndex) {
  const units = Array.isArray(view.amsUnits) ? view.amsUnits : [];
  if (!units.length) return null;
  if (unitIndex === null || unitIndex === undefined || unitIndex === "") {
    return units.find((unit) => unit.active) || units.find((unit) => unit.hasEnvironment) || (units.length === 1 ? units[0] : null);
  }
  if (String(unitIndex).startsWith("id:")) return units.find((unit) => String(unit.unitId) === String(unitIndex).slice(3)) || null;
  const n = Number(unitIndex);
  if (!Number.isFinite(n)) return null;
  return units.find((unit) => unit.unitIndex === n || unit.unitId === n) || null;
}

function normalizeAmsUnits(ams, slots) {
  if (!ams || typeof ams !== "object" || !Array.isArray(ams.ams)) return [];
  return ams.ams.map((unit, index) => {
    const unitId = Number(unit.id ?? unit.ams_id ?? unit.amsId ?? index);
    const unitSlots = (slots || []).filter((slot) => slot.unitId === unitId || slot.unitIndex === index);
    const humidity = normalizeAmsHumidity(
      firstPresent(
        unit.humidity_raw,
        unit.raw_humidity,
        unit.humidity_percent,
        unit.relative_humidity,
        unit.rh
      ),
      firstPresent(
        unit.humidity,
        unit.humidity_index,
        unit.humid,
        unit.hum,
        unit.ams_humidity
      )
    );
    const temperature = normalizeAmsTemperature(firstPresent(
      unit.temp,
      unit.temperature,
      unit.ams_temp,
      unit.ams_temperature,
      unit.current_temper,
      unit.current_temperature,
      unit.dry_temp,
      unit.tray_temp
    ));
    const slotCount = unitSlots.length || (Array.isArray(unit.tray) ? unit.tray.length : Array.isArray(unit.trays) ? unit.trays.length : 0);
    const model = normalizeAmsModel(unit, slotCount);

    return {
      unitId,
      unitIndex: index,
      label: amsUnitLabel(index),
      shortLabel: amsUnitLabel(index),
      model,
      slotCount,
      active: unitSlots.some((slot) => slot.active),
      humidityText: humidity.text,
      dryText: humidity.dryText,
      humidityRaw: humidity.raw,
      humidityKind: humidity.kind,
      humidityProgress: humidity.humidityProgress,
      dryProgress: humidity.dryProgress,
      temperatureText: temperature.text,
      temperatureRaw: temperature.raw,
      hasEnvironment: humidity.text !== "--" || temperature.text !== "--",
      color: humidity.warning ? "#f59e0b" : "#00AE42",
      warning: humidity.warning
    };
  });
}

function normalizeAmsSlots(ams) {
  if (!ams || typeof ams !== "object" || !Array.isArray(ams.ams)) return [];
  const slots = [];
  const trayNow = optionalNumber(ams.tray_now ?? ams.trayNow ?? ams.now_tray);
  const pushTraySlot = (unitId, unitIndex, tray, index, labelOverride = "") => {
    if (!tray || typeof tray !== "object") return;
    const slotId = tray.id ?? tray.tray_id ?? tray.slot_id ?? index;
    const materialSource = tray.tray_type || tray.type || tray.filament_type || tray.name || "";
    const materialInfo = normalizeMaterialInfo(
      materialSource,
      tray.tray_sub_brands || tray.filament_name || tray.filament_variant || (materialSource === tray.name ? "" : tray.name) || ""
    );
    const brand = tray.tray_sub_brands || tray.brand || "";
    const remainPercent = optionalPercent(tray.remain ?? tray.remaining ?? tray.remain_percent ?? tray.tray_remaining ?? tray.percent);
    const globalIndex = Number(unitId) * 4 + Number(slotId);
    slots.push({
      unitId: Number(unitId),
      unitIndex: Number(unitIndex),
      slotId: Number(slotId),
      globalIndex,
      label: labelOverride || amsSlotLabel(unitIndex, slotId),
      material: materialInfo.base,
      materialDetail: materialInfo.detail,
      materialFull: materialInfo.full,
      brand: String(brand || "").trim(),
      color: normalizeAmsColor(tray.tray_color || tray.color || tray.filament_color || tray.trayColor),
      remainPercent,
      remainText: remainPercent === null ? "--" : `${remainPercent}%`,
      active: trayNow !== null && (trayNow === globalIndex || (Number(unitId) === 0 && trayNow === Number(slotId))),
      empty: materialInfo.base === "EMPTY"
    });
  };

  for (const [unitIndex, unit] of ams.ams.entries()) {
    const unitId = unit.id ?? unit.ams_id ?? unit.amsId ?? unitIndex;
    const trays = Array.isArray(unit.tray) ? unit.tray : Array.isArray(unit.trays) ? unit.trays : [];
    trays.forEach((tray, index) => pushTraySlot(unitId, unitIndex, tray, index));
  }

  const virtualTrays = [
    ams.vt_tray,
    ams.virtual_tray,
    ams.external_spool,
    ams.ext_spool
  ].flatMap((tray) => Array.isArray(tray) ? tray : tray && typeof tray === "object" ? [tray] : []);

  virtualTrays.forEach((tray, index) => {
    const slotId = tray.id ?? tray.tray_id ?? tray.slot_id ?? slots.length;
    const label = slots.length === 4 ? "A5" : `EXT${index ? index + 1 : ""}`;
    pushTraySlot(0, 0, { ...tray, id: slotId }, slotId, label);
  });

  return slots;
}

function amsLines(slots) {
  if (!Array.isArray(slots) || !slots.length) return [];
  const labels = slots.slice(0, 3).map((slot) => `${slot.label} ${slot.material}`);
  if (slots.length > 3) labels.push("...");
  if (!slots.length) return [];
  return wrapWords(labels.join(" / "), 3, 10);
}

function normalizeMaterial(value) {
  return normalizeMaterialInfo(value).base;
}

function normalizeMaterialInfo(value, detailValue = "") {
  const material = cleanMaterialText(value);
  if (!material || /^EMPTY$/i.test(material)) {
    return {
      base: "EMPTY",
      detail: "",
      full: "EMPTY"
    };
  }

  const base = materialBase(material);
  const inlineDetail = material
    .replace(new RegExp(`(^|\\b)${escapeRegExp(base)}($|\\b)`, "i"), " ")
    .replace(/[-_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const extraDetail = cleanMaterialText(detailValue)
    .replace(/\b(BAMBU|BAMBU LAB|GENERIC|FILAMENT)\b/gi, " ")
    .replace(new RegExp(`(^|\\b)${escapeRegExp(base)}($|\\b)`, "i"), " ")
    .replace(/\s+/g, " ")
    .trim();
  const detail = (inlineDetail || extraDetail).slice(0, 14);

  return {
    base: base.slice(0, 9),
    detail,
    full: `${base}${detail ? ` ${detail}` : ""}`.trim().slice(0, 24)
  };
}

function materialBase(value) {
  const text = cleanMaterialText(value);
  const known = ["PETG", "PLA", "TPU", "ABS", "ASA", "PAHT", "PCTG", "PVA", "BVOH", "HIPS", "SUPPORT", "PA", "PC", "PP"];
  for (const base of known) {
    if (new RegExp(`(^|\\b)${escapeRegExp(base)}($|\\b|[-_+])`, "i").test(text)) return base;
  }
  return text.split(/\s+/)[0]?.slice(0, 9) || "EMPTY";
}

function cleanMaterialText(value) {
  return String(value || "")
    .trim()
    .replace(/[()]/g, " ")
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeAmsColor(value) {
  const raw = String(value || "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{6,8}$/i.test(raw)) return `#${raw.slice(0, 6).toUpperCase()}`;
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw.split("").map((part) => part + part).join("").toUpperCase()}`;
  }
  return "#334155";
}

function optionalPercent(value) {
  const n = optionalNumber(value);
  if (n === null) return null;
  return clampNumber(n, 0, 100, 0);
}

function amsSlotLabel(unitId, slotId) {
  const unitIndex = Number(unitId);
  const slotIndex = Number(slotId);
  const unitLabel = Number.isFinite(unitIndex) ? String.fromCharCode(65 + Math.max(0, Math.min(25, unitIndex))) : "A";
  const trayLabel = Number.isFinite(slotIndex) ? String(slotIndex + 1) : "?";
  return `${unitLabel}${trayLabel}`;
}

function amsUnitLabel(unitId) {
  const unitIndex = Number(unitId);
  return `AMS ${Number.isFinite(unitIndex) ? String.fromCharCode(65 + Math.max(0, Math.min(25, unitIndex))) : "A"}`;
}

function normalizeAmsModel(unit, slotCount) {
  const raw = normalizeHardwareText(firstPresent(
    unit.ams_type,
    unit.type,
    unit.model,
    unit.name,
    unit.ams_name
  ));
  if (/HT/.test(raw)) return "AMS HT";
  if (slotCount === 1) return raw || "1 SLOT";
  if (slotCount > 1) return "AMS";
  return raw || "AMS";
}

function normalizeAmsHumidity(rawPercentValue, indexValue) {
  const rawPercent = optionalNumber(rawPercentValue);
  if (rawPercent !== null) {
    const pct = clampNumber(rawPercent, 0, 100, 0);
    const dryProgress = clampNumber(100 - pct, 0, 100, 0);
    return {
      raw: pct,
      kind: "percent",
      text: `${pct}%`,
      dryText: `${dryProgress}%`,
      humidityProgress: pct,
      dryProgress,
      warning: pct >= 50
    };
  }

  const n = optionalNumber(indexValue);
  if (n === null) {
    return {
      raw: null,
      kind: "",
      text: "--",
      dryText: "--",
      humidityProgress: 0,
      dryProgress: 0,
      warning: false
    };
  }

  if (Number.isInteger(n) && n >= 1 && n <= 5) {
    const humidityProgress = clampNumber((n / 5) * 100, 0, 100, 0);
    const dryProgress = clampNumber(((6 - n) / 5) * 100, 0, 100, 0);
    return {
      raw: n,
      kind: "index",
      text: `${n}/5`,
      dryText: `${dryProgress}%`,
      humidityProgress,
      dryProgress,
      warning: n >= 4
    };
  }

  const pct = clampNumber(n, 0, 100, 0);
  const dryProgress = clampNumber(100 - pct, 0, 100, 0);
  return {
    raw: pct,
    kind: "percent",
    text: `${pct}%`,
    dryText: `${dryProgress}%`,
    humidityProgress: pct,
    dryProgress,
    warning: pct >= 50
  };
}

function normalizeAmsTemperature(value) {
  const n = optionalNumber(value);
  if (n === null) {
    return {
      raw: null,
      text: "--"
    };
  }
  return {
    raw: n,
    text: `${Math.round(n)}°C`
  };
}

function amsAverageRemain(slots) {
  const known = (slots || []).map((slot) => slot.remainPercent).filter((value) => value !== null);
  if (!known.length) return 0;
  return clampNumber(known.reduce((sum, value) => sum + value, 0) / known.length, 0, 100, 0);
}

function clampSlotIndex(index, length) {
  if (!length) return 0;
  const n = Number(index);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(length - 1, Math.round(n)));
}

function clampPage(index, totalPages) {
  const n = Number(index);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(Math.max(1, totalPages) - 1, Math.round(n)));
}

function preferredAmsOverviewPage(slots) {
  const activeIndex = (slots || []).findIndex((slot) => slot.active);
  if (activeIndex < 0) return 0;
  return Math.floor(activeIndex / 4);
}

function isStale(lastMessageAt) {
  if (!lastMessageAt) return false;
  return Date.now() - new Date(lastMessageAt).getTime() > 90_000;
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
