import test from "node:test";
import assert from "node:assert/strict";

import { BambuMqttClient } from "../plugin/bambu-mqtt.js";

test("requestPushAll asks the printer for a status snapshot", () => {
  const messages = [];
  const bambu = new BambuMqttClient();
  bambu.connected = true;
  bambu.config = {
    serial: "01P09C552900756"
  };
  bambu.client = {
    publish(topic, payload, options) {
      messages.push({ topic, payload: JSON.parse(payload), options });
    }
  };

  assert.equal(bambu.requestPushAll(), true);
  assert.deepEqual(messages, [{
    topic: "device/01P09C552900756/request",
    payload: {
      pushing: {
        sequence_id: "0",
        command: "pushall"
      }
    },
    options: {}
  }]);
});

test("requestPushAll does nothing until MQTT is connected", () => {
  const bambu = new BambuMqttClient();
  assert.equal(bambu.requestPushAll(), false);
});

test("setChamberLight publishes Bambu Studio's ledctrl payload", () => {
  const messages = [];
  const bambu = new BambuMqttClient();
  bambu.connected = true;
  bambu.sequenceId = 1000;
  bambu.config = {
    serial: "01P09C552900756"
  };
  bambu.client = {
    publish(topic, payload, options) {
      messages.push({ topic, payload: JSON.parse(payload), options });
    }
  };

  assert.equal(bambu.setChamberLight("ON"), true);
  assert.deepEqual(messages, [{
    topic: "device/01P09C552900756/request",
    payload: {
      system: {
        sequence_id: "1001",
        command: "ledctrl",
        led_node: "chamber_light",
        led_mode: "on",
        led_on_time: 500,
        led_off_time: 500,
        loop_times: 1,
        interval_time: 1000
      }
    },
    options: {}
  }]);
});

test("setChamberLight rejects unsupported modes and disconnected clients", () => {
  const bambu = new BambuMqttClient();
  assert.equal(bambu.setChamberLight("flashing"), false);
  assert.equal(bambu.setChamberLight("on"), false);
});
