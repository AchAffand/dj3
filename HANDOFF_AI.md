# Panduan Melanjutkan Project DJ3

Dokumen ini adalah konteks kerja untuk AI yang melanjutkan project DJ3. Baca seluruh file ini dan `README.md` sebelum mengubah kode, rumus, katalog, seed, atau database. Gunakan kondisi file project sebagai sumber kondisi terbaru; catatan percakapan menjelaskan alasan keputusan.

### Instruksi awal untuk AI penerus

Sebelum mulai bekerja, baca `HANDOFF_AI.md` sampai selesai, lalu baca `README.md` dan file terkait permintaan terbaru. Ringkas kondisi terakhir kepada pemilik, bedakan fakta yang sudah dipastikan dari yang belum, dan jangan mengubah database hosted atau menebak rumus tanpa persetujuan/sumber yang jelas.

## Cara bekerja dengan pemilik project

- Berkomunikasi dalam bahasa Indonesia, langsung dan spesifik.
- Pemilik sangat mengutamakan ketepatan rumus Excel dan fleksibilitas untuk menambah model, material, variabel, kelompok katalog, serta menu baru.
- Jangan menebak rumus atau menganggap baris Excel yang kosong berarti qty nol. Jika nama, kode, rumus, satuan, atau maksud perubahan tidak jelas, tunjukkan kode dan bagian yang bermasalah lalu tanyakan.
- Jangan mengulang pertanyaan yang sudah dijawab di bagian **Keputusan yang sudah disepakati**.
- Jangan melakukan push ke Supabase hosted, deploy, atau mengubah data eksternal tanpa instruksi yang jelas. Perubahan di folder project boleh dikerjakan sesuai permintaan.
- Jangan pernah menampilkan atau menyalin isi `.env.local`, access token, password, atau Supabase secret. Aplikasi browser hanya menggunakan publishable key; jangan menaruh `service_role` pada `VITE_*`.
- Jangan menjalankan ulang ekstraksi katalog dari Excel secara membabi buta; lihat peringatan di bawah.

## Ringkasan aplikasi

Project berada di `D:\Project\Dj3`. Ini aplikasi web Vite + React + TypeScript untuk kalkulator kusen/pintu, proyek, master rumus, dan master harga. Supabase adalah database/auth hosted; Vercel menjadi target hosting web. Untuk database Supabase hosted, Docker Desktop tidak diperlukan. Docker hanya dibutuhkan jika menjalankan Supabase lokal dengan `supabase start`.

Fitur dashboard didaftarkan melalui `src/app/features.ts`, supaya menu baru dapat ditambahkan secara terstruktur. Fitur aktif meliputi Kalkulator Kusen, Proyek, Master Rumus, dan Master Harga. Kalkulator mendukung beberapa model dalam satu proyek. Setiap baris model dapat memilih sumber master harga dan varian harga sendiri agar model berbeda dalam satu proyek dapat memakai sumber harga berbeda.

Master harga Alexindo dan HPM/INKA/DACON berasal dari workbook **Master budget_DJ3 bengkel.xlsx**. Tujuannya mengisi harga bahan proyek berdasarkan master harga, bukan membuat sistem terpisah yang tidak terhubung ke kalkulator. Pemetaan nama material kalkulator ke komponen harga disimpan untuk tiap katalog harga. Migration 019 menambahkan pemetaan material `kaca` ke komponen `SPANDRELL / M2`.

## Cara menjalankan aplikasi

Di PowerShell, dari `D:\Project\Dj3`:

```powershell
npm install
npm run dev
```

Isi `.env.local` menggunakan format `.env.example` jika belum tersedia. Jangan menyalin nilai rahasia ke chat atau dokumentasi. Aplikasi lokal biasanya tersedia di `http://localhost:5173`.

## Struktur project yang sering diperlukan

- `src/app/features.ts` — registri menu dashboard.
- `src/domain/catalog/door-catalog.json` — katalog model/material dan rumus dasar yang dipakai frontend/seed.
- `src/domain/formulas/` — parser serta validasi rumus; rumus dibatasi pada operasi aritmetika, bukan JavaScript.
- `src/features/calculator/` — kalkulator dan pemilihan katalog/varian harga untuk tiap model.
- `src/features/projects/` — penyimpanan, edit, rekap, dan cetak proyek.
- `src/features/formula-master/` — pengelolaan model, material, rumus, riwayat rumus, dan variabel.
- `src/features/budgets/` — master harga, pemetaan material, dan perkiraan biaya master budget.
- `src/integrations/supabase/repository.ts` — akses data Supabase.
- `supabase/migrations/` — perubahan skema/data hosted secara berurutan.
- `supabase/seed.sql` — seed katalog model kalkulator, dihasilkan dari JSON.
- `supabase/seed_kusen_budget.sql` — seed master budget.
- `scripts/extract-door-catalog.py` — ekstraksi dasar dari `kalkulator_Pintu.xlsx`.
- `scripts/generate-door-seed-sql.py` — membuat ulang `supabase/seed.sql` dari JSON katalog.

## Rumus dan katalog: keputusan yang sudah disepakati

### Aturan rumus

- Variabel yang umum dipakai: `T1`, `L1`, `T2`, `L2`, `T3`, `L3`, `daunPintu`, `daunJendela`.
- Sistem sengaja fleksibel: nama variabel baru yang valid bisa dimasukkan langsung dalam rumus dan akan menjadi input proyek. Jangan memperketat variabel hanya ke daftar baku tanpa persetujuan pemilik.
- Referensi qty material menggunakan bentuk `qty_<kode>`, termasuk referensi antar material/model jika sumber Excel memang demikian.
- Satuan mengikuti sumber Excel. Perhatikan perbedaan `m'`, `m"`, `pcs`, `set`, `daun`, dan satuan lain.
- Model 12100, material kusen, telah dikoreksi mengikuti pola prototype yang dikonfirmasi.
- Referensi kosong `D321` pada rumus item 30501 diperlakukan sebagai nol karena Excel memperlakukan sel kosong pada operasi aritmetika sebagai nol.
- Model 31000 memakai istilah **polis**; rumus silicone adalah qty polis × 2 (migration 017).
- Untuk rumus model 32200, pemilik memilih rumus dari foto `222.jpeg` ketika ada perbedaan dengan referensi lain.

### Keputusan model/material terbaru

- Workbook `rumus_DJ3_336-356.xlsx` dan foto referensi digunakan untuk melengkapi model 33600–35600.
- Untuk rentang itu, nama `kaca/jendela` diubah menjadi `kaca`; rumus yang sudah dipetakan tetap sama.
- Material `kaca/acp/spndrel/pintu` yang tidak punya rumus dihapus dari model 30000 terkait. Baris model 31400 adalah pengecualian: pemilik meminta model ini tetap kosong, jadi semua 12 materialnya tetap ada tanpa rumus.
- Flashbolt yang tercantum pada workbook ditambahkan dengan kode terpisah melalui migration 018.
- Di model 34300, gunakan **PT 40 kode 34310** dengan rumus `daunPintu`; PT 30 kode 34308 dihapus. Jangan membuat PT 40 kedua.
- Floorhinge kode 31109 pada model 31100 dihapus.
- Seluruh kelompok 40000 ditunda atas permintaan pemilik. Jangan isi rumus atau hapus materialnya sampai diminta.

## Kondisi katalog terakhir

Katalog lokal yang sudah disesuaikan berisi 100 model dan 1.081 material. Sebanyak 22 model memang berstatus belum lengkap sesuai keputusan sekarang:

- Model 31400: 12 material, semua rumus kosong dengan sengaja.
- Kelompok 40000: 21 model dan 255 material, rumus belum dikerjakan dengan sengaja.

Pemeriksaan struktur terakhir mengonfirmasi seed berisi 1.081 material dan daftar penghapusan migration 020 cocok dengan katalog. Pemeriksaan ini bersifat statis; migration belum dieksekusi terhadap PostgreSQL hosted dan tes/build aplikasi belum dijalankan setelah perubahan katalog terakhir.

## Perubahan terakhir yang sudah dibuat

- Menghapus 27 material kaca gabungan tanpa rumus dari kelompok 30000, kecuali material model 31400.
- Menghapus Floorhinge 31109.
- Menghapus PT 30 kode 34308 dan mempertahankan PT 40 kode 34310 dengan rumus `daunPintu`.
- Memperbarui `src/domain/catalog/door-catalog.json`, membuat ulang `supabase/seed.sql`, dan memperbarui ringkasan katalog di `README.md`.
- Membuat `supabase/migrations/020_remove_incomplete_door_window_materials.sql`. Migration memeriksa dependensi rumus aktif dan riwayat sebelum menghapus data. Jika kode diacu rumus lain, migration berhenti agar dependensi tidak rusak. Data harga/snapshot proyek tersimpan dipertahankan.
- Migration 019 memetakan material `kaca` ke SPANDRELL untuk master harga.

## Supabase dan penerapan perubahan

Status database hosted setelah migration 019/020 **belum diverifikasi**. Jangan menganggap file migration lokal berarti data hosted sudah berubah. Sebelum memberi instruksi atau menerapkan perubahan:

1. Periksa project ref yang terhubung dan status migration lokal/remote tanpa membocorkan kredensial.
2. Pastikan migration yang tertunda, baca seluruh SQL-nya, dan cocokkan project ref sebelum push.
3. Untuk database hosted yang sudah dipakai, gunakan `supabase db push` tanpa `--include-seed`. `--include-seed` hanya untuk setup awal database hosted yang masih kosong; jangan seed ulang database aktif.
4. Jangan gunakan `supabase db reset` pada database hosted. Docker tidak dibutuhkan untuk `db push` ke hosted.
5. Setelah migration diterapkan, periksa UI kalkulator bahwa item yang dihapus tidak muncul, harga/model lain tetap ada, dan proyek lama masih menampilkan snapshot harga tersimpan.

Sebelumnya pernah muncul kegagalan SQL pada proses migration/seed. Jika push gagal, catat nama migration, statement, dan seluruh pesan error; telusuri penyebabnya sebelum mengubah SQL atau mencoba ulang. Jangan menyimpulkan database sudah update dari pesan aplikasi berhasil dibuka.

## Peringatan penting tentang impor Excel

`scripts/extract-door-catalog.py` membangun ulang seluruh `door-catalog.json` dari `kalkulator_Pintu.xlsx`. Workbook itu adalah sumber dasar dan tidak memuat semua koreksi/rumus tambahan dari workbook rumus 336–356 dan keputusan terbaru. Menjalankan script itu langsung dapat mengembalikan material yang sudah dihapus serta menimpa formula tambahan. Jangan jalankan ulang tanpa strategi merge/overlay yang mempertahankan semua keputusan di file ini. Setelah JSON benar, `scripts/generate-door-seed-sql.py` dapat dijalankan untuk menyamakan seed.

## Langkah lanjut yang disarankan

1. Tanyakan apakah pemilik ingin menerapkan migration 019/020 ke Supabase hosted atau sudah menjalankannya sendiri; jangan push otomatis.
2. Setelah status remote jelas, bantu periksa hasilnya di kalkulator, master rumus, master harga, dan proyek/cetak.
3. Jangan mengerjakan kelompok 40000 atau model 31400 sampai pemilik memberi sumber/keputusan rumus baru.
4. Untuk fitur/menu berikutnya, pahami dulu sumber Excel dan alur pengguna, rangkum asumsi, lalu tanyakan hanya hal yang benar-benar belum jelas.

