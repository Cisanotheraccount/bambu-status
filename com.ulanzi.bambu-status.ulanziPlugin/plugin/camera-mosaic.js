export const CAMERA_MOSAIC_COLUMNS = 5;
export const CAMERA_MOSAIC_ROWS = 3;
export const CAMERA_MOSAIC_LONG_PRESS_MS = 800;
export const CAMERA_MOSAIC_FRAME_INTERVAL_MS = 1_000;

export const CAMERA_MOSAIC_KEYS = Object.freeze([
  "0_0", "1_0", "2_0", "3_0", "4_0",
  "0_1", "1_1", "2_1", "3_1", "4_1",
  "0_2", "1_2", "2_2"
]);

const CAMERA_MOSAIC_KEY_SET = new Set(CAMERA_MOSAIC_KEYS);

export function cameraMosaicPosition(contextOrKey) {
  const value = String(contextOrKey || "");
  const parts = value.split("___");
  const key = parts.length >= 2 ? parts[1] : value;
  if (!CAMERA_MOSAIC_KEY_SET.has(key)) return null;

  const [column, row] = key.split("_").map(Number);
  return { key, column, row };
}

export function hasCompleteCameraMosaic(contexts = []) {
  const keys = new Set(
    Array.from(contexts, (context) => cameraMosaicPosition(context)?.key).filter(Boolean)
  );
  return CAMERA_MOSAIC_KEYS.every((key) => keys.has(key));
}
