# Rancangan Teknis: Master Harga Normalisasi dan Rekap Material per TYPE

Tanggal: 2026-11-13  
Status: Rancangan teknis untuk review; belum diterapkan ke database atau aplikasi.

## Tujuan dan batas aman

Menyusun ulang hubungan Master Harga, pemetaan material rumus, dan Rekap Material Kalkulator Kusen agar setiap TYPE/model memiliki pilihan item, merek, varian, kuantitas tambahan, dan harga sendiri.

Prinsip yang tidak boleh berubah:
- Rumus dan hasil kuantitas formula yang sudah ada tetap menjadi sumber QTY formula.
- Rumus satuan meter (M') tidak disentuh dalam pekerjaan ini.
- Formula-generated item tidak memiliki toggle nonaktif/keluarkan.
- Item manual hanya dapat dipilih dari item yang sudah ada di Master Harga.
- Baris manual dan baris formula tetap terpisah walaupun merujuk item Master Harga yang sama.
- Proyek tersimpan mempertahankan snapshot historis; proyek baru memakai harga master terbaru.
- Katalog, rumus, pengaturan, dan proyek lama tetap tersedia selama transisi.

## Struktur konsep Master Harga

Master Harga tidak lagi menjadikan merek sebagai kelompok utama.

### Kelompok produk
- Pintu
- Kusen
- Jendela

### Kelompok material
- Aluminium
- Kayu

### Kelompok pendukung
- Kaca
- Aksesoris

Kelompok di atas adalah kategori master yang dapat ditambah admin. Model formula seperti 10100, 21300, dan lainnya tetap berada di Master Rumus dan tidak disamakan dengan kelompok master harga.

Merek adalah atribut opsional pada item, bukan katalog induk. Alexindo, HPM/INKA/DACON, dan YKK dipertahankan sebagai data merek/asal data yang dapat dipilih sesuai item. Kaca dan aksesoris umum tidak dipaksa menjadi milik merek aluminium.

## Struktur tabel target (proposal)

Semua tabel baru bersifat additive. Tabel lama tidak dihapus atau diganti pada tahap pertama.

### 1. `master_item_groups`
- `id uuid primary key`
- `group_key text unique`
- `label text`
- `group_type text check in ('product','material','supporting')`
- `position integer`
- `active boolean`
- timestamps

### 2. `master_items`
- `id uuid primary key`
- `group_id uuid references master_item_groups`
- `item_key text unique`
- `label text`
- `unit text`
- `description text nullable`
- `legacy_catalog_id uuid nullable`
- `legacy_component_id uuid nullable`
- `active boolean`
- timestamps

Kolom legacy menjadi jejak asal dan bukan ketergantungan runtime permanen.

### 3. `master_brands`
- `id uuid primary key`
- `brand_key text unique`
- `label text`
- `active boolean`
- `position integer`

Seed awal brand: Alexindo, HPM, INKA, DACON, dan YKK sebagai entitas terpisah. Label katalog lama “HPM / INKA / DACON” tidak otomatis dipetakan ke salah satu merek; relasi merek per item harus diverifikasi terlebih dahulu. Merek lain dapat ditambahkan tanpa membuat kelompok baru.

### 4. `master_item_variants`
- `id uuid primary key`
- `item_id uuid references master_items`
- `variant_key text`
- `label text`
- `attributes jsonb not null default '{}'`
- `position integer`
- `active boolean`
- unique (`item_id, variant_key`)

Atribut dapat menyimpan warna, finishing, ketebalan, tipe kaca, model daun pintu, atau spesifikasi lain. UI hanya menampilkan selector yang relevan untuk item terpilih.

### 5. `master_item_brand_options`
Relasi many-to-many antara item dan brand:
- `item_id uuid`
- `brand_id uuid`
- `brand_item_code text nullable`
- primary key (`item_id, brand_id`)

Ini memungkinkan item umum tanpa merek dan item yang tersedia dari beberapa merek.

### 6. `master_item_prices`
- `id uuid primary key`
- `item_id uuid references master_items`
- `brand_id uuid nullable`
- `variant_id uuid nullable`
- `amount numeric nullable check amount >= 0` (tanpa pembatas presisi agar QTY/harga tidak terpotong)
- `expression text nullable`
- `source_cell`, `source_formula`, `source_value` nullable untuk menjaga jejak sumber seperti katalog lama
- `version integer not null`
- `is_current boolean not null`
- `source_label text nullable`
- `updated_by uuid nullable`
- timestamps

Satu harga aktif untuk kombinasi item + brand (termasuk null) + variant (termasuk null). Harga kosong tetap sah; UI menampilkan belum diisi dan memberi input harga. Tidak ada fallback diam-diam ke merek/varian lain. Riwayat perubahan harga disimpan terpisah atau melalui tabel versi immutable.

### 7. `formula_material_item_options`
Pemetaan hasil rumus ke item Master Harga yang boleh dipilih:
- `id uuid primary key`
- `material_code integer references materials(code)`
- `model_code integer nullable references door_models(code)`
- `item_id uuid references master_items`
- `brand_id uuid nullable`
- `variant_id uuid nullable`
- `is_default boolean`
- `position integer`
- `active boolean`

Pemetaan boleh spesifik model atau berlaku umum. Pemetaan tidak mengubah expression maupun QTY rumus. Item hasil formula yang belum memiliki mapping tetap tampil dengan nama/satuan snapshot lama dan dapat dipetakan admin kemudian.

### 8. `project_line_material_items`
Tabel inti baru: satu baris untuk setiap item pada satu TYPE/model dalam satu proyek.
- `id uuid primary key`
- `project_id uuid not null references projects(id) on delete cascade`
- `project_model_line_id uuid not null references project_model_lines(id) on delete cascade`
- `source_type text check in ('formula','manual')`
- `formula_material_code integer nullable references materials(code)`
- `master_item_id uuid nullable references master_items(id) on delete set null`
- `selected_brand_id uuid nullable references master_brands(id) on delete set null`
- `selected_variant_id uuid nullable references master_item_variants(id) on delete set null`
- `quantity numeric not null check quantity >= 0`
- `unit_snapshot text not null`
- `item_name_snapshot text not null`
- `group_name_snapshot text nullable`
- `brand_name_snapshot text nullable`
- `variant_name_snapshot text nullable`
- `unit_price_snapshot numeric nullable check unit_price_snapshot >= 0`
- `price_version_snapshot integer nullable`
- `price_is_set boolean not null`
- `position integer not null`
- `created_at / updated_at`

Aturan integritas:
- source_type = 'formula': formula_material_code wajib ada. master_item_id boleh null jika belum dipetakan.
- source_type = 'manual': master_item_id wajib ada dan formula_material_code harus null.
- Unique partial index untuk baris formula: (project_model_line_id, formula_material_code) WHERE source_type='formula'.
- Tidak ada unique constraint pada baris manual; item yang sama dapat ditambahkan berkali-kali.
- Tambahkan unique (project_model_lines.id, project_id) lalu composite FK dari (project_model_line_id, project_id), agar TYPE tidak bisa tertaut ke proyek yang salah.
- Baris manual menyimpan QTY mandiri. Mengedit QTY manual tidak memengaruhi formula.
- Baris formula menyimpan QTY hasil formula sebagai snapshot; perubahan pilihan item/brand/varian tidak mengubah rumus.

Jika diperlukan untuk mencegah penghapusan item master menghapus jejak proyek, snapshot nama, satuan, brand, varian, dan harga tetap menjadi sumber tampilan proyek historis. Foreign key master_item_id boleh menjadi null setelah master item diarsipkan/dihapus.

## Alur aplikasi yang dituju

### Master Harga
1. Admin memilih kelompok: Pintu, Kusen, Jendela, Aluminium, Kayu, Kaca, atau Aksesoris.
2. Admin membuat/mengubah item, satuan, brand opsional, varian/spesifikasi, dan harga.
3. Menambah kelompok, item, brand, atau varian tidak memerlukan perubahan kode UI khusus untuk setiap nama baru.

### Kalkulator Kusen
1. Kotak model berisi kode model, dimensi, jumlah, dan input rumus saja.
2. Setelah rumus menghasilkan item, Rekap Material menampilkan setiap TYPE/model secara terpisah.
3. Di dalam TYPE, setiap baris formula memiliki pilihan item/brand/varian yang relevan. Harga dan subtotal tampil di baris yang sama.
4. Tambah Item membuka pilihan dari Master Harga. Item tidak dapat diketik bebas.
5. Item manual mempunyai QTY independen dan dapat ditambahkan berulang.
6. Rekap Material dibuat lebih dominan daripada kotak model; daftar model dirapatkan dan menghilangkan jarak vertikal berlebihan.

### Selektor dinamis
- Aluminium: item/profil → brand yang tersedia → warna/finishing → harga.
- Kayu: item/jenis kayu → spesifikasi yang relevan → harga.
- Kaca: tipe kaca → ketebalan/varian → harga.
- Aksesoris: item aksesoris → model/ukuran/varian → harga.
- Daun pintu: model daun pintu → brand → warna/finishing bila tersedia → harga.

Selector tidak menampilkan atribut yang tidak relevan bagi item terpilih.

## RLS dan akses

Semua tabel baru di schema public wajib:
- RLS enabled.
- Explicit revoke dari anon dan grant minimum ke authenticated.
- Read master data untuk authenticated hanya pada baris aktif atau sesuai kebutuhan UI; admin dapat membaca seluruh data.
- Mutasi master data hanya melalui kebijakan admin yang memanggil helper admin yang sudah diaudit, bukan SECURITY DEFINER baru yang terbuka.
- Baris project_line_material_items hanya dapat dibaca/ditambah/diubah/dihapus oleh pemilik proyek atau admin, dengan validasi bahwa project_model_line_id benar-benar milik project_id yang sama.
- UPDATE policy harus memiliki USING dan WITH CHECK.
- Indeks dibuat pada kolom yang dipakai RLS, terutama project_id dan foreign key yang sering difilter.

Tambahkan pgTAP RLS tests untuk anon, pemilik, pengguna lain, dan admin pada setiap tabel baru. Jangan menganggap grant dan policy sebagai hal yang sama.

## Migrasi data dan kompatibilitas

### Fase 0 — rekonsiliasi migrasi (wajib sebelum DDL baru)
- Remote migration history belum mencatat `20261112120000_master_harga_tiga_kelompok.sql`, walaupun efek skema dan beberapa data utamanya terlihat sudah ada.
- `20261112153000_fix_tatapan_samping_material_name.sql` belum tercatat dan koreksi ejaan belum terlihat diterapkan.
- Jangan menjalankan ulang migration pertama. Audit dan rekonsiliasi migration history dengan prosedur CLI `supabase migration repair` yang tepat, setelah memastikan setiap efek migration pertama di remote sudah cocok.
- Jalankan migration typo correction sebagai migrasi tersendiri hanya setelah history drift selesai ditangani.
- Jangan mengubah tabel registry migration secara manual lewat SQL.

### Fase 1 — additive schema
- Buat tabel master baru, relasi, constraints, indexes, RLS, grants, dan tests.
- Tidak menghapus/rename tabel lama.
- Tidak mengubah formula, tabel materials/model_materials, atau meter formulas.

### Fase 2 — seed dan pemetaan
- Buat master groups dan brand.
- Impor item dari katalog lama dengan legacy IDs untuk traceability.
- Buat pemetaan formula-material ke master item berdasarkan data yang diverifikasi.
- Data yang tidak punya padanan dibiarkan belum dipetakan; jangan menebak.

### Fase 3 — runtime dual-read / dual-write
- Proyek lama tetap membaca `project_line_price_snapshots` dengan perilaku lama selama belum ada konfigurasi per TYPE yang bisa dibuktikan.
- Proyek baru menyimpan baris `project_line_material_items` per TYPE.
- Saat proyek lama dibuka, jangan menggandakan snapshot global ke semua TYPE secara diam-diam. Tampilkan sebagai konfigurasi legacy yang belum dipisahkan, atau minta pengguna memilih ulang untuk penyimpanan baru.
- Saat save, formula snapshot dan input dimensi tetap disimpan seperti sebelumnya; tabel baru menyimpan seleksi material dan QTY per TYPE.

### Fase 4 — validasi dan cutover bertahap
- Uji dua TYPE dengan model code sama (contoh 10500 dua kali) dan pastikan brand/varian/harga tidak saling menimpa.
- Uji dua TYPE dengan model berbeda dan satu item manual yang sama ditambahkan dua kali.
- Uji harga kosong, harga nol, dan harga terisi; harga kosong harus tetap bisa diedit dan tidak mengambil harga lain.
- Uji reload, edit, save, print, dan reopen; snapshot historis tidak berubah saat master harga diperbarui.
- Bandingkan QTY hasil formula sebelum/sesudah untuk seluruh fixture. Tidak boleh ada perubahan QTY, khususnya rumus M'.
- Baru setelah hasil cocok, aktifkan UI baru secara bertahap.

## Risiko yang ditemukan pada audit saat ini

1. Aggregator Rekap Material mengelompokkan item lintas model line berdasarkan kode material/unit/harga; bukan ID TYPE.
2. Repository menyimpan snapshot harga dengan key global project/material/catalog/variant/component. Dua TYPE yang sama dapat berbagi konfigurasi dan harga.
3. Project loading membangun peta harga global, bukan per model line.
4. Tabel snapshot lama tidak menyimpan project_model_line_id. Riwayat lama tidak dapat dipetakan secara pasti ke TYPE jika material sama muncul pada lebih dari satu baris model.
5. Pada contoh proyek yang diaudit, terdapat 12 model lines dan 82 baris formula, tetapi hanya 66 kombinasi snapshot unik. Model 10500 dan 21300 masing-masing muncul dua kali. Ini menunjukkan agregasi lama memang melebur kombinasi yang seharusnya dapat berbeda per TYPE.
6. Foreign key snapshot lama ke katalog memakai ON DELETE RESTRICT; katalog yang punya snapshot historis tidak boleh dihapus secara fisik. Gunakan arsip/nonaktif untuk data master yang sudah dipakai.
7. Supabase Security Advisor memberi warning pada sembilan fungsi SECURITY DEFINER yang sudah ada. Definisi yang diaudit melakukan pemeriksaan admin atau autentikasi/pemilik di badan fungsi, tetapi setiap fungsi tetap perlu review grants, authorization tests, dan alasan penggunaan SECURITY DEFINER. Pekerjaan ini tidak boleh menambah pola SECURITY DEFINER serupa tanpa kebutuhan yang terbukti.

## Rencana uji penerimaan minimum

1. Project dengan dua baris TYPE model 10500: pilihan brand, warna, harga, dan item manual TYPE A berbeda dari TYPE B.
2. Project dengan dua baris TYPE model 21300: konfigurasi independen tetap ada setelah save, reload, edit, dan print.
3. Item manual sama ditambahkan dua kali pada satu TYPE: dua row ID, QTY, harga, dan subtotal independen.
4. Item manual hanya dapat berasal dari Master Harga.
5. Harga null tetap dapat diedit; tidak ada fallback otomatis.
6. Harga master diperbarui setelah proyek disimpan: proyek lama mempertahankan snapshot lama; proyek baru mengambil harga terbaru.
7. Formula-generated rows tidak memiliki kontrol exclude/disable.
8. Semua QTY formula identik dengan baseline; seluruh rumus M' tidak berubah.
9. Uji akses RLS: pemilik dapat mengelola barisnya; pengguna lain tidak dapat membaca atau mengubahnya; admin dapat melakukan tindakan yang memang diizinkan.
10. Semua tes unit, integrasi, build, dan pgTAP lulus sebelum PR diajukan untuk ditinjau.

## Status implementasi

- Audit database dan kode: selesai untuk jalur utama.
- Test catalogs: empat katalog percobaan telah dihapus sesuai instruksi; katalog dan data proyek lain dipertahankan.
- Migration history drift: ditemukan; belum direkonsiliasi.
- Rancangan tabel: proposal; belum dibuat.
- SQL migration: belum dibuat.
- Aplikasi: belum diubah.
- Database live: tidak ada perubahan skema baru dalam pekerjaan lanjutan ini.
