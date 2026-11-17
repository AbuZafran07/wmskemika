import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  BACKUP_PAGE_SIZE,
  EXTERNAL_PART_SIZE,
  EXCLUDED_TABLES,
  countSourceRows,
  daysAgoIso,
  listBackupTables,
  type BackupTable,
  type TableReadOptions,
} from "../_shared/backup-tables.ts";
import { rawTablePages } from "../_shared/backup-raw-rest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const DEFAULT_TARGET_URL = "https://pixigfhijudkuaozzoea.supabase.co";
const DEFAULT_FILE_BUCKETS = ["signatures", "avatars", "chat-attachments", "product-photos"];
const ALLOWED_FILE_BUCKETS = new Set([...DEFAULT_FILE_BUCKETS, "documents"]);
const MAX_RUNTIME_MS = 300_000;
const RETENTION_RUNS = 14;

class HttpError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}
class PartialRunError extends Error {}

function keyMatchesTargetProject(key: string, targetUrl: string): boolean {
  try {
    const payload = key.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized)) as { ref?: string };
    return decoded.ref === new URL(targetUrl).hostname.split(".")[0];
  } catch {
    return false;
  }
}

type BackupConfig = {
  audit_logs_days: number | null;
  sync_logs_days: number;
  include_buckets: string[];
  include_documents: boolean;
};
type RunRecord = {
  started_at: string;
  completed_at: string;
  status: "success" | "failed" | "partial";
  folder?: string;
  total_rows?: number;
  total_bytes?: number;
  failed_tables?: string[];
  error?: string;
  manifest?: Record<string, unknown>;
};
type ExternalStatus = {
  last_success_at: string | null;
  last_stale_alert_at?: string | null;
  history: RunRecord[];
};
type StorageEntry = { name: string; path: string; size: number | null };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < av.length; index++) difference |= av[index] ^ bv[index];
  return difference === 0;
}

function normalizeConfig(raw: unknown): BackupConfig {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const buckets = Array.isArray(value.include_buckets)
    ? [...new Set(value.include_buckets.filter((item): item is string =>
      typeof item === "string" && DEFAULT_FILE_BUCKETS.includes(item)
    ))]
    : DEFAULT_FILE_BUCKETS;
  return {
    audit_logs_days: typeof value.audit_logs_days === "number" && Number.isFinite(value.audit_logs_days)
      ? Math.max(1, Math.floor(value.audit_logs_days))
      : null,
    sync_logs_days: typeof value.sync_logs_days === "number" && Number.isFinite(value.sync_logs_days)
      ? Math.min(365, Math.max(1, Math.floor(value.sync_logs_days)))
      : 30,
    include_buckets: buckets,
    include_documents: value.include_documents === true,
  };
}

async function readJsonSetting(supabase: SupabaseClient, key: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(`Gagal membaca pengaturan ${key}: ${error.message}`);
  return data?.value && typeof data.value === "object" ? data.value as Record<string, unknown> : {};
}

async function notifySuperAdmins(
  supabase: SupabaseClient,
  sourceUrl: string,
  serviceKey: string,
  title: string,
  body: string,
) {
  const { data: roles, error } = await supabase.from("user_roles").select("user_id").eq("role", "super_admin");
  if (error) {
    console.error("Tidak dapat membaca penerima peringatan backup:", error.message);
    return;
  }
  const userIds = [...new Set((roles || []).map((row) => row.user_id))];
  if (userIds.length === 0) return;
  const cronSecret = Deno.env.get("CRON_SECRET");
  const response = await fetch(`${sourceUrl}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      ...(cronSecret ? { "x-cron-secret": cronSecret } : {}),
    },
    body: JSON.stringify({
      title,
      body,
      user_ids: userIds,
      data: { tag: "external-backup-alert", link: "/settings?tab=backup" },
    }),
  });
  if (!response.ok) console.error("Peringatan push backup gagal dengan status:", response.status);
}

async function writeStatus(
  supabase: SupabaseClient,
  previous: ExternalStatus,
  run: RunRecord,
) {
  const lastSuccess = run.status === "success" ? run.completed_at : previous.last_success_at;
  const next: ExternalStatus = {
    ...previous,
    last_success_at: lastSuccess || null,
    history: [run, ...(previous.history || [])].slice(0, 10),
  };
  const { error } = await supabase.from("settings").upsert({
    key: "external_backup_status",
    value: next,
    updated_at: new Date().toISOString(),
  }, { onConflict: "key" });
  if (error) throw new Error(`Gagal menyimpan status backup: ${error.message}`);
  return next;
}

async function auditRun(
  supabase: SupabaseClient,
  actorId: string | null,
  run: RunRecord,
) {
  const { error } = await supabase.from("audit_logs").insert({
    user_id: actorId,
    action: "EXTERNAL_BACKUP",
    module: "backup",
    ref_table: "settings",
    new_data: {
      status: run.status,
      folder: run.folder,
      total_rows: run.total_rows || 0,
      total_bytes: run.total_bytes || 0,
      failed_tables: run.failed_tables || [],
      error: run.error,
    },
  });
  if (error) console.error("Audit backup eksternal gagal:", error.message);
}

async function ensurePrivateTargetBucket(target: SupabaseClient) {
  const { error } = await target.storage.getBucket("backups");
  if (error) {
    const { error: createError } = await target.storage.createBucket("backups", { public: false });
    if (createError && !/already exists/i.test(createError.message)) {
      throw new HttpError(`Bucket tujuan tidak dapat disiapkan: ${createError.message}`, 502);
    }
  }
  const { data: bucket, error: readError } = await target.storage.getBucket("backups");
  if (readError || !bucket) throw new HttpError("Bucket backups tujuan tidak dapat dibaca", 502);
  if (bucket.public) throw new HttpError("Bucket backups tujuan harus privat; backup dihentikan", 409);
}

function assertTime(startMs: number) {
  if (Date.now() - startMs > MAX_RUNTIME_MS) {
    throw new PartialRunError("Batas waktu fungsi hampir habis; run ditandai partial tanpa manifest");
  }
}

async function listStorageEntries(
  client: SupabaseClient,
  bucket: string,
  prefix = "",
): Promise<StorageEntry[]> {
  const entries: StorageEntry[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Gagal membaca storage ${bucket}/${prefix}: ${error.message}`);
    for (const item of data || []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        entries.push(...await listStorageEntries(client, bucket, path));
      } else {
        const metadata = item.metadata as Record<string, unknown> | null;
        entries.push({ name: item.name, path, size: typeof metadata?.size === "number" ? metadata.size : null });
      }
    }
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return entries;
}

async function copyStorageBuckets(
  source: SupabaseClient,
  target: SupabaseClient,
  config: BackupConfig,
  startMs: number,
) {
  const buckets = [...config.include_buckets];
  if (config.include_documents) buckets.push("documents");
  const summary = { buckets, uploaded: 0, skipped: 0, bytes: 0 };

  for (const bucket of buckets) {
    if (!ALLOWED_FILE_BUCKETS.has(bucket)) throw new Error(`Bucket ${bucket} tidak diizinkan`);
    const targetPrefix = `kemika-wms-files/${bucket}`;
    const [sourceFiles, targetFiles] = await Promise.all([
      listStorageEntries(source, bucket),
      listStorageEntries(target, "backups", targetPrefix),
    ]);
    const existing = new Map(targetFiles.map((file) => [file.path, file.size]));

    for (const file of sourceFiles) {
      assertTime(startMs);
      const destination = `${targetPrefix}/${file.path}`;
      if (file.size !== null && existing.get(destination) === file.size) {
        summary.skipped += 1;
        continue;
      }
      const { data, error } = await source.storage.from(bucket).download(file.path);
      if (error || !data) throw new Error(`Gagal mengunduh ${bucket}/${file.path}: ${error?.message || "file kosong"}`);
      const bytes = new Uint8Array(await data.arrayBuffer());
      if (existing.get(destination) === bytes.byteLength) {
        summary.skipped += 1;
        continue;
      }
      const { error: uploadError } = await target.storage.from("backups").upload(destination, bytes, {
        contentType: data.type || "application/octet-stream",
        upsert: true,
      });
      if (uploadError) throw new Error(`Gagal mengunggah file ${bucket}/${file.path}: ${uploadError.message}`);
      summary.uploaded += 1;
      summary.bytes += bytes.byteLength;
    }
  }
  return summary;
}

async function listRunFiles(target: SupabaseClient, folder: string) {
  const { data, error } = await target.storage.from("backups").list(folder, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw new Error(`Verifikasi folder tujuan gagal: ${error.message}`);
  return data || [];
}

async function removeRunFolder(target: SupabaseClient, folder: string) {
  const files = await listStorageEntries(target, "backups", folder);
  if (files.length > 0) {
    const { error } = await target.storage.from("backups").remove(files.map((file) => file.path));
    if (error) throw new Error(`Retensi ${folder} gagal: ${error.message}`);
  }
}

async function pruneOldRuns(target: SupabaseClient) {
  const { data, error } = await target.storage.from("backups").list("kemika-wms", { limit: 1000 });
  if (error) throw new Error(`Daftar retensi gagal: ${error.message}`);
  const candidates = (data || [])
    .filter((item) => item.id === null && /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(item.name))
    .map((item) => item.name)
    .sort()
    .reverse();
  const complete: string[] = [];
  for (const name of candidates) {
    const { data: file, error: downloadError } = await target.storage.from("backups")
      .download(`kemika-wms/${name}/manifest.json`);
    if (downloadError || !file) continue;
    try {
      const manifest = JSON.parse(await file.text());
      if (manifest.status === "success" && manifest.run_folder === `kemika-wms/${name}`) complete.push(name);
    } catch { /* incomplete or invalid runs are never deleted */ }
  }
  for (const name of complete.slice(RETENTION_RUNS)) {
    await removeRunFolder(target, `kemika-wms/${name}`);
  }
  return Math.max(0, complete.length - RETENTION_RUNS);
}

function tableOptions(tableName: string, config: BackupConfig): TableReadOptions {
  if (tableName === "audit_logs" && config.audit_logs_days !== null) {
    return { sinceColumn: "created_at", since: daysAgoIso(config.audit_logs_days) };
  }
  if (tableName === "sales_pulse_sync_logs") {
    return { sinceColumn: "created_at", since: daysAgoIso(config.sync_logs_days) };
  }
  return {};
}

async function runExternalBackup(
  source: SupabaseClient,
  target: SupabaseClient,
  config: BackupConfig,
  startMs: number,
  startedAt: string,
  runFolder: string,
) {
  const discovered = await listBackupTables(source);
  const tables = discovered.filter((table) => !EXCLUDED_TABLES.includes(table.table_name));
  const skipped = discovered.filter((table) => EXCLUDED_TABLES.includes(table.table_name)).map((table) => table.table_name);
  const manifestTables: Record<string, unknown>[] = [];
  let totalRows = 0;
  let totalBytes = 0;

  for (const table of tables) {
    assertTime(startMs);
    const options = { ...tableOptions(table.table_name, config), pageSize: BACKUP_PAGE_SIZE };
    const countBefore = await countSourceRows(source, table, options);
    const split = countBefore > EXTERNAL_PART_SIZE;
    const files: { name: string; size: number }[] = [];

    let tableRowCount = 0;
    let partRowCount = 0;
    let partContents: string[] = [];
    const flushPart = async () => {
      if (partRowCount === 0) return;
      const partNumber = files.length + 1;
      if (!split && partNumber > 1) throw new Error(`Tabel ${table.table_name} berubah saat backup; ulangi run`);
      const name = split
        ? `${table.table_name}.part-${String(partNumber).padStart(3, "0")}.json`
        : `${table.table_name}.json`;
      const content = `[${partContents.join(",")}]`;
      const size = new TextEncoder().encode(content).byteLength;
      const { error } = await target.storage.from("backups").upload(`${runFolder}/${name}`, content, {
        contentType: "application/json",
        upsert: false,
      });
      if (error) throw new Error(`Upload ${table.table_name} bagian ${partNumber} gagal: ${error.message}`);
      files.push({ name, size });
      totalBytes += size;
      partRowCount = 0;
      partContents = [];
    };
    for await (const page of rawTablePages(table, options)) {
      assertTime(startMs);
      if (page.rowCount === 0) continue;
      if (partRowCount > 0 && partRowCount + page.rowCount > EXTERNAL_PART_SIZE) await flushPart();
      const pageJson = page.json.trim();
      if (!pageJson.startsWith("[") || !pageJson.endsWith("]")) throw new Error(`Format JSON ${table.table_name} tidak valid`);
      partContents.push(pageJson.slice(1, -1));
      partRowCount += page.rowCount;
      tableRowCount += page.rowCount;
      if (partRowCount === EXTERNAL_PART_SIZE) await flushPart();
    }
    await flushPart();

    if (tableRowCount === 0) {
      const content = "[]";
      const size = 2;
      const name = `${table.table_name}.json`;
      const { error } = await target.storage.from("backups").upload(`${runFolder}/${name}`, content, {
        contentType: "application/json",
        upsert: false,
      });
      if (error) throw new Error(`Upload tabel kosong ${table.table_name} gagal: ${error.message}`);
      files.push({ name, size });
      totalBytes += size;
    }

    const countAfter = await countSourceRows(source, table, options);
    manifestTables.push({
      name: table.table_name,
      primary_key: table.primary_key,
      row_count: tableRowCount,
      part_count: files.length,
      files,
      source_count_before: countBefore,
      source_count_after: countAfter,
      count_delta: countAfter - tableRowCount,
    });
    totalRows += tableRowCount;
  }

  const storageFiles = await copyStorageBuckets(source, target, config, startMs);
  assertTime(startMs);
  const completedAt = new Date().toISOString();
  const manifest = {
    version: 1,
    app: "WMS Kemika",
    status: "success",
    started_at: startedAt,
    completed_at: completedAt,
    run_folder: runFolder,
    total_rows: totalRows,
    total_bytes: totalBytes + storageFiles.bytes,
    tables: manifestTables,
    skipped_tables: skipped,
    storage_files: storageFiles,
    auth_users_included: false,
  };
  const manifestContent = JSON.stringify(manifest);
  const manifestSize = new TextEncoder().encode(manifestContent).byteLength;
  const { error: manifestUploadError } = await target.storage.from("backups").upload(
    `${runFolder}/manifest.json`,
    manifestContent,
    { contentType: "application/json", upsert: false },
  );
  if (manifestUploadError) throw new Error(`Upload manifest gagal: ${manifestUploadError.message}`);

  const { data: downloadedManifest, error: manifestDownloadError } = await target.storage.from("backups")
    .download(`${runFolder}/manifest.json`);
  if (manifestDownloadError || !downloadedManifest) throw new Error("Manifest tidak dapat diunduh untuk verifikasi");
  const verifiedManifest = JSON.parse(await downloadedManifest.text());
  if (verifiedManifest.run_folder !== runFolder || verifiedManifest.total_rows !== totalRows) {
    throw new Error("Isi manifest hasil unduhan tidak cocok");
  }

  const remoteFiles = await listRunFiles(target, runFolder);
  const remoteSizes = new Map(remoteFiles.map((file) => [file.name, Number((file.metadata as Record<string, unknown>)?.size || 0)]));
  for (const table of manifestTables) {
    for (const file of table.files as { name: string; size: number }[]) {
      if (remoteSizes.get(file.name) !== file.size) throw new Error(`Ukuran file ${file.name} tidak cocok`);
    }
  }
  if (remoteSizes.get("manifest.json") !== manifestSize) throw new Error("Ukuran manifest tidak cocok");

  let retentionDeleted = 0;
  let retentionWarning: string | undefined;
  try {
    retentionDeleted = await pruneOldRuns(target);
  } catch (error) {
    retentionWarning = error instanceof Error ? error.message : String(error);
  }

  return {
    run: {
      started_at: startedAt,
      completed_at: completedAt,
      status: "success" as const,
      folder: runFolder,
      total_rows: totalRows,
      total_bytes: totalBytes + storageFiles.bytes + manifestSize,
      manifest,
      error: retentionWarning,
    },
    manifest,
    retentionDeleted,
  };
}

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

async function handleExternalBackup(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const sourceUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const source = createClient(sourceUrl, serviceKey, { auth: { persistSession: false } });
  let actorId: string | null = null;
  let isCron = false;
  let action = "status";
  let runFolder: string | undefined;
  const startMs = Date.now();

  try {
    const cronSecrets = [Deno.env.get("CRON_SECRET"), Deno.env.get("GDRIVE_CRON_SECRET")].filter(
      (value): value is string => !!value,
    );
    const incomingCron = req.headers.get("x-cron-secret");
    isCron = !!incomingCron;
    if (incomingCron) {
      let matched = false;
      for (const secret of cronSecrets) matched = await constantTimeEqual(incomingCron, secret) || matched;
      isCron = matched;
    }
    if (!isCron) {
      const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
      if (!token) return json({ error: "Unauthorized" }, 401);
      const { data: userData, error: userError } = await source.auth.getUser(token);
      if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
      actorId = userData.user.id;
      const { data: roles, error: roleError } = await source.from("user_roles").select("role").eq("user_id", actorId);
      if (roleError) return json({ error: "Tidak dapat memeriksa hak akses" }, 500);
      const allowed = (roles || []).some((row) => row.role === "super_admin" || row.role === "admin");
      if (!allowed) return json({ error: "Forbidden: super_admin/admin only" }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || !["status", "backup"].includes(body.action)) {
      return json({ error: "Body harus berisi action: status atau backup" }, 400);
    }
    action = body.action;

    const [rawConfig, rawStatus] = await Promise.all([
      readJsonSetting(source, "external_backup_config"),
      readJsonSetting(source, "external_backup_status"),
    ]);
    const config = normalizeConfig(rawConfig);
    const previousStatus: ExternalStatus = {
      last_success_at: typeof rawStatus.last_success_at === "string" ? rawStatus.last_success_at : null,
      last_stale_alert_at: typeof rawStatus.last_stale_alert_at === "string" ? rawStatus.last_stale_alert_at : null,
      history: Array.isArray(rawStatus.history) ? rawStatus.history as RunRecord[] : [],
    };
    const targetKey = Deno.env.get("EXTERNAL_BACKUP_SECRET_KEY");
    const targetUrl = Deno.env.get("EXTERNAL_BACKUP_URL") || DEFAULT_TARGET_URL;

    if (action === "status") {
      if (isCron) {
        const lastSuccessMs = previousStatus.last_success_at ? Date.parse(previousStatus.last_success_at) : 0;
        const lastAlertMs = previousStatus.last_stale_alert_at ? Date.parse(previousStatus.last_stale_alert_at) : 0;
        const stale = !lastSuccessMs || Date.now() - lastSuccessMs > 36 * 60 * 60 * 1000;
        if (stale && Date.now() - lastAlertMs > 23 * 60 * 60 * 1000) {
          const lastText = previousStatus.last_success_at || "belum pernah berhasil";
          await notifySuperAdmins(source, sourceUrl, serviceKey, "Backup eksternal WMS gagal/terlambat", `Backup sukses terakhir: ${lastText}`);
          const next = { ...previousStatus, last_stale_alert_at: new Date().toISOString() };
          await source.from("settings").upsert({ key: "external_backup_status", value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
        }
      }
      const keyIsLegacyJwt = !!targetKey && /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(targetKey.trim());
      const keyMatchesTarget = !!targetKey && keyIsLegacyJwt && keyMatchesTargetProject(targetKey.trim(), targetUrl);
      return json({
        success: true,
        configured: keyMatchesTarget,
        configuration_issue: targetKey && !keyIsLegacyJwt
          ? "legacy_service_role_required"
          : targetKey && !keyMatchesTarget ? "wrong_project" : null,
        config,
        status: previousStatus,
      });
    }

    if (!targetKey) {
      return json({ error: "Backup eksternal belum dikonfigurasi: EXTERNAL_BACKUP_SECRET_KEY belum diisi", configured: false }, 503);
    }
    if (!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(targetKey.trim())) {
      return json({
        error: "Kunci tujuan harus berupa legacy service_role JWT dari project HRGA (Settings → API Keys → Legacy keys)",
        configured: false,
      }, 503);
    }
    if (!keyMatchesTargetProject(targetKey.trim(), targetUrl)) {
      return json({
        error: "Kunci yang tersimpan milik project lain. Backup ke HRGA tidak dijalankan.",
        configured: false,
        configuration_issue: "wrong_project",
      }, 503);
    }
    if (body.preflight === true) return json({ success: true, configured: true });
    const target = createClient(targetUrl, targetKey.trim(), { auth: { persistSession: false } });
    const startedAt = new Date().toISOString();
    runFolder = `kemika-wms/${startedAt.replace(/[:.]/g, "-")}`;
    await ensurePrivateTargetBucket(target);

    const result = await runExternalBackup(source, target, config, startMs, startedAt, runFolder);
    await writeStatus(source, previousStatus, result.run);
    await auditRun(source, actorId, result.run);
    return json({ success: true, ...result.run, retention_deleted: result.retentionDeleted });
  } catch (error) {
    const partial = error instanceof PartialRunError;
    const statusCode = error instanceof HttpError ? error.status : partial ? 504 : 500;
    const message = error instanceof Error ? error.message : String(error);
    console.error("External backup error:", message);

    if (action === "backup") {
      const now = new Date().toISOString();
      const failedTable = message.match(/Backup tabel ([a-z0-9_]+)/i)?.[1];
      const run: RunRecord = {
        started_at: new Date(startMs).toISOString(),
        completed_at: now,
        status: partial ? "partial" : "failed",
        folder: runFolder,
        failed_tables: failedTable ? [failedTable] : [],
        error: message.slice(0, 500),
      };
      try {
        const rawStatus = await readJsonSetting(source, "external_backup_status");
        const previous: ExternalStatus = {
          last_success_at: typeof rawStatus.last_success_at === "string" ? rawStatus.last_success_at : null,
          last_stale_alert_at: typeof rawStatus.last_stale_alert_at === "string" ? rawStatus.last_stale_alert_at : null,
          history: Array.isArray(rawStatus.history) ? rawStatus.history as RunRecord[] : [],
        };
        await writeStatus(source, previous, run);
        await auditRun(source, actorId, run);
        await notifySuperAdmins(
          source,
          sourceUrl,
          serviceKey,
          "Backup eksternal WMS gagal/terlambat",
          `${partial ? "Run partial" : "Backup gagal"}: ${run.error}. Sukses terakhir: ${previous.last_success_at || "belum pernah"}`,
        );
      } catch (statusError) {
        console.error("Gagal mencatat kegagalan backup:", statusError instanceof Error ? statusError.message : statusError);
      }
    }
    return json({ success: false, error: message, status: partial ? "partial" : "failed" }, statusCode);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = await req.clone().json().catch(() => null) as Record<string, unknown> | null;
  if (body?.action === "status") return handleExternalBackup(req);
  const preflightBody = { ...(body || {}), action: "backup", preflight: true };
    const preflight = await handleExternalBackup(new Request(req, { body: JSON.stringify(preflightBody) }));
  if (!preflight.ok) return preflight;
  EdgeRuntime.waitUntil(handleExternalBackup(req).then(async (response) => { await response.text(); }));
  return json({ success: true, status: "started" }, 202);
});
