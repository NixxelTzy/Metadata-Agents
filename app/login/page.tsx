"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || loading) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json() as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Login gagal");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Animated background */}
      <div className="auth-bg" aria-hidden="true">
        <div className="auth-bg__orb auth-bg__orb--1" />
        <div className="auth-bg__orb auth-bg__orb--2" />
        <div className="auth-bg__orb auth-bg__orb--3" />
        <div className="auth-bg__orb auth-bg__orb--4" />
      </div>

      {/* Left feature panel — desktop only */}
      <aside className="auth-left" aria-hidden="true">
        <div className="auth-left__brand">
          <div className="auth-left__brand-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <div className="auth-left__brand-name">Stock AI Studio</div>
            <div className="auth-left__brand-tagline">Powered by Groq AI</div>
          </div>
        </div>

        <h2 className="auth-left__headline">
          Analisis saham<br /><span>lebih cerdas</span>
        </h2>
        <p className="auth-left__sub">
          Platform riset investasi berbasis AI yang membantu kamu membuat keputusan lebih baik, lebih cepat.
        </p>

        <div className="auth-left__features">
          {[
            { icon: "⚡", title: "AI Analysis Ultra-Fast", desc: "Powered by Groq — respons analisis dalam hitungan detik." },
            { icon: "📊", title: "Riset Mendalam", desc: "Sumber data multi-layer dengan verifikasi akurasi tinggi." },
            { icon: "🔒", title: "Keamanan Enterprise", desc: "Data kamu terenkripsi end-to-end, tidak pernah dibagikan." },
            { icon: "💬", title: "Chat AI Kontekstual", desc: "Tanya apa saja tentang market, coding, atau strategi." },
          ].map((f) => (
            <div key={f.title} className="auth-left__feature">
              <div className="auth-left__feature-icon">{f.icon}</div>
              <div>
                <div className="auth-left__feature-title">{f.title}</div>
                <div className="auth-left__feature-desc">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Decorative SVG pattern */}
        <svg className="auth-left__pattern" viewBox="0 0 480 200" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
          <defs>
            <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#4f46e5" />
              <stop offset="100%" stopColor="#7c3aed" />
            </linearGradient>
          </defs>
          {Array.from({ length: 8 }).map((_, i) => (
            <circle key={i} cx={60 * i} cy={100 + Math.sin(i) * 40} r={20 + i * 4} stroke="url(#pg)" strokeWidth="1" fill="none" />
          ))}
          {Array.from({ length: 6 }).map((_, i) => (
            <line key={i} x1={i * 80} y1="0" x2={i * 80 + 40} y2="200" stroke="url(#pg)" strokeWidth="0.5" />
          ))}
        </svg>
      </aside>

      {/* Right form panel */}
      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo__icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <div className="auth-logo__title">Stock AI Studio</div>
              <div className="auth-logo__sub">Powered by Groq AI</div>
            </div>
          </div>

          <h1 className="auth-heading">Selamat datang kembali</h1>
          <p className="auth-subheading">
            Masuk ke akun untuk melanjutkan.{" "}
            <Link href="/register" className="auth-link">Buat akun baru →</Link>
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label htmlFor="email">Email</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/></svg>
                </span>
                <input
                  id="email"
                  type="email"
                  placeholder="kamu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Password kamu"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className="auth-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? <span className="auth-spinner" /> : null}
              {loading ? "Masuk..." : "Masuk"}
            </button>
          </form>

          <p className="auth-footer-text">
            Dengan masuk, kamu menyetujui penggunaan layanan ini.
          </p>
        </div>
      </div>
    </div>
  );
}
