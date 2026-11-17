import type { BackupTable, TableReadOptions } from "./backup-tables.ts";

export type RawTablePage = {
  json: string;
  rowCount: number;
  lastKey: string | number | null;
};

export async function* rawTablePages(
  table: BackupTable,
  options: TableReadOptions,
  sourceUrl = Deno.env.get("SUPABASE_URL")!,
  serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
): AsyncGenerator<RawTablePage> {
  const pageSize = options.pageSize || 1000;
  let after: string | number | null = null;

  while (true) {
    const params = new URLSearchParams({
      select: "*",
      order: `${table.primary_key}.asc`,
      limit: String(pageSize),
    });
    if (after !== null) params.set(table.primary_key, `gt.${String(after)}`);
    if (options.sinceColumn && options.since) params.set(options.sinceColumn, `gte.${options.since}`);
    const baseUrl = `${sourceUrl}/rest/v1/${table.table_name}?${params.toString()}`;
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
    };
    const response = await fetch(baseUrl, { headers });
    const json = await response.text();
    if (!response.ok) throw new Error(`Backup tabel ${table.table_name} gagal (${response.status}): ${json.slice(0, 300)}`);

    const range = response.headers.get("content-range")?.match(/^(\d+)-(\d+)\//);
    const rowCount = range ? Number(range[2]) - Number(range[1]) + 1 : json.trim() === "[]" ? 0 : -1;
    if (rowCount < 0) throw new Error(`Jumlah baris halaman ${table.table_name} tidak dapat diverifikasi`);
    let lastKey: string | number | null = null;

    if (rowCount === pageSize) {
      const lastParams = new URLSearchParams(params);
      lastParams.set("select", table.primary_key);
      lastParams.set("offset", String(pageSize - 1));
      lastParams.set("limit", "1");
      const lastResponse = await fetch(`${sourceUrl}/rest/v1/${table.table_name}?${lastParams.toString()}`, { headers });
      const lastText = await lastResponse.text();
      if (!lastResponse.ok) throw new Error(`Kunci halaman ${table.table_name} gagal dibaca: ${lastText.slice(0, 300)}`);
      const lastRows = JSON.parse(lastText) as Record<string, unknown>[];
      const value = lastRows[0]?.[table.primary_key];
      if ((typeof value !== "string" && typeof value !== "number") || String(value).length === 0) {
        throw new Error(`Primary key ${table.table_name}.${table.primary_key} tidak dapat digunakan untuk pagination`);
      }
      lastKey = value;
    }

    yield { json, rowCount, lastKey };
    if (rowCount < pageSize) break;
    after = lastKey;
  }
}
