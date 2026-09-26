"use client";

import { useEffect, useState } from "react";
import {
  Clock, Download, Trash2, ChevronDown, ChevronUp, Copy,
  Check, FileSpreadsheet, Sparkles, Layers, AlertCircle, ArrowRight, RefreshCw
} from "lucide-react";

interface MetadataJobItem {
  filename: string;
  title?: string;
  keywords?: string[];
  categories?: string[];
  prompt?: string;
  model?: string;
  editorial?: string;
  matureContent?: string;
  illustration?: string;
  thumbnailUrl?: string;
  error?: string;
}

interface MetadataHistoryEntry {
  id: string;
  jobId?: string;
  platform: string;
  photoCount: number;
  createdAt: string;
  items: MetadataJobItem[];
}

export default function MetadataHistoryPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [history, setHistory] = useState<MetadataHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedItemKey, setCopiedItemKey] = useState<string | null>(null);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/metadata/history");
      const data = await res.json();
      if (data.success) {
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error("fetchHistory error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Hapus riwayat metadata ini?")) return;
    try {
      const res = await fetch(`/api/metadata/history?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setHistory((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (err) {
      console.error("handleDelete error:", err);
    }
  };

  const copyMeta = (title: string, keywords: string[], key: string) => {
    const text = `Title: ${title}\nKeywords: ${keywords.join(", ")}`;
    navigator.clipboard.writeText(text);
    setCopiedItemKey(key);
    setTimeout(() => setCopiedItemKey(null), 2000);
  };

  const exportEntryCsv = (entry: MetadataHistoryEntry) => {
    const { platform, items } = entry;
    let header = "";
    let csvRows: string[] = [];

    if (platform === "shutterstock") {
      header = "Filename,Description,Keywords,Categories,Editorial,Mature content,illustration\r\n";
      csvRows = items.map((r) => {
        const filename = `"${(r.filename || "").replace(/"/g, '""')}"`;
        const title = `"${(r.title || "").replace(/"/g, '""')}"`;
        const kw = `"${(r.keywords || []).join(",").replace(/"/g, '""')}"`;
        const cat = `"${(r.categories || []).join(",").replace(/"/g, '""')}"`;
        return [filename, title, kw, cat, r.editorial || "no", r.matureContent || "no", r.illustration || "no"].join(",");
      });
    } else if (platform === "magnific") {
      header = "File name;Title;Keywords;Prompt;Model\r\n";
      csvRows = items.map((r) => {
        const esc = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;
        return [esc(r.filename), esc(r.title || ""), esc((r.keywords || []).join(",")), esc(r.prompt || ""), esc(r.model || "Midjourney 6")].join(";");
      });
    } else {
      header = "Filename,Title,Keywords,Category,Releases\r\n";
      csvRows = items.map((r) => {
        const filename = `"${(r.filename || "").replace(/"/g, '""')}"`;
        const title = `"${(r.title || "").replace(/"/g, '""')}"`;
        const kw = `"${(r.keywords || []).join(", ").replace(/"/g, '""')}"`;
        return [filename, title, kw, `""`, `""`].join(",");
      });
    }

    const csvContent = header + csvRows.join("\r\n") + "\r\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${platform}_history_${new Date(entry.createdAt).toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 14px 60px", fontFamily: "inherit" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 999, background: "rgba(219, 234, 254, 0.8)", border: "1px solid rgba(147, 197, 253, 0.6)", color: "#1e40af", fontSize: 11, fontWeight: 800, textTransform: "uppercase", marginBottom: 8 }}>
            <Clock size={13} color="#2563eb" />
            <span>Database Cloud Persistence</span>
          </div>
          <h1 style={{ fontSize: "clamp(22px, 3.8vw, 30px)", fontWeight: 900, color: "#0f172a", margin: "0 0 6px" }}>
            Riwayat &amp; Hasil Latar Belakang
          </h1>
          <p style={{ fontSize: 13.5, color: "#64748b", margin: 0 }}>
            Semua hasil proses metadata tersimpan otomatis di database. Anda dapat melihat, menyalin, atau mendownload ulang CSV kapan saja.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => void fetchHistory()}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(147, 197, 253, 0.7)",
              background: "rgba(255, 255, 255, 0.9)",
              color: "#1e40af",
              fontSize: 13,
              fontWeight: 700,
              cursor: loading ? "wait" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)"
            }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Segarkan</span>
          </button>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate("metadata")}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 4px 14px rgba(37, 99, 235, 0.3)"
              }}
            >
              <Sparkles size={14} />
              <span>Proses Foto Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* ── History List ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#64748b", fontSize: 14 }}>
          Memuat riwayat dari database...
        </div>
      ) : history.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "50px 24px",
          background: "rgba(255, 255, 255, 0.75)",
          border: "1px dashed rgba(147, 197, 253, 0.7)",
          borderRadius: 20,
          backdropFilter: "blur(14px)"
        }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(219, 234, 254, 0.8)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "#2563eb" }}>
            <Clock size={26} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>
            Belum ada riwayat proses
          </div>
          <div style={{ fontSize: 13, color: "#64748b", maxWidth: 420, margin: "0 auto 18px", lineHeight: 1.5 }}>
            Saat Anda melakukan generate metadata di menu Metadata AI, hasilnya akan otomatis disimpan di sini secara permanen.
          </div>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate("metadata")}
              style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
            >
              Mulai Sekarang
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {history.map((entry) => {
            const isExpanded = expandedId === entry.id;
            const dateStr = new Date(entry.createdAt).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div
                key={entry.id}
                style={{
                  background: "rgba(255, 255, 255, 0.85)",
                  border: "1px solid rgba(147, 197, 253, 0.5)",
                  borderRadius: 18,
                  backdropFilter: "blur(16px)",
                  boxShadow: "0 4px 18px rgba(59, 130, 246, 0.06)",
                  overflow: "hidden"
                }}
              >
                {/* Header item */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  style={{
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 12,
                    cursor: "pointer",
                    background: isExpanded ? "rgba(239, 246, 255, 0.6)" : "transparent",
                    transition: "background 0.15s ease"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {/* Thumbnail strip — first 5 photos */}
                    <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                      {entry.items.slice(0, 5).map((item, ti) => (
                        <div key={ti} style={{
                          width: 36, height: 36, borderRadius: 8, overflow: "hidden",
                          border: "1px solid rgba(147, 197, 253, 0.5)",
                          background: "rgba(219, 234, 254, 0.4)",
                          flexShrink: 0,
                        }}>
                          {item.thumbnailUrl && item.thumbnailUrl.startsWith("data:image") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Layers size={14} color="#93c5fd" />
                            </div>
                          )}
                        </div>
                      ))}
                      {entry.items.length > 5 && (
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(219, 234, 254, 0.6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#1e40af", border: "1px solid rgba(147, 197, 253, 0.5)" }}>
                          +{entry.items.length - 5}
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
                          {entry.platform === "shutterstock" ? "Shutterstock" : entry.platform === "magnific" ? "Magnific" : "Adobe Stock"}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "rgba(219, 234, 254, 0.8)", color: "#1e40af" }}>
                          {entry.photoCount} Foto
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>
                        {dateStr}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); exportEntryCsv(entry); }}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 9, border: "none", background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", fontSize: 11.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 3px 10px rgba(16,185,129,0.3)" }}
                    >
                      <Download size={13} />
                      <span>Download CSV</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDelete(entry.id, e)}
                      style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(252, 165, 165, 0.7)", background: "rgba(254, 226, 226, 0.7)", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                      title="Hapus riwayat"
                    >
                      <Trash2 size={14} />
                    </button>

                    <div style={{ color: "#2563eb", display: "flex", alignItems: "center", marginLeft: 4 }}>
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ padding: "16px 20px 20px", borderTop: "1px solid rgba(147, 197, 253, 0.4)", background: "rgba(248, 250, 252, 0.5)", display: "flex", flexDirection: "column", gap: 12 }}>
                    {entry.items.map((item, itemIdx) => {
                      const copyKey = `${entry.id}-${itemIdx}`;
                      const isCopied = copiedItemKey === copyKey;
                      return (
                        <div
                          key={`${item.filename}-${itemIdx}`}
                          style={{
                            padding: "14px 16px",
                            background: "rgba(255, 255, 255, 0.95)",
                            border: "1px solid rgba(147, 197, 253, 0.5)",
                            borderRadius: 12,
                            display: "flex",
                            gap: 14,
                            alignItems: "flex-start",
                          }}
                        >
                          {/* Thumbnail */}
                          <div style={{
                            width: 72, height: 72, borderRadius: 10, overflow: "hidden",
                            flexShrink: 0, background: "rgba(219, 234, 254, 0.4)",
                            border: "1px solid rgba(147, 197, 253, 0.4)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {item.thumbnailUrl && item.thumbnailUrl.startsWith("data:image") ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.thumbnailUrl}
                                alt={item.filename}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            ) : (
                              <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", padding: 4, lineHeight: 1.3 }}>
                                {item.filename.slice(0, 12)}
                              </div>
                            )}
                          </div>

                          {/* Content */}
                          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                              <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", wordBreak: "break-all" }}>
                                {item.filename || `File #${itemIdx + 1}`}
                              </div>
                              <button
                                type="button"
                                onClick={() => copyMeta(item.title || "", item.keywords || [], copyKey)}
                                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(147, 197, 253, 0.6)", background: isCopied ? "rgba(220, 252, 231, 0.9)" : "rgba(219, 234, 254, 0.7)", color: isCopied ? "#15803d" : "#1e40af", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                              >
                                {isCopied ? <Check size={12} /> : <Copy size={12} />}
                                <span>{isCopied ? "Tersalin!" : "Salin Meta"}</span>
                              </button>
                            </div>

                            {item.error ? (
                              <div style={{ fontSize: 11.5, color: "#dc2626", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                                <AlertCircle size={13} />
                                <span>Error: {item.error}</span>
                              </div>
                            ) : (
                              <>
                                <div style={{ fontSize: 12.5, color: "#1e293b", fontWeight: 600, lineHeight: 1.4 }}>
                                  <span style={{ color: "#64748b", fontWeight: 700 }}>Title: </span>
                                  {item.title}
                                </div>

                                {item.keywords && item.keywords.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 4 }}>
                                      Keywords ({item.keywords.length}):
                                    </div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                      {item.keywords.slice(0, 20).map((kw, kwIdx) => (
                                        <span key={kwIdx} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "rgba(219, 234, 254, 0.7)", color: "#1e40af", fontWeight: 600 }}>
                                          {kw}
                                        </span>
                                      ))}
                                      {item.keywords.length > 20 && (
                                        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "rgba(241, 245, 249, 0.9)", color: "#64748b", fontWeight: 600 }}>
                                          +{item.keywords.length - 20} lagi
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
