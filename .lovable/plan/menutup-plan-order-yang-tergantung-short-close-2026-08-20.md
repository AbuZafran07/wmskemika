# Menutup Plan Order yang Tergantung (Short Close)

## Masalah
Order 5 pcs, vendor hanya kirim 4. Setelah Stock In, PO berstatus **Partially Received** dengan `qty_remaining = 1` dan menggantung terus di tab Active, karena saat ini tidak ada cara menutup sisa selain menunggu kiriman berikutnya.

## Solusi: fitur "Tutup Sisa PO" (Short Close)
Menutup sisa qty secara administratif **tanpa** menyentuh stok yang sudah diterima.

Betul — penutupan tidak boleh sepihak. Alurnya dibuat 2 tahap dengan persetujuan Finance:

**Tahap 1 — Purchasing mengajukan**
1. Di detail Plan Order berstatus `partially_received` muncul tombol **"Ajukan Tutup Sisa PO"** (purchasing / admin / super_admin).
2. Dialog menampilkan item yang masih ada sisa (dipesan / diterima / sisa) dan meminta:
   - Alasan wajib (min. 20 karakter), mis. "Vendor stok habis, 1 pcs dibatalkan".
   - Opsi centang: "Buat Plan Order baru untuk sisa" (kalau sisa mau dipesan ulang).
3. Status PO menjadi **Short Close Requested** (tetap di tab Active, badge kuning). Belum ada perubahan qty/nilai.

**Tahap 2 — Finance menyetujui / menolak**
4. Finance (juga super_admin) melihat pengajuan di detail PO dan di widget Pending Actions dashboard, lalu:
   - **Setujui**: `planned_qty` tiap item disesuaikan menjadi = `qty_received` (sisa jadi 0), nilai PO dihitung ulang sesuai qty final, status menjadi **Received (Short Closed)** dan pindah ke tab Archived. Jika opsi PO baru dipilih, dibuat PO **draft** berisi item sisa dengan referensi ke PO lama.
   - **Tolak**: wajib alasan min. 20 karakter, status kembali ke `partially_received`.
5. Semua langkah (ajukan / setujui / tolak) tercatat di Audit Log beserta alasan dan data sebelum-sesudah, plus notifikasi push ke pihak terkait.

## Kenapa pendekatan ini
- Stok fisik yang sudah diterima tidak berubah — aman dan non-destruktif.
- Nilai PO menyesuaikan qty final, jadi laporan PO vs penerimaan tidak ada selisih semu.
- Sisa yang masih mau dibeli tetap terlacak lewat PO baru, bukan menggantung di PO lama.
- Perubahan nilai PO hanya terjadi setelah Finance approve, jadi ada kontrol dan jejak audit yang jelas.

## Detail teknis
- Migration (semua RPC `SECURITY DEFINER`, `search_path='public'`, tanpa overloading):
  - Kolom baru di `plan_order_headers`: `short_close_reason`, `short_close_requested_by`, `short_close_requested_at`, `short_close_create_followup`, `short_close_approved_by`, `short_close_approved_at`, `short_close_rejected_reason`. Status baru: `short_close_requested`.
  - `plan_order_request_short_close(order_id uuid, reason text, create_followup boolean)` — validasi status `partially_received`, masih ada sisa, role `super_admin`/`admin`/`purchasing`, alasan >= 20 karakter; set status `short_close_requested` + simpan pengajuan; audit log.
  - `plan_order_approve_short_close(order_id uuid)` — role `finance`/`super_admin`; update `plan_order_items.planned_qty = qty_received`, hitung ulang `total_amount`/`grand_total` mengikuti diskon, pajak, biaya kirim; set `status = 'received'` dan penanda short close; buat PO draft item sisa bila `create_followup`; audit log.
  - `plan_order_reject_short_close(order_id uuid, reject_reason text)` — role `finance`/`super_admin`, alasan >= 20 karakter, status balik ke `partially_received`; audit log.
- Frontend:
  - `src/hooks/usePlanOrders.ts`: `requestPlanOrderShortClose`, `approvePlanOrderShortClose`, `rejectPlanOrderShortClose`.
  - `src/pages/PlanOrder.tsx`: status baru di `statusConfig` + filter, tombol "Ajukan Tutup Sisa PO" (purchasing) dan tombol Setujui/Tolak (finance), dialog dengan tabel sisa + textarea alasan + checkbox PO lanjutan, toast sonner (hijau approve, merah reject).
  - `src/components/dashboard/PendingActionsWidget.tsx`: tampilkan pengajuan short close untuk Finance.
- Alur Stock In yang sudah berjalan tidak diubah.

