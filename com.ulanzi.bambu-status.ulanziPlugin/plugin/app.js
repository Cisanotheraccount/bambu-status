import { UlanziApi } from "./ulanzi-api/index.js";
import { promises as fs } from "fs";
import path from "path";
import { dataDirectory, printerDirectory, redactDiagnostic } from "./platform.js";
import { PrinterProfiles, probePrinter } from "./pairing.js";
import { discoverPrinters } from "./discovery.js";
import { PrintEstimate } from "./print-estimate.js";
import { isFreshCameraFrame } from "./frame-check.js";
import { BambuMqttClient } from "./bambu-mqtt.js";
import { CameraAdapter } from "./camera-adapter.js";
import { BedOccupancyDetector } from "./bed-occupancy.js";
import {
  actionRoleFromContext,
  buildPrinterView,
  buildTilePayload,
  DEFAULT_ACTION_SETTINGS,
  DEFAULT_GLOBAL_SETTINGS,
  mergeBambuReport,
  sanitizeActionSettings,
  sanitizeGlobalSettings
} from "./state.js";
import {
  cameraMosaicPosition,
  CAMERA_MOSAIC_FRAME_INTERVAL_MS,
  CAMERA_MOSAIC_LONG_PRESS_MS,
  hasCompleteCameraMosaic
} from "./camera-mosaic.js";
import { renderCameraIcon, renderCameraMosaicTile, renderTileIcon } from "./icon-renderer.js";

const PLUGIN_UUID = "com.ulanzi.ulanzistudio.bambustatus";

const $UD = new UlanziApi();
const bambu = new BambuMqttClient();
const camera = new CameraAdapter();
const bedDetector = new BedOccupancyDetector();
const profiles = new PrinterProfiles();
const estimate = new PrintEstimate(path.join(dataDirectory(), "unpaired", "estimate.json"));
let pairedPrinter = null;
let loadingProfile = null;
let discoveryWork = null;
let setupBusy = false;
let lastSetupStatusKey = "";
const actions = new Map();
const AMS_LONG_PRESS_MS = 750;
const LIGHT_DEBOUNCE_MS = 700;
const LIGHT_REFRESH_DELAY_MS = 750;
const LIGHT_CONFIRM_TIMEOUT_MS = 3_000;
const LIGHT_FAILURE_VISIBLE_MS = 3_000;
const CAMERA_DIAGNOSTIC_PATH = path.join(dataDirectory(), "camera-diagnostic.json");
const CAMERA_DIAGNOSTIC_TEMP_PATH = `${CAMERA_DIAGNOSTIC_PATH}.tmp`;
const CAMERA_DIAGNOSTIC_FRAME_MIN_MS = 15_000;

let globalSettings = { ...DEFAULT_GLOBAL_SETTINGS };
let printerState = {};
let connectionState = {
  connected: false,
  lastMessageAt: null,
  error: "",
  reason: "starting"
};
let renderTimer = null;
let lastCameraJumpAt = 0;
const etaToggleTimes = new Map();
const progressToggleTimes = new Map();
const amsViewModes = new Map();
const amsPressStates = new Map();
const amsActionTimes = new Map();
const lightActionTimes = new Map();
const cameraMosaicPressStates = new Map();
const cameraMosaicRunSuppressUntil = new Map();
let cameraManuallyDisabled = false;
let cameraMosaic = createCameraMosaicState();
let cameraMosaicFrameTimer = null;
let lightControlState = {
  pendingTarget: "",
  failedUntil: 0,
  error: ""
};
let lightRefreshTimer = null;
let lightConfirmTimer = null;
let lightFailureTimer = null;
let pendingEmptyBedCapture = "";
let pendingEmptyBedCaptureFrame = null;
let pendingManualBedCheck = false;
let pendingManualBedCheckFrameId = 0;
let pendingManualBedCheckStartedAt = 0;
let lastHandledCaptureRequest = "";
let didLoadGlobalSettingsOnce = false;
let cameraFrameWorkActive = false;
let lastManualBedCheckAt = 0;
let lastCameraDiagnosticFrameAt = 0;
let cameraDiagnosticWritePromise = Promise.resolve();

$UD.connect(PLUGIN_UUID);

$UD.onConnected(() => {
  log("Connected to Ulanzi Studio");
  resetCameraMosaicState();
  cameraManuallyDisabled = false;
  $UD.getGlobalSettings();
  loadSavedGlobalSettingsFallback();
  updateCameraEnabled();
  scheduleRender();
});

$UD.onClose(() => {
  exitCameraMosaic("connection-close", { render: false, toast: false });
  camera.setEnabled(false);
  bambu.disconnect();
  log("Ulanzi Studio connection closed", "warn");
});
$UD.onError((err) => log(`Ulanzi Studio websocket error: ${err}`, "error"));

$UD.onAdd((message) => {
  const context = message.context;
  const settings = sanitizeActionSettings(message.param || {});
  actions.set(context, {
    context,
    actionid: message.actionid,
    actionUuid: message.uuid,
    action: message.action || message.Action,
    settings,
    active: true
  });
  $UD.getGlobalSettings();
  loadSavedGlobalSettingsFallback();
  updateCameraEnabled();
  renderContext(context);
});

$UD.onSetActive((message) => {
  const action = actions.get(message.context);
  if (!action) return;
  action.active = String(message.active) === "true";
  if (cameraMosaic.active && !action.active && cameraMosaicPosition(message.context)) {
    exitCameraMosaic("page-change", { render: false, toast: false });
  }
  updateCameraEnabled();
  if (action.active) renderContext(message.context);
});

$UD.onClear((message) => {
  let removedMosaicContext = false;
  for (const item of message.param || []) {
    removedMosaicContext ||= Boolean(cameraMosaicPosition(item.context));
    actions.delete(item.context);
    etaToggleTimes.delete(item.context);
    progressToggleTimes.delete(item.context);
    amsViewModes.delete(item.context);
    amsPressStates.delete(item.context);
    amsActionTimes.delete(item.context);
    lightActionTimes.delete(item.context);
    cameraMosaicPressStates.delete(item.context);
    cameraMosaicRunSuppressUntil.delete(item.context);
  }
  if (cameraMosaic.active && removedMosaicContext) {
    exitCameraMosaic("action-clear", { render: false, toast: false });
  }
  updateCameraEnabled();
});

$UD.onParamFromApp((message) => updateActionSettings(message));
$UD.onParamFromPlugin((message) => updateActionSettings(message));

$UD.onDidReceiveGlobalSettings((message) => {
  const settings = settingsFromMessage(message);
  updateGlobalSettings(settings);
  if (!hasConnectionSettings(globalSettings)) {
    loadSavedGlobalSettingsFallback();
  }
});

$UD.onSendToPlugin((message) => {
  handleSetupRequest(message).catch(() => {
    setupReply(message, { ok: false, error: "SETUP_FAILED", message: "Setup failed. Check local network and system credential access." });
  });
});

$UD.onRun((message) => {
  if (handleCameraMosaicRun(message)) {
    return;
  }

  if (handleEtaCommand(message, "run")) {
    return;
  }

  if (handleProgressCommand(message, "run")) {
    return;
  }

  if (handleAmsDisplayCommand(message, "run")) {
    return;
  }

  if (handleLightCommand(message, "run")) {
    return;
  }

  if (handleCameraCommand(message, "run")) {
    return;
  }

  if (handleStatusBedCheckCommand(message, "run")) {
    return;
  }

  if (bambu.requestPushAll()) {
    $UD.toast("Bambu status refresh requested");
  } else {
    $UD.toast("Pair a printer in settings first");
  }
});

$UD.onKeyDown((message) => {
  if (handleCameraMosaicKeyDown(message)) return;
  if (handleEtaCommand(message, "keydown")) return;
  if (handleProgressCommand(message, "keydown")) return;
  if (handleAmsDisplayKeyDown(message, "keydown")) return;
  if (handleLightCommand(message, "keydown")) return;
  if (handleStatusBedCheckCommand(message, "keydown")) return;
  handleCameraCommand(message, "keydown");
});

$UD.onKeyUp((message) => {
  if (handleCameraMosaicKeyUp(message)) return;
  handleAmsDisplayKeyUp(message, "keyup");
});

bambu.on("status", (status) => {
  connectionState = {
    ...connectionState,
    ...status,
    error: status.connected ? "" : connectionState.error
  };
  scheduleRender();
});

bambu.on("errorStatus", (error) => {
  connectionState = {
    ...connectionState,
    connected: false,
    error
  };
  log(`Bambu MQTT: ${error}`, "warn");
  scheduleRender();
});

bambu.on("report", (report) => {
  printerState = mergeBambuReport(printerState, report);
  connectionState = {
    ...connectionState,
    connected: true,
    error: "",
    lastMessageAt: new Date().toISOString()
  };
  reconcileLightControl(buildPrinterView(printerState, connectionState));
  bedDetector.updatePrintLifecycle(buildPrinterView(printerState, connectionState));
  updateCameraEnabled();
  broadcastSetupStatus();
  scheduleRender();
});

camera.on("frame", (cameraState) => {
  updateCameraMosaicSnapshot(cameraState);
  handleCameraFrame(cameraState);
  writeCameraDiagnostic(cameraState, "frame");
  scheduleRender();
});
camera.on("status", (cameraState) => {
  updateCameraMosaicSnapshot(cameraState, { statusOnly: true });
  writeCameraDiagnostic(cameraState, "status");
  scheduleRender();
});

setInterval(() => scheduleRender(), 15_000);

function updateGlobalSettings(settings) {
  const previousCode = pairedPrinter?.accessCode || globalSettings.accessCode;
  globalSettings = sanitizeGlobalSettings({
    ...globalSettings,
    ...settings
  });
  globalSettings.accessCode = previousCode || "";
  if (pairedPrinter) Object.assign(globalSettings, { host: pairedPrinter.host, serial: pairedPrinter.serial, accessCode: pairedPrinter.accessCode, model: pairedPrinter.model });
  bambu.configure(globalSettings);
  camera.configure(globalSettings);
  bedDetector.configure(globalSettings);
  bedDetector.refreshReferenceState()
    .then(() => updateCameraEnabled())
    .catch((err) => log(`Bed reference refresh failed: ${err.message}`, "warn"));
  handleEmptyBedCaptureRequest(globalSettings.emptyBedCaptureRequest || "");
  updateCameraEnabled();
  scheduleRender();
}

async function loadSavedGlobalSettingsFallback() {
  if (process.env.NODE_ENV === "test" || pairedPrinter) return;
  if (loadingProfile) return loadingProfile;
  loadingProfile = profiles.load().then(async (profile) => {
    if (profile) await activatePrinter(profile);
  }).catch(() => log("Saved pairing unavailable; pair again in settings", "warn"));
  return loadingProfile;
}

function settingsFromMessage(message = {}) {
  return message.settings || message.param || message.payload || message.globalSettings || message;
}

function hasConnectionSettings(settings) {
  return Boolean(settings.host && settings.serial && settings.accessCode);
}

function updateActionSettings(message) {
  const context = message.context;
  if (!context) return;

  const action = actions.get(context) || {
    context,
    actionid: message.actionid,
    actionUuid: message.uuid,
    action: message.action || message.Action,
    settings: { ...DEFAULT_ACTION_SETTINGS },
    active: true
  };
  action.actionid = message.actionid || action.actionid;
  action.actionUuid = message.uuid || action.actionUuid;
  action.action = message.action || message.Action || action.action;
  action.settings = sanitizeActionSettings({
    ...action.settings,
    ...(message.param || {})
  });
  actions.set(context, action);
  updateCameraEnabled();
  renderContext(context);
}

function scheduleRender() {
  if (renderTimer) return;
  const interval = Math.max(1, Number(globalSettings.refreshInterval) || 2);
  renderTimer = setTimeout(() => {
    renderTimer = null;
    renderAll();
  }, Math.min(interval * 1000, 750));
}

function renderAll() {
  if (cameraMosaic.active) renderCameraMosaicBatch();
  for (const context of actions.keys()) {
    if (cameraMosaic.active && cameraMosaicPosition(context)) continue;
    renderContext(context);
  }
}

function renderContext(context) {
  const action = actions.get(context);
  if (!action || !action.active) return;

  const view = withBedOccupancy(buildPrinterView(printerState, connectionState));
  updatePrintEstimateBaseline(view);
  const mosaicPosition = cameraMosaic.active ? cameraMosaicPosition(context) : null;
  if (mosaicPosition) {
    renderCameraMosaicBatch();
    return;
  }

  const role = actionRoleFromContext(context, action.settings, action.actionUuid, action.action, action.actionid);
  const icon = role === "camera"
    ? renderCameraIcon(camera.getState(), view)
    : renderTileIcon(buildTilePayload(role, view, action.settings, {
      etaMode: action.etaMode || "finish",
      progressMode: action.progressMode || "remaining",
      originalFinishText: estimate.text(),
      amsMode: amsModeForContext(context, view, action.settings),
      bedOccupancy: bedOccupancyState(),
      lightControl: lightControlForRender()
    }));
  const renderKey = role === "camera"
    ? cameraRenderKey(role, camera.getState(), view)
    : "";

  if (renderKey && action.lastRenderKey === renderKey) return;

  try {
    $UD.setBaseDataIcon(context, icon, "");
    action.lastRenderKey = renderKey;
  } catch (err) {
    log(`Render failed: ${err.message}`, "error");
  }
}

function renderCameraMosaicBatch() {
  if (!cameraMosaic.active) return false;

  const mosaicActions = Array.from(actions.values())
    .filter((action) => action.active && cameraMosaicPosition(action.context))
    .sort((left, right) => {
      const leftPosition = cameraMosaicPosition(left.context);
      const rightPosition = cameraMosaicPosition(right.context);
      return leftPosition.row - rightPosition.row || leftPosition.column - rightPosition.column;
    });
  if (!hasCompleteCameraMosaic(mosaicActions.map((action) => action.context))) return false;

  const frameKey = cameraMosaicFrameRenderKey();
  if (mosaicActions.every((action) => action.lastRenderKey === frameKey)) return false;

  try {
    const icons = mosaicActions.map((action) => ({
      context: action.context,
      data: renderCameraMosaicTile(cameraMosaic.snapshot, cameraMosaicPosition(action.context)),
      text: ""
    }));
    $UD.setBaseDataIcons(icons);
    for (const action of mosaicActions) action.lastRenderKey = frameKey;
    return true;
  } catch (err) {
    log(`Camera mosaic batch render failed: ${err.message}`, "error");
    return false;
  }
}

function updateCameraEnabled() {
  const view = buildPrinterView(printerState, connectionState);
  bedDetector.updatePrintLifecycle(view);
  const needsBedCheckCamera = Boolean(pendingEmptyBedCapture) || pendingManualBedCheck || bedDetector.shouldUseCamera(view);
  const needsCamera = cameraMosaic.active || hasActiveCameraAction() || needsBedCheckCamera;
  camera.setEnabled(needsCamera && (!cameraManuallyDisabled || cameraMosaic.active));
  scheduleRender();
}

function bedOccupancyState() {
  const state = bedDetector.getState();
  return {
    ...state,
    checking: state.checking || pendingManualBedCheck || Boolean(pendingEmptyBedCapture)
  };
}

function hasActiveCameraAction() {
  for (const action of actions.values()) {
    if (!action.active) continue;
    const role = actionRoleFromContext(action.context, action.settings, action.actionUuid, action.action, action.actionid);
    if (role === "camera") return true;
  }
  return false;
}

function roleFromRunMessage(message = {}) {
  const action = actions.get(message.context);
  if (action) {
    return actionRoleFromContext(action.context, action.settings, action.actionUuid, action.action, action.actionid);
  }
  return actionRoleFromContext(
    message.context,
    sanitizeActionSettings(message.param || {}),
    message.uuid,
    message.action,
    message.Action,
    message.actionid
  );
}

function updatePrintEstimateBaseline(view) {
  if (pairedPrinter && view.connected) estimate.observe(view, printerState);
}

function withBedOccupancy(view) {
  return {
    ...view,
    bedOccupancy: bedOccupancyState()
  };
}

function handleEmptyBedCaptureRequest(captureRequest) {
  if (!didLoadGlobalSettingsOnce) {
    didLoadGlobalSettingsOnce = true;
    if (!isFreshCaptureRequest(captureRequest)) {
      lastHandledCaptureRequest = captureRequest || "";
      return;
    }
  }

  if (!captureRequest || captureRequest === lastHandledCaptureRequest) return;
  lastHandledCaptureRequest = captureRequest;
  if (pendingEmptyBedCapture || pendingManualBedCheck) { $UD.toast("A bed check is already running"); return; }
  const view = buildPrinterView(printerState, connectionState);
  if (!view.connected || isActivePrintForManualCheck(view)) {
    $UD.toast("Confirm an idle, empty bed before capturing a reference");
    return;
  }
  pendingEmptyBedCapture = "settings";
  pendingEmptyBedCaptureFrame = { frameId: Number(camera.getState().frameId || 0), startedAt: Date.now() };
  bedDetector.state = {
    ...bedDetector.state,
    checking: true,
    error: ""
  };
  cameraManuallyDisabled = false;
  const cameraState = camera.getState();
  if (isFreshCameraFrame(cameraState, pendingEmptyBedCaptureFrame)) {
    saveEmptyBedReferenceFromCamera("settings", cameraState).catch((err) => {
      pendingEmptyBedCapture = "";
      bedDetector.state = {
        ...bedDetector.state,
        checking: false,
        error: err.message || "Empty bed capture failed"
      };
      $UD.toast("Empty bed capture failed");
      log(`Empty bed reference capture failed: ${err.message}`, "warn");
      scheduleRender();
      updateCameraEnabled();
    });
    scheduleRender();
    return;
  }
  updateCameraEnabled();
  const captureFrame = pendingEmptyBedCaptureFrame;
  setTimeout(() => {
    if (!pendingEmptyBedCapture || pendingEmptyBedCaptureFrame !== captureFrame) return;
    pendingEmptyBedCapture = "";
    pendingEmptyBedCaptureFrame = null;
    bedDetector.recordFailure("NO_FRESH_FRAME");
    scheduleRender(); updateCameraEnabled(); broadcastSetupStatus();
    $UD.toast("No fresh camera frame. Reference was not changed.");
  }, 12000).unref?.();
  $UD.toast("Waiting for camera frame to save empty bed");
  log("Empty bed reference capture requested from settings");
}

function isFreshCaptureRequest(captureRequest) {
  const timestamp = Number(captureRequest);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
  return Date.now() - timestamp < 5 * 60 * 1000;
}

async function saveEmptyBedReferenceFromCamera(reason, cameraState = {}) {
  const result = await bedDetector.captureReferenceFromCameraState(cameraState, reason || "settings", { referenceId: globalSettings.emptyBedCaptureVariant });
  pendingEmptyBedCapture = "";
  pendingEmptyBedCaptureFrame = null;
  $UD.toast("Empty bed reference saved");
  log(`Empty bed reference saved: ${result.path}`);
  scheduleRender();
  updateCameraEnabled();
  broadcastSetupStatus();
  return result;
}

async function handleCameraFrame(cameraState = {}) {
  if (cameraFrameWorkActive) return;
  cameraFrameWorkActive = true;

  try {
    const view = buildPrinterView(printerState, connectionState);
    bedDetector.updatePrintLifecycle(view);
    await bedDetector.saveLatestCameraFrame(cameraState, view);

    if (pendingEmptyBedCapture) {
      if (isActivePrintForManualCheck(view)) { pendingEmptyBedCapture = ""; pendingEmptyBedCaptureFrame = null; bedDetector.recordFailure("PRINTING"); return; }
      if (!isFreshCameraFrame(cameraState, pendingEmptyBedCaptureFrame)) return;
      await saveEmptyBedReferenceFromCamera(pendingEmptyBedCapture, cameraState);
      return;
    }

    if (pendingManualBedCheck) {
      if (!isFreshCameraFrame(cameraState, { frameId: pendingManualBedCheckFrameId, startedAt: pendingManualBedCheckStartedAt })) {
        scheduleRender();
        return;
      }

      pendingManualBedCheck = false;
      pendingManualBedCheckFrameId = 0;
      pendingManualBedCheckStartedAt = 0;
      const hasReference = await bedDetector.refreshReferenceState();
      if (!hasReference) {
        await bedDetector.writeLastCheckMeta({
          checkedAt: new Date().toISOString(),
          reason: "manual-status-key",
          frameId: cameraState.frameId || null,
          occupied: false,
          error: "NO_REFERENCE",
          referencePath: bedDetector.referencePath,
          currentPath: bedDetector.currentPath,
          localOnly: true
        }).catch((err) => log(`Bed check debug write failed: ${err.message}`, "warn"));
        bedDetector.state = {
          ...bedDetector.state,
          checking: false,
          error: "NO_REFERENCE"
        };
        $UD.toast("Capture empty bed first");
        log("Manual bed check skipped: no empty bed reference");
        scheduleRender();
        return;
      }
      const result = await bedDetector.analyzeCameraState(cameraState, view, {
        force: true,
        reason: "manual-status-key"
      });
      $UD.toast(result.occupied ? "Part on bed" : "Bed looks clear");
      log(`Manual bed check complete: occupied=${result.occupied} score=${result.score}`);
      scheduleRender();
      return;
    }

    const captured = await bedDetector.autoCaptureIfMissing(cameraState, view);
    if (captured) {
      $UD.toast("Empty bed reference saved");
      log("Empty bed reference auto-saved");
      scheduleRender();
      return;
    }

    await bedDetector.analyzeCameraState(cameraState, view);
    scheduleRender();
  } catch (err) {
    bedDetector.recordFailure("CHECK_FAILED");
    log("Bed occupancy frame handling failed", "warn");
  } finally {
    cameraFrameWorkActive = false;
    updateCameraEnabled();
    broadcastSetupStatus();
  }
}

function handleStatusBedCheckCommand(message = {}, eventName = "run") {
  if (roleFromRunMessage(message) !== "status") {
    return false;
  }
  if (pendingManualBedCheck || pendingEmptyBedCapture) return true;
  if (!bedDetector.enabled) { $UD.toast("Local bed detection is disabled"); return true; }

  const now = Date.now();
  if (now - lastManualBedCheckAt < 1_500) {
    return true;
  }
  lastManualBedCheckAt = now;

  const view = buildPrinterView(printerState, connectionState);
  if (!view.connected) {
    $UD.toast("Printer offline");
    return true;
  }

  if (isActivePrintForManualCheck(view)) {
    $UD.toast("Printing; bed check skipped");
    log(`Manual bed check skipped during ${view.status} from ${eventName}`);
    return true;
  }

  bedDetector.state = {
    ...bedDetector.state,
    checking: true,
    error: ""
  };
  pendingManualBedCheck = true;
  const cameraState = camera.getState();
  pendingManualBedCheckFrameId = Number(cameraState.frameId || 0);
  pendingManualBedCheckStartedAt = Date.now();
  cameraManuallyDisabled = false;
  updateCameraEnabled();
  scheduleRender();
  setTimeout(() => {
    if (!pendingManualBedCheck) return;
    const fallbackCameraState = camera.getState();
    if (isFreshCameraFrame(fallbackCameraState, { frameId: pendingManualBedCheckFrameId, startedAt: pendingManualBedCheckStartedAt })) {
      handleCameraFrame(fallbackCameraState);
      return;
    }

    pendingManualBedCheck = false;
    pendingManualBedCheckFrameId = 0;
    pendingManualBedCheckStartedAt = 0;
    bedDetector.recordFailure("NO_FRESH_FRAME");
    bedDetector.writeLastCheckMeta({
      checkedAt: new Date().toISOString(),
      reason: "manual-status-key",
      frameId: fallbackCameraState.frameId || null,
      occupied: false,
      error: "No camera frame available",
      referencePath: bedDetector.referencePath,
      currentPath: bedDetector.currentPath,
      localOnly: true
    }).catch((err) => log(`Bed check debug write failed: ${err.message}`, "warn"));
    $UD.toast("No camera frame");
    log("Manual bed check failed: no camera frame", "warn");
    scheduleRender();
    updateCameraEnabled();
  }, 4_500);
  $UD.toast("Checking bed now");
  log(`Manual bed check requested from ${eventName}`);
  return true;
}

function isActivePrintForManualCheck(view = {}) {
  const status = String(view.status || "").toUpperCase();
  return ["RUNNING", "PREPARE", "PAUSED"].includes(status) && Number(view.progress || 0) < 100;
}

function handleEtaCommand(message = {}, eventName = "run") {
  if (roleFromRunMessage(message) !== "eta") {
    return false;
  }

  const context = message.context || "";
  const now = Date.now();
  if (now - (etaToggleTimes.get(context) || 0) < 700) {
    return true;
  }
  etaToggleTimes.set(context, now);

  const action = actions.get(context);
  if (!action) return true;

  action.etaMode = action.etaMode === "remaining" ? "finish" : "remaining";
  renderContext(context);
  $UD.toast(action.etaMode === "finish" ? "ETA shows finish time" : "ETA shows remaining time");
  log(`ETA display toggled to ${action.etaMode} from ${eventName}`);
  return true;
}

function handleProgressCommand(message = {}, eventName = "run") {
  if (roleFromRunMessage(message) !== "progress") {
    return false;
  }

  const context = message.context || "";
  const now = Date.now();
  if (now - (progressToggleTimes.get(context) || 0) < 700) {
    return true;
  }
  progressToggleTimes.set(context, now);

  const action = actions.get(context);
  if (!action) return true;

  action.progressMode = action.progressMode === "original" ? "remaining" : "original";
  renderContext(context);
  $UD.toast(action.progressMode === "original" ? "Progress shows first ETA" : "Progress shows remaining time");
  log(`Progress display toggled to ${action.progressMode} from ${eventName}`);
  return true;
}

function handleAmsDisplayCommand(message = {}, eventName = "run") {
  if (roleFromRunMessage(message) !== "ams") {
    return false;
  }

  const context = message.context || "";
  const now = Date.now();
  if (now - (amsActionTimes.get(context) || 0) < 500) {
    return true;
  }

  cycleAmsDisplay(context, eventName);
  return true;
}

function handleAmsDisplayKeyDown(message = {}, eventName = "keydown") {
  if (roleFromRunMessage(message) !== "ams") {
    return false;
  }

  const context = message.context || "";
  const existing = amsPressStates.get(context);
  if (existing?.timer) clearTimeout(existing.timer);

  const pressState = {
    startedAt: Date.now(),
    longHandled: false,
    timer: null
  };
  pressState.timer = setTimeout(() => {
    pressState.longHandled = true;
    resetAmsDisplay(context, eventName);
  }, AMS_LONG_PRESS_MS);
  pressState.timer.unref?.();
  amsPressStates.set(context, pressState);
  return true;
}

function handleAmsDisplayKeyUp(message = {}, eventName = "keyup") {
  if (roleFromRunMessage(message) !== "ams") {
    return false;
  }

  const context = message.context || "";
  const pressState = amsPressStates.get(context);
  if (pressState?.timer) clearTimeout(pressState.timer);
  amsPressStates.delete(context);

  if (pressState?.longHandled) {
    return true;
  }

  const now = Date.now();
  if (now - (amsActionTimes.get(context) || 0) < 500) {
    return true;
  }

  cycleAmsDisplay(context, eventName);
  return true;
}

function cycleAmsDisplay(context, eventName) {
  const action = actions.get(context);
  const view = buildPrinterView(printerState, connectionState);
  const unitIndex = amsUnitIndexFromSettings(action?.settings);
  const slots = selectedAmsSlotsForUnit(view, unitIndex);
  const unit = selectedAmsUnitForIndex(view, unitIndex);
  if (!slots.length && !unit?.hasEnvironment) {
    resetAmsDisplay(context, eventName);
    return;
  }

  const current = amsViewModes.get(context);
  const totalPages = Math.max(1, Math.ceil(slots.length / 4));
  if (current?.mode === "env") {
    resetAmsDisplay(context, eventName);
    return;
  }

  if (!current || current.mode === "overview") {
    const currentPage = clampAmsPage(current?.page, totalPages);
    if (currentPage + 1 < totalPages) {
      amsViewModes.set(context, {
        mode: "overview",
        page: currentPage + 1,
        slotIndex: 0
      });
      amsActionTimes.set(context, Date.now());
      renderContext(context);
      $UD.toast(`AMS page ${currentPage + 2}/${totalPages}`);
      log(`AMS display toggled to overview page ${currentPage + 2}/${totalPages} from ${eventName}`);
      return;
    }
  }

  const nextSlotIndex = current?.mode === "slot"
    ? Number(current.slotIndex || 0) + 1
    : 0;
  if (nextSlotIndex >= slots.length) {
    if (unit?.hasEnvironment) {
      amsViewModes.set(context, {
        mode: "env",
        page: 0,
        slotIndex: 0,
        unitIndex
      });
      amsActionTimes.set(context, Date.now());
      renderContext(context);
      $UD.toast(`${unit.shortLabel} ${unit.humidityText} ${unit.temperatureText}`);
      log(`AMS display toggled to environment page from ${eventName}`);
      return;
    }
    resetAmsDisplay(context, eventName);
    return;
  }

  amsViewModes.set(context, {
    mode: "slot",
    slotIndex: nextSlotIndex,
    unitIndex
  });
  amsActionTimes.set(context, Date.now());
  renderContext(context);
  const slot = slots[nextSlotIndex];
  $UD.toast(`${slot.label} ${slot.material} ${slot.remainText}`);
  log(`AMS display toggled to ${slot.label} from ${eventName}`);
}

function resetAmsDisplay(context, eventName) {
  const action = actions.get(context);
  const unitIndex = amsUnitIndexFromSettings(action?.settings);
  amsViewModes.set(context, {
    mode: "overview",
    page: 0,
    slotIndex: 0,
    unitIndex
  });
  amsActionTimes.set(context, Date.now());
  renderContext(context);
  $UD.toast("AMS overview");
  log(`AMS display returned to overview from ${eventName}`);
}

function amsModeForContext(context, view, settings = {}) {
  const unitIndex = amsUnitIndexFromSettings(settings);
  const slots = selectedAmsSlotsForUnit(view, unitIndex);
  const unit = selectedAmsUnitForIndex(view, unitIndex);
  const mode = amsViewModes.get(context);
  const totalPages = Math.max(1, Math.ceil(slots.length / 4));
  if (mode?.mode === "slot" && slots.length) {
    return {
      mode: "slot",
      slotIndex: Math.max(0, Math.min(slots.length - 1, Number(mode.slotIndex) || 0)),
      unitIndex
    };
  }
  if (mode?.mode === "env" && unit?.hasEnvironment) {
    return {
      mode: "env",
      page: 0,
      slotIndex: 0,
      unitIndex
    };
  }
  return {
    mode: "overview",
    page: clampAmsPage(mode?.page, totalPages),
    slotIndex: 0,
    unitIndex
  };
}

function amsUnitIndexFromSettings(settings = {}) {
  const value = String(settings.amsUnit || "auto");
  if (value === "auto" || value === "") return null;
  if (/^id:\d+$/.test(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(7, Math.round(n))) : null;
}

function selectedAmsSlotsForUnit(view, unitIndex) {
  const slots = Array.isArray(view.amsSlots) ? view.amsSlots : [];
  if (unitIndex === null || unitIndex === undefined) return slots;
  if (String(unitIndex).startsWith("id:")) return slots.filter((slot) => String(slot.unitId) === String(unitIndex).slice(3));
  return slots.filter((slot) => slot.unitIndex === unitIndex || slot.unitId === unitIndex);
}

function selectedAmsUnitForIndex(view, unitIndex) {
  const units = Array.isArray(view.amsUnits) ? view.amsUnits : [];
  if (!units.length) return null;
  if (unitIndex === null || unitIndex === undefined) {
    return units.find((unit) => unit.active) || units.find((unit) => unit.hasEnvironment) || (units.length === 1 ? units[0] : null);
  }
  if (String(unitIndex).startsWith("id:")) return units.find((unit) => String(unit.unitId) === String(unitIndex).slice(3)) || null;
  return units.find((unit) => unit.unitIndex === unitIndex || unit.unitId === unitIndex) || null;
}

function clampAmsPage(page, totalPages) {
  const n = Number(page);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(Math.max(1, totalPages) - 1, Math.round(n)));
}

function handleLightCommand(message = {}, eventName = "run") {
  if (roleFromRunMessage(message) !== "light") {
    return false;
  }

  const context = message.context || "";
  const now = Date.now();
  if (now - (lightActionTimes.get(context) || 0) < LIGHT_DEBOUNCE_MS) {
    return true;
  }
  lightActionTimes.set(context, now);

  if (lightControlState.pendingTarget) {
    $UD.toast("Light switch in progress");
    return true;
  }

  const view = buildPrinterView(printerState, connectionState);
  if (!view.connected) {
    $UD.toast("Printer offline");
    return true;
  }

  if (view.lightMode === "unknown") {
    bambu.requestPushAll();
    $UD.toast("Waiting for light status");
    return true;
  }

  const target = view.lightOn ? "off" : "on";
  if (!bambu.setChamberLight(target)) {
    $UD.toast("Light command not sent");
    return true;
  }

  beginLightControl(target, eventName);
  return true;
}

function beginLightControl(target, eventName) {
  clearLightPendingTimers();
  clearLightFailureTimer();
  lightControlState = {
    pendingTarget: target,
    failedUntil: 0,
    error: ""
  };
  renderAll();
  $UD.toast(target === "on" ? "Switching light on" : "Switching light off");
  log(`Chamber light ${target} requested from ${eventName}`);

  lightRefreshTimer = setTimeout(() => {
    lightRefreshTimer = null;
    bambu.requestPushAll();
  }, LIGHT_REFRESH_DELAY_MS);
  lightRefreshTimer.unref?.();

  lightConfirmTimer = setTimeout(() => {
    lightConfirmTimer = null;
    failLightControl("NO_REPLY");
  }, LIGHT_CONFIRM_TIMEOUT_MS);
  lightConfirmTimer.unref?.();
}

function reconcileLightControl(view = {}) {
  const target = lightControlState.pendingTarget;
  if (!target || view.lightMode !== target) return;

  clearLightPendingTimers();
  clearLightFailureTimer();
  lightControlState = {
    pendingTarget: "",
    failedUntil: 0,
    error: ""
  };
  $UD.toast(target === "on" ? "Light on" : "Light off");
  log(`Chamber light confirmed ${target}`);
  scheduleRender();
}

function failLightControl(error) {
  clearLightPendingTimers();
  clearLightFailureTimer();
  lightControlState = {
    pendingTarget: "",
    failedUntil: Date.now() + LIGHT_FAILURE_VISIBLE_MS,
    error: String(error || "NO_REPLY")
  };
  $UD.toast("Light command not confirmed");
  log(`Chamber light command failed: ${lightControlState.error}`, "warn");
  renderAll();

  lightFailureTimer = setTimeout(() => {
    lightFailureTimer = null;
    lightControlState = {
      pendingTarget: "",
      failedUntil: 0,
      error: ""
    };
    scheduleRender();
  }, LIGHT_FAILURE_VISIBLE_MS);
  lightFailureTimer.unref?.();
}

function lightControlForRender() {
  return {
    pendingTarget: lightControlState.pendingTarget,
    failed: lightControlState.failedUntil > Date.now(),
    error: lightControlState.error
  };
}

function clearLightPendingTimers() {
  if (lightRefreshTimer) clearTimeout(lightRefreshTimer);
  if (lightConfirmTimer) clearTimeout(lightConfirmTimer);
  lightRefreshTimer = null;
  lightConfirmTimer = null;
}

function clearLightFailureTimer() {
  if (lightFailureTimer) clearTimeout(lightFailureTimer);
  lightFailureTimer = null;
}

function handleCameraMosaicKeyDown(message = {}) {
  const context = message.context || "";
  const position = cameraMosaicPosition(context);
  const action = actions.get(context);
  if (!position || !action?.active) return false;

  const mode = cameraMosaic.active
    ? "exit"
    : roleFromRunMessage(message) === "camera"
      ? "enter"
      : "";
  if (!mode) return false;

  const existing = cameraMosaicPressStates.get(context);
  if (existing?.timer) clearTimeout(existing.timer);

  const pressState = {
    mode,
    longHandled: false,
    timer: null
  };
  pressState.timer = setTimeout(() => {
    pressState.longHandled = true;
    cameraMosaicRunSuppressUntil.set(context, Date.now() + 1_500);
    if (mode === "enter") {
      enterCameraMosaic(context);
    } else {
      exitCameraMosaic("long-press", { pressedContext: context });
    }
  }, CAMERA_MOSAIC_LONG_PRESS_MS);
  pressState.timer.unref?.();
  cameraMosaicPressStates.set(context, pressState);
  return true;
}

function handleCameraMosaicKeyUp(message = {}) {
  const context = message.context || "";
  const pressState = cameraMosaicPressStates.get(context);
  if (!pressState) {
    return cameraMosaic.active && Boolean(cameraMosaicPosition(context));
  }

  if (pressState.timer) clearTimeout(pressState.timer);
  cameraMosaicPressStates.delete(context);
  if (pressState.mode === "enter" && !pressState.longHandled && !cameraMosaic.active) {
    cameraMosaicRunSuppressUntil.set(context, Date.now() + 1_500);
    handleCameraCommand(message, "keyup");
  }
  return true;
}

function handleCameraMosaicRun(message = {}) {
  const context = message.context || "";
  if (cameraMosaicPressStates.has(context)) return true;
  const suppressUntil = cameraMosaicRunSuppressUntil.get(context) || 0;
  if (suppressUntil > Date.now()) return true;
  if (suppressUntil) cameraMosaicRunSuppressUntil.delete(context);
  return cameraMosaic.active && Boolean(cameraMosaicPosition(context));
}

function enterCameraMosaic(context) {
  if (cameraMosaic.active) return true;

  const mosaicContexts = activeCameraMosaicContexts();
  if (!hasCompleteCameraMosaic(mosaicContexts)) {
    $UD.toast("Full camera needs all 13 Bambu tiles");
    log("Camera mosaic not started: the active page does not expose all 13 Bambu tile positions", "warn");
    return false;
  }

  const restoreCameraManuallyDisabled = cameraManuallyDisabled;
  cameraMosaic = {
    ...createCameraMosaicState(),
    active: true,
    sourceContext: context,
    restoreCameraManuallyDisabled
  };
  cameraManuallyDisabled = false;
  invalidateCameraMosaicRenderKeys();
  updateCameraEnabled();
  updateCameraMosaicSnapshot(camera.getState(), { force: true });
  renderAll();
  $UD.toast("Camera full screen");
  log("Camera mosaic opened across 13 D200X tiles");
  return true;
}

function exitCameraMosaic(reason = "manual", options = {}) {
  if (!cameraMosaic.active) {
    if (reason === "connection-close") resetCameraMosaicState();
    return false;
  }

  const restoreCameraManuallyDisabled = cameraMosaic.restoreCameraManuallyDisabled;
  clearCameraMosaicFrameTimer();
  clearCameraMosaicPressStates(options.pressedContext || "");
  cameraMosaic = createCameraMosaicState();
  cameraManuallyDisabled = restoreCameraManuallyDisabled;
  invalidateCameraMosaicRenderKeys();
  updateCameraEnabled();

  if (options.render !== false) renderAll();
  if (options.toast !== false) $UD.toast("Camera tiles restored");
  log(`Camera mosaic closed: ${reason}`);
  return true;
}

function createCameraMosaicState() {
  return {
    active: false,
    sourceContext: "",
    restoreCameraManuallyDisabled: false,
    snapshot: cameraSnapshotFromState(),
    pendingSnapshot: null,
    lastAcceptedFrameAt: 0
  };
}

function resetCameraMosaicState() {
  clearCameraMosaicFrameTimer();
  clearCameraMosaicPressStates();
  cameraMosaicRunSuppressUntil.clear();
  cameraMosaic = createCameraMosaicState();
  invalidateCameraMosaicRenderKeys();
}

function activeCameraMosaicContexts() {
  return Array.from(actions.values())
    .filter((action) => action.active && cameraMosaicPosition(action.context))
    .map((action) => action.context);
}

function updateCameraMosaicSnapshot(cameraState = {}, options = {}) {
  if (!cameraMosaic.active) return false;

  const next = cameraSnapshotFromState(cameraState);
  const previous = cameraMosaic.snapshot;
  const now = Date.now();
  const hasNewFrame = !options.statusOnly && Boolean(next.frameDataUrl) && (
    !previous.frameDataUrl || next.frameId !== previous.frameId
  );
  const mayAcceptFrame = options.force || !previous.frameDataUrl ||
    now - cameraMosaic.lastAcceptedFrameAt >= CAMERA_MOSAIC_FRAME_INTERVAL_MS;
  const statusChanged = next.active !== previous.active ||
    next.connected !== previous.connected || next.phase !== previous.phase ||
    next.error !== previous.error;
  let changed = false;

  if (hasNewFrame && mayAcceptFrame) {
    cameraMosaic.snapshot = next;
    cameraMosaic.pendingSnapshot = null;
    cameraMosaic.lastAcceptedFrameAt = now;
    clearCameraMosaicFrameTimer();
    changed = true;
  } else {
    if (statusChanged) {
      cameraMosaic.snapshot = {
        ...previous,
        active: next.active,
        connected: next.connected,
        phase: next.phase,
        error: next.error,
        lastFrameAt: next.lastFrameAt
      };
      if (cameraMosaic.pendingSnapshot) {
        cameraMosaic.pendingSnapshot = {
          ...cameraMosaic.pendingSnapshot,
          active: next.active,
          connected: next.connected,
          phase: next.phase,
          error: next.error,
          lastFrameAt: next.lastFrameAt
        };
      }
      changed = true;
    }

    if (hasNewFrame) {
      cameraMosaic.pendingSnapshot = next;
      schedulePendingCameraMosaicFrame(now);
    }
  }

  if (changed) {
    invalidateCameraMosaicRenderKeys();
    scheduleRender();
  }
  return changed;
}

function schedulePendingCameraMosaicFrame(now = Date.now()) {
  if (cameraMosaicFrameTimer || !cameraMosaic.active) return;
  const elapsed = now - cameraMosaic.lastAcceptedFrameAt;
  const delay = Math.max(1, CAMERA_MOSAIC_FRAME_INTERVAL_MS - elapsed);
  cameraMosaicFrameTimer = setTimeout(() => {
    cameraMosaicFrameTimer = null;
    const pending = cameraMosaic.pendingSnapshot;
    if (!cameraMosaic.active || !pending) return;
    updateCameraMosaicSnapshot(pending, { force: true });
  }, delay);
  cameraMosaicFrameTimer.unref?.();
}

function clearCameraMosaicFrameTimer() {
  if (cameraMosaicFrameTimer) clearTimeout(cameraMosaicFrameTimer);
  cameraMosaicFrameTimer = null;
}

function clearCameraMosaicPressStates(exceptContext = "") {
  for (const [context, pressState] of cameraMosaicPressStates.entries()) {
    if (context === exceptContext) continue;
    if (pressState.timer) clearTimeout(pressState.timer);
    cameraMosaicPressStates.delete(context);
  }
}

function cameraSnapshotFromState(cameraState = {}) {
  return {
    active: Boolean(cameraState.active),
    connected: Boolean(cameraState.connected),
    phase: String(cameraState.phase || ""),
    error: String(cameraState.error || ""),
    frameDataUrl: cameraState.frameDataUrl || "",
    frameId: Number(cameraState.frameId || 0),
    lastFrameAt: cameraState.lastFrameAt || null
  };
}

function invalidateCameraMosaicRenderKeys() {
  for (const action of actions.values()) {
    if (cameraMosaicPosition(action.context)) action.lastRenderKey = "";
  }
}

function cameraMosaicFrameRenderKey() {
  const snapshot = cameraMosaic.snapshot;
  return [
    "camera-mosaic",
    snapshot.frameId,
    snapshot.active ? "1" : "0",
    snapshot.connected ? "1" : "0",
    snapshot.phase || "",
    snapshot.error || ""
  ].join(":");
}

function handleCameraCommand(message = {}, eventName = "run") {
  if (roleFromRunMessage(message) !== "camera") {
    return false;
  }

  const now = Date.now();
  if (now - lastCameraJumpAt < 1_500) {
    return true;
  }
  lastCameraJumpAt = now;

  cameraManuallyDisabled = !cameraManuallyDisabled;
  updateCameraEnabled();

  if (cameraManuallyDisabled) {
    $UD.toast("Camera off");
    log(`Camera disabled from ${eventName}`);
  } else {
    $UD.toast("Camera on");
    log(`Camera enabled from ${eventName}`);
  }
  return true;
}

function cameraRenderKey(role, cameraState, view) {
  return [
    role,
    cameraState.frameId,
    cameraState.active ? "1" : "0",
    cameraState.connected ? "1" : "0",
    cameraState.phase || "",
    cameraState.error || "",
    view.status,
    view.progress,
    view.remainingText,
    view.bedOccupancy?.occupied ? "bed1" : "bed0"
  ].join(":");
}

function writeCameraDiagnostic(cameraState = {}, reason = "status") {
  const now = Date.now();
  if (reason === "frame" && now - lastCameraDiagnosticFrameAt < CAMERA_DIAGNOSTIC_FRAME_MIN_MS) return;
  if (reason === "frame") lastCameraDiagnosticFrameAt = now;

  const { frameDataUrl: _frameDataUrl, ...safeCameraState } = cameraState;
  const lastFrameTime = cameraState.lastFrameAt ? Date.parse(cameraState.lastFrameAt) : NaN;
  const diagnostic = {
    updatedAt: new Date(now).toISOString(),
    reason,
    camera: {
      ...safeCameraState,
      frameBytes: cameraState.frameDataUrl
        ? Buffer.byteLength(cameraState.frameDataUrl, "utf8")
        : 0,
      lastFrameAgeMs: Number.isFinite(lastFrameTime)
        ? Math.max(0, now - lastFrameTime)
        : null
    },
    printer: {
      mqttConnected: Boolean(connectionState.connected),
      model: pairedPrinter?.model || "unpaired"
    },
    runtime: {
      pid: process.pid,
      pluginVersion: "0.4.0"
    }
  };

  const serialized = `${JSON.stringify(redactDiagnostic(diagnostic), null, 2)}\n`;
  cameraDiagnosticWritePromise = cameraDiagnosticWritePromise
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(path.dirname(CAMERA_DIAGNOSTIC_PATH), { recursive: true, mode: 0o700 });
      await fs.writeFile(CAMERA_DIAGNOSTIC_TEMP_PATH, serialized, { mode: 0o600 });
      await fs.rename(CAMERA_DIAGNOSTIC_TEMP_PATH, CAMERA_DIAGNOSTIC_PATH);
    })
    .catch((err) => log(`Camera diagnostic write failed: ${err.message}`, "warn"));
}

async function activatePrinter(profile) {
  const changed = pairedPrinter?.id !== profile.id;
  if (changed) {
    camera.setEnabled(false);
    bambu.disconnect();
    printerState = {};
    connectionState = { connected: false, lastMessageAt: null, reason: "pairing", error: "" };
    amsViewModes.clear();
    bedDetector.resetForPrinter(printerDirectory(profile.serial));
    estimate.setDirectory(printerDirectory(profile.serial));
    await estimate.load();
  }
  pairedPrinter = profile;
  updateGlobalSettings({ host: profile.host, serial: profile.serial, model: profile.model });
  broadcastSetupStatus();
}

function setupStatus() {
  const view = buildPrinterView(printerState, connectionState);
  return {
    type: "setup-status", paired: Boolean(pairedPrinter), connected: view.connected,
    printer: pairedPrinter ? { host: pairedPrinter.host, serial: pairedPrinter.serial, model: pairedPrinter.model, name: pairedPrinter.name } : null,
    amsUnits: view.amsUnits.map((unit) => ({ value: `id:${unit.unitId}`, label: `${unit.shortLabel} · ${unit.model} · ${unit.slotCount} slots` })),
    bed: { checking: bedOccupancyState().checking, hasReference: bedDetector.state.hasReference, error: bedDetector.state.error, occupied: bedDetector.state.occupied, checkedAt: bedDetector.state.checkedAt },
    camera: { phase: camera.getState().phase, error: camera.getState().error },
    version: "0.4.0"
  };
}

function setupReply(message, result) {
  if (!message.context) return;
  $UD.sendToPropertyInspector({ ...result, requestId: message.payload?.requestId || "" }, message.context);
}

function broadcastSetupStatus() {
  const status = setupStatus();
  const key = JSON.stringify(status);
  if (key === lastSetupStatusKey) return;
  lastSetupStatusKey = key;
  for (const action of actions.values()) { try { $UD.sendToPropertyInspector(status, action.context); } catch {} }
}

async function handleSetupRequest(message) {
  if (!String(message.uuid || "").startsWith(`${PLUGIN_UUID}.`)) return;
  const request = message.payload || {};
  if (request.type === "setup-status") return setupReply(message, setupStatus());
  if (request.type === "discover") {
    if (process.env.NODE_ENV === "test") return setupReply(message, { ok: false, type: "discover-result", error: "TEST_MODE" });
    discoveryWork ||= discoverPrinters().finally(() => { discoveryWork = null; });
    const result = await discoveryWork;
    return setupReply(message, { ok: true, type: "discover-result", ...result });
  }
  if (request.type === "pair") {
    if (process.env.NODE_ENV === "test" || setupBusy) return setupReply(message, { ok: false, error: "PAIRING_BUSY" });
    setupBusy = true;
    try {
      const config = await probePrinter({ ...request.printer, tlsVerify: globalSettings.tlsVerify });
      const profile = await profiles.save(config);
      await activatePrinter(profile);
      $UD.setGlobalSettings({ ...globalSettings, accessCode: "" }, message.context);
      return setupReply(message, { ...setupStatus(), ok: true, type: "pair-result" });
    } catch (error) {
      return setupReply(message, { ok: false, type: "pair-result", message: error.message });
    } finally { setupBusy = false; }
  }
  if (request.type === "capture") {
    const variant = request.variant === "light-off" ? "light-off" : "light-on";
    globalSettings.emptyBedCaptureVariant = variant;
    handleEmptyBedCaptureRequest(String(Date.now()));
    return setupReply(message, setupStatus());
  }
  if (request.type === "check-bed") {
    handleStatusBedCheckCommand({ ...message, uuid: `${PLUGIN_UUID}.status`, context: "" }, "settings");
    return setupReply(message, setupStatus());
  }
}

function log(message, level = "info") {
  const safe = String(redactDiagnostic(message)).replaceAll(globalSettings.accessCode || "\u0000", "[secret]").replaceAll(globalSettings.serial || "\u0000", "[printer]");
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](`[BambuStatus] ${safe}`);
  try {
    $UD.logMessage(`[BambuStatus] ${safe}`, level);
  } catch {
    // Ulanzi Studio logging is best-effort during startup.
  }
}
