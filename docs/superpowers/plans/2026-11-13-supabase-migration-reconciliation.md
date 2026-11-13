# Rekonsiliasi Riwayat Migrasi Supabase DJ3

Tanggal audit: 2026-11-13  
Project ref: `gpyqgnvfujxyuydlbvid`  
Status: prosedur disiapkan; belum ada perubahan pada migration registry atau data live.

## Temuan yang sudah diverifikasi

Remote migration history berisi versi sampai:
- `20261108202604_reuse_archived_budget_catalog_positions`

Dua file di GitHub belum tercatat di remote history:
- `20261112120000_master_harga_tiga_kelompok.sql`
- `20261112153000_fix_tatapan_samping_material_name.sql`

### File 20261112120000

File ini tidak aman untuk dijalankan ulang secara utuh karena sebagian efeknya sudah ada di remote. Pemeriksaan read-only mengonfirmasi:
- Katalog `kaca-umum` dan `aksesoris-umum` ada dan aktif.
- Katalog bersama berisi 14 item kaca dan 26 item aksesoris aktif.
- Kolom `snapshot_component_key` ada pada `project_line_price_snapshots`.
- Fungsi `save_project_with_budget_prices` memiliki signature yang sesuai, menggunakan `snapshot_component_key` pada conflict key, dan mendelegasikan penyimpanan proyek ke `save_project_with_metadata`.
- Fungsi tersebut bukan SECURITY DEFINER.

Pemeriksaan berikutnya sebelum repair:
1. Pastikan definisi kolom `snapshot_component_key` adalah generated stored expression `coalesce(component_id, '00000000-0000-0000-0000-000000000000'::uuid)`.
2. Pastikan primary key snapshot persis terdiri dari `project_id, material_code, catalog_id, variant_id, snapshot_component_key`.
3. Cocokkan daftar komponen, varian, harga, dan mapping dengan keseluruhan isi migration file, bukan hanya jumlah agregat.
4. Pastikan tidak ada efek migration lain yang belum tercermin.

Jika seluruh pemeriksaan di atas cocok, migration ini memang sudah diterapkan secara manual/di luar tracking dan hanya perlu ditandai applied pada registry. Jangan jalankan ulang SQL-nya.

### File 20261112153000

Migration ini belum diterapkan. Read-only audit menemukan:
- `Tatapan samping`: 6 baris
- `Tatapn samping`: 7 baris
- `Tatpen samping`: 3 baris

File tersebut hanya menormalisasi nama material ke `Tatapan samping`; tidak mengubah material code, model-material relation, expression, atau QTY. Namun file ini baru boleh dijalankan setelah migration history sebelumnya sinkron dan seluruh referensi data diperiksa.

## Prosedur CLI yang disarankan

Jalankan dari checkout repository yang memiliki kedua file migration tersebut. Pastikan branch dan working tree benar sebelum menjalankan perintah.

```bash
supabase link --project-ref gpyqgnvfujxyuydlbvid
supabase migration list --remote
```

Setelah empat pemeriksaan tambahan pada migration pertama dinyatakan cocok, perbaiki tracking untuk versi yang memang sudah diterapkan:

```bash
supabase migration repair 20261112120000 --status applied --remote
supabase migration list --remote
```

Perintah repair hanya memperbarui riwayat migration; tidak menjalankan SQL. Jangan tandai versi `20261112153000` sebagai applied sebelum SQL-nya benar-benar dijalankan.

Setelah status pertama sinkron, lakukan validasi lokal migration:

```bash
supabase db reset
supabase migration list --remote
supabase db push --dry-run --remote
```

Catatan:
- `db reset` hanya boleh dijalankan pada database lokal disposable, bukan project live.
- Pastikan seluruh migration lokal yang diperlukan tersedia dan urutannya konsisten. Jika local history lama belum lengkap, jangan memaksa reset; gunakan database lokal baru/branch database untuk validasi.
- Dry-run harus menunjukkan hanya migration yang memang belum diterapkan.
- Setelah review SQL dan hasil dry-run, barulah jalankan `supabase db push --remote` untuk menerapkan migration yang tertunda.
- Setelah push, jalankan `supabase migration list --remote` dan query verifikasi data typo.

## Batasan keselamatan

- Jangan mengubah `supabase_migrations.schema_migrations` dengan SQL manual.
- Jangan menjalankan ulang `20261112120000` melalui `apply_migration` atau SQL editor.
- Jangan menandai `20261112153000` applied jika update namanya belum benar-benar terjadi.
- Jangan menghapus/rename katalog lama.
- Jangan menyentuh rumus, `model_materials`, QTY formula, atau rumus M'.
- Jika CLI tidak tersedia, berhenti pada dokumentasi/prosedur ini. Jangan mensimulasikan repair dengan DML langsung.

## Status akhir audit ini

- Remote migration history telah dibaca ulang.
- Isi kedua migration file telah diperiksa.
- Efek utama migration pertama tampak sudah ada; verifikasi struktur exact dan seluruh seed data masih harus diselesaikan.
- Migration kedua belum diterapkan.
- Tidak ada migration repair, DDL, atau UPDATE data yang dijalankan selama audit ini.
