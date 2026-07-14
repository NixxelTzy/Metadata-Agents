"use client";

import { useEffect, useState } from "react";

interface DownloadLinks {
  apk: string;
  exe: string;
}

export default function BuildsPanel() {
  const [links, setLinks] = useState<DownloadLinks>({ apk: "", exe: "" });
  const [apkInput, setApkInput] = useState("");
  const [exeInput, setExeInput] = useState("");
  
  const [loading, setLoading] = useState(true);
  const [savingApk, setSavingApk] = useState(false);
  const [savingExe, setSavingExe] = useState(false);
  const [deletingApk, setDeletingApk] = useState(false);
  const [deletingExe, setDeletingExe] = useState(false);
  
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fetchLinks = async () => {
    try {
      const res = await fetch("/api/admin/downloads");
      if (res.ok) {
        const data = await res.json() as { links: DownloadLinks };
        if (data.links) {
          setLinks(data.links);
          setApkInput(data.links.apk);
          setExeInput(data.links.exe);
        }
      }
    } catch (err) {
      console.error("Gagal memuat link download:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, []);

  const handleSaveLink = async (type: "apk" | "exe", linkValue: string) => {
    setError("");
    setMessage("");
    
    if (linkValue.trim() !== "" && !/^https?:\/\/.+/i.test(linkValue)) {
      setError("Format link tidak valid. Link harus diawali dengan http:// atau https://");
      return;
    }

    if (type === "apk") setSavingApk(true);
    else setSavingExe(true);

    try {
      const res = await fetch("/api/admin/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, link: linkValue.trim() }),
      });
      const data = await res.json() as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan link");
      } else {
        setMessage(data.message || "Tautan berhasil disimpan");
        setLinks(prev => ({ ...prev, [type]: linkValue.trim() }));
      }
    } catch (err) {
      setError("Terjadi kesalahan koneksi");
    } finally {
      if (type === "apk") setSavingApk(false);
      else setSavingExe(false);
    }
  };

  const handleDeleteLink = async (type: "apk" | "exe") => {
    setError("");
    setMessage("");

    if (type === "apk") setDeletingApk(true);
    else setDeletingExe(true);

    try {
      const res = await fetch(`/api/admin/downloads?type=${type}`, {
        method: "DELETE",
      });
      const data = await res.json() as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.error || "Gagal menghapus link");
      } else {
        setMessage(data.message || "Tautan berhasil dihapus");
        setLinks(prev => ({ ...prev, [type]: "" }));
        if (type === "apk") setApkInput("");
        else setExeInput("");
      }
    } catch (err) {
      setError("Terjadi kesalahan koneksi");
    } finally {
      if (type === "apk") setDeletingApk(false);
      else setDeletingExe(false);
    }
  };

  const copyToClipboard = (text: string, elementId: string) => {
    navigator.clipboard.writeText(text);
    const badge = document.getElementById(elementId);
    if (badge) {
      const oldText = badge.innerText;
      badge.innerText = "Tersalin! ✓";
      badge.style.background = "var(--success)";
      badge.style.color = "white";
      setTimeout(() => {
        badge.innerText = oldText;
        badge.style.background = "";
        badge.style.color = "";
      }, 1500);
    }
  };

  const capacitorCommands = `npm run build\nnpx cap sync\nnpx cap open android`;
  const electronCommands = `npm run build\nnpm run electron:start\nnpx electron-builder build --windows`;

  if (loading) {
    return (
      <div className="fb-loading">
        <span className="fb-spinner fb-spinner--large" />
        <p>Memuat database link unduhan...</p>
      </div>
    );
  }

  return (
    <div className="fb-wrapper">
      <div className="fb-grid fb-grid--admin">
        
        {/* Left Column: Download Cards & Live Link Management */}
        <div className="fb-admin-left">
          
          {/* Download Center */}
          <div className="fb-card">
            <div className="fb-card__header">
              <h2 className="fb-card__title">💾 Download Pusat Aplikasi (Android & Windows)</h2>
              <p className="fb-card__desc">Unduh versi kompilasi native dari aplikasi. Fitur ini dinonaktifkan untuk akun biasa (Khusus Admin).</p>
            </div>

            <div className="dl-center-grid">
              {/* Android Card */}
              <div className="dl-card">
                <div className="dl-card__icon">🤖</div>
                <div className="dl-card__title">Android Mobile App (.apk)</div>
                <div className="dl-card__desc">Versi mobile Android hasil kompilasi Capacitor. Cocok untuk HP Android.</div>
                {links.apk ? (
                  <a href={links.apk} target="_blank" rel="noopener noreferrer" className="dl-card__btn dl-card__btn--active">
                    📥 Download APK Android
                  </a>
                ) : (
                  <button type="button" className="dl-card__btn dl-card__btn--disabled" disabled>
                    Link Belum Tersedia
                  </button>
                )}
                {links.apk && <span className="dl-card__url">{links.apk}</span>}
              </div>

              {/* Windows Card */}
              <div className="dl-card">
                <div className="dl-card__icon">🪟</div>
                <div className="dl-card__title">Windows Desktop App (.exe)</div>
                <div className="dl-card__desc">Versi desktop Windows hasil kompilasi Electron. Cocok untuk PC & Laptop Windows.</div>
                {links.exe ? (
                  <a href={links.exe} target="_blank" rel="noopener noreferrer" className="dl-card__btn dl-card__btn--active dl-card__btn--windows">
                    📥 Download EXE Windows
                  </a>
                ) : (
                  <button type="button" className="dl-card__btn dl-card__btn--disabled" disabled>
                    Link Belum Tersedia
                  </button>
                )}
                {links.exe && <span className="dl-card__url">{links.exe}</span>}
              </div>
            </div>
          </div>

          {/* Database Link Manager */}
          <div className="fb-card">
            <div className="fb-card__header">
              <h2 className="fb-card__title">⚙️ Manajemen Link Unduhan di Database</h2>
              <p className="fb-card__desc">Masukkan link baru atau hapus link lama agar tombol unduhan di atas diperbarui secara dinamis.</p>
            </div>

            <div className="fb-form">
              {error && <div className="fb-alert fb-alert--error">{error}</div>}
              {message && <div className="fb-alert fb-alert--success">{message}</div>}

              {/* APK Link Field */}
              <div className="db-link-field">
                <div className="db-link-field__left">
                  <label htmlFor="input-apk" className="fb-form__label">Tautan APK Android</label>
                  <input
                    id="input-apk"
                    type="text"
                    value={apkInput}
                    onChange={(e) => setApkInput(e.target.value)}
                    placeholder="https://drive.google.com/file/.../view?usp=sharing"
                    className="fb-form__input"
                  />
                </div>
                <div className="db-link-field__actions">
                  <button
                    type="button"
                    onClick={() => handleSaveLink("apk", apkInput)}
                    disabled={savingApk || deletingApk}
                    className="fb-btn fb-btn--primary db-btn--save"
                  >
                    {savingApk ? "..." : "Simpan APK"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteLink("apk")}
                    disabled={savingApk || deletingApk || !links.apk}
                    className="fb-btn db-btn--delete"
                  >
                    {deletingApk ? "..." : "Hapus Link"}
                  </button>
                </div>
              </div>

              {/* EXE Link Field */}
              <div className="db-link-field">
                <div className="db-link-field__left">
                  <label htmlFor="input-exe" className="fb-form__label">Tautan EXE Windows</label>
                  <input
                    id="input-exe"
                    type="text"
                    value={exeInput}
                    onChange={(e) => setExeInput(e.target.value)}
                    placeholder="https://github.com/.../releases/download/...exe"
                    className="fb-form__input"
                  />
                </div>
                <div className="db-link-field__actions">
                  <button
                    type="button"
                    onClick={() => handleSaveLink("exe", exeInput)}
                    disabled={savingExe || deletingExe}
                    className="fb-btn fb-btn--primary db-btn--save"
                  >
                    {savingExe ? "..." : "Simpan EXE"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteLink("exe")}
                    disabled={savingExe || deletingExe || !links.exe}
                    className="fb-btn db-btn--delete"
                  >
                    {deletingExe ? "..." : "Hapus Link"}
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Build commands references */}
        <div className="fb-admin-right">
          
          {/* Capacitor Build commands */}
          <div className="fb-card">
            <div className="fb-card__header fb-card__header--split">
              <div>
                <h2 className="fb-card__title">🚀 Capacitor Android Studio Build Output</h2>
                <p className="fb-card__desc">Salin instruksi di bawah untuk melakukan compile project web ke project native Android.</p>
              </div>
              <button
                type="button"
                id="copy-cap-badge"
                onClick={() => copyToClipboard(capacitorCommands, "copy-cap-badge")}
                className="copy-btn"
              >
                Salin Kode
              </button>
            </div>
            
            <div className="code-box">
              <pre className="code-pre">
                <span className="code-comment"># 1. Build output Next.js secara static</span>
                {"\n"}npm run build{"\n\n"}
                <span className="code-comment"># 2. Sinkronisasikan file out/ ke project Android</span>
                {"\n"}npx cap sync{"\n\n"}
                <span className="code-comment"># 3. Buka Android Studio untuk build APK</span>
                {"\n"}npx cap open android
              </pre>
            </div>
            <div className="build-note">
              <strong>💡 Info Android Studio:</strong> Setelah Android Studio terbuka, klik menu <em>Build › Build Bundle(s) / APK(s) › Build APK(s)</em> untuk menghasilkan file .apk akhir yang bisa Anda upload ke penyimpanan cloud dan masukkan link-nya ke database.
            </div>
          </div>

          {/* Electron Windows Build commands */}
          <div className="fb-card" style={{ marginTop: "24px" }}>
            <div className="fb-card__header fb-card__header--split">
              <div>
                <h2 className="fb-card__title">💻 Electron Windows Build Output (.exe)</h2>
                <p className="fb-card__desc">Instruksi menjalankan dan melakukan packaging aplikasi windows (.exe) secara lokal.</p>
              </div>
              <button
                type="button"
                id="copy-ele-badge"
                onClick={() => copyToClipboard(electronCommands, "copy-ele-badge")}
                className="copy-btn"
              >
                Salin Kode
              </button>
            </div>

            <div className="code-box">
              <pre className="code-pre">
                <span className="code-comment"># 1. Build static assets Next.js</span>
                {"\n"}npm run build{"\n\n"}
                <span className="code-comment"># 2. Jalankan aplikasi Electron untuk uji coba lokal</span>
                {"\n"}npm run electron:start{"\n\n"}
                <span className="code-comment"># 3. Lakukan compile/package ke installer Windows (.exe)</span>
                {"\n"}npx electron-builder build --windows
              </pre>
            </div>
            <div className="build-note">
              <strong>💡 Info Windows Builder:</strong> Command builder di atas akan merangkum aplikasi web Anda ke dalam file setup setup.exe yang terletak di folder <code>dist/</code> secara otomatis.
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
