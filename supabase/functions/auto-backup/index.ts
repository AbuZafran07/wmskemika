import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { daysAgoIso, listBackupTables } from "../_shared/backup-tables.ts";
import { writeBackupJsonFile } from "../_shared/backup-json-file.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

async function handleAutoBackup(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  let configValue: Record<string, unknown> = {};
  let cleanup: (() => Promise<void>) | undefined;

  try {
    const cronSecrets = [Deno.env.get("CRON_SECRET"), Deno.env.get("GDRIVE_CRON_SECRET")].filter(Boolean);
    const incoming = req.headers.get("x-cron-secret");
    if (cronSecrets.length === 0 || !incoming || !cronSecrets.includes(incoming)) {
      return json({ error: "Forbidden" }, 403);
    }

    const { data: config } = await supabase.from("settings").select("value").eq("key", "auto_backup_config").maybeSingle();
    configValue = (config?.value || {}) as Record<string, unknown>;
    if (!configValue.enabled) return json({ message: "Auto backup is disabled" });
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body */ }
    if (body.preflight === true) return json({ success: true });

    const tables = await listBackupTables(supabase);
    const now = new Date().toISOString();
    const fileName = `auto/backup-${now.replace(/[:.]/g, "-")}.json`;
    const archive = await writeBackupJsonFile(
      supabase,
      tables,
      (table) => table.table_name === "audit_logs" || table.table_name === "sales_pulse_sync_logs"
        ? { sinceColumn: "created_at", since: daysAgoIso(30) }
        : {},
      (tableCounts, totalRecords) => ({
        app: "WMS Kemika",
        version: "1.1.0",
        type: "auto_backup",
        exported_at: now,
        tables: tables.map((table) => table.table_name),
        total_records: totalRecords,
        table_counts: tableCounts,
        failed_tables: [],
      }),
    );
    cleanup = archive.cleanup;

    const uploadPath = fileName.split("/").map(encodeURIComponent).join("/");
    const uploadFile = await Deno.open(archive.path, { read: true });
    const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/backups/${uploadPath}`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Content-Length": String(archive.size),
        "x-upsert": "false",
      },
      body: uploadFile.readable,
    });
    if (!uploadResponse.ok) {
      const message = await uploadResponse.text();
      throw new Error(`Upload arsip internal gagal (${uploadResponse.status}): ${message.slice(0, 300)}`);
    }
    await archive.cleanup();
    cleanup = undefined;

    const { data: files } = await supabase.storage.from("backups").list("auto", {
      sortBy: { column: "created_at", order: "asc" },
    });
    if (files && files.length > 4) {
      const toDelete = files.slice(0, files.length - 4).map((file) => `auto/${file.name}`);
      await supabase.storage.from("backups").remove(toDelete);
    }

    const previousHistory = Array.isArray(configValue.history) ? configValue.history as Record<string, unknown>[] : [];
    const historyEntry = {
      file: fileName,
      created_at: now,
      size: archive.size,
      table_count: tables.length,
      total_records: archive.totalRecords,
      table_counts: archive.tableCounts,
      status: "success",
    };
    const { error: settingError } = await supabase.from("settings").upsert({
      key: "auto_backup_config",
      value: {
        ...configValue,
        enabled: true,
        last_backup_at: now,
        history: [historyEntry, ...previousHistory].slice(0, 12),
      },
      updated_at: now,
    }, { onConflict: "key" });
    if (settingError) throw settingError;

    await supabase.from("audit_logs").insert({
      action: "AUTO_BACKUP",
      module: "backup",
      ref_table: "settings",
      new_data: { file: fileName, total_records: archive.totalRecords, failed_tables: [] },
    });
    return json({
      success: true,
      file: fileName,
      total_records: archive.totalRecords,
      table_counts: archive.tableCounts,
      size: archive.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Auto backup error:", message);
    const failedTable = message.match(/Backup tabel ([a-z0-9_]+)/i)?.[1];
    const previousHistory = Array.isArray(configValue.history) ? configValue.history as Record<string, unknown>[] : [];
    await supabase.from("settings").upsert({
      key: "auto_backup_config",
      value: {
        ...configValue,
        history: [{
          file: "",
          created_at: new Date().toISOString(),
          size: 0,
          table_count: 0,
          total_records: 0,
          status: "failed",
          failed_tables: failedTable ? [failedTable] : [],
          error: message.slice(0, 500),
        }, ...previousHistory].slice(0, 12),
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
    return json({ success: false, error: message, failed_tables: failedTable ? [failedTable] : [] }, 500);
  } finally {
    if (cleanup) await cleanup();
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const preflight = await handleAutoBackup(new Request(req, { body: JSON.stringify({ preflight: true }) }));
  if (!preflight.ok) return preflight;
  EdgeRuntime.waitUntil(handleAutoBackup(req).then(async (response) => { await response.text(); }));
  return json({ success: true, status: "started" }, 202);
});
