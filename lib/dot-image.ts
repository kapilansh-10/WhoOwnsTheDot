export const DOT_IMAGES_BUCKET = "dot-images";

// Server-generated staged paths only: "staged/<uuid>.webp".
// Never accept user filenames, traversal ("/", "..", "\\"), or other prefixes.
const STAGED_PATH_RE = /^staged\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

export function isValidStagedImagePath(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && STAGED_PATH_RE.test(value);
}

export function dotImagePublicUrl(path: string | null | undefined): string | null {
  if (!path || !isValidStagedImagePath(path)) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${DOT_IMAGES_BUCKET}/${path}`;
}
