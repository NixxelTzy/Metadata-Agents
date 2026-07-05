"use client";

import { useState, useCallback, useEffect } from "react";
import { addUsage, formatTokens, estimateCost, getPlatformLabel, getUsage, type Platform } from "@/lib/tokenStore";

// ── Types ─────────────────────────────────────────────────────────────────────
type PanelTab = "magic" | "analytics";

interface MagicIdea {
  id: string;
  title: string;
  description: string;
  prompt: string;
  tags: string[];
  estimatedSales: string;
  difficulty: "Easy" | "Medium" | "Complex";
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ART_THEMES = [
  { value: "vector",      label: "🟦 Vector"         },
  { value: "illustrator", label: "🎨 Illustrator"     },
  { value: "photography", label: "📷 Photography"     },
  { value: "watercolor",  label: "💧 Watercolor"      },
  { value: "3d_render",   label: "🧊 3D Render"       },
  { value: "pixel_art",   label: "🕹️ Pixel Art"       },
  { value: "sketch",      label: "✏️ Sketch"          },
  { value: "anime",       label: "🌸 Anime / Manga"   },
  { value: "infographic", label: "📊 Infographic"     },
  { value: "icon_set",    label: "🔷 Icon Set"        },
];

const CONCEPT_CATEGORIES = [
  { value: "graphic",     label: "🔷 Grafik & Abstrak"    },
  { value: "business",    label: "💼 Bisnis & Keuangan"   },
  { value: "scenery",     label: "🌿 Pemandangan & Alam"  },
  { value: "technology",  label: "🤖 Teknologi & AI"      },
  { value: "healthcare",  label: "🏥 Kesehatan & Medis"   },
  { value: "food",        label: "🍜 Makanan & Kuliner"   },
  { value: "travel",      label: "✈️ Perjalanan & Wisata" },
  { value: "education",   label: "📚 Pendidikan"          },
  { value: "sports",      label: "⚽ Olahraga & Fitness"  },
];

// ── Default Ideas ─────────────────────────────────────────────────────────────
const DEFAULT_IDEAS: MagicIdea[] = [
  {
    id: "di1",
    title: "Ekosistem Rumah Pintar Terintegrasi AI",
    description: "Ilustrasi konsep futuristik tentang interaksi manusia dengan sistem otomasi rumah cerdas berbasis AI. Sangat diminati agensi desain, startup IoT, dan editorial teknologi.",
    prompt: "A highly detailed flat vector illustration of a futuristic smart home automation system. A young developer standing in a minimalist living room, interacting with glowing holographic interface panels showing room temperature graphs, energy usage charts, home security map, and automated lighting controls. Deep corporate blue and neon white gradient color palette, isometric grid layout, elegant geometric shapes, isolated on white background, premium commercial stock design, wide establishing shot from eye-level perspective.",
    tags: ["smart home", "technology", "vector", "business", "IoT"],
    estimatedSales: "8,400+ downloads",
    difficulty: "Complex",
  },
  {
    id: "di2",
    title: "Nomad Digital & Remote Work Lifestyle",
    description: "Bestseller konsisten di kategori bisnis modern. Konversi lisensi 40% lebih tinggi dibanding fotografi studio untuk landing page SaaS dan produk produktivitas.",
    prompt: "A modern flat vector illustration of a digital nomad working on a laptop at an outdoor cafe table overlooking a sunny tropical beach. Surrounded by potted palm plants, a coconut water drink on the table, warm golden hour sunlight. Work-from-anywhere lifestyle, vibrant warm orange and teal color scheme, clean vector lines, top-down bird-eye flat-lay perspective view.",
    tags: ["remote work", "business", "travel", "lifestyle"],
    estimatedSales: "15,800+ downloads",
    difficulty: "Medium",
  },
  {
    id: "di3",
    title: "Energi Hijau & Keberlanjutan ESG",
    description: "Konten bertema ESG mengalami lonjakan lisensi 300% dari korporasi untuk laporan tahunan dan kampanye ramah lingkungan.",
    prompt: "Complex flat isometric vector illustration of a sustainable green energy ecosystem. Wind turbines on rolling green hills, large solar panel farm tracking the sun, smart electrical grid towers, modern electric vehicle charging station. Vibrant eco-friendly color palette, detailed geometric elements, extreme high-angle isometric 3D perspective view, perfect for corporate sustainability reports and annual ESG disclosures.",
    tags: ["sustainability", "energy", "environment", "ESG", "vector"],
    estimatedSales: "9,600+ downloads",
    difficulty: "Complex",
  },
  {
    id: "di4",
    title: "Meditasi & Mental Wellness Kontemporer",
    description: "Kategori terlaris top 5% dengan permintaan komersial konsisten untuk aplikasi kesehatan, editorial mindfulness, dan media sosial wellness.",
    prompt: "An elegant clean flat vector illustration of a calm faceless character in lotus meditation pose floating above a giant monstera leaf. Abstract organic pastel background shapes, soft floating orbs, botanical leaves in lavender mint green and coral. Peaceful minimal design, smooth gradients, extreme close-up macro portrait perspective, ideal for modern meditation app onboarding screen.",
    tags: ["wellness", "meditation", "mindfulness", "health"],
    estimatedSales: "12,200+ downloads",
    difficulty: "Easy",
  },
];

// ── Main Component ────────────────────────────────────────────────────────────
interface VectorCreatorProps {
  onTokensUpdated?: () => void;
}

export default function VectorCreator({ onTokensUpdated }: VectorCreatorProps = {}) {
  const [panelTab, setPanelTab]         = useState<PanelTab>("magic");
  const [faceless, setFaceless]         = useState(false);
  const [selectedArtTheme, setSelectedArtTheme]     = useState("vector");
  const [selectedConcept, setSelectedConcept]       = useState("business");
  const [customTheme, setCustomTheme]   = useState("");

  const [magicIdeas, setMagicIdeas]     = useState<MagicIdea[]>(DEFAULT_IDEAS);
  const [ideaCount, setIdeaCount]       = useState(6);
  const [ideaSortBy, setIdeaSortBy]     = useState<"default" | "sales" | "difficulty">("default");
  const [ideaFilterDiff, setIdeaFilterDiff] = useState<"All" | "Easy" | "Medium" | "Complex">("All");
  const [ideaSearchQuery, setIdeaSearchQuery] = useState("");

  const [isMagicking, setIsMagicking]   = useState(false);
  const [error, setError]               = useState("");
  const [copiedId, setCopiedId]         = useState("");
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null);
  const [sessionTokens, setSessionTokens] = useState({ prompt: 0, completion: 0, total: 0, requests: 0 });

  const trackTokens = useCallback((usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined) => {
    if (!usage) return;
    addUsage(usage.promptTokens, usage.completionTokens, "vector");
    setSessionTokens(prev => ({
      prompt:     prev.prompt + usage.promptTokens,
      completion: prev.completion + usage.completionTokens,
      total:      prev.total + usage.totalTokens,
      requests:   prev.requests + 1,
    }));
    onTokensUpdated?.();
  }, [onTokensUpdated]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(""), 2200);
    });
  };

  // ── handleMagic ──────────────────────────────────────────────────────────────
  const handleMagic = useCallback(async () => {
    setError(""); setIsMagicking(true);
    try {
      const artLabel = ART_THEMES.find(a => a.value === selectedArtTheme)?.label.replace(/[^\w\s]/gi, "").trim() || selectedArtTheme;
      const conceptLabel = CONCEPT_CATEGORIES.find(c => c.value === selectedConcept)?.label.replace(/[^\w\s]/gi, "").trim() || selectedConcept;
      const res = await fetch("/api/vector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "magic",
          payload: {
            artType: artLabel,
            concept: conceptLabel,
            customTheme: customTheme.trim(),
            faceless,
            count: ideaCount,
          }
        }),
      });
      if (!res.ok) throw new Error(await res.text() || "Gagal menghasilkan ide");
      const data = await res.json();
      if (data.success && Array.isArray(data.ideas) && data.ideas.length > 0) {
        setMagicIdeas(data.ideas);
        setIdeaSearchQuery("");
        setIdeaFilterDiff("All");
        setIdeaSortBy("default");
      } else if (data.error) {
        throw new Error(data.error);
      }
      trackTokens(data.usage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan saat generate ideas");
    } finally {
      setIsMagicking(false);
    }
  }, [selectedArtTheme, selectedConcept, customTheme, faceless, ideaCount, trackTokens]);

  // ── Auto-dismiss error ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 8000);
    return () => clearTimeout(t);
  }, [error]);

  // ── Filtered + sorted ideas ───────────────────────────────────────────────────
  const filteredIdeas = (() => {
    let list = [...magicIdeas];
    if (ideaFilterDiff !== "All") list = list.filter(i => i.difficulty === ideaFilterDiff);
    const q = ideaSearchQuery.toLowerCase();
    if (q) list = list.filter(i =>
      i.title.toLowerCase().includes(q) ||
      i.tags.some(t => t.toLowerCase().includes(q)) ||
      i.description.toLowerCase().includes(q)
    );
    if (ideaSortBy === "sales") {
      list.sort((a, b) => {
        const na = parseInt(a.estimatedSales.replace(/[^0-9]/g, "")) || 0;
        const nb = parseInt(b.estimatedSales.replace(/[^0-9]/g, "")) || 0;
        return nb - na;
      });
    } else if (ideaSortBy === "difficulty") {
      const ord: Record<string, number> = { Easy: 0, Medium: 1, Complex: 2 };
      list.sort((a, b) => (ord[a.difficulty] || 0) - (ord[b.difficulty] || 0));
    }
    return list;
  })();

  return (
    <div className="vc-container">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="vc-header">
        <div className="vc-header__title-group">
          <h1>
            ✨ Vector Ideas AI
            <span className="vc-header__pro-badge">PRO</span>
          </h1>
          <p className="vc-header__subtitle">
            Generator ide konten komersial berbasis AI · Anti-similarity · Adobe Stock-ready prompts
          </p>
        </div>
        <div className="vc-header__right">
          <div className="mon-tabs">
            {[
              { id: "magic"     as PanelTab, label: "✨ Ideas"     },
              { id: "analytics" as PanelTab, label: "📈 Analytics" },
            ].map(t => (
              <button key={t.id} type="button" onClick={() => setPanelTab(t.id)}
                className={`mon-tab ${panelTab === t.id ? "mon-tab--active" : ""}`}>
                {t.label}
              </button>
            ))}
          </div>
          {sessionTokens.total > 0 && (
            <div className="vc-token-badge">
              <span className="vc-token-badge__icon">⚡</span>
              <span className="vc-token-badge__label">Sesi ini:</span>
              <span className="vc-token-badge__value">{formatTokens(sessionTokens.total)}</span>
              <span className="vc-token-badge__reqs">· {sessionTokens.requests} req</span>
              <span className="vc-token-badge__cost">{estimateCost(sessionTokens.prompt, sessionTokens.completion)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Error ────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="vc-error" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>⚠️ {error}</span>
          <button type="button" onClick={() => setError("")}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MAGIC IDEAS TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {panelTab === "magic" && (
        <div className="vc-panel">

          {/* Header row */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
            <div>
              <h3 className="mon-section__title" style={{ fontSize: 18, margin: 0 }}>✨ AI Ideas Generator</h3>
              <p className="vc-header__subtitle" style={{ margin: "4px 0 0" }}>
                Ide prompt komersial anti-mirip · angle & konsep unik per kartu · Adobe Stock-ready
              </p>
            </div>
            <button
              type="button"
              onClick={handleMagic}
              disabled={isMagicking}
              className="btn btn--primary"
              style={{ background: isMagicking ? "rgba(123,90,224,0.5)" : "linear-gradient(135deg,#7b5ae0,#4a90e2)", minWidth: 190, height: 44, fontSize: 13, fontWeight: 700 }}
            >
              {isMagicking ? (
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                  Generating...
                </span>
              ) : "🔄 Generate AI Ideas"}
            </button>
          </div>

          {/* ── Filters Panel ─────────────────────────────────────────────── */}
          <div className="vc-panel" style={{ padding: "18px", background: "var(--bg-secondary)", gap: 16, marginBottom: 0 }}>

            {/* Custom Theme */}
            <div>
              <span className="vc-field-label">
                Tema Spesifik&nbsp;
                <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 11 }}>(Opsional — biarkan kosong agar AI bebas berkreasi)</span>
              </span>
              <input
                type="text"
                value={customTheme}
                onChange={e => setCustomTheme(e.target.value)}
                placeholder="Contoh: Kopi luar angkasa, Robot memasak ramen, Kota bawah laut..."
                className="vc-input"
                style={{ width: "100%" }}
              />
            </div>

            {/* Art Style (single-select) */}
            <div>
              <span className="vc-field-label">
                🎨 Tema / Art Style&nbsp;
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}>Pilih 1</span>
              </span>
              <div className="vc-chip-group" style={{ flexWrap: "wrap" }}>
                {ART_THEMES.map(theme => (
                  <button
                    key={theme.value}
                    type="button"
                    onClick={() => setSelectedArtTheme(theme.value)}
                    className={`vc-theme-chip ${selectedArtTheme === theme.value ? "vc-theme-chip--active" : ""}`}
                  >
                    {theme.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Concept (single-select) */}
            <div>
              <span className="vc-field-label">
                🗂️ Kategori Konsep&nbsp;
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}>Pilih 1</span>
              </span>
              <div className="vc-chip-group" style={{ flexWrap: "wrap" }}>
                {CONCEPT_CATEGORIES.map(concept => (
                  <button
                    key={concept.value}
                    type="button"
                    onClick={() => setSelectedConcept(concept.value)}
                    className={`vc-concept-chip ${selectedConcept === concept.value ? "vc-concept-chip--active" : ""}`}
                  >
                    {concept.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bottom row: count slider + faceless */}
            <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <span className="vc-field-label">
                  Jumlah Ide:&nbsp;<strong style={{ color: "#7b5ae0" }}>{ideaCount}</strong>
                </span>
                <input
                  type="range" min={3} max={12} step={1} value={ideaCount}
                  onChange={e => setIdeaCount(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#7b5ae0", marginTop: 6 }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                  {[3,6,9,12].map(n => <span key={n}>{n}</span>)}
                </div>
              </div>

              <div
                className={`vc-checkbox-container ${faceless ? "vc-checkbox-container--active" : ""}`}
                onClick={() => setFaceless(f => !f)}
                style={{ width: "fit-content", flexShrink: 0 }}
              >
                <div className="vc-checkbox">
                  <span className="vc-checkbox-checkmark">✓</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>😶 Karakter Faceless</span>
              </div>
            </div>
          </div>

          {/* ── Results Toolbar ─────────────────────────────────────────────── */}
          {magicIdeas.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "14px 0 10px", borderBottom: "1px solid var(--border)" }}>
              <input
                type="text"
                value={ideaSearchQuery}
                onChange={e => setIdeaSearchQuery(e.target.value)}
                placeholder="🔍 Cari judul, tag, atau deskripsi..."
                className="vc-input"
                style={{ flex: 1, minWidth: 180, height: 34, fontSize: 12 }}
              />
              <select
                value={ideaSortBy}
                onChange={e => setIdeaSortBy(e.target.value as typeof ideaSortBy)}
                className="vc-input"
                style={{ width: "auto", height: 34, fontSize: 12 }}
              >
                <option value="default">Urutan: Default</option>
                <option value="sales">Est. Sales ↓</option>
                <option value="difficulty">Difficulty ↑</option>
              </select>
              {(["All","Easy","Medium","Complex"] as const).map(d => (
                <button key={d} type="button" onClick={() => setIdeaFilterDiff(d)} style={{
                  fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
                  border: `1px solid ${ideaFilterDiff === d ? "#7b5ae0" : "var(--border)"}`,
                  background: ideaFilterDiff === d ? "#7b5ae0" : "transparent",
                  color: ideaFilterDiff === d ? "#fff" : "var(--text-secondary)", cursor: "pointer"
                }}>{d}</button>
              ))}
              <button
                type="button"
                onClick={() => copyToClipboard(
                  magicIdeas.map((idea, i) =>
                    `--- Idea ${i+1}: ${idea.title} ---\nDeskripsi: ${idea.description}\nPrompt: ${idea.prompt}\nTags: ${idea.tags.join(", ")}\nEst. Sales: ${idea.estimatedSales}`
                  ).join("\n\n"),
                  "all-ideas"
                )}
                className="btn btn--ghost"
                style={{ fontSize: 11, height: 34, paddingInline: 12, flexShrink: 0 }}
              >
                {copiedId === "all-ideas" ? "✓ Semua Disalin!" : "📋 Salin Semua"}
              </button>
              <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                {filteredIdeas.length} hasil
              </span>
            </div>
          )}

          {/* ── Ideas Grid ───────────────────────────────────────────────────── */}
          {isMagicking ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", gap: 18 }}>
              <div style={{ display: "flex", gap: 8 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    width: 12, height: 12, borderRadius: "50%", background: "#7b5ae0",
                    animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", textAlign: "center", maxWidth: 360 }}>
                AI sedang menganalisis dan membuat ide-ide unik yang anti-similarity, berbeda angle, berbeda konsep visual, dan 100% original...
              </p>
              <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-14px)} }`}</style>
            </div>
          ) : filteredIdeas.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-muted)", fontSize: 14 }}>
              😔 Tidak ada ide yang cocok dengan filter yang dipilih.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(310px,1fr))", gap: 16, marginTop: 14 }}>
              {filteredIdeas.map((idea, idx) => {
                const isExpanded = expandedIdeaId === idea.id;
                const diffColor = idea.difficulty === "Easy" ? "#22c55e" : idea.difficulty === "Medium" ? "#f59e0b" : "#ef4444";
                const diffBg    = idea.difficulty === "Easy" ? "rgba(34,197,94,0.08)" : idea.difficulty === "Medium" ? "rgba(245,158,11,0.08)" : "rgba(239,68,68,0.08)";
                const salesNum  = parseInt(idea.estimatedSales.replace(/[^0-9]/g, "")) || 0;
                const popPct    = Math.min(Math.round((salesNum / 20000) * 100), 100);
                const popColor  = popPct >= 70 ? "#22c55e" : popPct >= 40 ? "#f59e0b" : "#60a5fa";

                return (
                  <div key={idea.id} className="vc-idea-card" style={{ display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>

                    {/* Rank badge */}
                    <div style={{
                      position: "absolute", top: 12, right: 12,
                      background: "rgba(123,90,224,0.12)", border: "1px solid rgba(123,90,224,0.25)",
                      borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 800, color: "#7b5ae0"
                    }}>
                      #{idx + 1}
                    </div>

                    <div style={{ flex: 1 }}>
                      {/* Badges */}
                      <div style={{ display: "flex", gap: 7, marginBottom: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: diffBg, color: diffColor, border: `1px solid ${diffColor}33` }}>
                          {idea.difficulty === "Easy" ? "⚡ Easy" : idea.difficulty === "Medium" ? "🔥 Medium" : "💎 Complex"}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "rgba(34,197,94,0.07)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }}>
                          📦 {idea.estimatedSales}
                        </span>
                      </div>

                      {/* Title */}
                      <h4 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 7px 0", lineHeight: 1.4, paddingRight: 36 }}>
                        {idea.title}
                      </h4>

                      {/* Description */}
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65, margin: "0 0 12px 0" }}>
                        {idea.description}
                      </p>

                      {/* Popularity bar */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Popularitas Komersial</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: popColor }}>{popPct}%</span>
                        </div>
                        <div style={{ background: "var(--border)", borderRadius: 4, height: 5, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${popPct}%`, background: `linear-gradient(90deg,${popColor},${popColor}99)`, borderRadius: 4, transition: "width 0.7s ease" }} />
                        </div>
                      </div>

                      {/* Tags */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                        {idea.tags.map(tag => <span key={tag} className="keyword-tag">{tag}</span>)}
                      </div>

                      {/* Prompt Collapsible */}
                      <div className="vc-idea-prompt-box">
                        <div className="vc-idea-prompt-header" onClick={() => setExpandedIdeaId(isExpanded ? null : idea.id)}>
                          <span>📋 Lihat Prompt AI</span>
                          <span>{isExpanded ? "Tutup ▲" : "Tampilkan ▼"}</span>
                        </div>
                        {isExpanded && (
                          <div style={{ paddingTop: 10 }}>
                            <p className="vc-idea-prompt-text" style={{ marginBottom: 10 }}>{idea.prompt}</p>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button type="button" onClick={() => copyToClipboard(idea.prompt, idea.id)} className="btn btn--small btn--ghost" style={{ fontSize: 11 }}>
                                {copiedId === idea.id ? "✓ Disalin!" : "📋 Copy Prompt"}
                              </button>
                              <button type="button"
                                onClick={() => copyToClipboard(`${idea.title}\n\nDeskripsi: ${idea.description}\n\nPrompt: ${idea.prompt}\n\nTags: ${idea.tags.join(", ")}\nEst. Sales: ${idea.estimatedSales}`, `full-${idea.id}`)}
                                className="btn btn--small btn--ghost" style={{ fontSize: 11 }}>
                                {copiedId === `full-${idea.id}` ? "✓ Disalin!" : "📄 Copy Lengkap"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* CTA: copy to clipboard as ready-to-use prompt */}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(idea.prompt, `use-${idea.id}`)}
                      className="btn btn--primary w-full text-center"
                      style={{ marginTop: 14, background: "linear-gradient(135deg,#7b5ae0,#6366f1)" }}
                    >
                      {copiedId === `use-${idea.id}` ? "✓ Prompt Disalin!" : "📋 Salin Prompt untuk Digunakan →"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ANALYTICS TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {panelTab === "analytics" && (
        <div className="vc-panel">
          <div className="vc-header" style={{ marginBottom: 8 }}>
            <div>
              <h3 className="mon-section__title" style={{ fontSize: 18 }}>📈 Token Usage Analytics</h3>
              <p className="vc-header__subtitle">Penghitungan token akurat per platform — reset otomatis setiap hari.</p>
            </div>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}
            </span>
          </div>

          {(() => {
            const usage = getUsage();
            const pct = Math.min(Math.round((usage.totalTokens / 100_000) * 100), 100);
            const pctColor = pct >= 85 ? "#dc2626" : pct >= 60 ? "#d97706" : "#16a34a";
            const platforms: Platform[] = ["metadata", "chat", "vector"];
            return (
              <>
                <div className="mon-section" style={{ background: "rgba(74,144,226,0.05)", borderColor: "rgba(74,144,226,0.2)", padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Total Penggunaan Hari Ini</span>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color: pctColor }}>{pct}%</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>dari 100k limit</span>
                    </div>
                  </div>
                  <div style={{ background: "var(--border)", borderRadius: 8, height: 10, overflow: "hidden", marginBottom: 8 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: pctColor, borderRadius: 8, transition: "width 0.5s ease" }} />
                  </div>
                  <div style={{ display: "flex", height: 6, borderRadius: 4, overflow: "hidden", gap: 1, marginBottom: 12 }}>
                    {platforms.map(p => {
                      const w = usage.totalTokens > 0 ? (usage.byPlatform[p].totalTokens / usage.totalTokens) * 100 : 0;
                      const colors: Record<Platform, string> = { metadata: "#4a90e2", chat: "#7b5ae0", vector: "#16a34a" };
                      return <div key={p} style={{ width: `${w}%`, background: colors[p], transition: "width 0.5s" }} />;
                    })}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                    {[
                      { label: "Total Token", value: formatTokens(usage.totalTokens), sub: "hari ini" },
                      { label: "Input", value: formatTokens(usage.promptTokens), sub: "prompt" },
                      { label: "Output", value: formatTokens(usage.completionTokens), sub: "completion" },
                      { label: "Est. Cost", value: estimateCost(usage.promptTokens, usage.completionTokens), sub: "perkiraan" },
                    ].map(item => (
                      <div key={item.label} style={{ textAlign: "center", background: "var(--surface)", padding: "10px 8px", borderRadius: 8, border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>{item.value}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{item.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
                  {platforms.map(p => {
                    const pu = usage.byPlatform[p];
                    const colors: Record<Platform, string> = { metadata: "#4a90e2", chat: "#7b5ae0", vector: "#16a34a" };
                    const pPct = usage.totalTokens > 0 ? Math.round((pu.totalTokens / usage.totalTokens) * 100) : 0;
                    return (
                      <div key={p} style={{ background: "var(--surface)", border: `1px solid ${colors[p]}33`, borderRadius: 12, padding: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{getPlatformLabel(p)}</span>
                          <span style={{ fontSize: 11, color: colors[p], fontWeight: 700, background: `${colors[p]}18`, padding: "2px 8px", borderRadius: 999 }}>{pPct}% share</span>
                        </div>
                        <div style={{ background: "var(--border)", borderRadius: 4, height: 4, marginBottom: 12, overflow: "hidden" }}>
                          <div style={{ width: `${pPct}%`, height: "100%", background: colors[p], borderRadius: 4, transition: "width 0.5s" }} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          {[
                            { label: "Total", val: formatTokens(pu.totalTokens) },
                            { label: "Requests", val: pu.requestCount.toString() },
                            { label: "Input", val: formatTokens(pu.promptTokens) },
                            { label: "Output", val: formatTokens(pu.completionTokens) },
                          ].map(item => (
                            <div key={item.label} style={{ background: "var(--bg-secondary)", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)" }}>
                              <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>{item.label}</div>
                              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{item.val}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)", textAlign: "right" }}>
                          Est. {estimateCost(pu.promptTokens, pu.completionTokens)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {sessionTokens.total > 0 && (
                  <div style={{ background: "rgba(22,163,74,0.06)", border: "1px solid rgba(22,163,74,0.2)", borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#16a34a", marginBottom: 10 }}>⚡ Sesi Ini (Ideas Generator)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                      {[
                        { label: "Total Token", val: formatTokens(sessionTokens.total) },
                        { label: "Input", val: formatTokens(sessionTokens.prompt) },
                        { label: "Output", val: formatTokens(sessionTokens.completion) },
                        { label: "Requests", val: sessionTokens.requests.toString() },
                      ].map(item => (
                        <div key={item.label} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>{item.label}</div>
                          <div style={{ fontSize: 16, fontWeight: 900, color: "#16a34a", marginTop: 2 }}>{item.val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
                  Token reset otomatis setiap hari · Semua platform menggunakan API key Groq yang sama
                </p>
              </>
            );
          })()}
        </div>
      )}

    </div>
  );
}
