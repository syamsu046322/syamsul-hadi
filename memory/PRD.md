
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
