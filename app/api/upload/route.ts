import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getSupabaseServer } from "@/lib/supabase";
import { DOT_IMAGES_BUCKET } from "@/lib/dot-image";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_INPUT_FORMATS = new Set(["jpeg", "png", "webp"]);

// Stages an optional owner image WITHOUT associating it with the dot.
// The returned storage path is only promoted to the current owner by the
// Dodo webhook after a successful payment claims the dot.
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image provided." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image must be 5 MB or smaller." }, { status: 400 });
    }

    const input = Buffer.from(await file.arrayBuffer());

    // Do not trust filename/MIME: decode actual bytes; sharp throws on
    // non-images and reports SVG as format "svg", which we reject.
    let pipeline: ReturnType<typeof sharp>;
    try {
      pipeline = sharp(input, { animated: false });
      const meta = await pipeline.metadata();
      if (!meta.format || !ALLOWED_INPUT_FORMATS.has(meta.format)) {
        return NextResponse.json({ error: "Only JPG, PNG, or WebP images are allowed." }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Only JPG, PNG, or WebP images are allowed." }, { status: 400 });
    }

    // Re-encode to safe WebP, square cover-fit 512x512. sharp strips
    // EXIF/metadata by default (we never call withMetadata()).
    const output = await pipeline
      .rotate()
      .resize(512, 512, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer();

    const path = `staged/${randomUUID()}.webp`;
    const supabase = getSupabaseServer();
    const { error } = await supabase.storage.from(DOT_IMAGES_BUCKET).upload(path, output, {
      contentType: "image/webp",
      upsert: false,
    });
    if (error) {
      console.error("Image staged upload failed", error.message);
      return NextResponse.json({ error: "Could not upload image." }, { status: 500 });
    }

    return NextResponse.json({ path });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not upload image." }, { status: 500 });
  }
}
