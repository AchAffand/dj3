# Rekonsiliasi Migration History Supabase — DJ3

Tanggal: 2026-11-13  
Project: gpyqgnvfujxyuydlbvid  
Repository: AchAffand/dj3  
Branch: feat/master-harga-per-type-architecture  
Status: audit selesai sebagian; belum mengubah migration registry atau menjalankan migrasi.

## Ringkasan temuan

Remote migration history saat audit berakhir mencatat migrasi hingga:
- 20261107082941 — restore_hpm_inka_dacon_accessories
- 20261107084952 — connect_model_accessory_prices
- 20261108202604 — reuse_archived_budget_catalog_positions

Dua file migrasi di GitHub tidak ada dalam daftar remote:
- 20261112120000_master_harga_tiga_kelompok.sql
- 20261112153000_fix_tatapan_samping_material_name.sql

### Migrasi 20261112120000 — efek sebagian besar sudah tampak diterapkan

Isi migrasi mencakup:
1. Menambahkan generated column `snapshot_component_key` pada `project_line_price_snapshots`.
2. Mengganti primary key tabel snapshot menjadi (project_id, material_code, catalog_id, variant_id, snapshot_component_key).
3. Mengganti fungsi `save_project_with_budget_prices` agar memakai kunci snapshot baru.
4. Membuat katalog `kaca-umum` dan `aksesoris-umum`.
5. Menyalin data item/harga kaca dan aksesoris dari katalog lama, serta membuat mapping.

Pemeriksaan remote menunjukkan:
- Katalog `kaca-umum` tersedia.
- Katalog `aksesoris-umum` tersedia.
- Fungsi `save_project_with_budget_prices` ada, memakai `snapshot_component_key`, dan meneruskan penyimpanan proyek ke `save_project_with_metadata`.
- Katalog bersama memiliki data aktif: Kaca 14 item, Aksesoris 26 item.
- Riwayat migrasi remote tidak mencatat versi 20261112120000.

Penting: hasil ini membuktikan beberapa efek utama telah ada, tetapi belum membuktikan bahwa seluruh isi migrasi identik dengan hasil SQL file. Sebelum repair, perlu diff lebih lanjut atas:
- generated column dan definisi PK persis;
- body fungsi persis dibanding file;
- varian, harga, item, mapping, serta provenance sumber;
- trigger, index, grants, RLS, dan constraints yang terkait;
- apakah ada perubahan manual sesudah migrasi yang harus dipertahankan.

**Tindakan:** jangan apply ulang file ini. Jangan tandai applied di migration registry sebelum seluruh efeknya dibandingkan dan dipastikan setara. Jika setara, gunakan prosedur resmi Supabase CLI `migration repair --status applied 20261112120000` dari lingkungan repo yang punya Supabase CLI dan project link yang benar. Jangan manipulasi `supabase_migrations.schema_migrations` langsung dengan SQL.

### Migrasi 20261112153000 — koreksi nama belum diterapkan

File ini hanya mengubah nama pada `public.materials` untuk varian ejaan:
- Tatpen samping
- Tatapn samping
- Tatapan samping

Audit remote menemukan:
- `Tatpen samping`: 3 baris
- `Tatapn samping`: 7 baris
- `Tatapan samping`: 6 baris

Karena migration pertama belum direkonsiliasi, jangan lanjutkan migration kedua dahulu. Setelah history diperbaiki, jalankan koreksi nama sebagai migrasi terpisah yang sudah diverifikasi, dengan pemeriksaan jumlah row sebelum/sesudah dan tanpa menyentuh formula atau model_materials.

## Risiko khusus pada koreksi nama

Sebelum update, periksa:
- unique constraints/index pada `materials.name` atau kombinasi kode/nama;
- foreign key dan referensi `materials.code`;
- apakah nama tersebut muncul di snapshot proyek, formula snapshot, atau aplikasi yang bergantung pada string;
- apakah ada variasi kapitalisasi/spasi lain.

Update hanya kolom `materials.name`; jangan mengubah `code`, `source_code`, `model_materials`, `formula_versions`, atau expression rumus.

## Langkah aman selanjutnya

1. Bandingkan seluruh state remote yang relevan dengan efek SQL migrasi 20261112120000.
2. Jalankan pemeriksaan data invariants untuk jumlah item, harga, varian, mapping, serta snapshot.
3. Siapkan dan lakukan migration repair dari Supabase CLI hanya setelah setara terbukti.
4. Jalankan migrasi koreksi ejaan secara terpisah dan terverifikasi.
5. Periksa `list_migrations` kembali; pastikan kedua versi tercatat dan migrasi berurutan.
6. Jalankan regression checks untuk save/reopen proyek, snapshot harga, serta data Master Harga.
7. Baru mulai membuat migrasi additive untuk struktur Master Harga per TYPE.

## Larangan sampai audit lengkap

- Jangan menjalankan ulang migrasi 20261112120000.
- Jangan mengedit migration registry langsung dengan SQL.
- Jangan menghapus katalog lama atau data snapshot.
- Jangan mengubah formula atau hasil QTY.
- Jangan mengubah rumus M'.
- Jangan menerapkan migrasi struktur Master Harga baru di atas migration history yang masih drift.

## Status kerja

- Dokumen arsitektur Master Harga per TYPE tersimpan di branch.
- Dokumen rekonsiliasi migration history ini tersimpan di branch.
- Belum ada DDL baru yang diterapkan.
- Belum ada data material yang dikoreksi pada langkah ini.
- Belum ada perubahan source code aplikasi.
- Belum ada PR, merge, atau production deploy.


## Hasil audit lanjutan — 2026-11-13

### Struktur snapshot: cocok persis

Remote:
- `snapshot_component_key`: UUID, GENERATED ALWAYS, NOT NULL.
- Expression: `COALESCE(component_id, '00000000-0000-0000-0000-000000000000'::uuid)`.
- Primary key: `(project_id, material_code, catalog_id, variant_id, snapshot_component_key)`.
- Index PK juga memakai lima kolom tersebut.
- Body fungsi `save_project_with_budget_prices` cocok dengan definisi fungsi di file migrasi yang diperiksa, termasuk conflict target dengan `snapshot_component_key`.

### Katalog Aksesoris: sumber lengkap, empat item manual tanpa harga

Pemeriksaan per component_key:
- Seluruh item aktif sumber HPM/INKA/DACON (22 item) tersedia di katalog Aksesoris umum.
- Tidak ada perbedaan harga untuk 22 item sumber pada varian brown → standar.
- Ada empat item tambahan hasil seed manual: Doorcloser, Kunci Folding, Engsel, Engsel Pintu. Keempatnya memang belum memiliki harga; ini sesuai SQL migrasi yang menyiapkan item untuk diisi kemudian.
- Katalog memiliki 22 mapping aktif dan tidak ada mapping aktif dengan component_id NULL.
- Jangan mengisi harga empat item ini otomatis; harga belum ditentukan.

### Katalog Kaca: seed migrasi dan item tambahan

- Tiga belas item kaca hasil seed migrasi memiliki harga dan source marker yang sesuai.
- Ada satu item tambahan `xxxx`, component_key `manual_f8ffcc4024ce4ddc`, dengan source marker MANUAL dan harga NULL. Ini bukan bagian dari seed migrasi; pertahankan karena bisa merupakan item manual yang ditambahkan setelah migrasi.
- Tidak ada mapping aktif pada katalog Kaca; ini sesuai SQL migrasi tersebut yang tidak menambahkan mapping kaca.
- Jangan menghapus atau mengubah item `xxxx` dalam rekonsiliasi migration history.

### Koreksi Tatapan Samping: aman untuk kolom nama, tetapi mengubah nama 10 baris

Audit remote:
- 16 material code berbeda memiliki salah satu dari tiga ejaan tersebut.
- 10 baris akan berubah menjadi nama canonical: 3 `Tatpen samping` + 7 `Tatapn samping`.
- 6 baris sudah bernama `Tatapan samping` dan hanya akan menjadi no-op.
- Seluruh 16 kode memiliki referensi di `model_materials`; total referensi formula: 16.
- Tidak ada trigger pada tabel `materials`.
- Primary key tabel adalah `code`; tidak ada unique constraint pada `name`.
- Dua snapshot harga lama dan beberapa result_snapshot proyek menyimpan teks ejaan lama. Migrasi hanya memperbarui `materials.name`, sehingga snapshot historis tetap utuh dan tidak diubah.
- Tidak ada formula snapshot yang memuat ejaan tersebut.
- Unit semua baris adalah `m'`. Karena itu migrasi koreksi nama tidak boleh mengubah unit, formula, expression, atau QTY.

Kesimpulan: update nama material tidak mengubah key maupun referensi formula. Snapshot lama sengaja dipertahankan sebagai snapshot historis. Perubahan ini dapat dijalankan setelah history migrasi pertama direkonsiliasi.

### CLI repair — sintaks terbaru

Dokumentasi resmi Supabase CLI v3 menyatakan repair remote dilakukan dengan:
```bash
supabase migration repair 20261112120000 --status applied --remote
```
Perintah ini hanya memperbaiki migration history; ia tidak menjalankan SQL. Jalankan dari root repository yang sudah di-link ke project `gpyqgnvfujxyuydlbvid`. Jangan menambahkan `--yes` agar CLI tetap meminta konfirmasi interaktif.

Sesudah itu:
```bash
supabase migration list --remote
```
Pastikan versi `20261112120000` muncul sebagai applied sebelum menjalankan migrasi berikutnya.

**Jangan tandai 20261112153000 sebagai applied dengan repair**, karena SQL koreksi namanya belum dijalankan. Setelah versi pertama tercatat, jalankan migrasi kedua melalui workflow migrasi normal (misalnya `supabase migration up --remote` setelah memastikan daftar migrasi lokal/remote hanya menunjukkan file yang memang dimaksud). Lalu verifikasi 10 nama berubah dan 6 canonical tetap sama.

### Status keputusan

Efek utama migrasi pertama sekarang telah diverifikasi pada struktur dan data seed:
- struktur generated column / PK / function cocok;
- 22 item dan harga sumber aksesoris cocok;
- empat item tanpa harga sesuai seed manual;
- tiga belas item kaca hasil seed memiliki harga; satu item manual tambahan dipertahankan;
- tidak ada alasan untuk menjalankan ulang migrasi pertama.

Satu hal yang tetap perlu dilakukan dari lingkungan lokal adalah memperbaiki catatan migration history dengan Supabase CLI. Tidak ada akses CLI lokal di sesi ini, jadi jangan mengklaim repair sudah dilakukan.
