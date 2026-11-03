# DJ3 · Kalkulator Pintu

Aplikasi web untuk menghitung kebutuhan material model pintu/kusen, menyimpan beberapa model dalam satu proyek, mengisi harga satuan, dan melihat rekap biaya. Antarmuka berbahasa Indonesia.

## Menjalankan aplikasi

1. Pasang Node.js 20.19 atau lebih baru.
2. Jalankan `npm install`.
3. Salin `.env.example` menjadi `.env.local`, lalu isi URL dan publishable key proyek Supabase.
4. Jalankan `npm run dev` dan buka alamat lokal yang ditampilkan.

Kunci publishable digunakan di browser; tabel database tetap dilindungi Row Level Security (RLS). Jangan menaruh `service_role` atau secret key pada berkas `VITE_*`.

## Menyiapkan Supabase

Untuk pengembangan lokal, pasang Docker Desktop, lalu jalankan:

```powershell
supabase start
supabase db reset
supabase test db
```

Langkah ini hanya diperlukan jika ingin menjalankan database Supabase lokal. Docker Desktop dibutuhkan untuk `supabase start`; jika memakai proyek Supabase hosted seperti pengaturan saat ini, Docker tidak diperlukan. Database lokal dibuat dari migrasi `supabase/migrations/` dan diisi dengan katalog awal dari kedua berkas seed. Seed memakai `ON CONFLICT DO NOTHING`, sehingga seed ulang tidak menimpa rumus yang telah diedit.

Untuk menghubungkan proyek Supabase hosted:

1. Buat proyek di Supabase dan tambahkan URL proyek serta publishable key pada environment Vercel.
2. Buat akun pemilik dari Supabase Dashboard. Nonaktifkan pendaftaran publik pada pengaturan Auth; aplikasi hanya menyediakan alur masuk.
3. Login ke Supabase CLI, hubungkan project ref, lalu terapkan migrasi dan katalog awal:

   ```powershell
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push --include-seed
   ```

4. Perintah pada langkah 3 ditujukan untuk pengisian awal database hosted yang masih kosong. Setelah itu, gunakan `supabase db push` untuk migrasi berikutnya saja; jangan sertakan seed lagi pada database yang sudah dipakai. Migrasi katalog menambahkan atau memperbaiki data sesuai perubahan yang disebutkan di setiap migrasi.
5. Setelah akun pemilik dibuat, jadikan akun itu pengelola katalog melalui SQL Editor Supabase:

   ```sql
   insert into public.catalog_admins (user_id)
   select id from auth.users where email = 'email-pemilik@example.com'
   on conflict (user_id) do nothing;
   ```

   Ganti alamat email dengan akun pemilik. Pengelola dapat menyimpan versi rumus; pengguna lain hanya dapat membaca rumus dan mengelola proyeknya sendiri.

`supabase db reset` ditujukan untuk database lokal karena menghapus dan membangun ulang skema lokal. Untuk database hosted yang masih kosong, gunakan `supabase db push --include-seed` satu kali setelah memeriksa project ref; untuk pembaruan berikutnya gunakan `supabase db push` tanpa seed.

## Menu Pengaturan · kelola user

Menu **Pengaturan** (`/pengaturan`) hanya tampil untuk admin (akun di tabel `catalog_admins`). Admin dapat melihat daftar akun, menambah akun dengan **nama pengguna + kata sandi** (tanpa email) berperan **User** atau **Admin**, dan menghapus user. Akun Admin baru langsung masuk ke `catalog_admins` dan bisa menambah admin lain.

- Supabase Auth mewajibkan email, jadi nama pengguna dipetakan ke email internal `<nama>@dj3.local`. Email itu tidak pernah dikirimi surat dan tidak ditampilkan. Akun lama yang masuk dengan email asli tetap bisa login: kolom login menerima nama pengguna atau email.
- Menambah/menghapus akun butuh hak `service_role`, jadi dikerjakan oleh Edge Function `supabase/functions/manage-users`. Function memeriksa JWT pemanggil dan memastikan ia admin sebelum bertindak. Kunci `service_role` tidak pernah masuk ke browser.
- Akun sendiri dan akun admin tidak dapat dihapus dari menu ini, supaya admin tidak terkunci. Mencabut atau menghapus admin lewat SQL Editor Supabase (`delete from public.catalog_admins where user_id = ...`).
- Menghapus user ikut menghapus semua proyek dan perkiraan harga miliknya (`on delete cascade`). Dialog konfirmasi menampilkan peringatan ini.

Penerapan ke Supabase hosted (belum dilakukan otomatis; jalankan setelah memeriksa project ref):

```powershell
supabase functions deploy manage-users --project-ref <project-ref>
```

Tidak ada migrasi database baru. Setelah deploy, cek bahwa email `@dj3.local` diterima oleh Auth hosted dengan membuat satu user uji dari menu, lalu coba login dengan user itu. Panjang kata sandi minimal di function adalah 8 karakter.

## Katalog dan rumus

Katalog aplikasi saat ini memuat 100 model dan 1.081 item material pada kelompok 10000 (pintu), 30000 (pintu jendela), dan 40000 (pintu sliding). Sheet master sumber tidak memuat kelompok 20000; data jendela dari workbook terpisah belum diimpor. Baris kaca gabungan tanpa rumus pada model 30600–33500 selain 31400, Floorhinge 31100, dan PT 30 kode 34308 telah dikeluarkan; model 34300 memakai PT 40 kode 34310 dengan rumus `daunPintu`. Model 31400 sengaja tetap memiliki 12 item tanpa rumus. Kelompok 40000 juga sengaja belum dilengkapi: 21 model dengan 255 baris material tanpa rumus. Total 22 model saat ini berstatus belum lengkap; hasil tanpa rumus tidak dianggap nol.

Skrip ekstraksi hanya membaca workbook dan menghasilkan katalog JSON serta seed SQL. Di blok 34200, kode item setelah 34203 berurutan sebagai 34104–34114 di sumber; importer memetakan 11 baris itu ke 34204–34214 berdasarkan urutan berlanjut dan menyimpan kode Excel asal sebagai `sourceCode`. Referensi kosong D321 dalam rumus item 30501 dipertahankan sebagai nol sesuai perilaku Excel. Untuk mengulang impor setelah perubahan workbook:

```powershell
python -m pip install openpyxl
python scripts/extract-door-catalog.py
python scripts/generate-door-seed-sql.py
```

Rumus dijalankan dengan parser aritmetika terbatas, bukan JavaScript. Variabel ukuran yang umum dipakai antara lain `T1`, `L1`, `T2`, `L2`, `T3`, `L3`, `daunPintu`, dan `daunJendela`; nama variabel baru yang valid juga dapat ditulis langsung pada rumus dan akan tersedia sebagai input proyek. Referensi qty menggunakan kode stabil seperti `qty_10101`, termasuk referensi lintas model yang memang ada dalam workbook. Formula model 12100 item kusen telah diperbaiki mengikuti pola prototype yang dikonfirmasi.

Hasil dan versi rumus yang dipakai disimpan pada baris proyek. Mengubah rumus tidak mengganti hasil proyek yang telah tersimpan.

Menu dashboard berasal dari registri fitur di `src/app/features.ts`. Tambahkan implementasi halaman dan daftarkan fiturnya di sana untuk menambah menu berikutnya.

## Build dan pengujian

```powershell
npm test
npm run build
```

Vercel memakai build `npm run build`, folder keluaran `dist`, dan rewrite SPA di `vercel.json`. Set `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` pada Project Settings → Environment Variables.

Supabase Free dapat menjeda proyek dengan aktivitas rendah setelah 7 hari. Lihat [Vite di Vercel](https://vercel.com/docs/frameworks/frontend/vite), [migrasi database Supabase](https://supabase.com/docs/guides/deployment/database-migrations), dan [ketentuan jeda proyek gratis Supabase](https://supabase.com/docs/guides/platform/free-project-pausing).

