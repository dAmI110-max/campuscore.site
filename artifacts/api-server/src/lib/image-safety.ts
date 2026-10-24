import sharp from "sharp";
import { HttpError } from "./errors";

sharp.concurrency(1);
sharp.cache({ memory: 16, files: 0, items: 32 });
let activeJobs = 0;
/** Decode all pixels and re-encode: magic-byte checks alone cannot reject corrupt/polyglot images. */
export async function sanitizeImage(bytes: Buffer): Promise<Buffer> {
  if (bytes.length > 5 * 1024 * 1024) throw new HttpError(400, "Images must be 5 MB or smaller.");
  if (activeJobs >= 2) throw new HttpError(429, "Image processing is busy. Wait a moment and retry this upload.");
  activeJobs += 1;
  try {
    return await sharp(bytes, { limitInputPixels: 16_000_000, failOn: "warning", animated: false })
      .rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 }).toBuffer();
  } catch {
    throw new HttpError(400, "This image is damaged, unsupported or too large to process safely. Choose another JPEG, PNG or WebP image.");
  } finally { activeJobs -= 1; }
}
