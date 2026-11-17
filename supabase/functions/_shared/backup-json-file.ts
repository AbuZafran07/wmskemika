import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EXTERNAL_PART_SIZE,
  readTableInParts,
  type BackupTable,
  type TableReadOptions,
} from "./backup-tables.ts";

export type JsonBackupFile = {
  path: string;
  size: number;
  tableCounts: Record<string, number>;
  totalRecords: number;
  cleanup: () => Promise<void>;
};

export async function writeBackupJsonFile(
  supabase: SupabaseClient,
  tables: BackupTable[],
  optionsForTable: (table: BackupTable) => TableReadOptions,
  metadata: (tableCounts: Record<string, number>, totalRecords: number) => Record<string, unknown>,
): Promise<JsonBackupFile> {
  const path = `/tmp/wms-backup-${crypto.randomUUID()}.json`;
  const file = await Deno.open(path, { write: true, createNew: true });
  const encoder = new TextEncoder();
  const tableCounts: Record<string, number> = {};
  let totalRecords = 0;
  let closed = false;

  const close = async () => {
    if (!closed) {
      file.close();
      closed = true;
    }
  };
  const cleanup = async () => {
    await close();
    await Deno.remove(path).catch(() => undefined);
  };
  const write = async (text: string) => {
    let offset = 0;
    const bytes = encoder.encode(text);
    while (offset < bytes.byteLength) offset += await file.write(bytes.subarray(offset));
  };

  try {
    await write('{"data":{');
    for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
      const table = tables[tableIndex];
      if (tableIndex > 0) await write(",");
      await write(`${JSON.stringify(table.table_name)}:[`);
      let tableRows = 0;
      await readTableInParts(
        supabase,
        table,
        { ...optionsForTable(table), pageSize: 1000 },
        1000,
        async (_part, rows) => {
          for (const row of rows) {
            if (tableRows > 0) await write(",");
            await write(JSON.stringify(row));
            tableRows += 1;
          }
        },
      );
      await write("]");
      tableCounts[table.table_name] = tableRows;
      totalRecords += tableRows;
    }
    await write(`],"_meta":${JSON.stringify(metadata(tableCounts, totalRecords))}}`);
    await file.sync();
    await close();
    const stat = await Deno.stat(path);
    return { path, size: stat.size, tableCounts, totalRecords, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
