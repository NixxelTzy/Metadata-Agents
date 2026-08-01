"use client";

import { useState, useEffect } from "react";

interface Contributor {
  name: string;
  avatarText: string;
  lifetimeDownloads: string;
  profileUrl: string;
  topSellingSubjects: string[];
  previews?: string[];
}

interface ChartPoint {
  day: string;
  downloads: number;
  conversionRate: number;
}

interface InsightData {
  summary: string;
  overallSuccessRate: string;
  totalEstimatedDownloads: string;
  opportunityScore: string;
  competitionLevel: string;
  weeklyGrowth: string;
  topKeywords: string[];
  topContributors: Contributor[];
  chartData: ChartPoint[];
  suggestedConcepts: string[];
}

const DEFAULT_URL = "https://contributor.stock.adobe.com/en/insights/best/contributors";

// Stock preview image presets per category to match the Adobe Stock screenshot
const PREVIEW_IMAGES: Record<string, string[]> = {
  Photos: [
    "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=400&q=80",
    "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&q=80",
    "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400&q=80",
    "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&q=80",
    "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&q=80",
    "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=80",
    "https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=400&q=80",
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&q=80",
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&q=80",
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80"
  ],
  Illustrations: [
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80",
    "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=400&q=80",
    "https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=400&q=80",
    "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400&q=80",
    "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=400&q=80",
    "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=400&q=80",
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80",
    "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=400&q=80",
    "https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=400&q=80",
    "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400&q=80"
  ],
  Vectors: [
    "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=400&q=80",
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80",
    "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=400&q=80",
    "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=400&q=80",
    "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80",
    "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=400&q=80",
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80",
    "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=400&q=80",
    "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=400&q=80",
    "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80"
  ]
};

export default function ResearchPanel() {
  const [targetUrl, setTargetUrl] = useState(DEFAULT_URL);
  const [category, setCategory] = useState<"Photos" | "Illustrations" | "Vectors">("Photos");
  const [dateRange, setDateRange] = useState("Jul 20 - Jul 26");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  // Result state
  const [data, setData] = useState<InsightData | null>({
    summary: "Penjualan teratas didominasi oleh arsitektur minimalis 3D, struktur fasad geometris bersih, dan foto ruang kerja komersial.",
    overallSuccessRate: "96.4%",
    totalEstimatedDownloads: "18,400+ downloads",
    opportunityScore: "94%",
    competitionLevel: "Low Competition / High Demand",
    weeklyGrowth: "+34% vs minggu lalu",
    topKeywords: [
      "architecture geometry",
      "minimalist 3d",
      "white facade",
      "modern building",
      "clean lines",
      "abstract texture",
      "commercial workspace",
      "sustainable design"
    ],
    topContributors: [
      {
        name: "ilham",
        avatarText: "I",
        lifetimeDownloads: "1,000+",
        profileUrl: "https://contributor.stock.adobe.com/en/insights/best/contributors",
        topSellingSubjects: ["Abstract Architectural Lines", "Minimalist White Facade", "3D Curved Ribbed Structure"]
      },
      {
        name: "creative_studio",
        avatarText: "C",
        lifetimeDownloads: "5,400+",
        profileUrl: "https://contributor.stock.adobe.com/en/insights/best/contributors",
        topSellingSubjects: ["Modern Corporate Workspace", "Data Analytics UI Overlay", "Technology Teamwork"]
      },
      {
        name: "visual_pro",
        avatarText: "V",
        lifetimeDownloads: "3,200+",
        profileUrl: "https://contributor.stock.adobe.com/en/insights/best/contributors",
        topSellingSubjects: ["Eco Friendly Green Building", "Futuristic Office Desk", "Clean Geometric Pattern"]
      }
    ],
    chartData: [
      { day: "Jul 20", downloads: 1400, conversionRate: 91 },
      { day: "Jul 21", downloads: 1850, conversionRate: 93 },
      { day: "Jul 22", downloads: 2200, conversionRate: 95 },
      { day: "Jul 23", downloads: 2750, conversionRate: 97 },
      { day: "Jul 24", downloads: 3100, conversionRate: 98 },
      { day: "Jul 25", downloads: 2900, conversionRate: 96 },
      { day: "Jul 26", downloads: 3300, conversionRate: 99 }
    ],
    suggestedConcepts: [
      "Fasad Arsitektur Minimalis Serba Putih",
      "Gelombang Ribbon 3D Abstrak Modern",
      "Meja Kerja Bisnis Teknologi Terang",
      "Struktur Bangunan Geometris Berkelanjutan"
    ]
  });

  const runResearch = async () => {
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tab: "insight",
          payload: {
            url: targetUrl,
            category,
            dateRange
          }
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Gagal melakukan riset insight.");
      }

      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan riset");
    } finally {
      setIsLoading(false);
    }
  };

  // Run initial research on mount if needed
  useEffect(() => {
    runResearch();
  }, [category, dateRange]);

  const copyLink = () => {
    navigator.clipboard.writeText(targetUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const previewList = PREVIEW_IMAGES[category] || PREVIEW_IMAGES.Photos;

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "16px", color: "var(--text)" }}>
      {/* ── TOP HEADER (Adobe Stock Contributor Insights Style) ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "20px",
          paddingBottom: "16px",
          borderBottom: "1px solid var(--border)"
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: "800", margin: 0, letterSpacing: "-0.02em" }}>
              Recent top sellers
            </h1>
            {/* Date range display */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                padding: "4px 12px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: "600"
              }}
            >
              <span>📅</span>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text)",
                  fontWeight: "600",
                  fontSize: "13px",
                  cursor: "pointer",
                  outline: "none"
                }}
              >
                <option value="Jul 20 - Jul 26">Jul 20 - Jul 26</option>
                <option value="Jul 27 - Aug 02">Jul 27 - Aug 02</option>
                <option value="Aug 01 - Aug 07">Aug 01 - Aug 07</option>
                <option value="Last 30 Days">Last 30 Days</option>
              </select>
            </div>

            <a
              href={targetUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: "13px",
                color: "#4a90e2",
                textDecoration: "none",
                fontWeight: "600",
                marginLeft: "8px"
              }}
            >
              How it works ↗
            </a>
          </div>
          <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "var(--text-muted)" }}>
            Platform Riset Produk & Contributor Insights Otomatis Adobe Stock
          </p>
        </div>

        {/* Start Research Action Button */}
        <button
          type="button"
          onClick={runResearch}
          disabled={isLoading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "linear-gradient(135deg, #0066FF 0%, #00C8FF 100%)",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            padding: "10px 20px",
            fontSize: "14px",
            fontWeight: "700",
            cursor: isLoading ? "wait" : "pointer",
            boxShadow: "0 4px 14px rgba(0, 102, 255, 0.3)",
            transition: "all 0.2s"
          }}
        >
          {isLoading ? <span className="spinner" /> : "🚀"}
          {isLoading ? "Memproses Riset AI..." : "Mulai Riset Insight"}
        </button>
      </div>

      {/* ── TARGET LINK INPUT & DISPLAY ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          padding: "10px 14px",
          borderRadius: "10px",
          marginBottom: "20px",
          flexWrap: "wrap"
        }}
      >
        <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase" }}>
          Target Link:
        </span>
        <input
          type="text"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          style={{
            flex: 1,
            minWidth: "260px",
            background: "transparent",
            border: "none",
            color: "#4a90e2",
            fontSize: "13px",
            fontWeight: "600",
            outline: "none",
            textDecoration: "underline"
          }}
        />
        <button
          type="button"
          onClick={copyLink}
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "4px 10px",
            fontSize: "12px",
            color: "var(--text)",
            cursor: "pointer"
          }}
        >
          {copiedLink ? "✓ Copied" : "📋 Salin Link"}
        </button>
        <a
          href={targetUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "4px 10px",
            fontSize: "12px",
            color: "var(--text)",
            textDecoration: "none",
            fontWeight: "600"
          }}
        >
          🌐 Buka Link
        </a>
      </div>

      {/* ── CATEGORY TABS (Photos | Illustrations | Vectors) ── */}
      <div
        style={{
          display: "flex",
          gap: "24px",
          borderBottom: "2px solid var(--border)",
          marginBottom: "24px",
          paddingBottom: "2px"
        }}
      >
        {(["Photos", "Illustrations", "Vectors"] as const).map((tabItem) => {
          const isActive = category === tabItem;
          return (
            <button
              key={tabItem}
              type="button"
              onClick={() => setCategory(tabItem)}
              style={{
                background: "none",
                border: "none",
                padding: "8px 0",
                fontSize: "16px",
                fontWeight: isActive ? "800" : "500",
                color: isActive ? "#0066FF" : "var(--text-muted)",
                cursor: "pointer",
                borderBottom: isActive ? "3px solid #0066FF" : "3px solid transparent",
                marginBottom: "-2px",
                transition: "all 0.15s"
              }}
            >
              {tabItem}
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "rgba(255,77,79,0.1)", border: "1px solid rgba(255,77,79,0.3)", borderRadius: "8px", color: "#ff4d4f", marginBottom: "20px", fontSize: "13px" }}>
          ❌ {error}
        </div>
      )}

      {/* ── METRICS & GRAFIK KEBERHASILAN (Success Graphics & Charts) ── */}
      {data && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              marginBottom: "24px"
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, rgba(0,102,255,0.1) 0%, rgba(0,200,255,0.05) 100%)",
                border: "1px solid rgba(0,102,255,0.25)",
                borderRadius: "12px",
                padding: "16px"
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "#0066FF" }}>
                Grafik Keberhasilan / Success Rate
              </div>
              <div style={{ fontSize: "24px", fontWeight: "900", marginTop: "4px", color: "var(--text)" }}>
                {data.overallSuccessRate}
              </div>
              <div style={{ fontSize: "11px", color: "#4caf50", fontWeight: "600", marginTop: "2px" }}>
                {data.weeklyGrowth}
              </div>
            </div>

            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "16px"
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)" }}>
                Total Penjualan / Downloads
              </div>
              <div style={{ fontSize: "24px", fontWeight: "900", marginTop: "4px" }}>
                {data.totalEstimatedDownloads}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                Estimasi periode {dateRange}
              </div>
            </div>

            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "16px"
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)" }}>
                Skor Peluang Pasar (Opportunity)
              </div>
              <div style={{ fontSize: "24px", fontWeight: "900", marginTop: "4px", color: "#00C8FF" }}>
                {data.opportunityScore}
              </div>
              <div style={{ fontSize: "11px", color: "#4caf50", fontWeight: "600", marginTop: "2px" }}>
                {data.competitionLevel}
              </div>
            </div>
          </div>

          {/* ── VISUAL CHART GRAFIK PENJUALAN MINGGUAN ── */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "20px",
              marginBottom: "28px"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: "700", margin: 0 }}>
                📈 Grafik Tren Penjualan Harian ({category} · {dateRange})
              </h3>
              <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "500" }}>
                Tingkat Konversi Rata-rata: 95.8%
              </span>
            </div>

            {/* SVG Interactive Chart */}
            <div style={{ width: "100%", height: "140px", position: "relative" }}>
              <svg width="100%" height="100%" viewBox="0 0 700 120" preserveAspectRatio="none" style={{ overflow: "visible" }}>
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0066FF" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#0066FF" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {/* Background Grid Lines */}
                <line x1="0" y1="20" x2="700" y2="20" stroke="var(--border)" strokeDasharray="4 4" />
                <line x1="0" y1="60" x2="700" y2="60" stroke="var(--border)" strokeDasharray="4 4" />
                <line x1="0" y1="100" x2="700" y2="100" stroke="var(--border)" strokeDasharray="4 4" />

                {/* Filled Area */}
                <path
                  d="M 0 100 L 0 80 L 100 60 L 200 45 L 300 25 L 400 10 L 500 20 L 600 5 L 700 5 L 700 100 Z"
                  fill="url(#chartGradient)"
                />
                {/* Line Path */}
                <path
                  d="M 0 80 L 100 60 L 200 45 L 300 25 L 400 10 L 500 20 L 600 5 L 700 5"
                  fill="none"
                  stroke="#0066FF"
                  strokeWidth="3"
                />
                {/* Data Points */}
                {[
                  { x: 0, y: 80, val: "1.4k" },
                  { x: 100, y: 60, val: "1.85k" },
                  { x: 200, y: 45, val: "2.2k" },
                  { x: 300, y: 25, val: "2.75k" },
                  { x: 400, y: 10, val: "3.1k" },
                  { x: 500, y: 20, val: "2.9k" },
                  { x: 700, y: 5, val: "3.3k" }
                ].map((pt, idx) => (
                  <g key={idx}>
                    <circle cx={pt.x} cy={pt.y} r="5" fill="#00C8FF" stroke="#fff" strokeWidth="2" />
                    <text x={pt.x} y={pt.y - 10} textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontWeight="600">
                      {pt.val}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", fontSize: "11px", color: "var(--text-muted)", fontWeight: "600" }}>
              {data.chartData?.map((cd, idx) => (
                <span key={idx}>{cd.day}</span>
              )) || (
                <>
                  <span>Jul 20</span>
                  <span>Jul 21</span>
                  <span>Jul 22</span>
                  <span>Jul 23</span>
                  <span>Jul 24</span>
                  <span>Jul 25</span>
                  <span>Jul 26</span>
                </>
              )}
            </div>
          </div>

          {/* ── TOP SELLERS GRID (MATCHING THE SCREENSHOT EXACTLY!) ── */}
          <div style={{ marginBottom: "28px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "800", marginBottom: "16px" }}>
              Top Selling Contributors & Portfolio Highlights ({category})
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {data.topContributors.map((c, idx) => (
                <div
                  key={c.name + idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "240px 1fr",
                    gap: "20px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "14px",
                    padding: "20px",
                    alignItems: "center"
                  }}
                >
                  {/* Left Column: Contributor Profile Card */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderRight: "1px solid var(--border)", paddingRight: "16px" }}>
                    <div
                      style={{
                        width: "60px",
                        height: "60px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #e0e0e0 0%, #cccccc 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "24px",
                        fontWeight: "800",
                        color: "#333",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
                      }}
                    >
                      {c.avatarText || c.name.charAt(0).toUpperCase()}
                    </div>

                    <div>
                      <h4 style={{ fontSize: "18px", fontWeight: "800", margin: "0 0 4px 0" }}>
                        {c.name}
                      </h4>
                      <div style={{ fontSize: "10px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                        LIFETIME DOWNLOADS
                      </div>
                      <div style={{ fontSize: "20px", fontWeight: "900", color: "var(--text)", marginTop: "2px" }}>
                        {c.lifetimeDownloads}
                      </div>
                    </div>

                    <a
                      href={c.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-block",
                        marginTop: "8px",
                        fontSize: "13px",
                        fontWeight: "700",
                        color: "var(--text)",
                        textDecoration: "underline"
                      }}
                    >
                      View profile
                    </a>
                  </div>

                  {/* Right Column: 10 Thumbnail Grid Preview */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(5, 1fr)",
                      gap: "8px",
                      width: "100%"
                    }}
                  >
                    {previewList.map((imgUrl, imgIdx) => (
                      <div
                        key={imgIdx}
                        style={{
                          aspectRatio: "1/1",
                          borderRadius: "6px",
                          overflow: "hidden",
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border)",
                          position: "relative"
                        }}
                      >
                        <img
                          src={imgUrl}
                          alt={`Top seller preview ${imgIdx + 1}`}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            transition: "transform 0.2s"
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── SEO KEYWORDS & HIGH DEMAND CONCEPTS ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            {/* Top Selling Keywords */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px" }}>
              <h4 style={{ fontSize: "14px", fontWeight: "700", margin: "0 0 12px 0", color: "#0066FF" }}>
                🏷️ Keyword Terlaris ({category})
              </h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {data.topKeywords.map((kw, idx) => (
                  <span
                    key={idx}
                    style={{
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border)",
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: "500"
                    }}
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>

            {/* Suggested High Demand Concepts */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px" }}>
              <h4 style={{ fontSize: "14px", fontWeight: "700", margin: "0 0 12px 0", color: "#00C8FF" }}>
                💡 Rekomendasi Konsep Produk
              </h4>
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", lineHeight: "1.6" }}>
                {data.suggestedConcepts.map((concept, idx) => (
                  <li key={idx} style={{ marginBottom: "4px", fontWeight: "500" }}>
                    {concept}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
