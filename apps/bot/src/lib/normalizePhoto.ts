import sharp from "sharp";
import convert from "heic-convert";
import { MAX_UPLOAD_BYTES } from "@blackroom/shared";

export type NormalizeResult =
  | { ok: true; buffer: Buffer }
  | { ok: false; reason: "too_big" | "not_an_image" };

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

function isHeic(buf: Buffer): boolean {
  // ISO-BMFF: [size(4)]['ftyp'][major brand(4)]
  if (buf.length < 12) return false;
  if (buf.toString("ascii", 4, 8) !== "ftyp") return false;
  return HEIC_BRANDS.has(buf.toString("ascii", 8, 12).toLowerCase());
}

/**
 * §11 upload hygiene, in order:
 *  1. size cap — reject clearly rather than time out downstream
 *  2. HEIC → JPEG (iPhones produce HEIC; nothing downstream reads it)
 *  3. honour the EXIF orientation tag (sharp .rotate()), then strip all
 *     metadata by re-encoding — portraits arrive upright and EXIF-free
 */
export async function normalizePhoto(input: Buffer): Promise<NormalizeResult> {
  if (input.length > MAX_UPLOAD_BYTES) return { ok: false, reason: "too_big" };

  let working = input;
  if (isHeic(working)) {
    try {
      const jpeg = await convert({
        buffer: working as unknown as ArrayBufferLike,
        format: "JPEG",
        quality: 0.92,
      });
      working = Buffer.from(jpeg as ArrayBuffer);
    } catch {
      return { ok: false, reason: "not_an_image" };
    }
  }

  try {
    // .rotate() with no args applies the EXIF orientation; re-encoding drops
    // metadata (sharp strips it unless withMetadata() is called).
    const upright = await sharp(working, { failOn: "error" })
      .rotate()
      .jpeg({ quality: 92 })
      .toBuffer();
    return { ok: true, buffer: upright };
  } catch {
    return { ok: false, reason: "not_an_image" };
  }
}
