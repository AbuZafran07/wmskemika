import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const TABLES = [
  // Master Data
  "products", "categories", "units", "suppliers", "customers",
  // Plan & Sales Order
  "plan_order_headers", "plan_order_items",
  "sales_order_headers", "sales_order_items",
  // Proforma Invoice
  "proforma_invoices", "proforma_invoice_items",
  // Stock
  "stock_in_headers", "stock_in_items",
  "stock_out_headers", "stock_out_items",
  "stock_adjustments", "stock_adjustment_items",
  "inventory_batches", "stock_transactions",
  // Delivery / Kanban
  "delivery_requests", "delivery_orders", "delivery_comments",
  "delivery_checklists", "delivery_labels", "delivery_card_labels",
  // Tracker PO
  "po_tracker_checklists", "po_tracker_comments",
  "po_tracker_labels", "po_tracker_card_labels", "po_tracker_archived",
  // Kalibrasi
  "calibration_items", "calibration_spare_parts",
  "calibration_tracker_checklists", "calibration_tracker_comments",
  "calibration_labels", "calibration_card_labels", "calibration_document_logs",
  // Chat K'talk
  "chat_messages", "chat_reactions",
  // Lainnya
  "attachments", "national_holidays",
  "profiles", "user_roles", "user_signatures",
  "audit_logs", "settings",
];

async function getGoogleAccessToken(serviceAccount: Record<string, string>) {
  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const iat = Math.floor(Date.now() / 1000);
  const signingInput = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  })}`;

  const pem = serviceAccount.private_key
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  const keyBuffer = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${signingInput}.${signatureB64}`,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Google OAuth gagal: ${JSON.stringify(data)}`);
  }
  return data.access_token as string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // ===== Auth: cron secret OR super_admin JWT =====
    const cronSecret = Deno.env.get("GDRIVE_CRON_SECRET") || Deno.env.get("CRON_SECRET");
    const incomingCron = req.headers.get("x-cron-secret");
    let authorized = !!cronSecret && incomingCron === cronSecret;
    let actorId: string | null = null;

    if (!authorized) {
      const token = req.headers.get("Authorization")?.replace("Bearer ", "");
      if (!token) return json({ error: "Unauthorized" }, 401);
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
      actorId = userData.user.id;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", actorId);
      const allowed = (roles || []).some((r: { role: string }) =>
        r.role === "super_admin" || r.role === "admin"
      );
      if (!allowed) return json({ error: "Forbidden: super_admin/admin only" }, 403);
      authorized = true;
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch (_) { /* empty body */ }

    // ===== Google credentials =====
    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!serviceAccountJson) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON belum dikonfigurasi");
    }
    const gdriveFolderId = Deno.env.get("GDRIVE_FOLDER_ID");
    if (!gdriveFolderId) {
      throw new Error("GDRIVE_FOLDER_ID belum dikonfigurasi");
    }
    const serviceAccount = JSON.parse(serviceAccountJson);

    // ===== Test mode: hanya cek akses token + folder =====
    if (body.test === true) {
      const accessToken = await getGoogleAccessToken(serviceAccount);
      const folderRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${gdriveFolderId}?fields=id,name,driveId,owners(emailAddress)&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const folderData = await folderRes.json();
      if (!folderRes.ok) {
        return json({
          success: false,
          message: `Folder Google Drive tidak dapat diakses: ${JSON.stringify(folderData)}`,
        }, 400);
      }
      if (!folderData.driveId) {
        return json({
          success: false,
          message:
            `Folder "${folderData.name}" berada di My Drive pribadi. Service Account tidak punya kuota penyimpanan, ` +
            `jadi upload akan gagal. Pindahkan folder backup ke Shared Drive (Drive Bersama) lalu bagikan ke ${serviceAccount.client_email} sebagai Content manager, dan isi GDRIVE_FOLDER_ID dengan ID folder di Shared Drive tersebut.`,
        }, 400);
      }
      return json({
        success: true,
        message: `Koneksi Google Drive OK — folder "${folderData.name}" (Shared Drive)`,
        folder: folderData.name,
        service_account: serviceAccount.client_email,
      });
    }

    // ===== Cek toggle (cron only; manual run selalu boleh) =====
    const { data: config } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "gdrive_backup_config")
      .maybeSingle();
    const configValue = (config?.value ?? {}) as Record<string, unknown>;
    const isCron = incomingCron && incomingCron === cronSecret;
    if (isCron && !configValue.enabled) {
      return json({ message: "Google Drive backup is disabled" });
    }

    // ===== 1. Export tabel =====
    const backupData: Record<string, unknown[]> = {};
    let totalRecords = 0;
    const failed: string[] = [];

    for (const table of TABLES) {
      let query = supabase.from(table).select("*");
      if (table === "audit_logs") {
        query = query
          .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order("created_at", { ascending: false });
      }
      const { data, error } = await query;
      if (error) {
        failed.push(table);
        continue;
      }
      backupData[table] = data ?? [];
      totalRecords += data?.length ?? 0;
    }

    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `WMS-Kemika-Backup-${dateStr}.json`;
    const jsonContent = JSON.stringify({
      _meta: {
        app: "WMS Kemika",
        version: "1.0.0",
        type: "gdrive_auto_backup",
        exported_at: now.toISOString(),
        tables: Object.keys(backupData),
        failed_tables: failed,
        total_records: totalRecords,
      },
      data: backupData,
    });

    // ===== 2. Access token =====
    const accessToken = await getGoogleAccessToken(serviceAccount);

    // ===== 3. Upload multipart =====
    const boundary = "backup_boundary_wms_kemika";
    const metadata = JSON.stringify({
      name: fileName,
      parents: [gdriveFolderId],
      mimeType: "application/json",
      description: `WMS Kemika auto backup — ${totalRecords} records`,
    });

    const multipartBody =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json\r\n\r\n${jsonContent}\r\n` +
      `--${boundary}--`;

    const uploadResponse = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,size",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      },
    );

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      console.error("Google Drive upload gagal:", uploadResponse.status, errText);
      if (errText.includes("storageQuotaExceeded") || errText.includes("do not have storage quota")) {
        return json({
          error:
            "Upload gagal: folder tujuan ada di My Drive pribadi. Service Account Google tidak memiliki kuota penyimpanan. " +
            `Buat folder backup di Shared Drive (Drive Bersama), bagikan ke ${serviceAccount.client_email} sebagai Content manager, ` +
            "lalu perbarui GDRIVE_FOLDER_ID dengan ID folder tersebut.",
          reason: "storage_quota",
        }, 400);
      }
      return json({ error: `Google Drive upload gagal (${uploadResponse.status}): ${errText}` }, 502);
    }
    const uploadResult = await uploadResponse.json();

    // ===== 4. Retensi 30 file =====
    const listResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${
        encodeURIComponent(
          `'${gdriveFolderId}' in parents and name contains 'WMS-Kemika-Backup' and trashed=false`,
        )
      }&orderBy=createdTime&fields=files(id,name,createdTime)&pageSize=100&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const listData = await listResponse.json();
    const files: Array<{ id: string }> = listData.files || [];

    const KEEP_COUNT = 30;
    let deletedOld = 0;
    if (files.length > KEEP_COUNT) {
      const toDelete = files.slice(0, files.length - KEEP_COUNT);
      deletedOld = toDelete.length;
      await Promise.all(
        toDelete.map((f) =>
          fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?supportsAllDrives=true`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          })
        ),
      );
    }

    // ===== 5. Setting + audit log =====
    await supabase.from("settings").upsert({
      key: "gdrive_backup_config",
      value: {
        ...configValue,
        enabled: configValue.enabled === true,
        last_backup_at: now.toISOString(),
        last_backup_file: fileName,
        last_backup_records: totalRecords,
        gdrive_file_id: uploadResult.id,
      },
      updated_at: now.toISOString(),
    }, { onConflict: "key" });

    await supabase.from("audit_logs").insert({
      user_id: actorId,
      action: "GDRIVE_AUTO_BACKUP",
      module: "backup",
      ref_table: "settings",
      new_data: {
        file: fileName,
        gdrive_file_id: uploadResult.id,
        total_records: totalRecords,
        deleted_old_files: deletedOld,
        failed_tables: failed,
      },
    });

    return json({
      success: true,
      file: fileName,
      gdrive_file_id: uploadResult.id,
      total_records: totalRecords,
      failed_tables: failed,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("GDrive backup error:", message);
    return json({ error: message }, 500);
  }
});
