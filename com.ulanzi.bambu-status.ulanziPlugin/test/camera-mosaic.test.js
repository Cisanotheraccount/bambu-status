import test from "node:test";
import assert from "node:assert/strict";

import {
  CAMERA_MOSAIC_KEYS,
  cameraMosaicPosition,
  hasCompleteCameraMosaic
} from "../plugin/camera-mosaic.js";

test("camera mosaic maps the 13 D200X square displays and leaves the wide display alone", () => {
  assert.equal(CAMERA_MOSAIC_KEYS.length, 13);
  assert.deepEqual(cameraMosaicPosition("plugin___0_0___action"), {
    key: "0_0",
    column: 0,
    row: 0
  });
  assert.deepEqual(cameraMosaicPosition("plugin___4_1___action"), {
    key: "4_1",
    column: 4,
    row: 1
  });
  assert.deepEqual(cameraMosaicPosition("plugin___2_2___action"), {
    key: "2_2",
    column: 2,
    row: 2
  });
  assert.equal(cameraMosaicPosition("plugin___3_2___wide-display"), null);
  assert.equal(cameraMosaicPosition("plugin___4_2___wide-display"), null);
});

test("camera mosaic requires all 13 active Bambu tile positions", () => {
  const contexts = CAMERA_MOSAIC_KEYS.map((key, index) => `plugin___${key}___action-${index}`);
  assert.equal(hasCompleteCameraMosaic(contexts), true);
  assert.equal(hasCompleteCameraMosaic(contexts.slice(0, -1)), false);
  assert.equal(hasCompleteCameraMosaic([...contexts, "plugin___3_2___wide-display"]), true);
});
