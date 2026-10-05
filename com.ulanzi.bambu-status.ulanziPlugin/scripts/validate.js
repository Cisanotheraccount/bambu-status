import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const errors = [];

if (manifest.UUID !== "com.ulanzi.ulanzistudio.bambustatus") {
  errors.push("manifest UUID must be com.ulanzi.ulanzistudio.bambustatus");
}

if (!fs.existsSync(path.join(root, manifest.CodePath))) {
  errors.push(`CodePath does not exist: ${manifest.CodePath}`);
}

for (const action of manifest.Actions || []) {
  if (!action.UUID?.startsWith(`${manifest.UUID}.`)) {
    errors.push(`Action UUID is outside plugin UUID: ${action.UUID}`);
  }
  if (!fs.existsSync(path.join(root, action.Icon))) {
    errors.push(`Action icon missing: ${action.Icon}`);
  }
  if (!fs.existsSync(path.join(root, action.PropertyInspectorPath))) {
    errors.push(`Property inspector missing: ${action.PropertyInspectorPath}`);
  }
  for (const state of action.States || []) {
    if (!fs.existsSync(path.join(root, state.Image))) {
      errors.push(`State image missing: ${state.Image}`);
    }
  }
}

if (errors.length) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log(`Validated ${manifest.Name} ${manifest.Version} with ${manifest.Actions.length} actions.`);
