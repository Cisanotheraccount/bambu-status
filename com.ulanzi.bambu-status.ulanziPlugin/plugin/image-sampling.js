import { promises as fs } from "node:fs";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

export function decodeImage(buffer) {
  if (buffer.length > 12 * 1024 * 1024) throw new Error("Image exceeds the local decoding limit");
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return jpeg.decode(buffer, { useTArray: true, maxResolutionInMP: 6, maxMemoryUsageInMB: 96, tolerantDecoding: false });
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    if (buffer.length < 24 || buffer.readUInt32BE(16) * buffer.readUInt32BE(20) > 6_000_000) throw new Error("Image exceeds the local resolution limit");
    return PNG.sync.read(buffer);
  }
  throw new Error("Use a JPEG or PNG image");
}

export function resizeSample(image, width = 96, height = 54) {
  if (!image.width || !image.height || width < 1 || height < 1 || width * height > 1_000_000) throw new Error("Invalid image size");
  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / width));
      const sy = Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / height));
      const source = (sy * image.width + sx) * 4;
      const destination = (y * width + x) * 3;
      pixels.set(image.data.subarray(source, source + 3), destination);
    }
  }
  return { width, height, pixels };
}

export async function samplePortableImage(file, options = {}) {
  return resizeSample(decodeImage(await fs.readFile(file)), options.width || 96, options.height || 54);
}
