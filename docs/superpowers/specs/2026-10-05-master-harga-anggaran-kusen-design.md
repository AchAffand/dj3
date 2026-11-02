# Spesifikasi Desain: Master Harga dan Anggaran Kusen

Tanggal: 2026-10-05  
Status: Menunggu tinjauan pengguna

## Tujuan

Memindahkan seluruh alur anggaran kusen pada workbook `Master budget_DJ3 bengkel.xlsx` ke aplikasi web. Versi awal mencakup dua lembar: `ALEXINDO` (lembar tersembunyi yang kini sudah ditemukan) dan `Hpm-inka-dacon dll`. Setiap lembar menjadi katalog anggaran yang memiliki harga, variasi finishing, rumus, rincian pekerjaan, subtotal, dan grand total sendiri.

## Keputusan desain

- Aplikasi tetap memakai React, TypeScript, Vite, Supabase Auth/Postgres, dan pola navigasi fitur yang sudah ada.
- Navigasi menambahkan induk **Master Harga** di sidebar dashboard yang sudah ada, tepat di bawah **Master Rumus**. Submenu awalnya **ALEXINDO** dan **HPM/INKA/DACON**. Ini bukan dashboard atau beranda baru. Katalog berikutnya dengan struktur hitung yang sama dapat ditambahkan tanpa merombak shell dashboard.
- Setiap submenu adalah satu lembar kerja anggaran lengkap, bukan hanya daftar harga. Tampilan web menjaga semua kategori dan hasil Excel, tetapi mengelompokkan komponen ke bagian yang mudah dibaca di desktop dan ponsel alih-alih menampilkan tabel selebar puluhan kolom.
- Harga aktif, pilihan finishing, dan rumus disimpan sebagai konfigurasi data dengan versi/audit. Evaluasi rumus menggunakan parser aritmetika terbatas; tidak menggunakan `eval` atau menjalankan kode bebas.
- Anggaran menyimpan snapshot daftar komponen, harga, rumus, dan hasil saat disimpan. Perubahan master berikutnya tidak mengubah anggaran lama.
- Harga master hanya bisa diubah katalog admin. Pengguna yang masuk dapat membuat dan mengelola anggaran miliknya sendiri sesuai pola kepemilikan proyek saat ini.

## Struktur menu dan halaman

1. **Master Harga** menjadi item sidebar baru tepat di bawah **Master Rumus**, dengan daftar submenu katalog yang aktif.
2. **ALEXINDO** memuat kategori dan harga dari sheet tersebut dengan variasi Silver, Brown, Putih/Cream, dan Coating.
3. **HPM/INKA/DACON** memuat kategori dan harga dari sheet tersebut dengan variasi Brown, Putih/Cream, dan Coating.
4. Di tiap katalog, admin dapat mengubah nama komponen, satuan, urutan/kategori, harga dasar, rumus turunan variasi, dan status aktif. Riwayat perubahan mencatat pembuat, waktu, serta versi.
5. Pengguna dapat membuat anggaran dari submenu katalog, membuka/mengedit anggaran yang tersimpan, dan mencetak atau menyimpan PDF.
6. Menambahkan katalog lain dengan pola harga/anggaran yang sama berarti menambah definisi katalog dan datanya. Perhitungan dengan alur yang benar-benar berbeda tetap membutuhkan modul kalkulasi baru.

## Struktur sumber Excel yang dipertahankan

- Kedua lembar memiliki kelompok harga dasar dan variasi finishing. Nama, urutan, satuan, serta relasi rumus tiap kelompok diimpor berdasarkan lembar sumbernya, tidak disamaratakan.
- ALEXINDO memiliki daftar komponen dari kolom F sampai BT. HPM/INKA/DACON memiliki daftar komponen dari kolom F sampai BU, termasuk `Roda Bawah (Henderson)` pada kolom BU.
- Setiap lembar menyediakan 21 kelompok baris pekerjaan (nomor 1 sampai 21). Satu kelompok memuat deskripsi pekerjaan, jumlah unit, kuantitas input per komponen, nilai komponen, dan subtotal. Bentuk awal web menyediakan 21 baris seperti template; ruang lingkup awal tidak menambahkan baris tanpa batas.
- Metadata proyek pada anggaran web memuat nama proyek, lokasi, lantai, tanggal, dan pembuat, mengikuti data proyek yang sudah dipakai aplikasi.
- Sheet non-kusen (canopy, pagar, mezzanine, atap, plafon/partisi, kontraktor, dan lainnya) tidak masuk cakupan ini.

## Aturan kalkulasi

- Untuk setiap baris pekerjaan dan komponen, nilai komponen adalah kuantitas dikalikan harga/variasi yang dirujuk oleh rumus aktif pada lembar sumber. Pemetaan variasi dapat berbeda antarbaris dan antarkomponen, sehingga harus diimpor persis dan tidak boleh diasumsikan sebagai satu pilihan finishing untuk seluruh baris.
- Subtotal baris adalah jumlah semua nilai komponen dikalikan jumlah unit pekerjaan.
- Grand total adalah jumlah subtotal seluruh baris pekerjaan.
- Seluruh komponen sampai kolom terakhir sumber harus dijumlahkan pada setiap baris: ALEXINDO sampai BT dan HPM sampai BU. Screenshot mengonfirmasi rumus HPM D24 memakai rentang `SUM(F23:BU23)*C22`; rumus baris lain yang masih berhenti lebih awal diperluas agar komponen terakhir tetap masuk.
- Formula/harga antar-variasi diimpor per komponen sesuai relasi Excel. Formula yang berbeda antara ALEXINDO dan HPM tidak boleh disalin silang atau diganti asumsi umum.
- Rumus invalid, referensi komponen hilang, atau pembagian dengan nol harus menunjukkan kesalahan yang bisa ditindaklanjuti; jangan diam-diam menghasilkan nol.
- Rumus harga dapat memakai nilai numerik, tanda kurung, operator `+`, `-`, `*`, `/`, dan referensi harga bernama yang terdaftar. Persentase di Excel dinormalisasi menjadi faktor numerik yang ekuivalen (contoh `130%` menjadi `1.3`). Pratinjau hasil ditampilkan sebelum perubahan disimpan.

## Alur pengguna

1. Pengguna membuka **Master Harga** lalu memilih ALEXINDO atau HPM/INKA/DACON.
2. Admin mengelola harga dasar dan variasi finishing di katalog terkait. Perubahan menghasilkan versi harga baru.
3. Pengguna membuat anggaran baru, mengisi metadata proyek, lalu mengisi hingga 21 baris pekerjaan yang tersedia.
4. Di setiap baris, pengguna mengisi deskripsi, jumlah unit, dan kuantitas hanya untuk komponen yang dipakai. Kategori komponen dapat dibuka/tutup; hasil tiap komponen memakai aturan harga perbaris/perkomponen dari template, lalu subtotal baris serta grand total dihitung langsung.
5. Pengguna menyimpan anggaran; proyek dapat dibuka dan diedit lagi, dan snapshot harga/rumus awal tetap tersimpan bersama proyek.
6. Tampilan cetak/PDF menyajikan metadata proyek, katalog dan variasinya, rincian item/komponen terpakai, kuantitas, harga, subtotal, serta grand total dengan format rapi dan lebar halaman yang sesuai.

## Data Supabase konseptual

- `budget_catalogs`: identitas submenu (`alexindo`, `hpm-inka-dacon`), label, urutan, status aktif, dan definisi template.
- `budget_components`: katalog item/komponen per submenu, termasuk kode sumber, label, satuan, kategori, dan urutan.
- `budget_variants`: variasi harga/finishing per katalog.
- `budget_prices`: nilai dasar atau ekspresi turunan per komponen-variasi, versi, pembuat, dan waktu.
- `budget_calculation_rules`: referensi harga/variasi dan rumus per katalog, posisi baris pekerjaan, serta komponen; konfigurasi awal menyalin pemetaan sumber Excel secara persis.
- `budget_estimates`: pemilik, katalog, metadata proyek, snapshot harga/rumus, grand total, waktu dibuat/diubah.
- `budget_estimate_lines`: urutan pekerjaan, deskripsi, jumlah unit, kuantitas komponen, hasil kalkulasi, dan subtotal; snapshot baris merujuk versi yang digunakan.
- Tabel yang tersedia lewat Supabase Data API memakai grants minimal dan RLS. Admin katalog mengelola konfigurasi; pemilik anggaran hanya membaca/mengubah anggarannya sendiri.

Skema/tabel final mengikuti pola migrasi dan repository yang sudah ada. Data sumber diimpor melalui seed/migrasi lokal yang dapat diulang, tidak lewat akses publik.

## Kriteria penerimaan

1. Menu **Master Harga** menampilkan submenu ALEXINDO dan HPM/INKA/DACON sebagai katalog yang terpisah.
2. Data komponen, satuan, harga dasar, dan variasi finishing cocok dengan dua lembar Excel yang terkait.
3. Admin dapat mengubah harga dan rumus turunan dengan validasi serta melihat pratinjau hasilnya.
4. Kuantitas × harga menghasilkan nilai per komponen; semua nilai termasuk kolom BU masuk subtotal; jumlah unit mengalikan subtotal; grand total menjumlahkan subtotal baris.
5. Pengguna dapat menyimpan, membuka kembali, dan mengedit anggaran; perubahan harga master tidak mengubah anggaran lama.
6. Cetak/PDF menunjukkan metadata proyek, rincian biaya, harga, subtotal, dan grand total, serta tetap terbaca pada halaman cetak.
7. Tampilan berfungsi di ponsel tanpa membuat form biaya puluhan kolom melebar ke samping.
8. RLS membatasi perubahan katalog ke admin dan data anggaran ke pemiliknya.
9. Katalog baru dengan bentuk konfigurasi sejenis dapat ditambahkan tanpa merombak navigasi utama.

## Pertanyaan sumber yang harus diverifikasi saat implementasi

- Workbook memiliki rumus detail yang memilih baris harga variasi berbeda antarkolom dan antarbari pekerjaan. Pemetaan tersebut perlu diekstrak persis dan ditampilkan/diatur di menu rumus.
- Koreksi BU yang ditunjukkan pada screenshot Excel terbaru mengubah D24 menjadi `SUM(F23:BU23)*C22`. Salinan workbook di folder proyek masih menampilkan rentang lama saat diperiksa; sebelum seed final dibuat, gunakan workbook yang sudah diperbarui dan cocokkan seluruh rumus subtotal HPM.
- Sumber template saat ini menampilkan kuantitas awal nol, sehingga contoh non-nol perlu disusun dari input yang dinyatakan jelas untuk verifikasi hasil, bukan menebak angka pekerjaan nyata.

## Di luar cakupan

- Sheet workbook selain `ALEXINDO` dan `Hpm-inka-dacon dll`.
- Mengubah kalkulator pintu/kusen yang sudah berjalan atau harga proyek lama.
- Perhitungan stok/potong, pembulatan pembelian, pajak, diskon, penawaran pelanggan, atau persetujuan biaya yang tidak ada pada dua sheet sumber.
- Membuat harga atau isi pekerjaan contoh seolah-olah data asli perusahaan.
