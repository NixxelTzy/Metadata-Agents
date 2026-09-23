# Requirements Document

## Introduction

Fitur ini menambahkan komponen `AdminMessageCard` — sebuah card UI yang menampilkan pesan resmi dari admin kepada pengguna. Komponen ini diintegrasikan ke dalam sistem inbox yang sudah ada (`UserInboxBanner`) dan dioptimalkan untuk tampilan mobile-first. Card terdiri dari tiga bagian: Header berisi branding "NixelStudio" dengan label "Pesan Resmi", Body berisi konten pesan dari admin, dan Footer berisi tombol aksi yang dapat dikonfigurasi.

## Glossary

- **AdminMessageCard**: Komponen React yang merender sebuah pesan admin dalam format card terstruktur dengan header, body, dan footer.
- **Header**: Bagian atas card yang menampilkan identitas pengirim (logo/nama "NixelStudio") dan official badge "Pesan Resmi".
- **Body**: Bagian tengah card yang menampilkan konten teks pesan dari admin.
- **Footer**: Bagian bawah card yang menampilkan satu atau lebih tombol aksi.
- **ActionButton**: Tombol aksi dalam Footer berbentuk objek `{ label: string; onClick: (() => void) | undefined; variant?: "primary" | "secondary" }`.
- **OfficialBadge**: Label bertanda yang menunjukkan pesan berasal dari sumber resmi NixelStudio.
- **AdminMessage**: Tipe data pesan yang berasal dari API `/api/user/inbox`, sudah terdefinisi di `UserInboxBanner.tsx`.
- **UserInboxBanner**: Komponen yang sudah ada dan menangani polling, notifikasi bell, serta modal popup pesan admin.
- **InboxSystem**: Sistem keseluruhan yang mencakup `UserInboxBanner`, API `/api/user/inbox`, dan mekanisme dismiss berbasis sessionStorage.

---

## Requirements

### Requirement 1: Struktur Layout Card

**User Story:** Sebagai pengguna, saya ingin melihat pesan admin dalam format card yang terstruktur, sehingga saya dapat dengan mudah membedakan header, isi pesan, dan tombol aksi.

#### Acceptance Criteria

1. THE AdminMessageCard SHALL merender tiga bagian terpisah secara vertikal: Header di atas, Body di tengah, dan Footer di bawah, dalam satu elemen kontainer root.
2. THE AdminMessageCard SHALL menerima prop `message` bertipe `AdminMessage` yang berisi setidaknya field `id`, `title`, `body`, dan `sentAt`.
3. THE AdminMessageCard SHALL menerima prop `actions` berupa array `ActionButton[]` di mana setiap item memiliki shape `{ label: string; onClick: (() => void) | undefined; variant?: "primary" | "secondary" }`.
4. IF prop `message` tidak diberikan atau bernilai `null`, THEN THE AdminMessageCard SHALL mengembalikan `null` dan tidak merender elemen apapun ke DOM.
5. IF prop `actions` adalah array kosong atau tidak diberikan, THEN THE AdminMessageCard SHALL tidak merender elemen Footer.

---

### Requirement 2: Header — Branding dan Official Badge

**User Story:** Sebagai pengguna, saya ingin melihat identitas pengirim yang jelas di bagian atas card, sehingga saya tahu bahwa pesan ini berasal dari NixelStudio secara resmi.

#### Acceptance Criteria

1. THE Header SHALL merender elemen-elemen dari kiri ke kanan dalam urutan: (1) logo atau inisial, (2) teks nama pengirim "NixelStudio", (3) OfficialBadge.
2. THE Header SHALL menampilkan teks "NixelStudio" sebagai nama pengirim.
3. THE Header SHALL menampilkan OfficialBadge dengan teks "Pesan Resmi" di sebelah kanan nama pengirim.
4. THE OfficialBadge SHALL memiliki tampilan visual yang membedakannya dari teks biasa, ditandai dengan background fill berwarna ATAU border yang terlihat.
5. WHERE prop `senderLogoUrl` diberikan dan URL dapat dimuat, THE Header SHALL menampilkan elemen `<img>` dengan `src` dari nilai prop tersebut dan `alt` bernilai "NixelStudio".
6. WHERE prop `senderLogoUrl` tidak diberikan ATAU gambar gagal dimuat (error event), THE Header SHALL menampilkan teks inisial "NS" sebagai pengganti logo.

---

### Requirement 3: Body — Konten Pesan Admin

**User Story:** Sebagai pengguna, saya ingin membaca isi pesan dengan jelas dan nyaman, sehingga saya memahami informasi yang disampaikan admin.

#### Acceptance Criteria

1. THE Body SHALL menampilkan nilai `message.title` sebagai judul pesan. IF `message.title` bernilai `null`, string kosong, atau tidak terdefinisi, THEN THE Body SHALL menampilkan teks placeholder "(Tanpa Judul)".
2. THE Body SHALL menampilkan nilai `message.body` sebagai isi pesan dalam elemen blok yang terpisah secara visual dari judul. IF `message.body` bernilai `null`, string kosong, atau tidak terdefinisi, THEN THE Body SHALL menampilkan teks placeholder "(Tidak ada isi pesan)".
3. THE Body SHALL menampilkan waktu pengiriman yang diformat dari `message.sentAt` menggunakan `toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })`. IF `message.sentAt` tidak dapat di-parse menjadi `Date` yang valid, THEN THE Body SHALL menampilkan teks "(Waktu tidak tersedia)".
4. WHEN nilai `message.body` mengandung satu atau lebih karakter newline (`\n`), THE Body SHALL merender setiap segmen sebagai elemen terpisah (misal `<p>` atau `<span>` dengan `display: block`). Segmen kosong yang dihasilkan dari pemisahan (panjang 0 setelah trim) SHALL dilewati dan tidak dirender.

---

### Requirement 4: Footer — Tombol Aksi

**User Story:** Sebagai pengguna, saya ingin memiliki tombol aksi yang relevan di bagian bawah card, sehingga saya dapat merespons atau menutup pesan dengan mudah.

#### Acceptance Criteria

1. THE Footer SHALL merender tepat satu elemen `<button>` untuk setiap item dalam array prop `actions`, menggunakan `label` dari item sebagai teks yang terlihat pada tombol.
2. WHEN tombol di Footer diklik dan `onClick` pada `ActionButton` yang bersesuaian adalah fungsi, THE Footer SHALL memanggil fungsi tersebut.
3. IF `onClick` pada `ActionButton` bernilai `undefined` atau bukan fungsi, THEN tombol tersebut SHALL dirender dalam keadaan `disabled` dan tidak memicu aksi apapun saat diklik.
4. IF prop `actions` adalah array kosong atau prop `actions` tidak diberikan, THEN THE Footer SHALL tidak dirender ke DOM.
5. THE Footer SHALL merender tombol-tombol dengan gap horizontal sebesar 8px antar tombol ketika ditampilkan secara berdampingan.
6. WHERE prop `variant` pada `ActionButton` bernilai `"primary"`, THE Footer SHALL merender tombol dengan latar belakang berwarna solid yang berbeda secara visual dari tombol `"secondary"`.
7. WHERE prop `variant` pada `ActionButton` bernilai `"secondary"`, THE Footer SHALL merender tombol dengan latar belakang transparan DAN border yang terlihat.
8. WHERE prop `variant` pada `ActionButton` tidak diberikan atau bernilai selain `"primary"` atau `"secondary"`, THE Footer SHALL menerapkan gaya `"secondary"` sebagai fallback.

---

### Requirement 5: Desain Mobile-First dan Responsif

**User Story:** Sebagai pengguna HP, saya ingin card pesan yang mudah dibaca dan digunakan di layar kecil, sehingga pengalaman saya di perangkat mobile tetap nyaman.

#### Acceptance Criteria

1. THE AdminMessageCard SHALL merender dengan `width: 100%` pada viewport dengan lebar kurang dari 640px.
2. THE AdminMessageCard SHALL merender dengan `max-width: 480px` pada viewport dengan lebar 640px atau lebih, dengan tetap menggunakan `width: 100%` agar dapat menyusut di bawah max-width.
3. THE AdminMessageCard SHALL menerapkan padding internal minimal 16px pada semua sisi (top, right, bottom, left) di semua ukuran viewport.
4. THE Footer SHALL merender tombol-tombol dengan `flex-direction: column` (stack vertikal, lebar penuh) pada viewport dengan lebar kurang dari 400px.
5. THE Footer SHALL merender tombol-tombol dengan `flex-direction: row` (horizontal) pada viewport dengan lebar 400px atau lebih.
6. THE Body SHALL menerapkan `font-size` minimal 14px untuk teks `message.body` di semua ukuran viewport.

---

### Requirement 6: Integrasi dengan Sistem Inbox yang Ada

**User Story:** Sebagai developer, saya ingin `AdminMessageCard` dapat digunakan di dalam `UserInboxBanner` yang sudah ada, sehingga tidak perlu membangun ulang sistem polling dan dismiss dari awal.

#### Acceptance Criteria

1. THE AdminMessageCard SHALL menerima prop opsional `onDismiss` bertipe `(message: AdminMessage) => void`.
2. WHEN prop `onDismiss` diberikan DAN array prop `actions` tidak mengandung item dengan `label` bernilai `"Tutup"`, THEN THE Footer SHALL menyertakan satu `ActionButton` berlabel "Tutup" yang memanggil `onDismiss(message)` saat diklik.
3. WHEN prop `onDismiss` diberikan DAN array prop `actions` sudah mengandung item dengan `label` bernilai `"Tutup"`, THEN THE Footer SHALL tidak menambahkan tombol "Tutup" duplikat.
4. THE AdminMessageCard SHALL mengimpor dan menggunakan tipe `AdminMessage` yang diekspor dari `UserInboxBanner.tsx` tanpa mendefinisikan ulang tipe tersebut.
5. THE AdminMessageCard SHALL dapat dirender sebagai child dari elemen `<div>` apapun tanpa memerlukan context atau provider khusus dari `UserInboxBanner`.

---

### Requirement 7: Aksesibilitas

**User Story:** Sebagai pengguna dengan kebutuhan khusus, saya ingin card pesan dapat diakses menggunakan teknologi asistif, sehingga saya tidak kehilangan informasi penting.

#### Acceptance Criteria

1. THE AdminMessageCard SHALL merender elemen kontainer root dengan atribut `role="region"` dan `aria-label="Pesan resmi dari NixelStudio"`.
2. THE OfficialBadge SHALL merender dengan atribut `aria-label="Pesan Resmi"`.
3. THE AdminMessageCard SHALL menerapkan pasangan warna teks/latar belakang dengan rasio kontras minimum 4.5:1 pada elemen teks: judul pesan (`message.title`), isi pesan (`message.body`), dan timestamp.
4. WHEN tombol di Footer mendapatkan fokus keyboard, THE tombol tersebut SHALL menampilkan outline dengan ketebalan minimal 2px dan rasio kontras outline terhadap warna di sekitarnya minimal 3:1, sesuai WCAG 2.1 SC 2.4.11.
5. THE tombol-tombol di Footer SHALL dapat diaktifkan menggunakan tombol keyboard `Enter` dan `Space`, sehingga pengguna yang hanya menggunakan keyboard dapat berinteraksi dengan card.
