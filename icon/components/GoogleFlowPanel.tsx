"use client";

import { useState } from "react";
import {
  Sparkles, ExternalLink, ArrowRight, CheckCircle2, ShieldCheck,
  Zap, Layers, Film, Wand2, Image as ImageIcon, Flame, ChevronRight
} from "lucide-react";

export default function GoogleFlowPanel() {
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const samplePrompt = "Ultra-realistic commercial photography of fresh organic ripe cherry tomatoes in a sunny greenhouse, cinematic lighting, 8k resolution, photorealistic depth of field, vibrant colors";

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(samplePrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  const handleOpenGoogleFlow = () => {
    window.open("https://flow.google.com/", "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flow-root">
      <style>{`
        .flow-root {
          max-width: 100%;
          margin: 0;
          padding: 24px 18px 80px;
          font-family: inherit;
        }
        @keyframes flowGlow {
          0%, 100% { transform: translateY(0); box-shadow: 0 10px 30px rgba(59,130,246,0.15); }
          50% { transform: translateY(-3px); box-shadow: 0 16px 40px rgba(99,102,241,0.25); }
        }
        .flow-hero-card {
          background: linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(239,246,255,0.95) 50%, rgba(238,242,255,0.92) 100%);
          border: 1px solid rgba(147, 197, 253, 0.6);
          border-radius: 20px;
          padding: 32px 28px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(59, 130, 246, 0.12);
        }
        .flow-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(37,99,235,0.12), rgba(99,102,241,0.15));
          border: 1px solid rgba(99,102,241,0.3);
          color: #2563eb;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .flow-btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 14px 26px;
          border-radius: 12px;
          background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
          color: #ffffff;
          font-size: 14px;
          font-weight: 800;
          border: none;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.35);
          text-decoration: none;
        }
        .flow-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 28px rgba(79, 70, 229, 0.45);
          background: linear-gradient(135deg, #1d4ed8 0%, #4338ca 100%);
        }
        .flow-btn-primary:active {
          transform: translateY(0);
        }
        .flow-feature-box {
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(147, 197, 253, 0.5);
          border-radius: 16px;
          padding: 20px;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .flow-feature-box:hover {
          transform: translateY(-3px);
          border-color: rgba(59, 130, 246, 0.7);
          box-shadow: 0 10px 24px rgba(59, 130, 246, 0.12);
        }

        @media (max-width: 640px) {
          .flow-root { padding: 16px 12px 60px !important; }
          .flow-hero-card { padding: 20px 16px !important; border-radius: 16px !important; }
          .flow-btn-primary { width: 100% !important; justify-content: center !important; }
          .flow-feature-box { padding: 14px !important; border-radius: 14px !important; }
        }
      `}</style>

      {/* ── HERO BANNER ── */}
      <div className="flow-hero-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <div className="flow-badge">
            <Sparkles size={13} />
            Platform AI Kreatif Gemini Resmi
          </div>
          <span style={{
            fontSize: 11,
            fontWeight: 800,
            padding: "4px 10px",
            borderRadius: 999,
            background: "rgba(16, 185, 129, 0.15)",
            border: "1px solid rgba(16, 185, 129, 0.35)",
            color: "#059669",
            letterSpacing: "0.03em"
          }}>
            ⚡ UNLIMITED TOKEN &amp; TANPA BATAS
          </span>
        </div>

        <h1 style={{
          fontSize: "clamp(22px, 3.5vw, 32px)",
          fontWeight: 900,
          color: "#0f172a",
          lineHeight: 1.25,
          letterSpacing: "-0.02em",
          margin: "0 0 12px"
        }}>
          Google Flow — AI Creative Studio
        </h1>

        <p style={{
          fontSize: 14,
          color: "#475569",
          lineHeight: 1.6,
          maxWidth: 720,
          margin: "0 0 24px"
        }}>
          Studio kreatif kecerdasan buatan bertenaga <strong>Google Gemini &amp; Imagen</strong> untuk membuat foto berkualitas tinggi, generasi video, aset digital microstock, serta *custom workflow* kreatif tanpa batas token dan bebas pembatasan kuota harian.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className="flow-btn-primary"
            onClick={handleOpenGoogleFlow}
          >
            <span>Buka Google Flow Studio</span>
            <ExternalLink size={16} />
          </button>

          <a
            href="https://flow.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#2563eb",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "10px 14px"
            }}
          >
            <span>https://flow.google.com</span>
            <ChevronRight size={14} />
          </a>
        </div>
      </div>

      {/* ── HIGHLIGHT FITUR UTAMA ── */}
      <div style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", margin: "0 0 16px" }}>
          Keunggulan Google Flow untuk Kontributor Microstock
        </h2>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16
        }}>
          <div className="flow-feature-box">
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "rgba(37,99,235,0.1)",
              border: "1px solid rgba(37,99,235,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#2563eb"
            }}>
              <Zap size={20} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Unlimited &amp; Bebas Batasan</div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
              Buat dan eksplorasi gambar serta video tanpa cemas kehabisan token atau kredit. Sepenuhnya fleksibel untuk produksi stok massal.
            </div>
          </div>

          <div className="flow-feature-box">
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "rgba(99,102,241,0.1)",
              border: "1px solid rgba(99,102,241,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#4f46e5"
            }}>
              <ImageIcon size={20} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Generasi Foto Gemini &amp; Imagen</div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
              Hasil generasi foto realistis tingkat tinggi dengan pemahaman prompt mendalam berbasis teknologi model tercanggih dari Google.
            </div>
          </div>

          <div className="flow-feature-box">
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#059669"
            }}>
              <Film size={20} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Video &amp; Custom Creative Tools</div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
              Bukan hanya foto, Google Flow juga mendukung generasi cuplikan video dinamis, konsistensi karakter, dan alur kerja kustom.
            </div>
          </div>
        </div>
      </div>

      {/* ── WORKFLOW WORKSHOP / INTEGRATION WITH APP ── */}
      <div style={{
        marginTop: 28,
        background: "rgba(255, 255, 255, 0.75)",
        border: "1px solid rgba(147, 197, 253, 0.45)",
        borderRadius: 16,
        padding: "22px 24px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Wand2 size={18} color="#2563eb" />
          <h3 style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", margin: 0 }}>
            Alur Kerja Sempurna Bersama Stock AI Studio
          </h3>
        </div>

        <ol style={{
          margin: "0 0 18px",
          paddingLeft: 20,
          fontSize: 13,
          color: "#475569",
          lineHeight: 1.8
        }}>
          <li><strong>Buat Foto di Google Flow:</strong> Buka <a href="https://flow.google.com/" target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: 700 }}>Google Flow</a>, buat foto stok fotorealistis menggunakan prompt berbasis Gemini tanpa batas.</li>
          <li><strong>Unduh Gambar:</strong> Simpan hasil foto beresolusi tinggi dari Google Flow ke perangkat Anda.</li>
          <li><strong>Upscale ke 2K Stock di AI Upscaler:</strong> Gunakan menu <strong>AI Upscaler</strong> kami untuk menaikkan resolusi ke 2K/3K dengan garansi lolos &gt;4MP Adobe Stock.</li>
          <li><strong>Generate Metadata Siap Jual:</strong> Masukkan foto ke <strong>Metadata Generator</strong> untuk membuat Judul &amp; 49 Keywords komersial paling dicari pembeli.</li>
        </ol>

        {/* Prompt copy box */}
        <div style={{
          background: "rgba(241, 245, 249, 0.9)",
          border: "1px solid rgba(203, 213, 225, 0.8)",
          borderRadius: 12,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap"
        }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: 4 }}>
              Contoh Prompt Siap Pakai untuk Google Flow:
            </div>
            <div style={{ fontSize: 12, color: "#1e293b", fontFamily: "monospace", lineHeight: 1.4 }}>
              {samplePrompt}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyPrompt}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid rgba(37,99,235,0.3)",
              background: copiedPrompt ? "rgba(16,185,129,0.15)" : "#ffffff",
              color: copiedPrompt ? "#059669" : "#2563eb",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.15s ease",
              flexShrink: 0
            }}
          >
            {copiedPrompt ? (
              <>
                <CheckCircle2 size={14} color="#059669" />
                <span>Tersalin!</span>
              </>
            ) : (
              <>
                <span>Salin Prompt</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
