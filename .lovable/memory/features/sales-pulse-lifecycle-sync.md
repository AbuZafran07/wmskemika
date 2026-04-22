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
