# TODO

- [ ] Integrasikan fitur “Start Riset Produk” di `components/ResearchPanel.tsx`:
  - [ ] Tombol Start Riset Produk muncul di tab `product`
  - [ ] Generate query AI dari `adobePhotoUrl` (via API/groq atau aturan heuristik)
  - [ ] Ubah query menjadi URL pencarian AdobeStock
  - [ ] Tampilkan daftar URL hasil + tombol Buka Semua

- [ ] Integrasikan fitur “Start Riset Event” di `components/ResearchPanel.tsx`:
  - [ ] Tombol Start Riset Event muncul di tab `events`
  - [ ] Generate query AI dari `eventRegion`, `eventSeason`, dan nama event
  - [ ] Ubah query menjadi URL pencarian AdobeStock
  - [ ] Tampilkan daftar URL hasil + tombol Buka Semua

- [ ] (Opsional) Tambahkan micro-interaction: loading state, error state, retry.

