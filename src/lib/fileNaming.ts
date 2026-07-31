const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sanitize = (s: string) =>
  s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();

/** Build a human-readable file name: "<Nama Dokumen>-<No Dokumen>.pdf".
 *  Never falls back to a raw UUID — uses the current date instead. */
export function docFileName(docName: string, ...numbers: (string | null | undefined)[]) {
  const num = numbers.find((n) => n && !UUID_RE.test(String(n).trim()));
  const safe = sanitize(num ? String(num) : new Date().toISOString().slice(0, 10));
  return `${docName}-${safe}.pdf`;
}

/** Extension from a (possibly signed) storage URL, defaults to "pdf". */
export function extFromUrl(url: string | null | undefined, fallback = "pdf") {
  if (!url) return fallback;
  const path = String(url).split("?")[0];
  const seg = path.split("/").pop() || "";
  const m = seg.match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : fallback;
}

/** File name for an attachment download: "<Nama Dokumen>-<No Dokumen>.<ext>".
 *  Never uses UUID / random hash names. */
export function attachmentFileName(
  docName: string,
  number: string | null | undefined,
  url?: string | null,
) {
  const num = number && !UUID_RE.test(String(number).trim()) ? String(number) : null;
  const safe = sanitize(num || new Date().toISOString().slice(0, 10));
  return `${docName}-${safe}.${extFromUrl(url)}`;
}
