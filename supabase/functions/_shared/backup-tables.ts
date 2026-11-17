import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type BackupTable = {
  table_name: string;
  primary_key: string;
};

export type TableReadOptions = {
  sinceColumn?: "created_at";
  since?: string;
  pageSize?: number;
};

export const EXCLUDED_TABLES: string[] = [];
export const BACKUP_PAGE_SIZE = 1000;
export const EXTERNAL_PART_SIZE = 5000;

export async function listBackupTables(
  supabase: SupabaseClient,
): Promise<BackupTable[]> {
  const { data, error } = await supabase.rpc("list_backup_tables");
  if (error) throw new Error(`Gagal membaca daftar tabel backup: ${error.message}`);
  return (data || []) as BackupTable[];
}

function filteredQuery(
  supabase: SupabaseClient,
  table: BackupTable,
  options: TableReadOptions,
) {
  let query = supabase
    .from(table.table_name)
    .select("*")
    .order(table.primary_key, { ascending: true })
    .limit(options.pageSize || BACKUP_PAGE_SIZE);
  if (options.since && options.sinceColumn) {
    query = query.gte(options.sinceColumn, options.since);
  }
  return query;
}

function tableError(table: string, message: string): Error {
  return new Error(`Backup tabel ${table} gagal: ${message}`);
}

export async function readAllTableRows(
  supabase: SupabaseClient,
  table: BackupTable,
  options: TableReadOptions = {},
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let lastValue: unknown = null;
  const pageSize = options.pageSize || BACKUP_PAGE_SIZE;

  while (true) {
    let query = filteredQuery(supabase, table, { ...options, pageSize });
    if (lastValue !== null) query = query.gt(table.primary_key, lastValue);
    const { data, error } = await query;
    if (error) throw tableError(table.table_name, error.message);
    const page = (data || []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
    lastValue = page[page.length - 1][table.primary_key];
    if (lastValue === null || lastValue === undefined) {
      throw tableError(table.table_name, `nilai kunci ${table.primary_key} kosong`);
    }
  }
  return rows;
}

export async function readTableInParts(
  supabase: SupabaseClient,
  table: BackupTable,
  options: TableReadOptions,
  partSize: number,
  onPart: (partNumber: number, rows: Record<string, unknown>[]) => Promise<void>,
): Promise<{ rowCount: number; partCount: number }> {
  let buffer: Record<string, unknown>[] = [];
  let lastValue: unknown = null;
  let rowCount = 0;
  let partCount = 0;
  const pageSize = options.pageSize || BACKUP_PAGE_SIZE;

  const flush = async () => {
    if (buffer.length === 0) return;
    partCount += 1;
    await onPart(partCount, buffer);
    buffer = [];
  };

  while (true) {
    let query = filteredQuery(supabase, table, { ...options, pageSize });
    if (lastValue !== null) query = query.gt(table.primary_key, lastValue);
    const { data, error } = await query;
    if (error) throw tableError(table.table_name, error.message);
    const page = (data || []) as Record<string, unknown>[];
    rowCount += page.length;

    for (const row of page) {
      buffer.push(row);
      if (buffer.length === partSize) await flush();
    }

    if (page.length < pageSize) break;
    lastValue = page[page.length - 1][table.primary_key];
    if (lastValue === null || lastValue === undefined) {
      throw tableError(table.table_name, `nilai kunci ${table.primary_key} kosong`);
    }
  }

  await flush();
  return { rowCount, partCount };
}

export async function countSourceRows(
  supabase: SupabaseClient,
  table: BackupTable,
  options: TableReadOptions = {},
): Promise<number> {
  let query = supabase
    .from(table.table_name)
    .select(table.primary_key, { count: "exact", head: true });
  if (options.since && options.sinceColumn) {
    query = query.gte(options.sinceColumn, options.since);
  }
  const { count, error } = await query;
  if (error) throw tableError(table.table_name, error.message);
  return count || 0;
}

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
