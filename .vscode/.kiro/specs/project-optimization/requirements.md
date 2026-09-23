# Requirements Document

## Introduction

Dokumen ini mendefinisikan requirements untuk optimasi menyeluruh proyek **Stock AI Studio** — aplikasi Next.js 15 yang mencakup Adobe Stock metadata generator, AI photo generator, dan AI chat. Optimasi mencakup: dukungan penuh format API key `AQ.` dari Google AI Studio, konsolidasi logika key rotation, penambahan response caching, standardisasi error handling, peningkatan type safety, deduplication request, health endpoint, validasi kredensial saat startup, cancel generation di PhotoGenerator, dan auto-reconnect SSE yang robust di ServerMonitor.

---

## Glossary

- **Key_Manager**: Module terpusat (`lib/keyManager.ts`) yang mengelola health tracking dan rotasi semua Gemini API key.
- **Gemini_Client**: Module `lib/gemini.ts` yang memanggil Gemini API menggunakan key dari Key_Manager.
- **Image_Generator**: Module `lib/imageGen.ts` yang menghasilkan gambar menggunakan Gemini API.
- **Response_Cache**: Layer caching in-memory berbasis LRU untuk menyimpan hasil response Gemini.
- **Request_Deduplicator**: Mekanisme yang memastikan request identik yang concurrent hanya dikirimkan sekali ke API.
- **Credentials_Validator**: Fungsi yang memvalidasi ketersediaan semua kredensial wajib saat startup.
- **Error_Formatter**: Fungsi yang menstandardisasi semua error response API sebelum dikirim ke client.
- **Health_Endpoint**: Route `/api/health` yang melaporkan status sistem secara ringkas.
- **Photo_Generator**: Komponen React `components/PhotoGenerator.tsx` untuk generate gambar AI.
- **Server_Monitor**: Komponen React `components/ServerMonitor.tsx` untuk monitoring server via SSE.
- **SSE_Client**: Logika koneksi EventSource di dalam Server_Monitor.
- **AQ_Key**: Format API key Google AI Studio dengan prefix `AQ.` yang digunakan dalam proyek ini.
- **Gemini_API**: External service Google Generative AI yang dipanggil via `@google/genai`.
- **AbortController**: Web API standar untuk membatalkan fetch/request yang sedang berjalan.

---

## Requirements

### Requirement 1: Dukungan dan Validasi Format AQ. API Key

**User Story:** Sebagai developer, saya ingin sistem memvalidasi dan mendukung format AQ. API key dengan benar, agar tidak ada key valid yang ditolak atau gagal digunakan karena validasi format yang salah.

#### Acceptance Criteria

1. WHEN Key_Manager memuat API key dari credentials file atau environment variables, THE Key_Manager SHALL menerima key dengan format `AQ.[A-Za-z0-9_\-]+` (panjang bagian setelah `AQ.` minimal 10 karakter) sebagai key yang valid.
2. THE Key_Manager SHALL memfilter key yang kosong, null, undefined, atau hanya whitespace sebelum dimasukkan ke pool rotasi.
3. WHEN sebuah key tidak memenuhi format atau panjang minimum, THE Key_Manager SHALL mengecualikan key tersebut dari pool dan mencatat peringatan ke console dalam format `[WARN] Invalid key excluded: <KEY_PREFIX>...`.
4. WHEN Key_Manager menginisialisasi pool key untuk pertama kalinya, THE Credentials_Validator SHALL memvalidasi bahwa minimal 1 Gemini API key valid tersedia.
5. IF tidak ada Gemini API key valid yang tersedia saat `callGemini` dipanggil, THEN THE Gemini_Client SHALL mencoba memuat ulang key dari sumber kredensial paling banyak 1 kali sebelum melempar error dengan pesan `"Tidak ada Gemini API key valid yang dikonfigurasi"`.
6. WHEN Key_Manager menginisialisasi pool key, THE Key_Manager SHALL mencatat jumlah total key valid yang dimuat ke console pada level `info` dalam format `[INFO] Gemini keys loaded: N`.

---

### Requirement 2: Konsolidasi Key Rotation ke Module Terpusat

**User Story:** Sebagai developer, saya ingin logika key rotation dan health tracking hanya ada di satu tempat, agar perubahan perilaku rotasi tidak perlu dilakukan di banyak file sekaligus.

#### Acceptance Criteria

1. THE Key_Manager SHALL menyediakan fungsi `getOrderedKeys(): string[]` yang mengembalikan semua key diurutkan dengan prioritas: (1) key tidak dalam cooldown didahulukan, (2) di antara key yang setara cooldown-nya, key dengan jumlah error lebih sedikit didahulukan, (3) di antara key dengan jumlah error sama, key yang paling lama tidak digunakan (`lastUsed` terkecil) didahulukan.
2. THE Key_Manager SHALL menyediakan fungsi `recordSuccess(key: string): void` yang mengurangi `errors` sebesar 1 (minimal 0), mereset `cooldownUntil` ke 0, dan memperbarui `lastUsed` ke `Date.now()`.
3. THE Key_Manager SHALL menyediakan fungsi `recordError(key: string, status: number): void` untuk mencatat kegagalan dengan HTTP status code dan memperbarui `lastUsed` ke `Date.now()`.
4. THE Key_Manager SHALL menyediakan fungsi `isOnCooldown(key: string): boolean` yang mengembalikan `true` jika dan hanya jika `cooldownUntil > Date.now()`.
5. WHEN `recordError` dipanggil dengan status 429, THE Key_Manager SHALL menetapkan `cooldownUntil = Date.now() + 60_000` untuk key tersebut.
6. WHEN `recordError` dipanggil dengan status 403, THE Key_Manager SHALL menetapkan `cooldownUntil = Date.now() + 300_000` untuk key tersebut.
7. WHEN `recordError` dipanggil dengan status selain 429 dan 403, dan `errors` kumulatif key tersebut setelah penambahan mencapai 3 atau lebih, THE Key_Manager SHALL menetapkan `cooldownUntil = Date.now() + 30_000`.
8. THE Gemini_Client SHALL menggunakan `Key_Manager.getOrderedKeys()` sebagai sumber urutan key dan `Key_Manager.isOnCooldown()` sebagai penentu skip; Gemini_Client TIDAK SHALL menduplikasi logika cooldown atau sorting sendiri.
9. THE Image_Generator SHALL menggunakan `Key_Manager.getOrderedKeys()` sebagai sumber urutan key dan `Key_Manager.isOnCooldown()` sebagai penentu skip; Image_Generator TIDAK SHALL menduplikasi logika cooldown atau sorting sendiri.
10. THE Key_Manager SHALL menyediakan fungsi `getHealthReport(): Record<string, KeyHealthSummary>` di mana `KeyHealthSummary` adalah interface dengan field: `errors: number`, `onCooldown: boolean`, `cooldownRemainingMs: number`, `lastUsed: number`, `totalRequests: number`.
11. THE Key_Manager SHALL mengekspor interface `KeyHealth` dengan field: `errors: number`, `cooldownUntil: number`, `lastUsed: number`, `totalRequests: number`.

---

### Requirement 3: Response Caching untuk Gemini

**User Story:** Sebagai pengguna, saya ingin request yang identik tidak membuang quota API, agar limit harian bertahan lebih lama terutama saat ada banyak gambar dengan metadata yang sama.

#### Acceptance Criteria

1. THE Response_Cache SHALL menghasilkan cache key dengan menghitung SHA-256 dari string yang merupakan hasil `JSON.stringify({ model, systemInstruction, contents })` di mana `contents` adalah array messages dalam urutan array asli (tidak disortir).
2. WHEN sebuah request diterima dan cache entry dengan key yang sama masih valid (belum melewati TTL), THE Gemini_Client SHALL mengembalikan cached response tanpa memanggil Gemini_API.
3. THE Response_Cache SHALL memiliki TTL default 300 detik (5 menit) untuk setiap cache entry, dihitung sejak entry disimpan.
4. THE Response_Cache SHALL membatasi jumlah maksimum entry yang disimpan sebesar 500 entry menggunakan strategi LRU eviction.
5. WHEN cache kapasitas penuh dan entry baru akan ditambahkan, THE Response_Cache SHALL menghapus entry yang `accessedAt`-nya paling lama (paling jarang diakses terakhir).
6. THE Response_Cache SHALL menyediakan method `getSize(): number` yang mengembalikan jumlah entry aktif saat ini yang dapat diquery untuk monitoring.
7. WHEN Gemini_Client mengembalikan response dari cache, THE Gemini_Client SHALL menetapkan `fromCache: true` pada `GeminiResult`; WHEN Gemini_Client mengembalikan response dari live API call, THE Gemini_Client SHALL menetapkan `fromCache: false` pada `GeminiResult`.

---

### Requirement 4: Request Deduplication

**User Story:** Sebagai pengguna, saya ingin klik tombol generate berulang kali dengan prompt yang sama tidak mengirimkan multiple request ke API, agar quota tidak terbuang percuma.

#### Acceptance Criteria

1. THE Request_Deduplicator SHALL menghasilkan deduplication key dengan menggabungkan: nama fungsi yang dipanggil + teks prompt + nilai resolusi, lalu menghitung hash SHA-256 dari string tersebut.
2. WHEN request kedua dengan deduplication key identik datang sementara request pertama masih in-flight (Promise belum settled), THE Request_Deduplicator SHALL mengembalikan Promise yang sama dengan request pertama, bukan membuat request baru ke Gemini_API.
3. WHEN request selesai (baik resolved maupun rejected), THE Request_Deduplicator SHALL pertama menyebarkan hasil (resolve atau reject) ke semua caller yang menunggu, kemudian menghapus entry deduplication — dalam urutan ini.
4. THE Request_Deduplicator SHALL hanya menganggap dua request identik jika teks prompt dan nilai resolusi sama secara karakter-per-karakter (case-sensitive, tanpa normalisasi).
5. IF sebuah Promise untuk deduplication key tertentu sudah settled pada saat request duplikat datang (race antara settlement dan penghapusan entry), THEN THE Request_Deduplicator SHALL memperlakukan request tersebut sebagai request baru, bukan berbagi Promise yang sudah settled.

---

### Requirement 5: Standardisasi Error Handling dan Error Response

**User Story:** Sebagai developer dan pengguna, saya ingin semua error dari API dikembalikan dalam format yang konsisten, agar client dapat menangani error dengan cara yang seragam.

#### Acceptance Criteria

1. THE Error_Formatter SHALL menghasilkan error response dengan struktur `{ error: string, code: string, statusCode: number }` untuk semua API route yang tercakup.
2. WHEN error berasal dari Gemini_API dengan status 429, THE Error_Formatter SHALL mengembalikan pesan `"Terlalu banyak permintaan, coba lagi dalam beberapa menit"` tanpa mengekspos detail internal API; WHEN status 403, pesan `"Akses API ditolak"`; WHEN status 500 atau lainnya dari Gemini, pesan `"Layanan AI sedang tidak tersedia"`.
3. WHEN error adalah kegagalan autentikasi (token tidak ada atau tidak valid), THE Error_Formatter SHALL menggunakan HTTP status 401 dengan `code: "UNAUTHORIZED"`.
4. IF error autentikasi dan error validasi input terjadi bersamaan dalam satu request, THEN THE Error_Formatter SHALL memprioritaskan error autentikasi dengan mengembalikan 401/UNAUTHORIZED.
5. WHEN error adalah kesalahan validasi input dan tidak ada error autentikasi, THE Error_Formatter SHALL menggunakan HTTP status 400 dengan `code: "VALIDATION_ERROR"`.
6. WHEN error berasal dari semua Gemini key yang habis dirotasi, THE Error_Formatter SHALL menggunakan HTTP status 503 dengan `code: "SERVICE_UNAVAILABLE"` dan pesan `"Semua API key sedang tidak tersedia, coba lagi beberapa saat"`.
7. WHEN terjadi unexpected error (tidak termasuk kategori di atas), THE Error_Formatter SHALL menggunakan HTTP status 500 dengan `code: "INTERNAL_ERROR"` dan pesan `"Terjadi kesalahan server"`.
8. THE Error_Formatter SHALL memastikan field `stack` dari Error object tidak pernah disertakan dalam response body yang dikirim ke client, tanpa pengecualian.
9. THE Error_Formatter SHALL diterapkan secara konsisten di semua route: `/api/generate`, `/api/chat`, `/api/auth/login`, `/api/auth/register`, `/api/auth/verify-otp`.

---

### Requirement 6: Peningkatan Type Safety

**User Story:** Sebagai developer, saya ingin tidak ada `as any` atau unsafe cast di kode utama, agar bug type-related terdeteksi saat compile time bukan runtime.

#### Acceptance Criteria

1. THE Gemini_Client SHALL mendefinisikan tipe eksplisit `GeminiContent` yang kompatibel dengan parameter `contents` di `ai.models.generateContent`; tipe `GeminiMessage` yang sudah ada SHALL di-rename atau di-alias ke `GeminiContent` agar konsisten, menggantikan semua penggunaan `as any` pada parameter `contents`.
2. THE Image_Generator SHALL menggunakan tipe eksplisit untuk semua parameter dan return value fungsi publik (`generateImage`, `upscaleImage`) tanpa `as any`.
3. WHEN `generate/route.ts` membangun message dengan `inlineData`, THE route SHALL menggunakan tipe `Part` yang diimport dari `@google/genai` yang mendukung `inlineData`, menggantikan cast `as unknown as { text: string }`.
4. THE Credentials_Validator SHALL mendefinisikan dan mengekspor interface `CredentialsFile` yang mencakup semua field yang dibaca dari `credentials.ts` (`GEMINI_KEYS`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `JWT_SECRET`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`), menggantikan anonymous type cast di `lib/config.ts`, `lib/gemini.ts`, dan `lib/db.ts`.
5. THE Key_Manager SHALL mengekspor interface `KeyHealth` dengan field `errors: number`, `cooldownUntil: number`, `lastUsed: number`, `totalRequests: number` yang digunakan konsisten di seluruh codebase yang membutuhkan data health key.

---

### Requirement 7: Health Endpoint

**User Story:** Sebagai operator, saya ingin ada endpoint cepat yang melaporkan status sistem, agar saya dapat mengecek apakah aplikasi berjalan normal tanpa masuk ke halaman monitor lengkap.

#### Acceptance Criteria

1. WHEN Health_Endpoint menerima request GET ke `/api/health`, THE Health_Endpoint SHALL memproses request tanpa memerlukan autentikasi apapun.
2. WHEN Health_Endpoint dipanggil dan minimal 1 Gemini API key valid dikonfigurasi, THE Health_Endpoint SHALL mengembalikan HTTP 200 dengan body `{ status: "ok", timestamp: number, version: string, keys: { total: number, available: number, onCooldown: number } }` di mana `timestamp` adalah Unix epoch dalam milidetik, `available` adalah jumlah key yang tidak sedang dalam cooldown, dan `onCooldown` adalah jumlah key yang sedang cooldown.
3. WHEN Health_Endpoint dipanggil dan tidak ada Gemini API key yang dikonfigurasi sama sekali, THE Health_Endpoint SHALL mengembalikan HTTP 503 dengan `{ status: "degraded", reason: "no_keys_configured", timestamp: number, version: string }`.
4. IF semua Gemini API key dikonfigurasi tetapi seluruhnya sedang dalam cooldown, THEN THE Health_Endpoint SHALL mengembalikan HTTP 200 dengan `status: "ok"` dan `available: 0` — bukan 503 — karena key masih dikonfigurasi.
5. THE Health_Endpoint SHALL mengembalikan response dalam waktu kurang dari 100ms karena hanya membaca data in-memory tanpa I/O eksternal.
6. THE Health_Endpoint SHALL membaca nilai `version` dari field `version` di `package.json` dan menyertakannya dalam setiap response body.
7. WHEN Health_Endpoint menerima request dengan metode selain GET, THE Health_Endpoint SHALL mengembalikan HTTP 405 dengan body `{ error: "Method not allowed" }`.

---

### Requirement 8: Validasi Kredensial Saat Startup

**User Story:** Sebagai developer, saya ingin aplikasi langsung memberitahu jika ada kredensial yang hilang saat pertama kali berjalan, agar tidak ada error runtime misterius saat fitur digunakan.

#### Acceptance Criteria

1. WHEN module `lib/config.ts` pertama kali diimport di server-side, THE Credentials_Validator SHALL memvalidasi keberadaan semua kredensial wajib: `GEMINI_KEYS` (minimal 1 key setelah filter), `JWT_SECRET`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
2. WHEN sebuah kredensial wajib tidak ditemukan (tidak ada di credentials file maupun environment variable), THE Credentials_Validator SHALL mencatat peringatan ke console dengan format `[WARN] Missing credential: <NAMA_CREDENTIAL>`.
3. IF sebuah kredensial wajib ditemukan dan nilainya non-empty setelah trim, THEN THE Credentials_Validator SHALL mencatat status valid secara internal tanpa mengekspos nilai kredensial ke console atau log.
4. IF kode berjalan di browser (konteks client-side), THEN THE Credentials_Validator SHALL tidak menjalankan validasi apapun dan langsung return.
5. WHEN validasi semua kredensial selesai, THE Credentials_Validator SHALL mencetak ringkasan ke console: `[INFO] Credentials check: N/M valid` di mana N adalah jumlah yang valid dan M adalah total yang diperiksa.
6. IF satu atau lebih kredensial wajib hilang, THEN THE Credentials_Validator SHALL tidak melempar exception — hanya mencatat peringatan — agar aplikasi tetap dapat berjalan dalam mode terbatas.

---

### Requirement 9: Cancel Generation di PhotoGenerator

**User Story:** Sebagai pengguna, saya ingin bisa membatalkan proses generate foto yang sedang berjalan, agar saya tidak harus menunggu jika menyadari prompt yang dimasukkan salah.

#### Acceptance Criteria

1. WHEN proses generate foto sedang berjalan (spinner ditampilkan), THE Photo_Generator SHALL menampilkan tombol "Batalkan" yang dapat diklik oleh pengguna, menggantikan atau melengkapi tombol generate.
2. WHEN pengguna mengklik tombol "Batalkan", THE Photo_Generator SHALL memanggil `AbortController.abort()` pada controller aktif untuk membatalkan request yang sedang in-flight.
3. WHEN request berhasil dibatalkan (error dengan `name === "AbortError"` diterima), THE Photo_Generator SHALL menampilkan pesan "Generate dibatalkan" dan mereset UI ke kondisi idle: spinner hilang, tombol "Batalkan" disembunyikan, input prompt diaktifkan kembali.
4. WHEN request dibatalkan, THE Photo_Generator SHALL memanggil `URL.revokeObjectURL()` pada setiap object URL yang sudah dibuat dalam proses generate tersebut, terlepas dari apakah URL sudah ditampilkan atau belum.
5. THE Image_Generator SHALL menerima parameter opsional `signal: AbortSignal` pada fungsi `generateImage` dan meneruskannya ke semua internal fetch call (termasuk fetch untuk decode base64).
6. IF `AbortSignal` yang diteruskan sudah dalam kondisi `aborted` atau menjadi `aborted` selama request berlangsung, THEN THE Image_Generator SHALL melempar error dengan `name === "AbortError"` — ELSE IF request sudah selesai sebelum sinyal `aborted`, THEN THE Image_Generator SHALL mengembalikan hasil normal tanpa error.
7. WHEN generate foto baru dimulai dan controller sebelumnya belum `aborted`, THE Photo_Generator SHALL memanggil `abort()` pada controller sebelumnya sebelum membuat instance `AbortController` baru.

---

### Requirement 10: Auto-Reconnect SSE yang Robust di ServerMonitor

**User Story:** Sebagai operator, saya ingin koneksi monitoring tetap pulih secara otomatis setelah terputus, agar saya tidak perlu me-refresh halaman secara manual saat koneksi sesekali drop.

#### Acceptance Criteria

1. WHEN koneksi SSE ke `/api/monitor` terputus (event `onerror` terpicu), THE SSE_Client SHALL menutup EventSource yang terputus dan menjadwalkan reconnect menggunakan strategi exponential backoff.
2. THE SSE_Client SHALL menggunakan delay reconnect = `min(initialDelay × 2^(attempt-1), 30000)` ms, dengan `initialDelay = 1000` ms untuk attempt pertama; WHEN reconnect berhasil (event `onopen` terpicu), THE SSE_Client SHALL mereset `currentDelay` ke 1000ms DAN mereset `attemptCount` ke 0.
3. THE SSE_Client SHALL membatasi delay maksimum reconnect sebesar 30000ms (30 detik), sehingga semua attempt ke-5 dan seterusnya menggunakan delay tepat 30000ms.
4. WHEN jumlah percobaan reconnect mencapai 10 tanpa berhasil, THE SSE_Client SHALL berhenti menjadwalkan reconnect otomatis dan THE Server_Monitor SHALL menampilkan pesan `"Koneksi gagal setelah 10 percobaan. Klik tombol di bawah untuk mencoba lagi."`.
5. WHEN SSE_Client sedang dalam fase menunggu sebelum attempt ke-N (N antara 1 dan 10), THE Server_Monitor SHALL menampilkan status `"Reconnecting... (attempt N/10)"` di mana N adalah nomor attempt yang akan segera dicoba.
6. WHEN jumlah percobaan maksimum tercapai, THE Server_Monitor SHALL menampilkan tombol "Coba Lagi" yang, WHEN diklik, SHALL mereset `attemptCount` ke 0, mereset `currentDelay` ke 1000ms, dan memulai ulang siklus reconnect dari attempt 1.
7. WHEN komponen Server_Monitor di-unmount, THE SSE_Client SHALL membatalkan semua `setTimeout` reconnect yang pending dan memanggil `close()` pada EventSource yang ada.
8. WHEN reconnect pertama kali diperlukan setelah koneksi terputus, THE SSE_Client SHALL menunggu delay 1000ms terlebih dahulu (attempt 1) sebelum membuat EventSource baru — bukan langsung reconnect instan.
9. WHEN SSE_Client menjadwalkan reconnect attempt ke-N, THE SSE_Client SHALL terlebih dahulu memanggil `close()` pada EventSource lama jika masih open sebelum membuat EventSource baru — untuk mencegah akumulasi koneksi terbuka.
