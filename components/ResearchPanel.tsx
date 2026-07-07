"use client";

import { useMemo, useState } from "react";
import EventsCalendarAndTimeline from "./EventsCalendarAndTimeline";


// Note: UI responsif berada di app/research-panel.css



type Concept = {
  id: string;
  title: string;
  hook: string;
  angle: string;
  subjects: string[];
  composition: string[];
  colors: string[];
  seasonality: string;
  keywords: string[];
  risk: "low" | "medium" | "high";
  estimatedSales?: string;
  opportunityScore?: string;
  competition?: "Low" | "Medium" | "High";
};

type EventPlan = {
  id: string;
  name: string;
  window: string;
  photoIdeas: string[];
  contentTypes: string[];
  recommendedShots: number;
  queries?: string[];
  estimatedSales?: string;
  opportunityScore?: string;
  category?: string;
  startDay?: number;
  endDay?: number;
  startDate?: string;
  endDate?: string;
  popularityPercent?: number;
  campaignPhase?: string;
  description?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function cleanUrl(u: string) {
  return u.trim();
}

function safeSplitKeywords(s: string) {
  return s
    .split(/[,\n]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function ResearchPanel() {
  const [tab, setTab] = useState<
    "concepts" | "product" | "events" | "templates"
  >("concepts");

  // Loading & State
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>("");
  const [adobeStockLinks, setAdobeStockLinks] = useState<string[]>([]);
  const [adobeStockQueries, setAdobeStockQueries] = useState<string[]>([]);
  const [resultCount, setResultCount] = useState<5 | 8 | 12>(5);
  const [moreSpecific, setMoreSpecific] = useState(true);

  // Autopilot/Discovered Product Research Result
  const [autopilotResult, setAutopilotResult] = useState<{
    isAutopilot: boolean;
    trendDiscovered?: string;
    angles: string[];
    keywordClusters: { label: string; keywords: string[] }[];
    suggestedConcepts: string[];
    complianceNotes: string[];
    narrative: string;
    estimatedSales?: string;
    opportunityScore?: string;
    competitionLevel?: string;
  } | null>(null);

  // Concepts Tab States
  const [domainCategory, setDomainCategory] = useState("Technology");
  const [targetAudience, setTargetAudience] = useState("Small businesses");
  const [adjectiveStyle, setAdjectiveStyle] = useState("modern, clean, minimal");
  const [customKeywordsInput, setCustomKeywordsInput] = useState("");
  const [customConcepts, setCustomConcepts] = useState<Concept[]>([]);
  const [isConceptsLoading, setIsConceptsLoading] = useState(false);

  // Events Tab States
  const [eventRegion, setEventRegion] = useState("Global");
  const [eventSeason, setEventSeason] = useState("Upcoming 3 months");
  const [customEvents, setCustomEvents] = useState<EventPlan[]>([]);
  const [isEventsLoading, setIsEventsLoading] = useState(false);

  // Templates Tab States
  const [templateTheme, setTemplateTheme] = useState("AI Coding Assistant Workspaces");
  const [templateSetSize, setTemplateSetSize] = useState<number>(8);
  const [customTemplateSet, setCustomTemplateSet] = useState<{
    theme: string;
    shotPlan: Array<{
      id: string;
      intent: string;
      description: string;
      composition: string;
      lighting: string;
      props: string[];
      query: string;
      url: string;
    }>;
    coverageNote: string;
    narrative: string;
    keywordClusters: Array<{ label: string; keywords: string[] }>;
    templateSuggestions: string[];
    complianceTips: string[];
    estimatedSales?: string;
    opportunityScore?: string;
  } | null>(null);
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);

  // Inputs
  const [adobePhotoUrl, setAdobePhotoUrl] = useState("");

  const buildAdobeStockSearchUrl = (query: string) => {
    const q = encodeURIComponent(query.trim());
    return `https://stock.adobe.com/search?k=${q}`;
  };

  // ───────────────────────────────────────────────────────────────────────────
  // HANDLER: Riset Produk (Autopilot atau URL)
  // ───────────────────────────────────────────────────────────────────────────
  const runStartSearchProduct = async () => {
    setSearchError("");
    setAdobeStockLinks([]);
    setAdobeStockQueries([]);
    setAutopilotResult(null);
    setIsSearching(true);

    const url = cleanUrl(adobePhotoUrl);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tab: "product",
          payload: {
            adobePhotoUrl: url || "",
            resultCount,
            moreSpecific,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text() || "Gagal menghubungi server riset produk");
      }

      const data = await res.json();
      if (data.success) {
        setAdobeStockLinks(data.links);
        setAdobeStockQueries(data.queries);
        setAutopilotResult({
          isAutopilot: data.isAutopilot,
          trendDiscovered: data.trendDiscovered,
          angles: data.angles,
          keywordClusters: data.keywordClusters,
          suggestedConcepts: data.suggestedConcepts,
          complianceNotes: data.complianceNotes,
          narrative: data.narrative,
          estimatedSales: data.estimatedSales,
          opportunityScore: data.opportunityScore,
          competitionLevel: data.competitionLevel,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal menjalankan riset produk";
      setSearchError(msg);
    } finally {
      setIsSearching(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // HANDLER: Riset Konsep Terlaris (Concepts)
  // ───────────────────────────────────────────────────────────────────────────
  const runStartSearchConcepts = async () => {
    setSearchError("");
    setIsConceptsLoading(true);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tab: "concepts",
          payload: {
            domainCategory,
            targetAudience,
            adjectiveStyle,
            customKeywords: customKeywordsInput,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text() || "Gagal menghubungi server riset konsep");
      }

      const data = await res.json();
      if (data.success && Array.isArray(data.concepts)) {
        setCustomConcepts(data.concepts);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal menjalankan riset konsep";
      setSearchError(msg);
    } finally {
      setIsConceptsLoading(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // HANDLER: Riset Template Set Foto (Templates)
  // ───────────────────────────────────────────────────────────────────────────
  const runStartSearchTemplates = async () => {
    setSearchError("");
    setCustomTemplateSet(null);
    setIsTemplatesLoading(true);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tab: "templates",
          payload: {
            templateTheme,
            setSize: templateSetSize,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text() || "Gagal menghubungi server riset template");
      }

      const data = await res.json();
      if (data.success) {
        setCustomTemplateSet(data);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal merancang template set";
      setSearchError(msg);
    } finally {
      setIsTemplatesLoading(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // HANDLER: Riset Event (AI 100% Otomatis)
  // ───────────────────────────────────────────────────────────────────────────
  const runStartSearchEvent = async () => {
    setSearchError("");
    setAdobeStockLinks([]);
    setCustomEvents([]);
    setIsEventsLoading(true);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tab: "events",
          payload: {
            eventRegion,
            eventSeason,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text() || "Gagal menghubungi server riset event");
      }

      const data = await res.json();
      if (data.success && Array.isArray(data.events)) {
        const normalized: EventPlan[] = data.events.map((e: any, idx: number) => {
          const startDay = Number(e?.startDay);
          const endDay = Number(e?.endDay);

          return {
            id: String(e?.id ?? `ev-${idx + 1}`),
            name: String(e?.name ?? `Event #${idx + 1}`),
            window:
              Number.isFinite(startDay) && Number.isFinite(endDay)
                ? `${Math.floor(startDay)} - ${Math.floor(endDay)}`
                : String(e?.window ?? `Event #${idx + 1}`),
            photoIdeas: Array.isArray(e?.photoIdeas) ? e.photoIdeas : [],
            contentTypes: Array.isArray(e?.contentTypes) ? e.contentTypes : [],
            recommendedShots: Number.isFinite(Number(e?.recommendedShots)) ? Number(e.recommendedShots) : 6,
            queries: Array.isArray(e?.queries) ? e.queries : [],
            estimatedSales: e?.estimatedSales ? String(e.estimatedSales) : undefined,
            opportunityScore: e?.opportunityScore ? String(e.opportunityScore) : undefined,
            category: e?.category ? String(e.category) : undefined,
            startDay: Number.isFinite(startDay) ? Math.floor(startDay) : undefined,
            endDay: Number.isFinite(endDay) ? Math.floor(endDay) : undefined,
            startDate: e?.startDate ? String(e.startDate) : undefined,
            endDate: e?.endDate ? String(e.endDate) : undefined,
            popularityPercent: Number.isFinite(Number(e?.popularityPercent)) ? Number(e.popularityPercent) : undefined,
            campaignPhase: e?.campaignPhase ? String(e.campaignPhase) : undefined,
            description: e?.description ? String(e.description) : undefined,
          };
        });

        setCustomEvents(normalized);

        // Build links from queries generated by AI
        const queries = normalized.flatMap((e) => e.queries || []);
        if (queries.length > 0) {
          const links = queries.map((q: string) => buildAdobeStockSearchUrl(q));
          setAdobeStockLinks(links.slice(0, 10));
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal menjalankan riset event";
      setSearchError(msg);
    } finally {
      setIsEventsLoading(false);
    }
  };

  // Fallback static data if AI hasn't been triggered yet
  const fallbackConcepts: Concept[] = useMemo(() => {
    return [
      {
        id: "c1",
        title: "AI-assisted workspace planning",
        hook: "Menceritakan kisah produktivitas modern berbasis kecerdasan buatan.",
        angle: "Workstation with digital design charts, soft side lighting, over the shoulder",
        subjects: ["laptop", "paper notes", "hands", "tablet"],
        composition: ["rule-of-thirds", "negative space for text"],
        colors: ["cool gray", "warm white"],
        seasonality: "evergreen",
        keywords: ["workspace", "productivity", "collaboration", "technology"],
        risk: "low",
        estimatedSales: "4,800+ downloads",
        opportunityScore: "96%",
        competition: "Low"
      },
      {
        id: "c2",
        title: "Sustainability Office Habit Setup",
        hook: "Konsep paperless & eco-friendly yang populer untuk promosi ESG perusahaan.",
        angle: "Flatlay of workspace with green plants, reusable mug, recycled notebook",
        subjects: ["glass bottle", "recycled paper", "plants"],
        composition: ["top-down flatlay", "balanced minimalist composition"],
        colors: ["sage green", "earthy brown"],
        seasonality: "Q1-Q4",
        keywords: ["eco-friendly", "sustainability", "workspace", "lifestyle"],
        risk: "low",
        estimatedSales: "3,200+ downloads",
        opportunityScore: "91%",
        competition: "Medium"
      }
    ];
  }, []);

  const displayConcepts = customConcepts.length > 0 ? customConcepts : fallbackConcepts;

  const fallbackEvents: EventPlan[] = useMemo(() => {
    return [
      {
        id: "e1",
        name: "Global Tech Summit & Developer Conference",
        window: "Upcoming 3 months",
        photoIdeas: [
          "speaker podium with abstract network graphics",
          "creative audience focusing on main stage presentation",
          "networking attendees holding digital developer badges"
        ],
        contentTypes: ["developer lifestyle", "innovation summit", "networking interaction"],
        recommendedShots: 8,
        estimatedSales: "2,500+ downloads",
        opportunityScore: "88%"
      }
    ];
  }, []);

  const displayEvents = customEvents.length > 0 ? customEvents : fallbackEvents;

  return (
    <div className="uploader research-panel rp-container">


      <div className="uploader__hero rp-hero">
        <h2>Riset Pasar Adobe Stock (AI Autopilot 100%)</h2>
        <p>
          Temukan ide, produk, konsep terlaris, dan template set foto dengan **volume penjualan ribuan unduhan**. 
          Seluruh modul riset menggunakan AI Groq Riset secara otomatis tanpa input URL wajib.
        </p>
      </div>

      {/* Tabs */}
      <div className="mon-tabs research-panel__tabs">

        <button className={`mon-tab ${tab === "concepts" ? "mon-tab--active" : ""}`} onClick={() => setTab("concepts")}>
          🔥 Konsep Terlaris (Ribuan Unduhan)
        </button>
        <button className={`mon-tab ${tab === "product" ? "mon-tab--active" : ""}`} onClick={() => setTab("product")}>
          🔍 Riset Produk (Autopilot)
        </button>
        <button className={`mon-tab ${tab === "events" ? "mon-tab--active" : ""}`} onClick={() => setTab("events")}>
          📅 Riset Event (AI Forecast)
        </button>
        <button className={`mon-tab ${tab === "templates" ? "mon-tab--active" : ""}`} onClick={() => setTab("templates")}>
          📐 Template Set Foto
        </button>
      </div>

      {searchError && (
        <div className="rp-error">
          ⚠️ {searchError}
        </div>
      )}

      <div className="mon-body research-panel__body rp-body">

        
        {/* ─────────────────────────────────────────────────────────────────────
            TAB: CONCEPTS (Konsep Terlaris)
            ───────────────────────────────────────────────────────────────────── */}
        {tab === "concepts" && (
          <>
            <div className="rp-form-panel">
              <div className="mon-section__title">Kriteria Pencarian Konsep Volume Tinggi</div>
              <div className="rp-grid-2">
                <label className="field">
                  <div className="field__header"><label>Domain Kategori</label></div>
                  <input
                    value={domainCategory}
                    onChange={(e) => setDomainCategory(e.target.value)}
                    className="rp-input"
                  />
                </label>
                <label className="field">
                  <div className="field__header"><label>Target Audience</label></div>
                  <input
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    className="rp-input"
                  />
                </label>
              </div>

              <label className="field">
                <div className="field__header"><label>Style Visual</label></div>
                <input
                  value={adjectiveStyle}
                  onChange={(e) => setAdjectiveStyle(e.target.value)}
                  className="rp-input"
                />
              </label>

              <label className="field">
                <div className="field__header"><label>Kata Kunci Tambahan</label></div>
                <textarea
                  value={customKeywordsInput}
                  onChange={(e) => setCustomKeywordsInput(e.target.value)}
                  placeholder="pisahkan dengan koma (contoh: smart home, esg, eco friendly)"
                  className="rp-textarea"
                />
              </label>

              <button
                type="button"
                className="btn btn--primary"
                disabled={isConceptsLoading}
                onClick={runStartSearchConcepts}
              >
                {isConceptsLoading ? "⏳ AI sedang meriset pasar penjualan ribuan unduhan..." : "🚀 Cari Konsep Volume Ribuan Unduhan"}
              </button>
            </div>

            <div className="mon-section">
              <div className="mon-section__title">Rekomendasi Konsep Terlaris (Penjualan Ribuan)</div>
              <div className="rp-card-grid">
                {displayConcepts.map((c) => (
                  <div key={c.id} className="rp-concept-card">
                    
                    {/* Market Volume Indicators Dashboard */}
                    <div className="rp-stats-bar">
                      <div className="rp-stat-item" style={{ background: "rgba(76,175,80,0.1)", border: "1px solid rgba(76,175,80,0.2)" }}>
                        <span className="rp-stat-item__label">Estimasi Penjualan</span>
                        <strong className="rp-stat-item__value" style={{ color: "#4caf50" }}>{c.estimatedSales || "3,000+ sales"}</strong>
                      </div>
                      <div className="rp-stat-item" style={{ background: "rgba(74,144,226,0.1)", border: "1px solid rgba(74,144,226,0.2)" }}>
                        <span className="rp-stat-item__label">Peluang Pasar</span>
                        <strong className="rp-stat-item__value" style={{ color: "#4a90e2" }}>{c.opportunityScore || "94%"}</strong>
                      </div>
                      <div className="rp-stat-item" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}>
                        <span className="rp-stat-item__label">Kompetisi</span>
                        <strong className="rp-stat-item__value" style={{ color: "var(--text)" }}>{c.competition || "Low"}</strong>
                      </div>
                    </div>

                    <h3 className="rp-concept-card__title">{c.title}</h3>
                    <p className="rp-concept-card__hook">{c.hook}</p>

                    <div className="rp-concept-card__section">
                      <span className="rp-concept-card__section-title">Artistic Angle Brief</span>
                      <p>{c.angle}</p>
                    </div>

                    <div className="rp-concept-card__section">
                      <span className="rp-concept-card__section-title">Fokus Objek & Properti</span>
                      <div className="rp-concept-card__tags">
                        {c.subjects.map((s) => (
                          <span key={s} className="rp-tag">{s}</span>
                        ))}
                      </div>
                    </div>

                    <div className="rp-concept-card__section">
                      <span className="rp-concept-card__section-title">Tag Meta Teroptimasi (Eng)</span>
                      <div className="rp-concept-card__tags">
                        {c.keywords.slice(0, 8).map((k) => (
                          <span key={k} className="keyword-tag">{k}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ─────────────────────────────────────────────────────────────────────
            TAB: PRODUCT (Riset Produk Autopilot)
            ───────────────────────────────────────────────────────────────────── */}
        {tab === "product" && (
          <>
            <div className="rp-form-panel">
              <div className="mon-section__title">Metode Riset Produk</div>
              <label className="field">
                <div className="field__header">
                  <label>Referensi URL Foto (Opsional)</label>
                </div>
                <input
                  value={adobePhotoUrl}
                  onChange={(e) => setAdobePhotoUrl(e.target.value)}
                  placeholder="Kosongkan untuk mengaktifkan Autopilot Trend Discovery..."
                  className="rp-input"
                  disabled={isSearching}
                />
                <div className="rp-input-hint">
                  💡 Jika URL kosong, AI akan bekerja 100% otomatis menscan tren produk terlaris di pasar Adobe Stock.
                </div>
              </label>

              <div className="rp-grid-2">
                <label className="field">
                  <div className="field__header"><label>Jumlah Query Hasil</label></div>
                  <select value={resultCount} onChange={(e) => setResultCount(Number(e.target.value) as any)} className="rp-select">
                    <option value={5}>5 Query</option>
                    <option value={8}>8 Query</option>
                    <option value={12}>12 Query</option>
                  </select>
                </label>
                <label className="field">
                  <div className="field__header"><label>Tingkat Keketatan Detail</label></div>
                  <select value={moreSpecific ? "yes" : "no"} onChange={(e) => setMoreSpecific(e.target.value === "yes")} className="rp-select">
                    <option value="yes">Hyper-Specific (Commercial)</option>
                    <option value="no">General (Broad)</option>
                  </select>
                </label>
              </div>

                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={isSearching}
                  onClick={runStartSearchProduct}
                >
                  {isSearching ? "⏳ AI sedang menganalisis & menyusun metadata..." : !adobePhotoUrl ? "✨ Jalankan Riset Autopilot" : "🔍 Riset Berdasarkan Gambar"}
                </button>
            </div>

            {/* Narrative Analyst Dashboard (Autopilot/Discovery Output) */}
            {autopilotResult && (
              <>
                <div className="rp-dashboard-grid">

                  {autopilotResult.trendDiscovered && (

                    <div className="rp-highlight-card">
                      <span className="rp-highlight-card__label">🎯 Tren Terlaris Ditemukan</span>
                      <h3 className="rp-highlight-card__title">{autopilotResult.trendDiscovered}</h3>
                    </div>
                  )}
                  <div className="rp-metric-card">
                    <span className="rp-metric-card__label">Est. Volume Penjualan</span>
                    <h3 className="rp-metric-card__value" style={{ color: "#4caf50" }}>{autopilotResult.estimatedSales || "3,200+ sales"}</h3>
                  </div>
                  <div className="rp-metric-card">
                    <span className="rp-metric-card__label">Skor Peluang Pasar</span>
                    <h3 className="rp-metric-card__value" style={{ color: "#4a90e2" }}>{autopilotResult.opportunityScore || "94%"}</h3>
                  </div>
                </div>

                <div className="rp-narrative-section">
                  <div className="mon-section__title">📋 Analisis Pasar AI (Bahasa Indonesia)</div>
                  <p>
                    {autopilotResult.narrative}
                  </p>
                </div>

                {adobeStockLinks.length > 0 && (
                  <div className="mon-section">
                    <div className="mon-section__title">Hasil Pencarian Terlaris (Open Search)</div>
                    <div className="rp-search-link-grid">
                      {adobeStockLinks.map((u, i) => (
                        <a
                          key={u}
                          href={u}
                          target="_blank"
                          rel="noreferrer"
                          className="rp-search-link"
                        >
                          <span>🔍 Link #{i + 1}</span>
                          <span className="rp-search-link__arrow">Buka →</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rp-grid-2">
                  <div className="mon-section" style={{ marginBottom: 0 }}>
                    <div className="mon-section__title">Angle Visual yang Laku</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {autopilotResult.angles.map((a, i) => (
                        <div key={i} className="mon-info-row" style={{ alignItems: "flex-start" }}>
                          <span style={{ color: "#4a90e2", fontWeight: 800, marginRight: 6 }}>#{i + 1}</span>
                          <span style={{ fontSize: 13 }}>{a}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mon-section" style={{ marginBottom: 0 }}>
                    <div className="mon-section__title">Compliance & Standar Kualitas</div>
                    <ul className="rp-list">
                      {autopilotResult.complianceNotes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mon-section">
                  <div className="mon-section__title">Enriched Keyword Clusters</div>
                  <div className="rp-cluster-card-grid">
                    {autopilotResult.keywordClusters.map((c) => (
                      <div key={c.label} className="mon-section rp-cluster-card">
                        <div className="rp-cluster-card__label">{c.label}</div>
                        <div className="keywords" style={{ marginTop: 8 }}>
                          {c.keywords.map((k) => (
                            <span key={k} className="keyword-tag">{k}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mon-section">
                  <div className="mon-section__title">Rencana Pembuatan Set Foto (Derivasi Konsep)</div>
                  <div className="rp-idea-card-grid">
                    {autopilotResult.suggestedConcepts.map((c, i) => (
                      <div key={i} className="mon-section rp-idea-card">
                        <div className="rp-idea-card__label">IDE SHOT #{i + 1}</div>
                        <div className="rp-idea-card__text">{c}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ─────────────────────────────────────────────────────────────────────
            TAB: EVENTS (Riset Event AI)
            ───────────────────────────────────────────────────────────────────── */}
        {tab === "events" && (
          <>
            <div className="rp-form-panel">
              <div className="mon-section__title">Parameter Riset Event (AI 100% Otomatis)</div>
              <div className="rp-grid-2">
                <label className="field">
                  <div className="field__header"><label>Region Kancah</label></div>
                  <select value={eventRegion} onChange={(e) => setEventRegion(e.target.value)} className="rp-select">
                    <option>Global</option>
                    <option>Indonesia</option>
                    <option>North America</option>
                    <option>Europe</option>
                    <option>Asia</option>
                  </select>
                </label>

                <label className="field">
                  <div className="field__header"><label>Timeline Kampanye</label></div>
                  <select value={eventSeason} onChange={(e) => setEventSeason(e.target.value)} className="rp-select">
                    <option>Upcoming 3 months</option>
                    <option>Next 6 months</option>
                    <option>Next 12 months</option>
                    <option>Seasonal campaigns</option>
                  </select>
                </label>

                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={isEventsLoading}
                  onClick={runStartSearchEvent}
                  style={{ gridColumn: "1 / -1", marginTop: 10 }}
                >
                  {isEventsLoading ? "⏳ AI sedang memprediksi & mengumpulkan tren event..." : "🚀 Prediksikan Event Terpopuler"}
                </button>
              </div>
            </div>

            {adobeStockLinks.length > 0 && (
              <div className="mon-section">
                <div className="mon-section__title">Link Hasil Pencarian Event</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {adobeStockLinks.map((u, i) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" className="keyword-tag" style={{ textDecoration: "none", color: "#4a90e2", fontWeight: 700, padding: 8 }}>
                      🔍 Event Link #{i + 1}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <EventsCalendarAndTimeline events={displayEvents} />

            <div className="rp-card-grid">
              {displayEvents.map((ep) => (
                <div key={ep.id} className="rp-event-card">
                  <div className="rp-event-card__metrics">
                    <div className="rp-event-card__metric rp-event-card__metric--sales">
                      <span className="rp-event-card__metric-label">Downloads</span>
                      <strong className="rp-event-card__metric-value">{ep.estimatedSales || "2,000+"}</strong>
                    </div>
                    <div className="rp-event-card__metric rp-event-card__metric--opportunity">
                      <span className="rp-event-card__metric-label">Peluang</span>
                      <strong className="rp-event-card__metric-value">{ep.opportunityScore || "89%"}</strong>
                    </div>
                    <div className="rp-event-card__metric" style={{ background: "rgba(255,255,255,0.03)" }}>
                      <span className="rp-event-card__metric-label">Popularity</span>
                      <strong className="rp-event-card__metric-value" style={{ color: "#fbbf24" }}>
                        {ep.popularityPercent !== undefined ? `${Math.round(ep.popularityPercent)}%` : "N/A"}
                      </strong>
                    </div>
                  </div>

                  <div className="mon-section__title rp-event-card__title">{ep.name}</div>
                  <div className="rp-event-card__timeline">
                    📅 Timeline: <strong>{ep.startDay && ep.endDay ? `${ep.startDay} - ${ep.endDay}` : ep.window}</strong>
                  </div>

                  <div className="rp-concept-card__section">
                    <span className="rp-concept-card__section-title">Photo Brief Ideas (AI Generated)</span>
                    <div className="rp-event-card__ideas">
                      {ep.photoIdeas.map((p, i) => (
                        <div key={i} className="rp-event-card__idea-item">• {p}</div>
                      ))}
                    </div>
                  </div>

                  <div className="rp-concept-card__section">
                    <span className="rp-concept-card__section-title">Content Types</span>
                    <div className="keywords" style={{ marginTop: 6 }}>
                      {ep.contentTypes.map((k) => (
                        <span key={k} className="keyword-tag" style={{ fontSize: 10 }}>{k}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ─────────────────────────────────────────────────────────────────────
            TAB: TEMPLATES (Template Set Foto)
            ───────────────────────────────────────────────────────────────────── */}
        {tab === "templates" && (
          <>
            <div className="rp-form-panel">
              <div className="mon-section__title">Kriteria Perancangan Set Template</div>
              <div className="rp-grid-2" style={{ gridTemplateColumns: "2fr 1fr" }}>
                <label className="field">
                  <div className="field__header"><label>Tema / Topik Set Foto</label></div>
                  <input
                    value={templateTheme}
                    onChange={(e) => setTemplateTheme(e.target.value)}
                    placeholder="Contoh: Sustainable Eco Office, AI Designer..."
                    className="rp-input"
                  />
                </label>
                <label className="field">
                  <div className="field__header"><label>Ukuran Set (Shots)</label></div>
                  <select value={templateSetSize} onChange={(e) => setTemplateSetSize(Number(e.target.value))} className="rp-select">
                    <option value={6}>6 Shots</option>
                    <option value={8}>8 Shots (Standar)</option>
                    <option value={10}>10 Shots</option>
                    <option value={12}>12 Shots (Kompleks)</option>
                  </select>
                </label>
              </div>

              <button
                type="button"
                className="btn btn--primary"
                disabled={isTemplatesLoading}
                onClick={runStartSearchTemplates}
              >
                {isTemplatesLoading ? "⏳ AI sedang merancang shot plan set..." : "📐 Rancang Template Set Foto"}
              </button>
            </div>

            {/* Custom AI Template Set Output */}
            {customTemplateSet && (
              <>
                <div className="rp-dashboard-grid">

                  <div className="rp-highlight-card">
                    <span className="rp-highlight-card__label">📐 Tema Set</span>
                    <h3 className="rp-highlight-card__title">{customTemplateSet.theme}</h3>
                  </div>
                  <div className="rp-metric-card">
                    <span className="rp-metric-card__label">Est. Download Set</span>
                    <h3 className="rp-metric-card__value" style={{ color: "#4caf50" }}>{customTemplateSet.estimatedSales || "2,400+ downloads"}</h3>
                  </div>
                  <div className="rp-metric-card">
                    <span className="rp-metric-card__label">Skor Peluang</span>
                    <h3 className="rp-metric-card__value" style={{ color: "#4a90e2" }}>{customTemplateSet.opportunityScore || "91%"}</h3>
                  </div>
                </div>

                <div className="rp-narrative-section" style={{ background: "rgba(74,144,226,0.03)" }}>
                  <div className="mon-section__title" style={{ color: "#4a90e2" }}>📋 Narasi Desain Kreatif</div>
                  <p style={{ color: "var(--text-muted)" }}>
                    {customTemplateSet.narrative}
                  </p>
                </div>

                <div className="mon-section">
                  <div className="mon-section__title">Shot Plan List ({customTemplateSet.shotPlan.length} Shots)</div>
                  <div className="rp-shot-card-grid">
                    {customTemplateSet.shotPlan.map((s, idx) => (
                      <div key={s.id} className="rp-shot-card">
                        <div className="rp-shot-card__header">
                          <span className="rp-shot-card__id">SHOT #{idx + 1}</span>
                          <span className="rp-shot-card__intent">{s.intent}</span>
                        </div>

                        <h4 className="rp-shot-card__title">{s.description}</h4>

                        <div className="rp-shot-card__details">
                          <div>🎨 <strong>Komposisi:</strong> {s.composition}</div>
                          <div>💡 <strong>Pencahayaan:</strong> {s.lighting}</div>
                          {s.props.length > 0 && (
                            <div>📦 <strong>Props:</strong> {s.props.join(", ")}</div>
                          )}
                        </div>

                        <a href={s.url} target="_blank" rel="noreferrer" className="rp-shot-card__link">
                          Buka Link Pencarian →
                        </a>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rp-grid-2">
                  <div className="mon-section">
                    <div className="mon-section__title">Rekomendasi Set & Variasi</div>
                    <ul className="rp-list">
                      {customTemplateSet.templateSuggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="mon-section">
                    <div className="mon-section__title">Tips Kepatuhan Legal & Brand</div>
                    <ul className="rp-list">
                      {customTemplateSet.complianceTips.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            )}

            {/* Static Default Fallback if no custom template set generated */}
            {!customTemplateSet && (
              <>
                <div className="mon-section">
                  <div className="mon-section__title">Set 1: Decision + Action (8 shots)</div>
                  <div className="rp-fallback-card-grid">
                    {[
                      "Close detail: hands + device",
                      "Medium: workspace anchor",
                      "Screen metaphor: blurred UI",
                      "Notebook notes + pen",
                      "Coffee + time marker",
                      "Wide: negative space banner area",
                      "Angle: diagonal composition",
                      "Texture: cable / paper / keyboard",
                    ].map((s, i) => (
                      <div key={i} className="mon-section rp-fallback-card">
                        <div className="rp-fallback-card__title">Shot #{i + 1}</div>
                        <div className="rp-fallback-card__text">{s}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mon-section">
                  <div className="mon-section__title">Set 2: Background variations (6 shots)</div>
                  <div className="rp-fallback-card-grid">
                    {[
                      "Same subject, cooler background",
                      "Same subject, warmer background",
                      "Different crop: top-down",
                      "Different crop: side profile",
                      "More negative space",
                      "Add prop texture detail",
                    ].map((s, i) => (
                      <div key={i} className="mon-section rp-fallback-card">
                        <div className="rp-fallback-card__title">Variant #{i + 1}</div>
                        <div className="rp-fallback-card__text">{s}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
