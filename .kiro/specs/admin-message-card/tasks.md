# Implementation Plan: AdminMessageCard

## Overview

Membuat komponen `AdminMessageCard` sebagai presentational component TypeScript/React di `components/AdminMessageCard.tsx`, kemudian memodifikasi `components/UserInboxBanner.tsx` untuk menggunakannya sebagai pengganti JSX inline pada center-popup modal pesan bertipe `"message"`. Testing menggunakan Jest + React Testing Library + fast-check.

## Tasks

- [x] 1. Setup testing environment
  - Install devDependencies: `jest@^29`, `@types/jest@^29`, `jest-environment-jsdom@^29`, `@testing-library/react@^16`, `@testing-library/jest-dom@^6`, `fast-check@^3`, `ts-jest@^29`
  - Buat `jest.config.ts` dengan preset `ts-jest`, environment `jsdom`, dan `setupFilesAfterFramework` yang mengimpor `@testing-library/jest-dom`
  - Buat `jest.setup.ts` yang mengimpor `@testing-library/jest-dom`
  - Tambahkan script `"test": "jest --runInBand"` di `package.json`
  - _Requirements: (foundation untuk semua testing)_

- [x] 2. Ekspor tipe `AdminMessage` dari `UserInboxBanner.tsx`
  - Pastikan interface `AdminMessage` di `components/UserInboxBanner.tsx` sudah ditandai `export` agar dapat diimpor oleh `AdminMessageCard.tsx`
  - Verifikasi tidak ada perubahan breaking pada interface yang ada
  - _Requirements: 6.4_

- [x] 3. Buat komponen `AdminMessageCard`
  - [x] 3.1 Buat file `components/AdminMessageCard.tsx` dengan struktur dasar
    - Definisikan dan ekspor interface `ActionButton` dengan field `label`, `onClick`, dan `variant`
    - Definisikan interface `AdminMessageCardProps` dengan prop `message`, `actions`, `onDismiss`, `senderLogoUrl`
    - Impor tipe `AdminMessage` dari `./UserInboxBanner` (bukan redefinisi)
    - Buat fungsi komponen default `AdminMessageCard` yang mengembalikan `null` jika `message` adalah `null`
    - Tambahkan elemen kontainer root dengan `role="region"` dan `aria-label="Pesan resmi dari NixelStudio"`
    - Terapkan `width: "100%"`, `maxWidth: "480px"`, dan `padding: "16px"` pada kontainer root
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.1, 5.2, 5.3, 7.1_

  - [x] 3.2 Implementasi sub-fungsi `renderHeader`
    - Render elemen dengan layout horizontal (logo/inisial → nama pengirim → OfficialBadge)
    - Tambahkan state `imgError` menggunakan `useState(false)` untuk fallback logo
    - Jika `senderLogoUrl` ada dan `imgError` false: render `<img src={senderLogoUrl} alt="NixelStudio" onError={() => setImgError(true)} />`
    - Jika `senderLogoUrl` tidak ada atau `imgError` true: render `<span aria-hidden="true">NS</span>`
    - Render teks `"NixelStudio"` sebagai nama pengirim
    - Render `<span aria-label="Pesan Resmi">Pesan Resmi</span>` sebagai OfficialBadge dengan background fill atau border yang terlihat
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 7.2_

  - [x] 3.3 Implementasi sub-fungsi `renderBody`
    - Render judul dari `message.title` atau placeholder `"(Tanpa Judul)"` jika kosong/null/undefined
    - Render isi pesan dari `message.body` dengan fallback `"(Tidak ada isi pesan)"`, menggunakan `font-size` minimal `14px`
    - Split `message.body` dengan `\n`, filter segmen kosong setelah trim, render tiap segmen sebagai `<span style={{ display: "block" }}>`
    - Format `message.sentAt` dengan `new Date(sentAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })`
    - Jika parse Date menghasilkan NaN: tampilkan `"(Waktu tidak tersedia)"`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.6_

  - [x] 3.4 Implementasi sub-fungsi `renderFooter` dan logika injeksi tombol "Tutup"
    - Hitung `effectiveActions`: mulai dari `actions ?? []`
    - Jika `onDismiss` diberikan DAN tidak ada item berlabel `"Tutup"` di array: tambahkan `{ label: "Tutup", onClick: () => onDismiss(message), variant: "secondary" }`
    - Jika `effectiveActions` kosong: kembalikan `null` (Footer tidak dirender)
    - Render container flex dengan `gap: "8px"` dan responsif: `flexDirection: "column"` di < 400px, `"row"` di ≥ 400px (gunakan inline style atau CSS class)
    - Untuk tiap ActionButton: render `<button>` dengan teks `label`
    - Jika `onClick` adalah `undefined`: render tombol dengan `disabled={true}`
    - Jika `variant === "primary"`: terapkan background solid yang berbeda dari secondary
    - Jika `variant === "secondary"` atau tidak ada variant: terapkan `background: "transparent"` dan border yang terlihat
    - Tambahkan focus style dengan outline minimal 2px untuk aksesibilitas keyboard
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.4, 5.5, 6.1, 6.2, 6.3, 7.4, 7.5_

  - [x]* 3.5 Tulis unit tests (example-based) untuk `AdminMessageCard`
    - Test: render dengan `message={null}` → tidak ada elemen DOM
    - Test: render dengan `actions={[]}` dan tanpa `onDismiss` → tidak ada elemen Footer
    - Test: tombol dengan `onClick={undefined}` → dirender dengan atribut `disabled`
    - Test: teks `"NixelStudio"` dan `"Pesan Resmi"` selalu ada pada pesan valid
    - Test: OfficialBadge punya `aria-label="Pesan Resmi"`
    - Test: kontainer root punya `role="region"` dan `aria-label="Pesan resmi dari NixelStudio"`
    - Test: `senderLogoUrl` valid → `<img>` muncul dengan src dan alt yang benar
    - Test: tombol variant primary punya background solid (bukan transparent)
    - Test: tombol variant secondary punya background transparent dan border
    - _Requirements: 1.4, 1.5, 2.2, 2.3, 2.5, 4.3, 7.1, 7.2_

- [x] 4. Tulis property-based tests untuk `AdminMessageCard`
  - [x] 4.1 Setup arbitraries dan file test
    - Buat `components/__tests__/AdminMessageCard.property.test.tsx`
    - Definisikan `arbitraryAdminMessage()` menggunakan `fc.record` dengan semua field sesuai desain
    - Definisikan `arbitraryNonEmptyActions()` menggunakan `fc.array(..., { minLength: 1 })`
    - Konfigurasi `{ numRuns: 100 }` pada semua `fc.assert`
    - _Requirements: (foundation untuk semua property tests)_

  - [x]* 4.2 Tulis property test: Property 1 — Struktur tiga-bagian
    - **Property 1: Struktur tiga-bagian untuk semua pesan valid**
    - **Validates: Requirements 1.1**
    - For any valid AdminMessage + non-empty actions: header, body, dan footer harus ada di DOM dalam urutan vertikal

  - [x]* 4.3 Tulis property test: Property 2 — Fallback konten Body
    - **Property 2: Fallback konten Body**
    - **Validates: Requirements 3.1, 3.2**
    - For any message dengan title kosong/null: elemen judul harus berisi `"(Tanpa Judul)"`
    - For any message dengan non-empty title: elemen judul berisi nilai title persis
    - Sama untuk body dengan fallback `"(Tidak ada isi pesan)"`

  - [x]* 4.4 Tulis property test: Property 3 — Validasi dan formatting timestamp
    - **Property 3: Validasi dan formatting timestamp**
    - **Validates: Requirements 3.3**
    - For any ISO 8601 valid: output bukan `"(Waktu tidak tersedia)"`
    - For any non-parseable string: output adalah `"(Waktu tidak tersedia)"`

  - [x]* 4.5 Tulis property test: Property 4 — Multiline body splitting
    - **Property 4: Multiline body splitting**
    - **Validates: Requirements 3.4**
    - For any body dengan satu atau lebih `\n`: jumlah elemen blok === jumlah segmen non-empty setelah split + filter trim

  - [x]* 4.6 Tulis property test: Property 5 — Jumlah tombol sama dengan panjang actions
    - **Property 5: Jumlah tombol sama dengan panjang actions**
    - **Validates: Requirements 4.1**
    - For any actions array panjang N tanpa onDismiss: Footer merender tepat N `<button>`

  - [x]* 4.7 Tulis property test: Property 6 — Gaya variant tombol
    - **Property 6: Gaya variant tombol**
    - **Validates: Requirements 4.6, 4.7, 4.8**
    - For any ActionButton variant="primary": background adalah nilai solid (bukan "transparent")
    - For any ActionButton variant="secondary" atau tanpa variant: background adalah transparent dan border terlihat

  - [x]* 4.8 Tulis property test: Property 7 — Logo fallback untuk senderLogoUrl tidak valid
    - **Property 7: Logo fallback untuk senderLogoUrl tidak valid**
    - **Validates: Requirements 2.6**
    - For any falsy value atau string kosong sebagai senderLogoUrl: teks inisial "NS" dirender, tidak ada `<img>`

  - [x]* 4.9 Tulis property test: Property 8 — Injeksi tombol "Tutup" idempotency
    - **Property 8: Injeksi tombol "Tutup" dari onDismiss (idempotency)**
    - **Validates: Requirements 6.2, 6.3**
    - Jika actions tidak mengandung "Tutup" + onDismiss ada: tepat satu tombol "Tutup"
    - Jika actions sudah mengandung "Tutup" + onDismiss ada: tetap tepat satu tombol "Tutup"

  - [x]* 4.10 Tulis property test: Property 9 — ARIA region pada semua instance
    - **Property 9: ARIA region pada semua instance**
    - **Validates: Requirements 7.1**
    - For any valid AdminMessage: kontainer root punya `role="region"` dan `aria-label="Pesan resmi dari NixelStudio"`

  - [x]* 4.11 Tulis property test: Property 10 — Isolasi rendering tanpa provider
    - **Property 10: Isolasi rendering (tanpa provider)**
    - **Validates: Requirements 6.5**
    - For any valid AdminMessage + actions: render sebagai child `<div>` biasa berhasil tanpa error, output non-null

- [x] 5. Checkpoint — Pastikan semua tests lulus
  - Jalankan `npm test` atau `npx jest --runInBand` dan pastikan semua test lulus.
  - Periksa tidak ada TypeScript error dengan `npx tsc --noEmit`.
  - Tanyakan ke user jika ada pertanyaan sebelum melanjutkan.

- [x] 6. Integrasi `AdminMessageCard` ke `UserInboxBanner.tsx`
  - [x] 6.1 Tambahkan import `AdminMessageCard` dan `ActionButton` di `UserInboxBanner.tsx`
    - Tambahkan: `import AdminMessageCard, { ActionButton } from "./AdminMessageCard";`
    - _Requirements: 6.4, 6.5_

  - [x] 6.2 Refaktor center-popup modal untuk pesan bertipe `"message"`
    - Temukan blok JSX inline yang merender `showCenterPopup && activeMsg` (sekitar baris 963–1145)
    - Ganti JSX inline dengan `<AdminMessageCard>` sesuai desain, dengan overlay backdrop yang dipertahankan:
      ```tsx
      {showCenterPopup && activeMsg && (
        <div className="inbox-modal" style={/* overlay backdrop tetap */}>
          <AdminMessageCard
            message={activeMsg}
            onDismiss={handleDismiss}
            actions={
              unreadMessages.length > 1 && safeIdx < unreadMessages.length - 1
                ? [{ label: "Berikutnya →", onClick: () => { handleDismiss(activeMsg); setCurrentIdx(safeIdx + 1); } }]
                : []
            }
          />
        </div>
      )}
      ```
    - Hapus sidebar kolom kiri dari JSX lama (branding dipindah ke header card)
    - Pertahankan overlay backdrop (blur, ambient glows, animasi)
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

  - [x]* 6.3 Tulis smoke tests untuk integrasi `UserInboxBanner` + `AdminMessageCard`
    - Test: render `UserInboxBanner` dengan mock `activeMsg` bertipe `"message"` → `AdminMessageCard` tampil di DOM
    - Test: klik tombol "Tutup" di `AdminMessageCard` → `handleDismiss` dipanggil
    - Test: jika ada lebih dari 1 unread dan bukan pesan terakhir → tombol "Berikutnya →" muncul
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 7. Final checkpoint — Verifikasi end-to-end
  - Jalankan `npm test` dan pastikan semua test lulus.
  - Jalankan `npx tsc --noEmit` dan pastikan tidak ada TypeScript error.
  - Tanyakan ke user jika ada pertanyaan sebelum selesai.

## Notes

- Tasks bertanda `*` adalah opsional dan dapat dilewati untuk MVP yang lebih cepat
- Setiap task merujuk ke requirements spesifik untuk traceability
- Checkpoint memastikan validasi incremental
- Property tests memvalidasi correctness universal; unit tests memvalidasi kasus konkret dan edge case
- `AdminMessageCard` adalah pure presentational component — tidak ada state bisnis, semua data dari props
- State internal satu-satunya yang diizinkan adalah `imgError` untuk fallback logo
- Overlay backdrop (blur, ambient glows) di `UserInboxBanner` dipertahankan; hanya JSX inline card yang diganti

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3"] },
    { "id": 3, "tasks": ["3.4", "4.1"] },
    { "id": 4, "tasks": ["3.5", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "4.11"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["6.2"] },
    { "id": 7, "tasks": ["6.3"] }
  ]
}
```
