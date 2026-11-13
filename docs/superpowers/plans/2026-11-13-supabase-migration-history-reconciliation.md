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
