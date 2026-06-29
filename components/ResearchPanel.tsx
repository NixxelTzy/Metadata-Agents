"use client";

import { useMemo, useState } from "react";

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
        setCustomEvents(data.events);
        // Build links from queries generated by AI
        const queries = data.events.flatMap((e: any) => e.queries || []);
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
    <div className="uploader" style={{ paddingTop: 22 }}>
      <div className="uploader__hero" style={{ marginBottom: 18 }}>
        <h2>Riset Pasar Adobe Stock (AI Autopilot 100%)</h2>
        <p>
          Temukan ide, produk, konsep terlaris, dan template set foto dengan **volume penjualan ribuan unduhan**. 
          Seluruh modul riset menggunakan AI Groq Riset secara otomatis tanpa input URL wajib.
        </p>
      </div>

      {/* Tabs */}
      <div className="mon-tabs" style={{ paddingLeft: 0, paddingRight: 0 }}>
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
        <div style={{ color: "#ff4d4f", background: "rgba(255,77,79,0.1)", padding: 12, borderRadius: 8, marginTop: 12, fontSize: 13, border: "1px solid rgba(255,77,79,0.2)" }}>
          ⚠️ {searchError}
        </div>
      )}

      <div className="mon-body" style={{ paddingTop: 14 }}>
        
        {/* ─────────────────────────────────────────────────────────────────────
            TAB: CONCEPTS (Konsep Terlaris)
            ───────────────────────────────────────────────────────────────────── */}
        {tab === "concepts" && (
          <>
            <div className="mon-section" style={{ background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div className="mon-section__title">Kriteria Pencarian Konsep Volume Tinggi</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="field" style={{ marginBottom: 0 }}>
                  <div className="field__header"><label>Domain Kategori</label></div>
                  <input
                    value={domainCategory}
                    onChange={(e) => setDomainCategory(e.target.value)}
                    className="auth-field"
                    style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}
                  />
                </label>
                <label className="field" style={{ marginBottom: 0 }}>
                  <div className="field__header"><label>Target Audience</label></div>
                  <input
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    className="auth-field"
                    style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}
                  />
                </label>
              </div>

              <div style={{ marginTop: 10 }}>
                <label className="field" style={{ marginBottom: 0 }}>
                  <div className="field__header"><label>Style Visual</label></div>
                  <input
                    value={adjectiveStyle}
                    onChange={(e) => setAdjectiveStyle(e.target.value)}
                    style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}
                  />
                </label>
              </div>

              <div style={{ marginTop: 10 }}>
                <label className="field" style={{ marginBottom: 0 }}>
                  <div className="field__header"><label>Kata Kunci Tambahan</label></div>
                  <textarea
                    value={customKeywordsInput}
                    onChange={(e) => setCustomKeywordsInput(e.target.value)}
                    placeholder="pisahkan dengan koma (contoh: smart home, esg, eco friendly)"
                    style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)", minHeight: 60, background: "var(--surface)" }}
                  />
                </label>
              </div>

              <button
                type="button"
                className="btn btn--primary"
                disabled={isConceptsLoading}
                onClick={runStartSearchConcepts}
                style={{ marginTop: 14, width: "100%" }}
              >
                {isConceptsLoading ? "⏳ AI sedang meriset pasar penjualan ribuan unduhan..." : "🚀 Cari Konsep Volume Ribuan Unduhan"}
              </button>
            </div>

            <div className="mon-section">
              <div className="mon-section__title">Rekomendasi Konsep Terlaris (Penjualan Ribuan)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 12 }}>
                {displayConcepts.map((c) => (
                  <div key={c.id} className="result-card" style={{ flexDirection: "column", padding: 18, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14 }}>
                    
                    {/* Market Volume Indicators Dashboard */}
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginBottom: 12 }}>
                      <div style={{ background: "rgba(76,175,80,0.1)", border: "1px solid rgba(76,175,80,0.2)", padding: "6px 10px", borderRadius: 8, flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Estimasi Penjualan</div>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "#4caf50", marginTop: 2 }}>{c.estimatedSales || "3,000+ sales"}</div>
                      </div>
                      <div style={{ background: "rgba(74,144,226,0.1)", border: "1px solid rgba(74,144,226,0.2)", padding: "6px 10px", borderRadius: 8, flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Peluang Pasar</div>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "#4a90e2", marginTop: 2 }}>{c.opportunityScore || "94%"}</div>
                      </div>
                      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", padding: "6px 10px", borderRadius: 8, flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Kompetisi</div>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "var(--text)", marginTop: 2 }}>{c.competition || "Low"}</div>
                      </div>
                    </div>

                    <h3 style={{ fontSize: 16, fontWeight: 800, margin: "4px 0 6px 0", color: "var(--text)" }}>{c.title}</h3>
                    <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 12px 0", lineHeight: "1.5" }}>{c.hook}</p>

                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Artistic Angle Brief</span>
                      <p style={{ fontSize: 13, margin: "4px 0 0 0", color: "var(--text)", lineHeight: "1.4" }}>{c.angle}</p>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Fokus Objek & Properti</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 5 }}>
                        {c.subjects.map((s) => (
                          <span key={s} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", padding: "3px 8px", borderRadius: 6, fontSize: 11 }}>{s}</span>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Tag Meta Teroptimasi (Eng)</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        {c.keywords.slice(0, 8).map((k) => (
                          <span key={k} className="keyword-tag" style={{ fontSize: 10 }}>{k}</span>
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
            <div className="mon-section" style={{ background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div className="mon-section__title">Metode Riset Produk</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label className="field" style={{ marginBottom: 0 }}>
                  <div className="field__header">
                    <label>Referensi URL Foto (Opsional)</label>
                  </div>
                  <input
                    value={adobePhotoUrl}
                    onChange={(e) => setAdobePhotoUrl(e.target.value)}
                    placeholder="Kosongkan untuk mengaktifkan Autopilot Trend Discovery..."
                    style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}
                    disabled={isSearching}
                  />
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>
                    💡 Jika URL kosong, AI akan bekerja 100% otomatis menscan tren produk terlaris di pasar Adobe Stock.
                  </div>
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label className="field" style={{ marginBottom: 0 }}>
                    <div className="field__header"><label>Jumlah Query Hasil</label></div>
                    <select value={resultCount} onChange={(e) => setResultCount(Number(e.target.value) as any)} style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}>
                      <option value={5}>5 Query</option>
                      <option value={8}>8 Query</option>
                      <option value={12}>12 Query</option>
                    </select>
                  </label>
                  <label className="field" style={{ marginBottom: 0 }}>
                    <div className="field__header"><label>Tingkat Keketatan Detail</label></div>
                    <select value={moreSpecific ? "yes" : "no"} onChange={(e) => setMoreSpecific(e.target.value === "yes")} style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}>
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
            </div>

            {/* Narrative Analyst Dashboard (Autopilot/Discovery Output) */}
            {autopilotResult && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                  {autopilotResult.trendDiscovered && (
                    <div style={{ background: "linear-gradient(135deg, rgba(74,144,226,0.15) 0%, rgba(80,227,194,0.05) 100%)", border: "1px solid rgba(74,144,226,0.3)", borderRadius: 12, padding: 16 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: "#4a90e2", textTransform: "uppercase", letterSpacing: "0.08em" }}>🎯 Tren Terlaris Ditemukan</span>
                      <h3 style={{ margin: "5px 0 0 0", fontSize: 16, fontWeight: 900 }}>{autopilotResult.trendDiscovered}</h3>
                    </div>
                  )}
                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                    <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Est. Volume Penjualan</span>
                    <h3 style={{ margin: "4px 0 0 0", color: "#4caf50", fontSize: 18, fontWeight: 900 }}>{autopilotResult.estimatedSales || "3,200+ sales"}</h3>
                  </div>
                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                    <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Skor Peluang Pasar</span>
                    <h3 style={{ margin: "4px 0 0 0", color: "#4a90e2", fontSize: 18, fontWeight: 900 }}>{autopilotResult.opportunityScore || "94%"}</h3>
                  </div>
                </div>

                <div className="mon-section" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                  <div className="mon-section__title" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "#4a90e2" }}>📋 Analisis Pasar AI (Bahasa Indonesia)</div>
                  <p style={{ fontSize: 14, lineHeight: "1.6", color: "var(--text)", margin: 0, whiteSpace: "pre-wrap" }}>
                    {autopilotResult.narrative}
                  </p>
                </div>

                {adobeStockLinks.length > 0 && (
                  <div className="mon-section">
                    <div className="mon-section__title">Hasil Pencarian Terlaris (Open Search)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                      {adobeStockLinks.map((u, i) => (
                        <a
                          key={u}
                          href={u}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: 12,
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 10,
                            color: "var(--text)",
                            textDecoration: "none",
                            fontWeight: 700,
                            fontSize: 13,
                            transition: "all 0.2s"
                          }}
                          className="search-link-card"
                        >
                          <span>🔍 Link #{i + 1}</span>
                          <span style={{ color: "#4a90e2" }}>Buka →</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
                    <ul style={{ paddingLeft: 16, color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
                      {autopilotResult.complianceNotes.map((n, i) => (
                        <li key={i} style={{ marginTop: 6 }}>{n}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mon-section">
                  <div className="mon-section__title">Enriched Keyword Clusters</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 10 }}>
                    {autopilotResult.keywordClusters.map((c) => (
                      <div key={c.label} className="mon-section" style={{ padding: 12, background: "var(--surface)" }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#4a90e2" }}>{c.label}</div>
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
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 10 }}>
                    {autopilotResult.suggestedConcepts.map((c, i) => (
                      <div key={i} className="mon-section" style={{ padding: 12, background: "var(--surface)" }}>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>IDE SHOT #{i + 1}</div>
                        <div style={{ marginTop: 6, fontSize: 13 }}>{c}</div>
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
            <div className="mon-section" style={{ background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div className="mon-section__title">Parameter Riset Event (AI 100% Otomatis)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="field" style={{ marginBottom: 0 }}>
                  <div className="field__header"><label>Region Kancah</label></div>
                  <select value={eventRegion} onChange={(e) => setEventRegion(e.target.value)} style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}>
                    <option>Global</option>
                    <option>Indonesia</option>
                    <option>North America</option>
                    <option>Europe</option>
                    <option>Asia</option>
                  </select>
                </label>

                <label className="field" style={{ marginBottom: 0 }}>
                  <div className="field__header"><label>Timeline Kampanye</label></div>
                  <select value={eventSeason} onChange={(e) => setEventSeason(e.target.value)} style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}>
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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
              {displayEvents.map((ep) => (
                <div key={ep.id} className="mon-section" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 0 }}>
                  
                  {/* Event metrics card */}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 4, marginBottom: 12 }}>
                    <div style={{ background: "rgba(76,175,80,0.1)", padding: "4px 8px", borderRadius: 6, flex: 1, textAlign: "center" }}>
                      <span style={{ fontSize: 9, color: "var(--text-muted)", display: "block" }}>Downloads</span>
                      <strong style={{ fontSize: 12, color: "#4caf50" }}>{ep.estimatedSales || "2,000+"}</strong>
                    </div>
                    <div style={{ background: "rgba(74,144,226,0.1)", padding: "4px 8px", borderRadius: 6, flex: 1, textAlign: "center" }}>
                      <span style={{ fontSize: 9, color: "var(--text-muted)", display: "block" }}>Peluang</span>
                      <strong style={{ fontSize: 12, color: "#4a90e2" }}>{ep.opportunityScore || "89%"}</strong>
                    </div>
                  </div>

                  <div className="mon-section__title" style={{ color: "#4a90e2", fontSize: 15, margin: "0 0 10px 0" }}>{ep.name}</div>
                  <div style={{ fontSize: 13, marginBottom: 10 }}>📅 Timeline: <strong>{ep.window}</strong></div>

                  <div style={{ marginTop: 10 }}>
                    <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Photo Brief Ideas (AI Generated)</span>
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                      {ep.photoIdeas.map((p, i) => (
                        <div key={i} style={{ padding: 8, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}>
                          • {p}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Content Types</span>
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
            <div className="mon-section" style={{ background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div className="mon-section__title">Kriteria Perancangan Set Template</div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                <label className="field" style={{ marginBottom: 0 }}>
                  <div className="field__header"><label>Tema / Topik Set Foto</label></div>
                  <input
                    value={templateTheme}
                    onChange={(e) => setTemplateTheme(e.target.value)}
                    placeholder="Contoh: Sustainable Eco Office, AI Designer..."
                    style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}
                  />
                </label>
                <label className="field" style={{ marginBottom: 0 }}>
                  <div className="field__header"><label>Ukuran Set (Shots)</label></div>
                  <select value={templateSetSize} onChange={(e) => setTemplateSetSize(Number(e.target.value))} style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}>
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
                style={{ marginTop: 12, width: "100%" }}
              >
                {isTemplatesLoading ? "⏳ AI sedang merancang shot plan set..." : "📐 Rancang Template Set Foto"}
              </button>
            </div>

            {/* Custom AI Template Set Output */}
            {customTemplateSet && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div style={{ background: "rgba(74,144,226,0.05)", border: "1px solid rgba(74,144,226,0.2)", borderRadius: 12, padding: 16 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: "#4a90e2", textTransform: "uppercase" }}>📐 Tema Set</span>
                    <h3 style={{ margin: "5px 0 0 0", fontSize: 16, fontWeight: 900 }}>{customTemplateSet.theme}</h3>
                  </div>
                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                    <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Est. Download Set</span>
                    <h3 style={{ margin: "4px 0 0 0", color: "#4caf50", fontSize: 18, fontWeight: 900 }}>{customTemplateSet.estimatedSales || "2,400+ downloads"}</h3>
                  </div>
                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                    <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Skor Peluang</span>
                    <h3 style={{ margin: "4px 0 0 0", color: "#4a90e2", fontSize: 18, fontWeight: 900 }}>{customTemplateSet.opportunityScore || "91%"}</h3>
                  </div>
                </div>

                <div className="mon-section" style={{ background: "rgba(74,144,226,0.03)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                  <div className="mon-section__title" style={{ color: "#4a90e2" }}>📋 Narasi Desain Kreatif</div>
                  <p style={{ fontSize: 13, lineHeight: "1.6", color: "var(--text-muted)", margin: 0, whiteSpace: "pre-wrap" }}>
                    {customTemplateSet.narrative}
                  </p>
                </div>

                <div className="mon-section">
                  <div className="mon-section__title">Shot Plan List ({customTemplateSet.shotPlan.length} Shots)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                    {customTemplateSet.shotPlan.map((s, idx) => (
                      <div key={s.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 900, color: "#4a90e2" }}>SHOT #{idx + 1}</span>
                          <span style={{ fontSize: 11, textTransform: "uppercase", background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4 }}>{s.intent}</span>
                        </div>

                        <h4 style={{ margin: "10px 0 6px 0", fontSize: 14, fontWeight: 800 }}>{s.description}</h4>

                        <div style={{ fontSize: 12, marginTop: 8 }}>
                          <div>🎨 <strong>Komposisi:</strong> {s.composition}</div>
                          <div>💡 <strong>Pencahayaan:</strong> {s.lighting}</div>
                          {s.props.length > 0 && (
                            <div style={{ marginTop: 4 }}>📦 <strong>Props:</strong> {s.props.join(", ")}</div>
                          )}
                        </div>

                        <a href={s.url} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 12, fontSize: 12, color: "#4a90e2", textDecoration: "none", fontWeight: 700 }}>
                          Buka Link Pencarian →
                        </a>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="mon-section">
                    <div className="mon-section__title">Rekomendasi Set & Variasi</div>
                    <ul style={{ paddingLeft: 16, fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
                      {customTemplateSet.templateSuggestions.map((s, i) => (
                        <li key={i} style={{ marginTop: 6 }}>{s}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="mon-section">
                    <div className="mon-section__title">Tips Kepatuhan Legal & Brand</div>
                    <ul style={{ paddingLeft: 16, fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
                      {customTemplateSet.complianceTips.map((t, i) => (
                        <li key={i} style={{ marginTop: 6 }}>{t}</li>
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
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10 }}>
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
                      <div key={i} className="mon-section" style={{ padding: 12, background: "var(--surface)" }}>
                        <div style={{ fontWeight: 800, fontSize: 12 }}>Shot #{i + 1}</div>
                        <div style={{ marginTop: 6, fontSize: 13, color: "var(--text)" }}>{s}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mon-section">
                  <div className="mon-section__title">Set 2: Background variations (6 shots)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10 }}>
                    {[
                      "Same subject, cooler background",
                      "Same subject, warmer background",
                      "Different crop: top-down",
                      "Different crop: side profile",
                      "More negative space",
                      "Add prop texture detail",
                    ].map((s, i) => (
                      <div key={i} className="mon-section" style={{ padding: 12, background: "var(--surface)" }}>
                        <div style={{ fontWeight: 800, fontSize: 12 }}>Variant #{i + 1}</div>
                        <div style={{ marginTop: 6, fontSize: 13 }}>{s}</div>
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
