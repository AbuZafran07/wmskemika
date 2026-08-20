# Menutup Plan Order yang Tergantung (Short Close)

## Masalah
Order 5 pcs, vendor hanya kirim 4. Setelah Stock In, PO berstatus **Partially Received** dengan `qty_remaining = 1` dan menggantung terus di tab Active, karena saat ini tidak ada cara menutup sisa selain menunggu kiriman berikutnya.

## Solusi: fitur "Tutup Sisa PO" (Short Close)
Menutup sisa qty secara administratif **tanpa** menyentuh stok yang sudah diterima.

Alur:
1. Di detail Plan Order berstatus `partially_received` muncul tombol **"Tutup Sisa PO"**.
2. Dialog menampilkan item yang masih ada sisa (dipesan / diterima / sisa) dan meminta:
   - Alasan wajib (min. 20 karakter), mis. "Vendor stok habis, 1 pcs dibatalkan".
   - Opsi centang: "Buat Plan Order baru untuk sisa" (kalau sisa mau dipesan ulang).
3. Setelah dikonfirmasi:
   - `planned_qty` setiap item disesuaikan menjadi = `qty_received` (sisa jadi 0), nilai PO dihitung ulang sesuai qty final.
   - Status PO menjadi **Received (Short Closed)** dan pindah ke tab Archived.
   - Alasan + data sebelum/sesudah tercatat di Audit Log.
   - Jika opsi PO baru dipilih, dibuat PO **draft** berisi item sisa dengan referensi ke PO lama.

## Kenapa pendekatan ini
- Stok fisik yang sudah diterima tidak berubah — aman dan non-destruktif.
- Nilai PO menyesuaikan qty final, jadi laporan PO vs penerimaan tidak ada selisih semu.
- Sisa yang masih mau dibeli tetap terlacak lewat PO baru, bukan menggantung di PO lama.

## Detail teknis
- Migration: RPC `plan_order_short_close(order_id uuid, reason text, create_followup boolean)`, `SECURITY DEFINER`, `search_path='public'`:
  - Validasi: status harus `partially_received`, role `super_admin` / `admin` / `purchasing`, alasan >= 20 karakter.
  - Update `plan_order_items.planned_qty = qty_received` (qty_remaining generated ikut jadi 0).
  - Hitung ulang `total_amount` / `grand_total` mengikuti diskon, pajak, dan biaya kirim yang ada.
  - Set `status = 'received'` dan `cancel_reason = 'SHORT CLOSE: <alasan>'` sebagai penanda.
  - Insert `audit_logs` (action `short_close`, module `plan_order`, old_data/new_data).
  - Jika `create_followup` true, buat PO draft berisi item sisa memakai logika yang sama seperti `plan_order_create`.
- Frontend:
  - `src/hooks/usePlanOrders.ts`: fungsi `shortClosePlanOrder(...)`.
  - `src/pages/PlanOrder.tsx`: tombol di detail + dialog konfirmasi (tabel sisa, textarea alasan, checkbox PO lanjutan), toast sonner, dan badge "Short Closed" pada status.
- Alur Stock In yang sudah berjalan tidak diubah.

