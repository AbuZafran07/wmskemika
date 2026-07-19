# Phase 3b — Sales Order sebagai Home Kalibrasi

Tujuan: buat halaman **Sales Order** jadi satu-satunya tempat untuk mengelola SO Kalibrasi (create, terima alat, terbit SPK, minta sparepart), sehingga menu **Penerimaan Kalibrasi** bisa dipensiunkan di Phase berikutnya.

## Ruang Lingkup

### 1. Filter & Badge di List Sales Order
- Tambah filter tipe: `Semua / Regular / Kalibrasi` (baca `order_type`).
- Tambah kolom / badge kecil di tabel: chip "KAL" + `calibration_status` (pending_receipt / received / in_calibration / completed / returned) untuk baris `order_type='calibration'`.
- Nomor SO Kalibrasi tetap pakai format `KAL/YYYYMMDD.NN` (sudah ada di generator).

### 2. Tombol "Buat SO Kalibrasi"
- Di header halaman, tambah tombol kedua di samping "Buat SO" biasa.
- Membuka wizard ringkas: pilih Customer, PIC, tanggal target, catatan → generate KAL number → insert `sales_order_headers` dengan `order_type='calibration'`, `calibration_status='pending_receipt'`, tanpa item (item ditambahkan di tab Penerimaan).
- Untuk SO reguler, flow lama tidak berubah.

### 3. Detail Dialog SO Kalibrasi — 3 Tab Baru
Kalau `order_type='calibration'`, detail dialog menampilkan tab tambahan:

- **Tab Penerimaan Alat**
  - Daftar `sales_order_items` (`item_type='calibration'`) dengan kolom: Brand/Model, Serial, Range, Accuracy, Kondisi, Aksesoris, Kelengkapan, Catatan.
  - Tombol Tambah/Edit/Hapus alat (edit hanya saat status ≤ `received`).
  - Tombol **Konfirmasi Penerimaan** → set `calibration_received_at = now()`, `calibration_status='received'`.

- **Tab SPK & Sertifikat**
  - Field per-item: `spk_number`, `certificate_number`, `calibration_date`, `next_calibration_date`, `spk_notes`.
  - Tombol **Terbitkan SPK** → generate SPK number (sudah ada di util), set `calibration_status='in_calibration'`.
  - Tombol **Selesai Kalibrasi** → set `calibration_status='completed'`.

- **Tab Sparepart**
  - List sparepart yang ditarik untuk SO ini dari `stock_out_headers` (filter `so_ref = <so_number>` atau relasi `sales_order_id` kalau ada).
  - Tombol **Ajukan Sparepart** → membuka form: pilih produk, qty, alasan → membuat `stock_out_headers` draft dengan referensi SO kalibrasi ini.
  - Tombol **Cetak Form Pengajuan** → PDF sederhana untuk warehouse (nomor SO, alat, list sparepart, tanda tangan).

### 4. Menu "Penerimaan Kalibrasi" — Placeholder
- Sementara masih aktif (Phase 4 belum), tapi tambahkan banner di atas halaman: *"Menu ini akan digabung ke Sales Order. Silakan gunakan halaman Sales Order → tombol Buat SO Kalibrasi."*
- Fungsionalitas lama tetap jalan (compat).

## Catatan Teknis

- Semua tab baru dibungkus di komponen terpisah `src/components/sales-order/CalibrationTabs.tsx` supaya `SalesOrder.tsx` tidak makin gemuk.
- Wizard "Buat SO Kalibrasi" pakai komponen baru `src/components/sales-order/CreateCalibrationSODialog.tsx`.
- Data akses via hook baru `src/hooks/useCalibrationSO.ts` (create, addItem, updateItem, deleteItem, confirmReceived, issueSPK, completeCalibration).
- **Belum ada** tabel/RPC baru di phase ini. Sparepart pakai `stock_out_headers` existing + kolom `so_ref` (sudah ada). Kalau ternyata butuh kolom baru (misal `linked_so_id`), akan diusulkan lewat migration terpisah sebelum implementasi tab Sparepart.
- Typecheck harus tetap hijau di setiap langkah.

## Urutan Kerja (agar bisa direview bertahap)

1. Hook `useCalibrationSO.ts` + wizard **Buat SO Kalibrasi** + filter/badge di list SO.
2. Tab **Penerimaan Alat** di detail dialog.
3. Tab **SPK & Sertifikat**.
4. Tab **Sparepart** (butuh konfirmasi struktur relasi ke Stock Out).
5. Banner di menu Penerimaan Kalibrasi lama.

Boleh saya mulai dari langkah 1?
