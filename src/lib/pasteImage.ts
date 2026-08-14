/**
 * Ambil file gambar dari event paste clipboard (screenshot / copy image).
 * Return null jika clipboard tidak berisi gambar.
 */
export function getPastedImageFile(
  e: React.ClipboardEvent<HTMLElement>,
  prefix = "Paste"
): File | null {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (!blob) continue;
      const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
      const ts = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const name = `${prefix}_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.${ext}`;
      return new File([blob], name, { type: blob.type });
    }
  }
  return null;
}