# TODO

## Completed
- [x] Enforce hard month constraint untuk riset Event "bulan ini" di `app/api/research/route.ts`.
- [x] Buat Visual Calendar + Timeline Kampanye untuk Event di UI (`components/EventsCalendarAndTimeline.tsx`) dan dipakai oleh `components/ResearchPanel.tsx`.

## Next (Defence/Attack email missing + overlay)
- [ ] Tambahkan enforcement backend untuk "feature usage" (default endpoints) saat **auth_token tidak ada**.
  - Action: block sementara 24 jam (TTL 86400s)
  - Reason string: `blocked_by_missing_email` + detail endpoint/method
- [ ] Pastikan event/marker `reason/blocked_by_missing_email` ikut terbawa ke `app/api/monitor/route.ts` (recentAttacks snapshot).
- [ ] Update `components/ServerMonitor.tsx`:
  - Tab Defence/Attacks: filter hanya feature-usage alerts
  - Saat marker `blocked_by_missing_email` terdeteksi: tampilkan overlay glassmorphism di tengah layar + countdown.
- [ ] Verifikasi manual:
  - Test request tanpa login ke /api/research, /api/generate, /api/vector, /api/validate/links, /api/chat
  - Pastikan muncul overlay dengan timer dan countdown bekerja.

