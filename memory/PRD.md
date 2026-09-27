
## Implemented (2026-06) — Iterasi 4 (lanjutan prompt)
- Filter tanggal laporan: toggle "Per Bulan / Rentang Tanggal" di Laporan Penjualan (servis & jualan) dan Laporan Belanja; export Excel ikut rentang. (backend date_from/date_to sudah ada; wiring frontend + excel.ts exportReportXlsx({month|dateFrom|dateTo}))
- Grafik Laba Kotor Part di dashboard Owner: /reports/profit-trend, bar chart 12 bulan + toggle Tahunan, perbandingan M-1 (delta %), total laba part tahun berjalan
- Edit Belanja: tombol pensil per catatan (owner/pembuat) → expense-edit-sheet (nominal, tanggal[owner], metode, supplier/HET/diskon/ongkir untuk beli part, catatan) via PUT /expenses/{id}
- Backup reminder in-app: banner di dashboard Owner bila belum backup hari ini (src/backup-reminder.ts pakai storage.getItem/setItem key suel_last_backup_ymd; ditandai saat exportBackup sukses di /laporan)
- Alamat lengkap (opsional) di form: transaksi/baru (pelanggan baru) & outlet (jualan langsung) memakai AddressFields (Dusun ketik bebas; Desa autocomplete dari LOMBOK_VILLAGES; Kecamatan+Kabupaten auto). Desa non-list tetap tersimpan sbg teks bebas. Kirim dusun/desa/kecamatan/kabupaten + composed address
- Owner ubah tanggal transaksi semua jenis: servis (transaksi/[id], sudah ada), jualan langsung (nota-jual → PUT /sales/{id}/date), belanja (edit sheet, field tanggal owner), mutasi/penyesuaian stok (mutasi.tsx per baris → PUT /stock-movements/{id}/date). Default hari ini, owner bisa mundur-tanggalkan.
- Komponen baru: src/components/date-edit.tsx (DateEditSheet + ymdToDMY/isoToDMY/dmyToYmd)
- Tes: /app/backend/tests/test_iteration3_new_features.py — 14/14 PASSED

## Backlog / Next
- P2: bersihkan noise 401 pada layar terautentikasi (background call tanpa header)
- P2: /stock-movements/{mid}/date pakai Pydantic model (bukan raw dict)


## Implemented (2026-09-27) — Restore & Preview
- Proyek dipulihkan dari arsip zip `klinik-motor-main (3).zip` ke environment baru: backend (server.py, tests) + frontend (app/, src/, assets, app.json) disalin; file terproteksi (.env, metro.config.js, eas.json) dipertahankan.
- Dependensi dilengkapi: pip `openpyxl`, `pwdlib[argon2]`; yarn `@react-native-vector-icons/ionicons`, `@react-navigation/bottom-tabs`, `expo-camera`, `expo-document-picker`, `expo-image-picker`, `expo-print`, `expo-sharing`.
- backend/.env dilengkapi: JWT_SECRET, JWT_EXPIRE_MINUTES=10080, EMERGENT_LLM_KEY, INTEGRATION_PROXY_URL.
- Smoke test (testing agent): 13/13 backend pytest passed, 21 endpoint owner 200 OK, RBAC valid; frontend login owner & kasir + semua tab render tanpa error. Laporan: /app/test_reports/iteration_1.json.
- Kredensial uji: /app/memory/test_credentials.md (owner/owner123, kasir/kasir123, mekanik/mekanik123, partman/partman123).

## Implemented (2026-09-27) — Iterasi 2: pembatalan faktur, laporan modal, WA rinci, keyboard, thermal 80mm
- Pembatalan faktur: `exclude_cancelled_finance()` menandai payments/debt_payments `cancelled=True`, hapus service_history, nolkan hutang; filter `PAY_ACTIVE` dipakai di dashboard, /reports/omzet, profit-trend, expenses/summary, reports/mechanics, export omzet; /debts & piutang dashboard exclude DIBATALKAN. Migrasi sekali jalan saat startup (`purge_cancelled_finance`) untuk faktur batal lama.
- Laporan Modal & Penjualan: GET /reports/profit?mode=daily|monthly|yearly&period= (modal part=harga beli×qty, harga jual part, profit part, jasa, diskon, laba kotor; servis lunas + jualan langsung). Screen /laporan-modal (link dari /laporan).
- Nota WA (servis & jualan): rincian JASA/SPAREPART per item (qty x harga = subtotal), subtotal, diskon, TOTAL AKHIR, bayar/kembalian/sisa hutang, rekomendasi.
- Sheet (ui.tsx) dibungkus KeyboardAvoidingView (react-native-keyboard-controller) → daftar hasil pencarian part tampil di atas keyboard.
- Cetak nota/faktur: format thermal 80mm (src/thermal.ts: @page 80mm, body 72mm, item 2 baris; iOS width 226pt).
- Tes: tests/test_cancel_profit_wa.py (3) + tests/test_iteration2_cancel_profit_wa_ext.py (5) PASS. Laporan: /app/test_reports/iteration_2.json

## Implemented (2026-09-27) — Iterasi 3: urutan rak cek fisik + Hapus Data Percobaan
- Cek Fisik Stok: urutan lokasi rak ascending alami (1 < 2 < 10 < A1 < A1.2 < A2 < A10 < B1; tanpa rak paling bawah), diterapkan di backend (create + GET detail, rak ikut master terbaru) dan client-side (cek-stok/[id].tsx cmpRack).
- POST /admin/reset-trial-data (owner + password owner): hapus service_transactions/items/complaints/estimations/additional_items, work_orders, payments, invoices, debt_payments, service_history, status_logs, whatsapp_logs, audit_logs, sales, stock_movements, stock_checks(+items), outlet_stocks, expenses, tool_checklists, customers, vehicles, notifications, counters; stok part reset 0. Master tetap: users, parts, services, outlets, tools, settings, meta.
- UI: tab Lainnya (owner) → "Hapus Data Percobaan" → sheet password owner (testID menu-reset-trial-data, reset-trial-password-input, reset-trial-confirm-button).
- Tes: tests/test_rack_sort_reset.py 4/4 PASS.
