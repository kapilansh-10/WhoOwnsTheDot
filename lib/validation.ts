export function cleanName(input: unknown) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (/[<>]/.test(value)) return null;
  if (value.length < 2 || value.length > 32) return null;
  return value;
}

export function cleanUrl(input: unknown) {
  if (input == null || input === "") return null;
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (value.startsWith("@")) {
    const handle = value.slice(1);
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;
    return `https://x.com/${handle}`;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
