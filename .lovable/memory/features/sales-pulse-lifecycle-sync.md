---
name: Sales Pulse Lifecycle Sync
description: WMS sinkron lifecycle Sales Order (approved/updated/cancelled) ke Sales Pulse via edge function sales-pulse-sync
type: feature
---
WMS Integration Guide v5 mendefinisikan 4 webhook (approved/updated/cancelled/deleted). WMS mengimplementasikan 3 (skip deleted):

- **approved** → action `wms-so-approved` dipicu dari `approveSalesOrder()` setelah `sales_order_approve` RPC sukses.
- **updated** → action `wms-so-updated` dipicu di 2 tempat: `updateSalesOrder()` (edit SO yang sudah approved) DAN `approveSalesOrderRevision()` (setelah revisi di-approve).
- **cancelled** → action `wms-so-cancelled` dipicu di `cancelSalesOrder()` (soft cancel, tidak hapus deal di CRM).

**Helper internal**: `syncSalesOrderUpdatedFromDb(orderId)` di `src/hooks/useSalesOrders.ts` mengambil snapshot SO dari DB dan kirim event update. Hanya kirim jika status ∈ [approved, partially_delivered, completed] dan reference berawalan `REF-`.

**Helper publik** di `src/lib/salesPulseSync.ts`: `syncSalesOrderApprovedToSalesPulse`, `syncSalesOrderUpdatedToSalesPulse`, `syncSalesOrderCancelledToSalesPulse`, `sanitizeCustomerPoNumber`.

**Edge function** `sales-pulse-sync` melakukan whitelist sanitasi `customer_po` (A-Za-z0-9 spasi - _ . / \ # ()), forward ke `https://ggzttrxpkbpjbymrzpsg.supabase.co/functions/v1/wms-so-{approved,updated,cancelled}` dengan header `X-WMS-API-Key`, dan log ke `sales_pulse_sync_logs`.

Untuk update: hanya kirim field yang non-kosong (sesuai behaviour Sales Pulse: tidak overwrite field yang tidak dikirim). Items kalau dikirim → REPLACE TOTAL.

**Validasi reference_number** (`sanitizeSalesPulseReference` di `salesPulseSync.ts`): Wajib format `REF-XXXX` (uppercase, alfanumerik + dash). Semua call site di `useSalesOrders.ts` (createSalesOrder, updateSalesOrder, approveSalesOrder, cancelSalesOrder, syncSalesOrderUpdatedFromDb) menggunakan helper ini sebelum invoke edge function — input invalid otomatis di-skip tanpa throw.

**Retry otomatis** (`withRetry` internal di `salesPulseSync.ts`): Ketiga fungsi sync (approved/updated/cancelled) dibungkus retry 3 attempt total dengan exponential backoff (500ms → 1500ms). Hanya error transient yang di-retry (regex: network|fetch|timeout|503|502|504|temporarily|ECONNRESET|ETIMEDOUT). Error 4xx (validasi/conflict) langsung throw tanpa retry. Kegagalan akhir di-catch di caller dengan console.warn → tidak mengganggu transaksi WMS utama.

**Master Data Sync (spec v2.0)**: Tambahan 2 endpoint UPSERT idempotent untuk master data:
- `wms-product-upsert` (natural key: `sku`) — payload: `sku`, `name`, `is_active`, opsional `selling_price`, `purchase_price`, `unit`, `category`. Sales Pulse TIDAK overwrite `selling_price` jika existing > 0; auto-create kategori baru.
- `wms-customer-upsert` (natural key: `code`) — payload: `code`, `name`, `is_active`, opsional `customer_type`, `pic`, `phone`, `email`, `city`. Sales Pulse melakukan mapping `customer_type` → segment (Government→B2G, Individual/Retail→B2C, lainnya→B2B) dan `is_active` → status. `sales_id` auto-assign ke admin pertama saat insert, tidak overwrite saat update.

Helper `syncProductToSalesPulse` & `syncCustomerToSalesPulse` di `salesPulseSync.ts` dipakai dari `Products.tsx` & `Customers.tsx` (create/update + bulk import CSV) sebagai fire-and-forget. Field tambahan WMS yang belum didukung Sales Pulse (barcode, description, address, npwp, dll) di-DROP di edge function untuk hemat bandwidth — bisa ditambah on-request ke Sales Pulse.
