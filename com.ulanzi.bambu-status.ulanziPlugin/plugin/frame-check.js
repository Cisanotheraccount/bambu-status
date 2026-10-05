export function isFreshCameraFrame(state = {}, request = {}, now = Date.now()) {
  const timestamp = Date.parse(state.lastFrameAt || "");
  return Boolean(state.connected && !state.error && state.frameDataUrl
    && Number(state.frameId) > Number(request.frameId || 0)
    && Number.isFinite(timestamp) && timestamp >= Number(request.startedAt || 0)
    && timestamp <= now + 1000 && now - timestamp <= 5000);
}
