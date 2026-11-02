# Spesifikasi Desain: Kalkulator Pintu Web

Tanggal: 2026-10-02
Status: Disetujui untuk perencanaan implementasi

## Tujuan

Mengganti alur hitung manual pada kalkulator_Pintu.xlsx dengan aplikasi web berbahasa Indonesia. Versi pertama mencakup semua kelompok model yang memiliki data di sheet master workbook tersebut, dengan rumus qty yang dapat dikelola melalui menu, rekap harga, dan penyimpanan data proyek.

## Keputusan desain

- Frontend: React + TypeScript + Vite, di-host di Vercel.
- Dashboard dan navigasi berbasis registrasi fitur modular: halaman baru dapat ditambahkan sebagai modul/rute dan item menu tanpa merombak shell dashboard. Versi pertama mendaftarkan Kalkulator Pintu, Proyek, dan Master Rumus. Menambahkan fungsi halaman baru tetap membutuhkan implementasi modulnya; item menu kosong tidak dibuat melalui database.
- Database dan autentikasi: Supabase Postgres + Supabase Auth.
- Data katalog dan rumus tidak ditanam permanen di UI; data disimpan di Supabase sehingga dapat diperbarui melalui menu.
- Penghitungan berjalan di browser menggunakan evaluator ekspresi aritmetika terbatas. Jangan menggunakan eval atau menjalankan JavaScript yang dimasukkan pengguna.
- Semua tabel aplikasi mengaktifkan Row Level Security. Data proyek dibatasi berdasarkan pemilik/workspace; konfigurasi katalog rumus dikelola oleh pemilik/admin. Kunci Supabase publishable boleh dipakai pada frontend dengan RLS aktif; kunci rahasia hanya di server/lingkungan tepercaya.
- Tidak membutuhkan fungsi backend Vercel untuk jalur hitung utama; Vercel melayani aset frontend dan Supabase menyediakan Auth serta API data.

## Alur pengguna

1. Pengguna masuk melalui Supabase Auth.
2. Pengguna membuat atau membuka proyek perhitungan.
3. Pengguna menambahkan satu atau lebih baris/model pintu, memilih kode model, mengisi ukuran dan jumlah daun sesuai kebutuhan model, serta mengisi kuantitas unit model pada proyek.
4. Aplikasi mengevaluasi rumus item model dan menampilkan qty serta satuan tiap material.
5. Pengguna mengisi harga satuan. Aplikasi menghitung subtotal per item dan grand total.
6. Proyek, input, harga, rumus, dan konfigurasi katalog disimpan di Supabase dan dapat dibuka kembali.
7. Menu Master memungkinkan admin mengelola model, item, satuan, rumus, serta urutan dan label variabel input.
8. Dashboard menampilkan menu dari registrasi fitur modular sehingga fitur lanjutan dapat ditambahkan tanpa menulis ulang navigasi utama.

## Model dan masukan

- Kode grup dari workbook/katalog: 10000 (pintu), 20000 (jendela), 30000 (pintu-jendela), 40000 (pintu sliding). Dari master `kalkulator_Pintu.xlsx` sudah diekstrak seluruh model 10000, 30000, dan 40000. Model 20000 belum ada pada sheet tersebut; sumber workbook jendela perlu diimpor terpisah setelah ditinjau. Jangan membuat kalkulasi untuk model yang tidak memiliki formula qty.
- Kode model meningkat per 100, misalnya 10100, 10200, dan 10300. Kode item menggunakan kode model dan urutan material, misalnya 10101 dan 10102.
- Variabel ukuran mengikuti kolom workbook: T1, L1, T2, L2, T3, L3, daun pintu, dan daun jendela. UI menampilkan hanya input yang relevan bagi model, tetapi definisi relevansi harus berasal dari konfigurasi model, bukan ditebak dari nilai kosong atau tanda -.
- Unit panjang dan luas dalam rumus sumber tampak dikonversi dari mm ke m dengan pembagi 1.000 dan dari mm² ke m² dengan pembagi 1.000.000. Label unit material tetap mengikuti master.

## Rumus dan evaluasi

- Setiap item pada setiap model mempunyai ekspresi qty yang dapat diedit; rumus yang berbeda per model dipertahankan.
- Menu rumus menampilkan nama/kode model, item, satuan, ekspresi saat ini, variabel yang tersedia, dan hasil pratinjau untuk input contoh.
- Sintaks awal yang didukung: angka desimal, referensi variabel yang diberi nama, operator +, -, *, /, tanda kurung, dan referensi qty item menggunakan kode stabil. Formula impor workbook diterjemahkan ke sintaks simbolik; semua referensi `L<baris>` yang ada dipertahankan sebagai referensi kode materialnya, termasuk referensi lintas model yang memang muncul pada Excel (model 10500, 10600, dan 10800 merujuk kode 10101); referensi spreadsheet tidak ditampilkan sebagai koordinat sel mentah.
- Validasi menolak sintaks tidak sah, variabel yang tidak dikenal, referensi item yang hilang, pembagian dengan nol, dan ketergantungan melingkar lintas katalog. Referensi item dievaluasi memakai masukan proyek yang sama. Satuan qty ditampilkan dari master; sistem tidak menebak atau mengonversi satuan item.
- Perubahan rumus disimpan dengan identitas pembuat dan waktu perubahan. Perubahan katalog tidak mengubah hasil proyek lama secara diam-diam: setiap proyek menyimpan snapshot versi rumus/katalog yang dipakai atau referensi versi yang tetap dapat dilacak.

## Proyek, rekap, dan harga

- Proyek berisi metadata dasar proyek dan daftar baris model.
- Rekap menggabungkan kebutuhan material dari baris model proyek berdasarkan item dan satuan yang sama.
- Harga satuan dapat diisi/diubah pada rekap; subtotal = qty rekap × harga satuan; grand total = jumlah subtotal.
- Kuantitas model mengalikan kebutuhan per satuan model sebelum diagregasikan.
- Versi pertama tidak memasukkan pajak, diskon, pembulatan pembelian/panjang stok, optimasi potong, atau ekspor penawaran PDF kecuali sudah tercakup pada perilaku nyata workbook yang ditemukan sebelum implementasi.

## Impor dan kualitas data workbook

- Import sumber utama: kalkulator_Pintu.xlsx, khususnya sheet master, kalkulator_Pintu, rekap, dan prototype.
- Data item, satuan, kode model, formula, dan contoh nilai yang tersedia dipindahkan secara eksplisit dan ditelusuri kembali ke sel sumber saat penyusunan seed.
- Baris placeholder seperti item - tidak menjadi item material aktif.
- Model/item yang memiliki nama dan satuan namun belum mempunyai formula qty ditandai Belum lengkap, tidak menghasilkan angka qty seolah-olah nol, dan tidak diam-diam diberi formula dari model lain.
- Typo yang sudah dikonfirmasi: pada model 12100, formula qty kusen harus merujuk ukuran model melalui pola T1, L1, T2, L2 seperti model lain, bukan ukuran baris item. Rumus ini diperbaiki dalam seed sistem dan riwayat sumbernya dicatat.
- Formula aneh atau cached value yang tidak cocok dengan referensi Excel lain tidak diperbaiki tanpa pemeriksaan; tandai dan cocokkan contoh representatif dengan workbook serta pengguna.

## Data Supabase (entitas konseptual)

- profiles / workspaces: identitas pemilik dan batas kepemilikan data.
- door_model_groups, door_models: kelompok serta kode/nama model, status kelengkapan, definisi variabel yang dibutuhkan.
- materials: katalog item dan satuan.
- model_materials: hubungan model-item, kode item, urutan tampilan, dan ekspresi qty.
- formula_versions: perubahan formula yang dapat diaudit dan dipakai untuk snapshot proyek.
- projects, project_model_lines: metadata proyek, model yang dipilih, dimensi, jumlah daun, dan jumlah unit model.
- project_material_prices: harga satuan per proyek/item.

Nama tabel final dan aturan migrasi ditentukan saat implementasi, tetapi setiap data bisnis harus mempunyai kunci stabil dan kebijakan RLS yang teruji.

## Keamanan dan akses

- Login wajib untuk menyimpan atau mengubah data.
- Pengguna hanya dapat membaca/mengubah proyek yang dimilikinya atau workspace tempat ia menjadi anggota.
- Seed katalog awal dijalankan melalui migrasi/skrip tepercaya, bukan akses publik.
- Perubahan model/formula diberi izin hanya kepada pemilik/admin.
- Semua tabel yang dicapai melalui Supabase Data API menerapkan grants minimal dan RLS; secret/service-role key tidak boleh masuk build frontend.

## Deploy

- Aplikasi siap build untuk Vercel dan memakai environment variables untuk URL Supabase dan publishable key.
- Database schema, RLS policies, dan seed data disimpan sebagai migrasi/seed yang dapat diulang.
- Tidak ada klaim sudah online sampai proyek Supabase dan Vercel benar-benar terhubung dan deployment terverifikasi.
- Paket gratis dapat dipakai untuk prototipe; Supabase Free dapat menjeda proyek dengan aktivitas rendah selama 7 hari, jadi penggunaan yang perlu selalu aktif memerlukan rencana berbayar atau pemulihan proyek saat jeda.

## Kriteria penerimaan

1. Pengguna dapat masuk, membuat proyek, menyimpan dan membuka kembali proyeknya.
2. Model pintu dengan formula lengkap dari workbook dapat dipilih dan dihitung untuk ukuran/jumlah daun yang diisi.
3. Qty material cocok dengan perhitungan workbook pada contoh model/input yang dibandingkan, setelah menerapkan koreksi typo model 12100 yang telah dikonfirmasi.
4. Harga satuan, subtotal, dan grand total bereaksi benar terhadap perubahan qty atau harga.
5. Formula dapat diedit per item/model melalui menu, divalidasi, dipratinjau, dan disimpan tanpa menjalankan kode bebas.
6. Formula invalid, dependensi melingkar, dan model yang belum lengkap ditampilkan sebagai masalah yang jelas, bukan hasil qty 0 yang tampak sah.
7. RLS mencegah pengguna membaca/mengubah proyek pengguna lain; hanya admin/pemilik berhak mengubah katalog rumus.
8. Build produksi berhasil untuk deployment Vercel setelah konfigurasi environment tersedia.
9. Navigasi/dashboard bisa menerima modul fitur baru melalui satu titik registrasi tanpa mengubah struktur dasar aplikasi.

## Di luar lingkup versi pertama

- Kalkulator jendela murni atau pengisian otomatis rumus model yang tidak tercakup formula pintu.
- Mengoreksi semua formula Excel yang tampak janggal tanpa validasi pengguna.
- Multi-tenant organisasi dengan undangan/role kompleks, pembayaran, sinkronisasi offline, atau integrasi aplikasi lain.
- Deployment ke akun Supabase/Vercel pengguna sebelum kredensial/proyek tersedia.

## Asumsi yang perlu diperiksa saat tinjauan

- Rekap web mendukung banyak baris model dalam satu proyek dan menggabungkan material; ini perlu dikonfirmasi karena workbook saat ini menampilkan satu input model aktif.
- Login menggunakan satu pemilik awal, dengan landasan RLS/workspace untuk menambah anggota nanti.
- Katalog formula dapat diedit pemilik/admin; proyek menyimpan versi formula yang dipakai agar angka lama dapat dijelaskan.

