import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.platform !== "darwin") {
  console.log("Portable image detection and Windows DPAPI need no native build.");
  process.exit(0);
}
const build = path.join(root, ".build");
mkdirSync(build, { recursive: true });
for (const [source, output] of [["bed-vision.swift", "bed-vision"], ["credentials.swift", "credential-helper"]]) {
  const slices = [];
  for (const arch of ["arm64", "x86_64"]) {
    const slice = path.join(build, `${output}-${arch}`);
    const result = spawnSync("/usr/bin/xcrun", ["swiftc", "-O", "-target", `${arch}-apple-macosx12.0`, path.join(root, "native", source), "-o", slice], { encoding: "utf8" });
    if (result.status !== 0) { process.stderr.write(result.stderr || "Native build failed"); process.exit(1); }
    slices.push(slice);
  }
  const target = path.join(root, "native", output);
  const result = spawnSync("/usr/bin/lipo", ["-create", ...slices, "-output", target], { encoding: "utf8" });
  if (result.status !== 0 || !existsSync(target)) throw new Error("Universal native build failed");
  chmodSync(target, 0o755);
  const signature = spawnSync("/usr/bin/codesign", ["--force", "--sign", "-", "--identifier", `com.ulanzi.ulanzistudio.bambustatus.${output}`, target], { encoding: "utf8" });
  if (signature.status !== 0) throw new Error("Native helper signing failed");
  console.log(`Built and ad-hoc signed universal macOS ${output}.`);
}
rmSync(build, { recursive: true, force: true });
