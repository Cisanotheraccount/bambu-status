import path from "node:path";
import { readJson, writePrivateJson } from "./platform.js";

export class PrintEstimate {
  constructor(file) { this.file = file; this.baseline = null; }
  async load() { this.baseline = await readJson(this.file); }
  setDirectory(directory) { this.file = path.join(directory, "estimate.json"); this.baseline = null; }
  observe(view, raw = {}, now = Date.now()) {
    const active = ["RUNNING", "PREPARE", "PAUSED"].includes(view.status) && view.progress < 100;
    if (!active) {
      if (this.baseline?.active) { this.baseline.active = false; this.save(); }
      return this.baseline;
    }
    const key = [raw.task_id ?? raw.subtask_id ?? "", view.fileName || "", view.totalLayers || ""].join("|");
    if (!this.baseline?.active || this.baseline.key !== key || view.progress + 5 < (this.baseline.lastProgress || 0)) {
      const remaining = Number(view.remainingMinutes);
      this.baseline = { active: true, key, observedAt: now, originalFinishAt: view.remainingMinutes != null && Number.isFinite(remaining) ? now + remaining * 60000 : null, lastProgress: view.progress, joinedMidPrint: view.progress > 0 };
      this.save();
    } else if (!this.baseline.originalFinishAt && view.remainingMinutes != null) {
      this.baseline.originalFinishAt = now + view.remainingMinutes * 60000; this.save();
    }
    if (this.baseline) this.baseline.lastProgress = view.progress;
    return this.baseline;
  }
  text(now = Date.now()) {
    if (!this.baseline?.originalFinishAt) return "--:--";
    const date = new Date(this.baseline.originalFinishAt);
    const today = new Date(now);
    const days = Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
    const clock = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    return days > 0 ? `+${days}D ${clock}` : days < 0 ? `${date.getMonth() + 1}/${date.getDate()} ${clock}` : clock;
  }
  save() {
    const file = this.file;
    const snapshot = structuredClone(this.baseline);
    this.write = (this.write || Promise.resolve()).catch(() => {}).then(() => writePrivateJson(file, snapshot));
    return this.write;
  }
}
