import test from "node:test";
import assert from "node:assert/strict";

import {
  actionRoleFromContext,
  buildPrinterView,
  buildTilePayload,
  finishEstimate,
  mergeBambuReport
} from "../plugin/state.js";

test("finish estimate reports local calendar-day offsets", () => {
  const start = new Date(2026, 4, 30, 23, 30, 0);

  assert.deepEqual(finishEstimate(20, start), {
    text: "23:50",
    dayOffset: 0
  });
  assert.deepEqual(finishEstimate(90, start), {
    text: "01:00",
    dayOffset: 1
  });
  assert.deepEqual(finishEstimate((48 * 60) + 90, start), {
    text: "01:00",
    dayOffset: 3
  });
});

test("ETA tile places the future-day marker beside the finish estimate", () => {
  const view = {
    connected: true,
    stale: false,
    stateColor: "#00AE42",
    progress: 42,
    remainingText: "5h30",
    finishText: "01:00",
    finishDayOffset: 1
  };

  const finishTile = buildTilePayload("eta", view, {}, { etaMode: "finish" });
  const remainingTile = buildTilePayload("eta", view, {}, { etaMode: "remaining" });

  assert.equal(finishTile.label, "+1D End");
  assert.equal(finishTile.text, "01:00");
  assert.equal(finishTile.subtext, "5h30");
  assert.equal(remainingTile.label, "Left");
  assert.equal(remainingTile.text, "5h30");
  assert.equal(remainingTile.subtext, "+1D 01:00");

  for (const dayOffset of [2, 3]) {
    const laterTile = buildTilePayload(
      "eta",
      { ...view, finishDayOffset: dayOffset },
      {},
      { etaMode: "finish" }
    );
    assert.equal(laterTile.label, `+${dayOffset}D End`);
  }
});

test("mergeBambuReport merges delta print reports", () => {
  const first = mergeBambuReport({}, {
    print: {
      gcode_state: "RUNNING",
      mc_percent: 41,
      layer_num: 12
    }
  });
  const second = mergeBambuReport(first, {
    print: {
      mc_remaining_time: 74,
      total_layer_num: 120
    }
  });

  assert.equal(second.gcode_state, "RUNNING");
  assert.equal(second.mc_percent, 41);
  assert.equal(second.layer_num, 12);
  assert.equal(second.mc_remaining_time, 74);
  assert.equal(second.total_layer_num, 120);
});

test("printer view exposes compact running essentials", () => {
  const view = buildPrinterView({
    gcode_state: "RUNNING",
    mc_percent: 42,
    mc_remaining_time: 62,
    layer_num: 17,
    total_layer_num: 99,
    nozzle_temper: 219.8,
    nozzle_target_temper: 220,
    nozzle_diameter: "0.4",
    nozzle_type: "Hardened",
    bed_temper: 55,
    bed_target_temper: 55,
    curr_bed_type: "Cool Plate",
    cooling_fan_speed: 12,
    big_fan1_speed: 40,
    big_fan2_speed: 0,
    ams: {
      ams: [{
        id: 0,
        tray: [
          { id: 0, tray_type: "PLA", tray_color: "FF0000FF", remain: 72 },
          { id: 1, tray_type: "PETG", tray_color: "00AAFFFF", remain: 34 }
        ]
      }]
    },
    stg_cur: 0,
    lights_report: [{ node: "chamber_light", mode: "on" }],
    hms: [],
    print_error: 0
  }, {
    connected: true,
    lastMessageAt: new Date().toISOString()
  });

  assert.equal(view.status, "RUNNING");
  assert.equal(view.progress, 42);
  assert.equal(view.remainingText, "1h02");
  assert.match(view.finishText, /^\d{2}:\d{2}$/);
  assert.equal(view.totalTimeText, "1h47");
  assert.equal(view.layerText, "17/99");
  assert.equal(view.stage, "Printing");
  assert.equal(view.lightMode, "on");
  assert.equal(view.lightOn, true);
  assert.equal(view.nozzle.detail, "0.4MM HARDENED");
  assert.equal(view.bed.detail, "COOL PLATE");
  assert.deepEqual(view.fans.map((fan) => ({
    label: fan.label,
    percent: fan.percent
  })), [
    { label: "PART", percent: 80 },
    { label: "AUX", percent: 40 },
    { label: "CHAM", percent: 0 }
  ]);
  assert.equal(view.amsSlots.length, 2);
  assert.deepEqual(view.amsSlots.map((slot) => ({
    label: slot.label,
    material: slot.material,
    color: slot.color,
    remainText: slot.remainText
  })), [
    { label: "A1", material: "PLA", color: "#FF0000", remainText: "72%" },
    { label: "A2", material: "PETG", color: "#00AAFF", remainText: "34%" }
  ]);

  const statusTile = buildTilePayload("status", view);
  const progressTile = buildTilePayload("progress", view);
  const etaTile = buildTilePayload("eta", view);
  const remainingEtaTile = buildTilePayload("eta", view, {}, { etaMode: "remaining" });
  const errorTile = buildTilePayload("errors", view);
  const fansTile = buildTilePayload("fans", view);
  const amsTile = buildTilePayload("ams", view);
  const amsSlotTile = buildTilePayload("ams", view, {}, {
    amsMode: {
      mode: "slot",
      slotIndex: 1
    }
  });
  const nozzleTile = buildTilePayload("nozzle", view);
  const bedTile = buildTilePayload("bed", view);
  const fileTile = buildTilePayload("file", {
    ...view,
    fileName: "dragon_phone_stand_super_long_name.3mf",
    shortFileName: "dragon_phone_..."
  });

  assert.equal(statusTile.text, "RUN");
  assert.equal(statusTile.subtext, "Printing");
  assert.equal(buildTilePayload("stage", view).text, "RUN");
  assert.equal(buildTilePayload("stage", view).subtext, "Printing");
  assert.equal(progressTile.subtext, "1h02");
  assert.equal(buildTilePayload("progress", view, {}, {
    progressMode: "original",
    originalFinishText: "18:42"
  }).subtext, "18:42");
  assert.match(etaTile.text, /^\d{2}:\d{2}$/);
  assert.equal(etaTile.subtext, "1h02");
  assert.match(etaTile.label, /^(?:\+\d+D )?End$/);
  assert.doesNotMatch(etaTile.subtext, /AM|PM|END/i);
  assert.equal(remainingEtaTile.text, "1h02");
  assert.match(remainingEtaTile.subtext, /^(?:\+\d+D )?\d{2}:\d{2}$/);
  assert.equal(remainingEtaTile.label, "Left");
  assert.equal(errorTile.text, "OK");
  assert.equal(fansTile.text, "40%");
  assert.equal(fansTile.subtext, "AVG");
  assert.equal(fansTile.progress, 40);
  assert.equal(fansTile.fans.length, 3);
  assert.equal(amsTile.text, "2 SLOT");
  assert.equal(amsTile.label, "AMS A");
  assert.equal(amsTile.lines.length > 0, true);
  assert.equal(amsTile.amsSlots.length, 2);
  assert.equal(amsSlotTile.label, "A2");
  assert.equal(amsSlotTile.text, "PETG");
  assert.equal(amsSlotTile.subtext, "34%");
  assert.equal(amsSlotTile.amsSlot.color, "#00AAFF");
  assert.equal(nozzleTile.text, "220");
  assert.equal(nozzleTile.subtext, "220°C");
  assert.equal(nozzleTile.detail, "0.4MM HARDENED");
  assert.equal(bedTile.text, "55");
  assert.equal(bedTile.subtext, "55°C");
  assert.equal(bedTile.detail, "COOL PLATE");
  assert.deepEqual(fileTile.lines, ["dragon", "phone", "stand..."]);
});

test("temperature tiles turn green after cooling while idle", () => {
  const view = buildPrinterView({
    gcode_state: "IDLE",
    nozzle_temper: 35,
    nozzle_target_temper: 0,
    bed_temper: 32,
    bed_target_temper: 0
  }, {
    connected: true,
    lastMessageAt: new Date().toISOString()
  });

  const nozzleTile = buildTilePayload("nozzle", view);
  const bedTile = buildTilePayload("bed", view);

  assert.equal(nozzleTile.safeTouch, true);
  assert.equal(bedTile.safeTouch, true);
  assert.equal(nozzleTile.color, "#f97316");
  assert.equal(bedTile.color, "#eab308");
  assert.equal(nozzleTile.progressColor, "#00AE42");
  assert.equal(bedTile.progressColor, "#00AE42");
  assert.equal(nozzleTile.progress, 100);
  assert.equal(bedTile.progress, 100);
});

test("status tile shows a bright yellow removal reminder after bed occupancy detection", () => {
  const view = buildPrinterView({
    gcode_state: "FINISH",
    mc_percent: 100
  }, {
    connected: true,
    lastMessageAt: new Date().toISOString()
  });

  const statusTile = buildTilePayload("status", view, {}, {
    bedOccupancy: {
      occupied: true,
      color: "#facc15"
    }
  });

  assert.equal(statusTile.text, "REMOVE");
  assert.equal(statusTile.subtext, "PART ON BED");
  assert.equal(statusTile.color, "#facc15");
  assert.equal(statusTile.warning, true);
});

test("status tile shows scan feedback while manual bed detection is running", () => {
  const view = buildPrinterView({
    gcode_state: "IDLE",
    mc_percent: 0
  }, {
    connected: true,
    lastMessageAt: new Date().toISOString()
  });

  const statusTile = buildTilePayload("status", view, {}, {
    bedOccupancy: {
      checking: true,
      color: "#facc15"
    }
  });

  assert.equal(statusTile.text, "CHECK");
  assert.equal(statusTile.subtext, "SCANNING");
  assert.equal(statusTile.color, "#00AE42");
  assert.equal(statusTile.warning, false);
});

test("status tile asks for an empty reference when bed detection has no baseline", () => {
  const view = buildPrinterView({
    gcode_state: "IDLE",
    mc_percent: 0
  }, {
    connected: true,
    lastMessageAt: new Date().toISOString()
  });

  const statusTile = buildTilePayload("status", view, {}, {
    bedOccupancy: {
      error: "NO_REFERENCE"
    }
  });

  assert.equal(statusTile.text, "NO REF");
  assert.equal(statusTile.subtext, "SET EMPTY");
  assert.equal(statusTile.color, "#00AE42");
  assert.equal(statusTile.warning, false);
});

test("status tile shows a green clear result when the last bed detection found no object", () => {
  const view = buildPrinterView({
    gcode_state: "IDLE",
    mc_percent: 0
  }, {
    connected: true,
    lastMessageAt: new Date().toISOString()
  });

  const statusTile = buildTilePayload("status", view, {}, {
    bedOccupancy: {
      occupied: false,
      checkedAt: "2026-06-02T12:00:00.000Z"
    }
  });

  assert.equal(statusTile.text, "CLEAR");
  assert.equal(statusTile.subtext, "BED EMPTY");
  assert.equal(statusTile.color, "#00AE42");
  assert.equal(statusTile.warning, false);
});

test("stage 54 is shown as a human-readable bed-level preparation state", () => {
  const view = buildPrinterView({
    gcode_state: "PREPARE",
    stg_cur: 54,
    mc_percent: 0
  }, {
    connected: true,
    lastMessageAt: new Date().toISOString()
  });

  const statusTile = buildTilePayload("status", view);
  assert.equal(view.stage, "Bed Level Prep");
  assert.equal(statusTile.subtext, "Bed Level Prep");
  assert.doesNotMatch(statusTile.subtext, /Stage 54/i);
});

test("unknown numeric stages fall back to printer state instead of raw numbers", () => {
  const view = buildPrinterView({
    gcode_state: "RUNNING",
    stg_cur: 999,
    mc_remaining_time: 30
  }, {
    connected: true,
    lastMessageAt: new Date().toISOString()
  });

  const statusTile = buildTilePayload("status", view);
  assert.equal(view.stage, "Run");
  assert.equal(statusTile.subtext, "30m");
  assert.doesNotMatch(statusTile.subtext, /999|Stage/i);
});

test("error tile stays short on failed prints", () => {
  const view = buildPrinterView({
    gcode_state: "FAILED",
    mc_percent: 51,
    print_error: 50348044,
    hms: []
  }, {
    connected: true,
    lastMessageAt: new Date().toISOString()
  });

  assert.equal(view.hasError, true);
  assert.equal(buildTilePayload("status", view).text, "ERR");
  assert.equal(buildTilePayload("errors", view).text, "ERR");
  assert.equal(buildTilePayload("errors", view).subtext, "PRINT FAILED");
});

test("error tile describes known HMS errors in human language", () => {
  const view = buildPrinterView({
    gcode_state: "RUNNING",
    hms: [{
      attr: 0x03000400,
      code: 0x00020001
    }]
  }, {
    connected: true,
    lastMessageAt: new Date().toISOString()
  });

  const tile = buildTilePayload("errors", view);
  const statusTile = buildTilePayload("status", view);
  const progressTile = buildTilePayload("progress", view);
  assert.equal(view.hasNotice, true);
  assert.equal(view.hasError, false);
  assert.equal(view.stateColor, "#00AE42");
  assert.equal(statusTile.text, "RUN");
  assert.equal(statusTile.color, "#00AE42");
  assert.equal(statusTile.warning, false);
  assert.equal(progressTile.color, "#00AE42");
  assert.equal(tile.text, "ERR");
  assert.equal(tile.subtext, "FAN TOO SLOW");
  assert.deepEqual(tile.errorLines, ["FAN TOO", "SLOW", "0300-0400"]);
});

test("HMS warnings turn status red only after printing stops", () => {
  const view = buildPrinterView({
    gcode_state: "PAUSED",
    hms: [{
      attr: 0x03000400,
      code: 0x00020001
    }]
  }, {
    connected: true,
    lastMessageAt: new Date().toISOString()
  });

  const statusTile = buildTilePayload("status", view);
  assert.equal(view.hasNotice, true);
  assert.equal(view.hasError, true);
  assert.equal(statusTile.text, "ERR");
  assert.equal(statusTile.color, "#dc2626");
  assert.equal(statusTile.warning, true);
});

test("tiles keep compact text for D200X key displays", () => {
  const view = buildPrinterView({
    gcode_state: "RUNNING",
    mc_percent: 100,
    mc_remaining_time: 0,
    nozzle_temper: 219.8,
    nozzle_target_temper: 220
  }, {
    connected: true,
    lastMessageAt: new Date().toISOString()
  });

  const importantTexts = ["status", "progress", "eta", "errors"].map((role) => buildTilePayload(role, view).text);
  assert.deepEqual(importantTexts[0], "RUN");
  assert.deepEqual(importantTexts[1], "100%");
  assert.match(importantTexts[2], /^\d{2}:\d{2}$/);
  assert.deepEqual(importantTexts[3], "OK");
  assert.equal(importantTexts.every((text) => text.length <= 9), true);
  assert.equal(buildTilePayload("nozzle", view, { showText: "false" }).text, "");
});

test("light tile follows the printer's reported chamber light state", () => {
  const connection = {
    connected: true,
    lastMessageAt: new Date().toISOString()
  };
  const onView = buildPrinterView({
    lights_report: [{ node: "chamber_light", mode: "on" }]
  }, connection);
  const offView = buildPrinterView({
    lights_report: [{ node: "chamber_light", mode: "off" }]
  }, connection);

  const onTile = buildTilePayload("light", onView);
  const offTile = buildTilePayload("light", offView);
  assert.equal(onTile.text, "ON");
  assert.equal(onTile.color, "#facc15");
  assert.equal(onTile.progress, 100);
  assert.equal(offTile.text, "OFF");
  assert.equal(offTile.color, "#94a3b8");
  assert.equal(offTile.progress, 0);
});

test("light tile shows switching and unconfirmed command feedback", () => {
  const view = buildPrinterView({
    lights_report: [{ node: "chamber_light", mode: "off" }]
  }, {
    connected: true,
    lastMessageAt: new Date().toISOString()
  });
  const switching = buildTilePayload("light", view, {}, {
    lightControl: { pendingTarget: "on", failed: false }
  });
  const failed = buildTilePayload("light", view, {}, {
    lightControl: { pendingTarget: "", failed: true }
  });

  assert.equal(switching.text, "WAIT");
  assert.equal(switching.subtext, "SWITCHING");
  assert.equal(switching.warning, false);
  assert.equal(failed.text, "FAIL");
  assert.equal(failed.subtext, "NO REPLY");
  assert.equal(failed.warning, true);
});

test("actionRoleFromContext derives role from action UUID suffix", () => {
  const role = actionRoleFromContext("com.ulanzi.ulanzistudio.bambustatus.eta___3___46d45163-c1a9-4e78-bfe9-1585acc6e909", {});
  assert.equal(role, "eta");
});

test("actionRoleFromContext accepts explicit action id from Ulanzi messages", () => {
  const role = actionRoleFromContext("unexpected-context", {}, "com.ulanzi.ulanzistudio.bambustatus.progress");
  assert.equal(role, "progress");
});

test("legacy Stage actions are merged into Status", () => {
  const role = actionRoleFromContext("unexpected-context", {}, "com.ulanzi.ulanzistudio.bambustatus.stage");
  const staleCustomRole = actionRoleFromContext(
    "com.ulanzi.ulanzistudio.bambustatus.custom___3___46d45163-c1a9-4e78-bfe9-1585acc6e909",
    { tileRole: "stage" }
  );
  assert.equal(role, "status");
  assert.equal(staleCustomRole, "status");
});

test("actionRoleFromContext recognizes camera tiles", () => {
  const role = actionRoleFromContext("com.ulanzi.ulanzistudio.bambustatus.camera___3___46d45163-c1a9-4e78-bfe9-1585acc6e909", {});
  assert.equal(role, "camera");
});

test("actionRoleFromContext recognizes AMS display tiles", () => {
  assert.equal(actionRoleFromContext("com.ulanzi.ulanzistudio.bambustatus.ams___3___id", {}), "ams");
});

test("actionRoleFromContext recognizes fan display tiles", () => {
  assert.equal(actionRoleFromContext("com.ulanzi.ulanzistudio.bambustatus.fans___3___id", {}), "fans");
});

test("actionRoleFromContext recognizes chamber light tiles", () => {
  assert.equal(actionRoleFromContext("com.ulanzi.ulanzistudio.bambustatus.light___3___id", {}), "light");
});

test("printer view counts AMS units from bitmask fallback", () => {
  const view = buildPrinterView({
    ams: {
      ams_exist_bits: "3"
    }
  }, {
    connected: true,
    lastMessageAt: new Date().toISOString()
  });

  assert.equal(view.amsUnitCount, 2);
  assert.equal(view.amsText, "2 AMS");
});

test("AMS tile paginates extra slots and exposes page two", () => {
  const view = buildPrinterView({
    ams: {
      tray_now: 4,
      ams: [{
        id: 0,
        humidity: 3,
        humidity_raw: 17,
        temp: 25,
        tray: [
          { id: 0, tray_type: "PLA", tray_color: "FF0000FF", remain: 72 },
          { id: 1, tray_type: "PETG", tray_color: "00AAFFFF", remain: 34 },
          { id: 2, tray_type: "ABS", tray_color: "111111FF", remain: 80 },
          { id: 3, tray_type: "TPU", tray_color: "00FF00FF", remain: 90 }
        ]
      }],
      vt_tray: { id: 4, tray_type: "PLA", tray_color: "FFFFFFFF", remain: 25 }
    }
  }, {
    connected: true,
    lastMessageAt: new Date().toISOString()
  });

  assert.equal(view.amsSlots.length, 5);
  assert.equal(view.amsUnits.length, 1);
  assert.equal(view.amsUnits[0].humidityText, "17%");
  assert.equal(view.amsUnits[0].temperatureText, "25°C");
  assert.equal(view.amsSlots[4].label, "A5");
  const tile = buildTilePayload("ams", view);
  assert.equal(tile.amsPage, 0);
  assert.equal(tile.amsTotalPages, 2);
  assert.equal(tile.amsSlots.length, 4);

  const pageTwo = buildTilePayload("ams", view, {}, {
    amsMode: {
      mode: "overview",
      page: 1
    }
  });
  assert.equal(pageTwo.amsPage, 1);
  assert.equal(pageTwo.amsTotalPages, 2);
  assert.equal(pageTwo.amsSlots.length, 1);
  assert.equal(pageTwo.amsSlots[0].label, "A5");
  assert.equal(pageTwo.amsSlots[0].active, true);

  const envTile = buildTilePayload("ams", view, {}, {
    amsMode: {
      mode: "env",
      unitIndex: 0
    }
  });
  assert.equal(envTile.label, "");
  assert.equal(envTile.text, "17%");
  assert.equal(envTile.subtext, "25°C");
  assert.equal(envTile.progress, 17);
});

test("AMS tile can target a specific AMS unit", () => {
  const view = buildPrinterView({
    ams: {
      ams: [
        {
          id: 0,
          humidity: 4,
          temp: 24,
          tray: [
            { id: 0, tray_type: "PLA", tray_color: "FF0000FF", remain: 72 },
            { id: 1, tray_type: "PETG", tray_color: "00AAFFFF", remain: 34 }
          ]
        },
        {
          id: 128,
          humidity: 3,
          humidity_raw: 27,
          temp: 29.3,
          ams_type: "AMS HT",
          tray: [
            { id: 0, tray_type: "PAHT", tray_color: "111111FF", remain: 80 }
          ]
        }
      ]
    }
  }, {
    connected: true,
    lastMessageAt: new Date().toISOString()
  });

  const selected = buildTilePayload("ams", view, {}, {
    amsMode: {
      mode: "overview",
      unitIndex: 1
    }
  });
  assert.equal(selected.label, "AMS B");
  assert.equal(selected.subtext, "AMS HT");
  assert.equal(selected.amsSlots.length, 1);
  assert.equal(selected.amsSlots[0].label, "B1");
  assert.equal(selected.amsUnit.unitId, 128);
  assert.equal(selected.amsUnit.unitIndex, 1);

  const envTile = buildTilePayload("ams", view, {}, {
    amsMode: {
      mode: "env",
      unitIndex: 1
    }
  });
  assert.equal(envTile.text, "27%");
  assert.equal(envTile.subtext, "29°C");
  assert.equal(envTile.progress, 27);
});

test("action UUID wins over stale saved tile role", () => {
  const role = actionRoleFromContext(
    "com.ulanzi.ulanzistudio.bambustatus.eta___3___46d45163-c1a9-4e78-bfe9-1585acc6e909",
    { tileRole: "status" }
  );
  assert.equal(role, "eta");
});

test("custom tile still uses the configured role", () => {
  const role = actionRoleFromContext(
    "com.ulanzi.ulanzistudio.bambustatus.custom___3___46d45163-c1a9-4e78-bfe9-1585acc6e909",
    { tileRole: "fans" }
  );
  assert.equal(role, "fans");
});
