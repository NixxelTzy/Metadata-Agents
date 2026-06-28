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
};

type EventPlan = {
  id: string;
  name: string;
  window: string;
  photoIdeas: string[];
  contentTypes: string[];
  recommendedShots: number;
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

  // Auto-search state (placeholder behavior)
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>("");
  const [adobeStockLinks, setAdobeStockLinks] = useState<string[]>([]);

  const buildAdobeStockSearchUrl = (query: string) => {
    // Note: This project does not do scraping/crawling.
    // We generate a search URL the user can open.
    const q = encodeURIComponent(query.trim());
    // Use a stable query/search page pattern.
    return `https://www.adobestock.com/search/?k=${q}`;
  };

  const extractKeywordsHeuristic = (url: string) => {
    // Very small heuristic: use query tokens from URL slug/path.
    // This is a fallback for when AI isn't available.
    try {
      const clean = url
        .replace(/^https?:\/\//i, "")
        .replace(/[^a-z0-9]+/gi, " ")
        .trim()
        .toLowerCase();
      const parts = clean.split(/\s+/).filter(Boolean);
      // Take unique-ish tokens (cap)
      return Array.from(new Set(parts)).slice(0, 6);
    } catch {
      return [] as string[];
    }
  };

  const runStartSearchProduct = async () => {
    setSearchError("");
    setAdobeStockLinks([]);

    const url = cleanUrl(adobePhotoUrl);
    if (!url) {
      setSearchError("Masukkan URL photo terlebih dulu.");
      return;
    }

    setIsSearching(true);
    try {
      // Build queries (AI first). If AI fails, fallback to heuristic.
      const fallbackTokens = extractKeywordsHeuristic(url);

      // Use existing AI endpoint (/api/generate) to create search query strings.
      // We cannot scrape AdobeStock; we only generate search queries.
      const prompt = {
        queryType: "adobestock-search-queries",
        target: "product",
        input: { adobePhotoUrl: url },
        instructions:
          "Generate 5 concise Adobe Stock search queries in English. Avoid punctuation. Return ONLY JSON: { queries: string[] } with exactly 5 strings."
      };

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: JSON.stringify(prompt),
            },
          ],
        }),
      });

      let queries: string[] = [];
      if (res.ok) {
        const data = (await res.json()) as { content?: string };
        const text = data?.content ?? "";
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]) as { queries?: string[] };
          if (Array.isArray(parsed.queries) && parsed.queries.length) {
            queries = parsed.queries.slice(0, 5).map((q) => String(q).trim()).filter(Boolean);
          }
        }
      }

      if (!queries.length) {
        const base = fallbackTokens.length ? fallbackTokens.join(" ") : "stock photo concept";
        queries = [
          base,
          `${base} minimal workspace`,
          `${base} business technology`,
          `${base} office hands`,
          `${base} modern lifestyle`,
        ];
      }

      const links = queries.map((q) => buildAdobeStockSearchUrl(q));
      setAdobeStockLinks(links);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal menjalankan riset produk";
      setSearchError(msg);
    } finally {
      setIsSearching(false);
    }
  };

  const runStartSearchEvent = async () => {
    setSearchError("");
    setAdobeStockLinks([]);

    setIsSearching(true);
    try {
      const selectedName = eventPlans[0]?.name ?? "event";
      const prompt = {
        queryType: "adobestock-search-queries",
        target: "event",
        input: {
          eventRegion,
          eventSeason,
          eventName: selectedName,
        },
        instructions:
          "Generate 5 concise Adobe Stock search queries in English for event photos. Return ONLY JSON: { queries: string[] } with exactly 5 strings."
      };

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "user", content: JSON.stringify(prompt) },
          ],
        }),
      });

      let queries: string[] = [];
      if (res.ok) {
        const data = (await res.json()) as { content?: string };
        const text = data?.content ?? "";
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]) as { queries?: string[] };
          if (Array.isArray(parsed.queries) && parsed.queries.length) {
            queries = parsed.queries.slice(0, 5).map((q) => String(q).trim()).filter(Boolean);
          }
        }
      }

      if (!queries.length) {
        const base = `${eventRegion} ${eventSeason} event`;
        queries = [
          base,
          `${base} webinar conference`,
          `${base} audience collaboration`,
          `${base} business event lifestyle`,
          `${base} modern meeting scene`,
        ];
      }

      const links = queries.map((q) => buildAdobeStockSearchUrl(q));
      setAdobeStockLinks(links);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal menjalankan riset event";
      setSearchError(msg);
    } finally {
      setIsSearching(false);
    }
  };

  // Inputs
  const [domainCategory, setDomainCategory] = useState("Technology");
  const [targetAudience, setTargetAudience] = useState("Small businesses");
  const [adjectiveStyle, setAdjectiveStyle] = useState("modern, clean, minimal");
  const [adobePhotoUrl, setAdobePhotoUrl] = useState("");

  const [eventRegion, setEventRegion] = useState("Global");
  const [eventSeason, setEventSeason] = useState("Upcoming 3 months");

  const [customKeywordsInput, setCustomKeywordsInput] = useState("");

  const concepts: Concept[] = useMemo(() => {
    // Deterministic but feels "complex" via structure.
    const base = domainCategory.toLowerCase();
    const isTech = base.includes("tech") || base.includes("ai") || base.includes("software");

    const list: Concept[] = [
      {
        id: "c1",
        title: isTech
          ? "AI-assisted workspace planning"
          : "Handcrafted workflow in a modern space",
        hook: "Turn planning into a visible, sellable story",
        angle: isTech
          ? "A crisp workstation with AI-like UI elements (screens, cards, labels)"
          : "A tangible workflow: notes, devices, and a clean setting",
        subjects: isTech
          ? ["laptop", "smart screen", "paper notes", "hands"]
          : ["hands", "tablet", "paper", "workspace"],
        composition: [
          "rule-of-thirds",
          "foreground hands",
          "diagonal desk lines",
          "negative space for copy",
        ],
        colors: ["cool gray", "warm white", "accent blue"],
        seasonality: "evergreen",
        keywords: [
          "workflow",
          "workspace",
          "planning",
          "productivity",
          "digital",
          "collaboration",
          "strategy",
          "teamwork",
          "technology",
          "minimal",
        ],
        risk: "low",
      },
      {
        id: "c2",
        title: "Remote decision moment"
        ,
        hook: "Show action, not just tools",
        angle: "A remote meeting-style scene with focus on decision-making",
        subjects: ["monitor", "video call", "notebook", "coffee"],
        composition: [
          "cinematic crop",
          "center focus",
          "soft depth of field",
          "leading lines",
        ],
        colors: ["neutral beige", "soft navy", "warm light"],
        seasonality: "Q1–Q4",
        keywords: [
          "remote",
          "decision",
          "strategy",
          "meeting",
          "team",
          "work",
          "communication",
          "comfort",
          "focus",
          "home office",
        ],
        risk: "medium",
      },
      {
        id: "c3",
        title: "Data-to-clarity storytelling"
        ,
        hook: "Make analytics feel human",
        angle: "A clean visual metaphor: charts on screen + human interpretation",
        subjects: ["charts", "screen", "hands", "sticky notes"],
        composition: [
          "screen as anchor",
          "foreground cue",
          "balanced margins",
          "texture details",
        ],
        colors: ["charcoal", "light gray", "graph green"],
        seasonality: "evergreen",
        keywords: [
          "analytics",
          "insight",
          "clarity",
          "data",
          "reporting",
          "strategy",
          "business",
          "technology",
          "minimal design",
          "modern",
        ],
        risk: "low",
      },
      {
        id: "c4",
        title: "Sustainable habit routine"
        ,
        hook: "Lifestyle that converts",
        angle: "A natural, lifestyle scene with reusable items and calm composition",
        subjects: ["mug", "notebook", "reusable bottle", "morning light"],
        composition: [
          "soft window light",
          "gentle shadows",
          "lifestyle framing",
          "text-friendly space",
        ],
        colors: ["earth tones", "cream", "sage"],
        seasonality: "spring/summer",
        keywords: [
          "sustainability",
          "habit",
          "lifestyle",
          "eco",
          "morning",
          "minimal",
          "self care",
          "reusable",
          "wellbeing",
          "environment",
        ],
        risk: "medium",
      },
    ];

    // Inject user custom keywords (lightly) to make it feel tailored.
    const custom = safeSplitKeywords(customKeywordsInput);
    if (custom.length) {
      return list.map((c, idx) => {
        if (idx % 2 === 0) {
          const next = [...c.keywords, ...custom.slice(0, 5)];
          // unique + cap
          const uniq = Array.from(new Set(next)).slice(0, 12);
          return { ...c, keywords: uniq };
        }
        return c;
      });
    }

    return list;
  }, [domainCategory, customKeywordsInput]);

  const eventPlans: EventPlan[] = useMemo(() => {
    const regionHint = eventRegion === "Global" ? "Worldwide" : eventRegion;
    return [
      {
        id: "e1",
        name: "Tech Conference / Webinar cycle",
        window: eventSeason,
        photoIdeas: [
          "speaker podium + clean signage",
          "audience looking at screen",
          "hands holding conference badge",
          "coffee + notebook near laptop",
        ],
        contentTypes: ["event lifestyle", "office tech", "audience interaction"],
        recommendedShots: clamp(6, 4, 10),
      },
      {
        id: "e2",
        name: "Product Launch & Demo Day",
        window: "Monthly recurring",
        photoIdeas: [
          "hands presenting a device mockup",
          "team collaboration around a whiteboard",
          "clean booth scene with product focus",
          "user testing with calm lighting",
        ],
        contentTypes: ["product concept", "teamwork", "innovation"],
        recommendedShots: 8,
      },
      {
        id: "e3",
        name: "Sustainability awareness week",
        window: "Seasonal campaigns",
        photoIdeas: [
          `reusable items on desk (${regionHint})`,
          "community clean-up vibe (non-identifiable)",
          "eco labels on simple packaging",
          "nature light + calm productivity",
        ],
        contentTypes: ["eco lifestyle", "wellbeing", "community"],
        recommendedShots: 7,
      },
    ];
  }, [eventRegion, eventSeason]);

  const productResearch = useMemo(() => {
    const url = cleanUrl(adobePhotoUrl);
    if (!url) {
      return {
        summary: "Paste URL Adobe Stock (photo) untuk analisis pola konten.",
        angles: [] as string[],
        keywordClusters: [] as { label: string; keywords: string[] }[],
        suggestedConcepts: [] as string[],
        complianceNotes: [] as string[],
        urlDetected: false,
      };
    }

    const urlDetected = url.includes("adobestock") || url.includes("Adobe Stock");

    const angles = [
      "Identify dominant subject and replicate *the relationship*, not the exact scene.",
      "Extract lighting style: soft window / studio top light / high contrast.",
      "Capture composition template: rule-of-thirds anchor + negative space.",
      "Infer use-case: business presentation / lifestyle blog / campaign banner.",
    ];

    const keywordClusters = [
      {
        label: "Core subject",
        keywords: ["workspace", "technology", "teamwork", "productivity", "planning"],
      },
      {
        label: "Design & visual",
        keywords: ["minimal", "clean layout", "soft light", "modern", "depth of field"],
      },
      {
        label: "Use-case",
        keywords: ["business", "presentation", "strategy", "remote work", "launch"],
      },
      {
        label: "Audience",
        keywords: ["small business", "startup", "marketer", "developer", "manager"],
      },
    ];

    const suggestedConcepts = [
      "Create a 4-shot set: close detail → medium workspace → hands interaction → wide negative space.",
      "Make one concept from the *same template* but with different color accents for banner variations.",
      "Produce an infographic-like shot where the screen acts as a visual metaphor.",
    ];

    const complianceNotes = [
      "Jangan tiru persis karya atau identitas: variasi komposisi & konteks.",
      "Gunakan model/objek generik bila memungkinkan (hindari branding/teks berhak cipta).",
      "Fokus ke konsep dan kebutuhan buyer: readability + use-case.",
    ];

    return {
      summary: urlDetected
        ? "URL terdeteksi. Buat analisis konten: angle, komposisi, dan klaster keyword yang bisa dijual."
        : "URL sudah diisi. Jika domain bukan adobestock, tetap gunakan sebagai referensi pola visual.",
      angles,
      keywordClusters,
      suggestedConcepts,
      complianceNotes,
      urlDetected,
    };
  }, [adobePhotoUrl]);

  return (
    <div className="uploader" style={{ paddingTop: 22 }}>
      <div className="uploader__hero" style={{ marginBottom: 18 }}>
        <h2>Riset Adobe Stock</h2>
        <p>
          Platform riset untuk menemukan ide yang laku: konsep, riset produk dari URL photo, riset event,
          dan template pembuatan set foto.
        </p>
      </div>

      {/* Top tabs */}
      <div className="mon-tabs" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <button className={`mon-tab ${tab === "concepts" ? "mon-tab--active" : ""}`} onClick={() => setTab("concepts")}>
          Konsep yang laku
        </button>
        <button className={`mon-tab ${tab === "product" ? "mon-tab--active" : ""}`} onClick={() => setTab("product")}>
          Riset produk (URL photo)
        </button>
        <button className={`mon-tab ${tab === "events" ? "mon-tab--active" : ""}`} onClick={() => setTab("events")}>
          Riset event
        </button>
        <button className={`mon-tab ${tab === "templates" ? "mon-tab--active" : ""}`} onClick={() => setTab("templates")}>
          Template set
        </button>
      </div>

      <div className="mon-body" style={{ paddingTop: 14 }}>
        {tab === "concepts" && (
          <>
            <div className="mon-section">
              <div className="mon-section__title">Input riset</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="field" style={{ marginBottom: 0 }}>
                  <div className="field__header">
                    <label>Domain kategori</label>
                  </div>
                  <input
                    value={domainCategory}
                    onChange={(e) => setDomainCategory(e.target.value)}
                    className="auth-field"
                    style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)" }}
                  />
                </label>
                <label className="field" style={{ marginBottom: 0 }}>
                  <div className="field__header">
                    <label>Target audience</label>
                  </div>
                  <input
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    className="auth-field"
                    style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)" }}
                  />
                </label>
              </div>

              <div style={{ marginTop: 10 }}>
                <label className="field" style={{ marginBottom: 0 }}>
                  <div className="field__header">
                    <label>Style visual yang diinginkan</label>
                  </div>
                  <input
                    value={adjectiveStyle}
                    onChange={(e) => setAdjectiveStyle(e.target.value)}
                    style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)" }}
                  />
                </label>
              </div>

              <div style={{ marginTop: 10 }}>
                <label className="field" style={{ marginBottom: 0 }}>
                  <div className="field__header">
                    <label>Keyword tambahan (opsional)</label>
                  </div>
                  <textarea
                    value={customKeywordsInput}
                    onChange={(e) => setCustomKeywordsInput(e.target.value)}
                    placeholder="pisahkan dengan koma"
                    style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)", minHeight: 82 }}
                  />
                </label>
              </div>
            </div>

            <div className="mon-section" style={{ padding: 16 }}>
              <div className="mon-section__title">Rekomendasi konsep</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
                {concepts.map((c) => (
                  <div key={c.id} className="result-card" style={{ flexDirection: "column" }}>
                    <div className="result-card__body" style={{ width: "100%" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{c.title}</h3>
                        <span className="result-card__meta-tag">
                          Risiko: {c.risk}
                        </span>
                      </div>
                      <p style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 13 }}>{c.hook}</p>

                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Angle
                        </div>
                        <div style={{ fontSize: 13, marginTop: 4 }}>{c.angle}</div>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Subjects
                        </div>
                        <div className="keywords" style={{ marginTop: 6 }}>
                          {c.subjects.map((s) => (
                            <span key={s} className="keyword-tag">{s}</span>
                          ))}
                        </div>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Keywords snapshot
                        </div>
                        <div className="keywords" style={{ marginTop: 6 }}>
                          {c.keywords.map((k) => (
                            <span key={k} className="keyword-tag">{k}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 12 }}>
                Catatan: keyword di atas adalah “starter pack”. Biasanya buyer membutuhkan set foto konsisten agar metadata terlihat natural.
              </div>
            </div>
          </>
        )}

        {tab === "product" && (
          <>
            <div className="mon-section">
              <div className="mon-section__title">Riset produk via Adobe Stock URL</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                <label className="field" style={{ marginBottom: 0 }}>
                  <div className="field__header">
                    <label>Masukkan URL photo</label>
                  </div>
                  <input
                    value={adobePhotoUrl}
                    onChange={(e) => setAdobePhotoUrl(e.target.value)}
                    placeholder="https://www.adobestock.com/..."
                    style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)" }}
                    disabled={isSearching}
                  />
                </label>

                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {productResearch.summary}
                </div>

                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={isSearching || !cleanUrl(adobePhotoUrl)}
                  onClick={runStartSearchProduct}
                >
                  {isSearching ? "⏳ Start Riset..." : "▶ Start Riset Produk"}
                </button>
              </div>
            </div>

            {adobeStockLinks.length > 0 && (
              <div className="mon-section">
                <div className="mon-section__title">Hasil pencarian (buka URL)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {adobeStockLinks.map((u, i) => (
                    <div key={u} className="mon-info-row" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                      <span style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 12 }}>#{i + 1}</span>
                      <a href={u} target="_blank" rel="noreferrer" style={{ color: "var(--text)", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
                        Buka hasil pencarian
                      </a>
                    </div>
                  ))}

                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button type="button" className="btn btn--secondary" onClick={() => window.open(adobeStockLinks[0], "_blank")}>
                      Buka 1st
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => setAdobeStockLinks([])}>
                      Hapus hasil
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mon-section">
              <div className="mon-section__title">Angle yang bisa diulang</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {productResearch.angles.map((a, i) => (
                  <div key={i} className="mon-info-row">
                    <span>#{i + 1}</span>
                    <span style={{ fontFamily: "inherit", color: "var(--text)" }}>{a}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mon-section">
              <div className="mon-section__title">Klaster keyword (komersial)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 10 }}>
                {productResearch.keywordClusters.map((c) => (
                  <div key={c.label} className="mon-section" style={{ padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{c.label}</div>
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
              <div className="mon-section__title">Konsep turunan (set foto)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
                {productResearch.suggestedConcepts.map((c, i) => (
                  <div key={i} className="mon-section" style={{ padding: 12 }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700 }}>Idea #{i + 1}</div>
                    <div style={{ marginTop: 6, fontSize: 13 }}>{c}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mon-section">
              <div className="mon-section__title">Compliance & kualitas</div>
              <ul style={{ marginLeft: 18, color: "var(--text-muted)", fontSize: 13 }}>
                {productResearch.complianceNotes.map((n, i) => (
                  <li key={i} style={{ marginTop: 6 }}>{n}</li>
                ))}
              </ul>
            </div>
          </>
        )}

        {tab === "events" && (
          <>
            <div className="mon-section">
              <div className="mon-section__title">Riset event</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="field" style={{ marginBottom: 0 }}>
                  <div className="field__header">
                    <label>Region</label>
                  </div>
                  <select
                    value={eventRegion}
                    onChange={(e) => setEventRegion(e.target.value)}
                    style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}
                    disabled={isSearching}
                  >
                    <option>Global</option>
                    <option>Indonesia</option>
                    <option>North America</option>
                    <option>Europe</option>
                    <option>Middle East</option>
                    <option>Asia</option>
                  </select>
                </label>

                <label className="field" style={{ marginBottom: 0 }}>
                  <div className="field__header">
                    <label>Timeline</label>
                  </div>
                  <select
                    value={eventSeason}
                    onChange={(e) => setEventSeason(e.target.value)}
                    style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}
                    disabled={isSearching}
                  >
                    <option>Upcoming 3 months</option>
                    <option>Next 6 months</option>
                    <option>Next 12 months</option>
                    <option>Seasonal campaigns</option>
                  </select>
                </label>

                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={isSearching}
                  onClick={runStartSearchEvent}
                  style={{ gridColumn: "1 / -1" }}
                >
                  {isSearching ? "⏳ Start Riset..." : "▶ Start Riset Event"}
                </button>
              </div>
            </div>

            {adobeStockLinks.length > 0 && (
              <div className="mon-section">
                <div className="mon-section__title">Hasil pencarian (buka URL)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {adobeStockLinks.map((u, i) => (
                    <div key={u} className="mon-info-row" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                      <span style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 12 }}>#{i + 1}</span>
                      <a href={u} target="_blank" rel="noreferrer" style={{ color: "var(--text)", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
                        Buka hasil pencarian
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {eventPlans.map((ep) => (
              <div key={ep.id} className="mon-section">
                <div className="mon-section__title">{ep.name}</div>
                <div className="mon-info-row">
                  <span>Window</span>
                  <span>{ep.window}</span>
                </div>
                <div className="mon-info-row">
                  <span>Rekomendasi shot</span>
                  <span>{ep.recommendedShots}x</span>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Photo ideas
                  </div>
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                    {ep.photoIdeas.map((p, i) => (
                      <div key={i} className="mon-empty" style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 10, textAlign: "left" }}>
                        • {p}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Content types
                  </div>
                  <div className="keywords" style={{ marginTop: 8 }}>
                    {ep.contentTypes.map((k) => (
                      <span key={k} className="keyword-tag">{k}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "templates" && (
          <>
            <div className="mon-section">
              <div className="mon-section__title">Template set foto (kompleks)</div>
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                Pakai template ini untuk membuat satu ide menjadi “portfolio set” sehingga metadata terlihat konsisten dan mengurangi risiko sebagian foto gagal terisi.
              </div>
            </div>

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
                  <div key={i} className="mon-section" style={{ padding: 12 }}>
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
                  <div key={i} className="mon-section" style={{ padding: 12 }}>
                    <div style={{ fontWeight: 800, fontSize: 12 }}>Variant #{i + 1}</div>
                    <div style={{ marginTop: 6, fontSize: 13 }}>{s}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

