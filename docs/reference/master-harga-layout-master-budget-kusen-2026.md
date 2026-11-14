# Acuan tata letak Master Harga DJ3 — Master budget kusen 2026

Sumber: workbook yang diberikan pengguna, `Master budget_kusen 2026(2).xlsx`.
Workbook asli memiliki sheet: `atap baja ringan galfalum`, `ALEXINDO`, `ALMUNIUM`, `KACA`, `DAUN PINTU`, `ASS.`, `plafon&partisi`, `kontraktor<150jt `, dan `harga bali`.

## Sheet ALMUNIUM

Susunan katalog horizontal per merek. Tiap merek memiliki satu blok item; item menjadi kolom, varian/finishing menjadi baris.

Urutan blok merek yang terdeteksi:
- HPM (baris 2–13)
- ALEXINDO (baris 14–25)
- YKK (baris 26–37)

Kolom item HPM pada baris 2 dimulai dengan:
- KUSEN 4" / M'
- KUSEN 3" / M'
- HOLLOW TENGAH / M'
- Canal U kaca / M'
- TAPIN / M'
- TATAPAN SLIDING / M'
- TATAPAN PIVOT / M'
- PINTU / M'
- LOUVER KECIL / M2
- SPANDRELL / M2
- Daun pintu dan finishing
- PINTU WPC / UNIT
- PINTU PVC / PCS
- Rel, jendela, dan item kaca terkait

Varian/finishing HPM:
- BROWN/ANODIZE
- PUTIH / CREAM / HITAM
- COATING CUSTOM

Baris harga dasar HPM adalah baris 4; harga finishing berada di baris 7, 10, dan 13. Beberapa harga finishing merujuk ke harga dasar (contoh `=C4`), sebagian menambah nominal (contoh `=C4+5000` dan `=C4+15000`), sementara beberapa kolom memakai formula khusus atau mempertahankan harga dasar. Rumus asli perlu dipertahankan saat impor data; jangan mengasumsikan seluruh kolom memakai aturan tambahan yang sama.

## Sheet lain

- KACA: jenis kaca disusun sebagai kolom (contoh kaca polos berdasarkan ketebalan, tempered, riben, cermin, polis, hole, coak).
- DAUN PINTU: tipe/model pintu disusun sebagai kolom, termasuk kayu jati Perhutani, KK Door, HDF, teakwood, melamin, duco, WPC, dan PVC.
- ASS.: item aksesoris disusun sebagai kolom, misalnya sealant, PT set, aseseris pivot, rambuncis, engsel, handle, kunci, flushbolt, rel, dan roda.
- ALEXINDO dan ALMUNIUM memuat kelompok item lintas material dalam satu sheet; jangan memecah atau menggabungkan item tanpa pemetaan yang disengaja.

## Implementasi UI tahap pertama

Tabel Atur Harga aplikasi disusun ulang agar orientasinya sama: item sebagai kolom dan varian/finishing sebagai baris. Satuan tetap melekat pada item; perubahan ini hanya tata letak, bukan perubahan rumus kalkulator atau QTY.
