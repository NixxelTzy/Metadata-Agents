"use client";

import { useEffect, useState, useCallback } from "react";
import { showToast } from "./Toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountUser {
  id: string;
  email: string;
  username: string;
  role: "user" | "premium" | "admin";
  createdAt: string;
  passwordRaw: string | null;
  passwordHash: string;
  lastSeen: string | null;
  currentFeature: string | null;
  isOnline: boolean;
}

interface ActivityEvent {
  id: string;
  userId: string;
  email: string;
  username: string;
  action: string;
  detail: string;
  timestamp: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FEATURE_LABELS: Record<string, string> = {
  metadata: "🏷️ Metadata",
  upscale: "🔍 Upscale",
  watermark: "🧹 Hapus WM",
  research: "🔬 Riset",
  vector: "✨ Vector",
  chat: "🤖 AI Chat",
  feedback: "💬 Laporan",
  motion: "🎬 Motion Studio",
  accounts: "🛡️ Accounts",
  storage: "🗄️ Storage",
  "admin-messages": "📬 Pesan",
  unknown: "❓ Unknown",
};

const ACTION_COLORS: Record<string, string> = {
  login: "#4ade80",
  logout: "#94a3b8",
  metadata_upload: "#60a5fa",
  upscale: "#a78bfa",
  vector: "#f472b6",
  motion: "#fb923c",
  research: "#34d399",
  watermark: "#fbbf24",
  download: "#38bdf8",
};

const ACTION_ICONS: Record<string, string> = {
  login: "🔐",
  logout: "🚪",
  metadata_upload: "📸",
  upscale: "🔍",
  vector: "🎨",
  motion: "🎬",
  research: "🔬",
  watermark: "🪣",
  download: "⬇️",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(isoString: string) {
  try {
    return new Date(isoString).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "Belum pernah aktif";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 2) return "Baru saja";
  if (diffMin < 60) return `${diffMin} menit lalu`;
  if (diffHr < 24) return `${diffHr} jam lalu`;
  return `${diffDay} hari lalu`;
}

// ─── Activity Timeline Panel ──────────────────────────────────────────────────

function ActivityTimeline({
  userId,
  username,
  onClose,
}: {
  userId: string;
  username: string;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/activity?userId=${userId}&limit=100`)
      .then((r) => r.json())
      .then((d: { events: ActivityEvent[] }) => setEvents(d.events ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const actionCounts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.action] = (acc[e.action] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "680px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(135deg, rgba(124,58,237,0.12), rgba(236,72,153,0.08))",
          }}
        >
          <div>
            <div style={{ fontWeight: "800", fontSize: "16px", color: "var(--text)" }}>
              📋 Activity Timeline — {username}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
              {events.length} event tercatat (100 terbaru)
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--text)",
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            ✕ Tutup
          </button>
        </div>

        {/* Action Summary Chips */}
        {!loading && Object.keys(actionCounts).length > 0 && (
          <div
            style={{
              padding: "12px 24px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            {Object.entries(actionCounts).map(([action, count]) => (
              <span
                key={action}
                style={{
                  padding: "3px 10px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: "700",
                  background: `${ACTION_COLORS[action] ?? "#94a3b8"}22`,
                  color: ACTION_COLORS[action] ?? "#94a3b8",
                  border: `1px solid ${ACTION_COLORS[action] ?? "#94a3b8"}44`,
                }}
              >
                {ACTION_ICONS[action] ?? "⚡"} {action.replace(/_/g, " ")} ×{count}
              </span>
            ))}
          </div>
        )}

        {/* Timeline */}
        <div style={{ overflowY: "auto", padding: "16px 24px", flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
              <span className="spinner" style={{ marginBottom: "12px" }} />
              <div>Memuat activity log...</div>
            </div>
          ) : events.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px",
                color: "var(--text-muted)",
                fontSize: "14px",
              }}
            >
              ⚫ Belum ada aktivitas tercatat untuk user ini.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              {events.map((event, idx) => (
                <div
                  key={event.id}
                  style={{
                    display: "flex",
                    gap: "16px",
                    paddingBottom: idx < events.length - 1 ? "0" : "0",
                  }}
                >
                  {/* Timeline Line */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      minWidth: "28px",
                    }}
                  >
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        background: `${ACTION_COLORS[event.action] ?? "#94a3b8"}22`,
                        border: `2px solid ${ACTION_COLORS[event.action] ?? "#94a3b8"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        flexShrink: 0,
                        marginTop: "4px",
                      }}
                    >
                      {ACTION_ICONS[event.action] ?? "⚡"}
                    </div>
                    {idx < events.length - 1 && (
                      <div
                        style={{
                          width: "2px",
                          flex: 1,
                          minHeight: "24px",
                          background: "var(--border)",
                          margin: "4px 0",
                        }}
                      />
                    )}
                  </div>

                  {/* Event Content */}
                  <div
                    style={{
                      flex: 1,
                      paddingBottom: "16px",
                      paddingTop: "4px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "4px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "800",
                          color: ACTION_COLORS[event.action] ?? "#94a3b8",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {event.action.replace(/_/g, " ")}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--text-muted)",
                          marginLeft: "auto",
                        }}
                      >
                        {formatDate(event.timestamp)}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--text)",
                        lineHeight: "1.5",
                      }}
                    >
                      {event.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Global Activity Feed ─────────────────────────────────────────────────────

function GlobalActivityFeed({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/activity?limit=200`)
      .then((r) => r.json())
      .then((d: { events: ActivityEvent[] }) => setEvents(d.events ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "760px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(135deg, rgba(14,165,233,0.12), rgba(124,58,237,0.08))",
          }}
        >
          <div>
            <div style={{ fontWeight: "800", fontSize: "16px" }}>
              🌐 Global Activity Feed
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
              Real-time feed semua aktivitas · auto-refresh 20 detik
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={load}
              disabled={loading}
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--text)",
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              {loading ? "..." : "🔄"}
            </button>
            <button
              onClick={onClose}
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--text)",
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              ✕ Tutup
            </button>
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading && events.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
              <span className="spinner" style={{ marginBottom: "12px" }} />
              <div>Memuat feed...</div>
            </div>
          ) : events.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
              ⚫ Belum ada aktivitas tercatat.
            </div>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                style={{
                  display: "flex",
                  gap: "14px",
                  padding: "12px 24px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  alignItems: "flex-start",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.background =
                    "rgba(255,255,255,0.03)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.background = "transparent")
                }
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: `${ACTION_COLORS[event.action] ?? "#94a3b8"}18`,
                    border: `1.5px solid ${ACTION_COLORS[event.action] ?? "#94a3b8"}55`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "13px",
                    flexShrink: 0,
                  }}
                >
                  {ACTION_ICONS[event.action] ?? "⚡"}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "3px",
                    }}
                  >
                    <span style={{ fontWeight: "700", fontSize: "13px", color: "var(--text)" }}>
                      {event.username}
                    </span>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: "800",
                        color: ACTION_COLORS[event.action] ?? "#94a3b8",
                        background: `${ACTION_COLORS[event.action] ?? "#94a3b8"}18`,
                        padding: "1px 7px",
                        borderRadius: "12px",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {event.action.replace(/_/g, " ")}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        marginLeft: "auto",
                      }}
                    >
                      {formatRelativeTime(event.timestamp)}
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    {event.detail}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stats Card ───────────────────────────────────────────────────────────────

function StatsCard({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: `1px solid ${color}33`,
        borderRadius: "12px",
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        gap: "14px",
      }}
    >
      <div
        style={{
          width: "42px",
          height: "42px",
          borderRadius: "10px",
          background: `${color}18`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "20px",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: "22px", fontWeight: "800", color: "var(--text)", lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>
          {label}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminAccountChecker() {
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [newPasswordVal, setNewPasswordVal] = useState("");
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const [timelineUserId, setTimelineUserId] = useState<string | null>(null);
  const [timelineUsername, setTimelineUsername] = useState("");
  const [showGlobalFeed, setShowGlobalFeed] = useState(false);
  const [roleFilter, setRoleFilter] = useState<"all" | "user" | "premium" | "admin">("all");
  const [sortBy, setSortBy] = useState<"created" | "lastSeen" | "online">("online");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) {
        if (res.status === 403) throw new Error("Akses ditolak. Khusus Admin.");
        throw new Error("Gagal mengambil data akun");
      }
      const data = (await res.json()) as { users: AccountUser[] };
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 500);
    return () => clearInterval(interval);
  }, [fetchUsers]);

  const handleUpdateRole = async (email: string, role: "user" | "premium" | "admin") => {
    setActionLoading(`role-${email}`);
    try {
      const res = await fetch("/api/admin/users/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) {
        const errData = (await res.json()) as { error?: string };
        throw new Error(errData.error || "Gagal memperbarui role");
      }
      await fetchUsers();
    } catch (err) {
      showToast({ type: "error", title: "Gagal update role", message: err instanceof Error ? err.message : "Gagal memperbarui role" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPassword = async (email: string) => {
    if (newPasswordVal.length < 8) {
      showToast({ type: "warning", title: "Password terlalu pendek", message: "Password baru minimal harus 8 karakter!" });
      return;
    }
    setActionLoading(`pass-${email}`);
    try {
      const res = await fetch("/api/admin/users/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, newPassword: newPasswordVal }),
      });
      if (!res.ok) {
        const errData = (await res.json()) as { error?: string };
        throw new Error(errData.error || "Gagal mereset password");
      }
      setEditingUserId(null);
      setNewPasswordVal("");
      showToast({ type: "success", title: "Password diubah!", message: `Password ${email} berhasil direset` });
      await fetchUsers();
    } catch (err) {
      showToast({ type: "error", title: "Gagal reset password", message: err instanceof Error ? err.message : "Gagal mereset password" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (email: string) => {
    setActionLoading(`delete-${email}`);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const errData = (await res.json()) as { error?: string };
        throw new Error(errData.error || "Gagal menghapus user");
      }
      setShowConfirmDelete(null);
      await fetchUsers();
    } catch (err) {
      showToast({ type: "error", title: "Gagal hapus user", message: err instanceof Error ? err.message : "Gagal menghapus user" });
    } finally {
      setActionLoading(null);
    }
  };

  // ── Filtered & Sorted Users ─────────────────────────────────────────────────
  const filteredUsers = users
    .filter((u) => {
      const term = search.toLowerCase();
      const matchSearch =
        u.username.toLowerCase().includes(term) || u.email.toLowerCase().includes(term);
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      return matchSearch && matchRole;
    })
    .sort((a, b) => {
      if (sortBy === "online") {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      }
      if (sortBy === "lastSeen") {
        const aT = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
        const bT = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
        return bT - aT;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  // ── Summary Stats ───────────────────────────────────────────────────────────
  const onlineCount = users.filter((u) => u.isOnline).length;
  const premiumCount = users.filter((u) => u.role === "premium").length;
  const adminCount = users.filter((u) => u.role === "admin").length;

  return (
    <div className="uploader">
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px #4ade80; }
          50% { opacity: 0.5; box-shadow: 0 0 12px #4ade80; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .user-row:hover { background: rgba(255,255,255,0.025) !important; }
      `}</style>

      {/* Modals */}
      {timelineUserId && (
        <ActivityTimeline
          userId={timelineUserId}
          username={timelineUsername}
          onClose={() => setTimelineUserId(null)}
        />
      )}
      {showGlobalFeed && <GlobalActivityFeed onClose={() => setShowGlobalFeed(false)} />}

      {/* Header */}
      <div className="uploader__hero" style={{ marginBottom: "20px" }}>
        <h2>🛡️ Admin Control Center</h2>
        <p>
          Dashboard komprehensif untuk memantau, menganalisis, dan mengelola semua akun pengguna
          secara real-time. Notifikasi email otomatis ke{" "}
          <strong>nixxeltzy@gmail.com</strong> saat ada login.
        </p>
      </div>

      {error && (
        <div className="status status--error" style={{ marginBottom: "16px" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Stats Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <StatsCard icon="👥" label="Total Pengguna" value={users.length} color="#60a5fa" />
        <StatsCard
          icon="🟢"
          label="Sedang Online"
          value={onlineCount}
          color="#4ade80"
        />
        <StatsCard icon="⭐" label="Premium" value={premiumCount} color="#a78bfa" />
        <StatsCard icon="🛡️" label="Admin" value={adminCount} color="#ec4899" />
        <button
          type="button"
          onClick={() => setShowGlobalFeed(true)}
          style={{
            background: "linear-gradient(135deg, rgba(14,165,233,0.15), rgba(124,58,237,0.1))",
            border: "1px solid rgba(14,165,233,0.3)",
            borderRadius: "12px",
            padding: "16px 20px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            textAlign: "left",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              "linear-gradient(135deg, rgba(14,165,233,0.25), rgba(124,58,237,0.18))")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              "linear-gradient(135deg, rgba(14,165,233,0.15), rgba(124,58,237,0.1))")
          }
        >
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "10px",
              background: "rgba(14,165,233,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              flexShrink: 0,
            }}
          >
            🌐
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: "800", color: "var(--text)" }}>
              Live Feed
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
              Semua aktivitas global
            </div>
          </div>
        </button>
      </div>

      {/* Control Bar */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "16px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          type="text"
          placeholder="🔍 Cari email atau username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: "220px",
            padding: "9px 14px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--text)",
            fontSize: "13px",
          }}
        />

        {/* Role Filter */}
        <div style={{ display: "flex", gap: "6px" }}>
          {(["all", "user", "premium", "admin"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              style={{
                padding: "7px 12px",
                borderRadius: "7px",
                border: `1px solid ${roleFilter === r ? "#7c3aed" : "var(--border)"}`,
                background:
                  roleFilter === r ? "rgba(124,58,237,0.18)" : "var(--surface)",
                color: roleFilter === r ? "#a78bfa" : "var(--text-muted)",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "600",
                transition: "all 0.15s",
              }}
            >
              {r === "all"
                ? "Semua"
                : r === "user"
                ? "Free"
                : r === "premium"
                ? "⭐ Premium"
                : "🛡️ Admin"}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          style={{
            padding: "7px 10px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "7px",
            color: "var(--text)",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          <option value="online">Urutkan: Online Dulu</option>
          <option value="lastSeen">Urutkan: Terakhir Aktif</option>
          <option value="created">Urutkan: Terbaru Daftar</option>
        </select>

        <button
          type="button"
          className="btn"
          onClick={fetchUsers}
          disabled={loading}
          style={{
            padding: "8px 16px",
            fontSize: "12px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "⏳ Refresh..." : "🔄 Refresh"}
        </button>

        <span style={{ fontSize: "12px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {filteredUsers.length}/{users.length} user
        </span>
      </div>

      {/* Users Table */}
      {loading && users.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>
          <span className="spinner" style={{ marginBottom: "12px" }} />
          <div>Memuat data akun...</div>
        </div>
      ) : (
        <div
          style={{
            overflowX: "auto",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            background: "var(--surface)",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
              textAlign: "left",
            }}
          >
            <thead>
              <tr
                style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}
              >
                <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</th>
                <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>User / Email</th>
                <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Password</th>
                <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Role</th>
                <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Terdaftar</th>
                <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Aktivitas</th>
                <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                    Tidak ada akun yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isEditing = editingUserId === u.id;
                  const isConfirmingDelete = showConfirmDelete === u.id;

                  return (
                    <tr
                      key={u.id}
                      className="user-row"
                      style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s", animation: "fadeIn 0.3s ease" }}
                    >
                      {/* Status Dot */}
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                          <div
                            style={{
                              width: "10px",
                              height: "10px",
                              borderRadius: "50%",
                              background: u.isOnline ? "#4ade80" : "var(--text-muted)",
                              animation: u.isOnline ? "pulse 2s infinite" : "none",
                            }}
                          />
                          <span style={{ fontSize: "9px", color: u.isOnline ? "#4ade80" : "var(--text-muted)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            {u.isOnline ? "LIVE" : "OFF"}
                          </span>
                        </div>
                      </td>

                      {/* User Info */}
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontWeight: "700", color: "var(--text)", fontSize: "14px" }}>{u.username}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{u.email}</div>
                        <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px", fontFamily: "monospace" }}>
                          ID: {u.id.slice(0, 12)}…
                        </div>
                      </td>

                      {/* Password */}
                      <td style={{ padding: "14px 16px" }}>
                        {u.passwordRaw ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontFamily: "monospace", color: "#4ade80", background: "rgba(74,222,128,0.1)", padding: "2px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "700", border: "1px solid rgba(74,222,128,0.25)" }}>
                              {u.passwordRaw}
                            </span>
                            <span style={{ fontSize: "10px", color: "#4ade80" }}>✓</span>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontSize: "10px", color: "#f59e0b", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px", whiteSpace: "nowrap", display: "block" }} title={u.passwordHash}>
                              {u.passwordHash.slice(0, 20)}...
                            </span>
                            <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>bcrypt · belum login ulang</span>
                          </div>
                        )}
                      </td>

                      {/* Role */}
                      <td style={{ padding: "14px 16px" }}>
                        <select
                          value={u.role}
                          onChange={(e) => handleUpdateRole(u.email, e.target.value as "user" | "premium" | "admin")}
                          disabled={actionLoading === `role-${u.email}` || u.email === "nixxeltzy@gmail.com"}
                          style={{
                            padding: "5px 10px",
                            background: u.role === "admin" ? "rgba(236,72,153,0.15)" : u.role === "premium" ? "rgba(124,58,237,0.15)" : "var(--bg-secondary)",
                            color: u.role === "admin" ? "#ec4899" : u.role === "premium" ? "#8b5cf6" : "var(--text)",
                            border: `1px solid ${u.role === "admin" ? "#ec489944" : u.role === "premium" ? "#8b5cf644" : "var(--border)"}`,
                            borderRadius: "6px",
                            fontWeight: "700",
                            fontSize: "12px",
                            cursor: u.email === "nixxeltzy@gmail.com" ? "not-allowed" : "pointer",
                          }}
                        >
                          <option value="user">👤 Free</option>
                          <option value="premium">⭐ Premium</option>
                          <option value="admin">🛡️ Admin</option>
                        </select>
                      </td>

                      {/* Created At */}
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ color: "var(--text)", fontSize: "12px" }}>{formatDate(u.createdAt)}</div>
                      </td>

                      {/* Activity */}
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {u.isOnline ? (
                            <span style={{ fontSize: "11px", fontWeight: "700", color: "#4ade80" }}>
                              🟢 Online Sekarang
                            </span>
                          ) : u.lastSeen ? (
                            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "600" }}>
                              ⚫ {formatRelativeTime(u.lastSeen)}
                            </span>
                          ) : (
                            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Belum aktif</span>
                          )}
                          {u.currentFeature && (
                            <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                              {u.isOnline ? "Sedang di:" : "Terakhir di:"} {FEATURE_LABELS[u.currentFeature] ?? u.currentFeature}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        {isEditing ? (
                          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                            <input
                              type="text"
                              placeholder="Pass baru..."
                              value={newPasswordVal}
                              onChange={(e) => setNewPasswordVal(e.target.value)}
                              style={{
                                padding: "5px 8px",
                                background: "var(--bg-secondary)",
                                border: "1px solid var(--border)",
                                borderRadius: "5px",
                                color: "var(--text)",
                                width: "110px",
                                fontSize: "12px",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleResetPassword(u.email)}
                              disabled={actionLoading === `pass-${u.email}`}
                              style={{ padding: "5px 10px", background: "#4ade80", border: "none", borderRadius: "5px", color: "black", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}
                            >
                              Simpan
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingUserId(null); setNewPasswordVal(""); }}
                              style={{ padding: "5px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "5px", color: "var(--text)", fontSize: "11px", cursor: "pointer" }}
                            >
                              ✕
                            </button>
                          </div>
                        ) : isConfirmingDelete ? (
                          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                            <span style={{ fontSize: "11px", color: "var(--error)", fontWeight: "600" }}>Yakin hapus?</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u.email)}
                              disabled={actionLoading === `delete-${u.email}`}
                              style={{ padding: "5px 10px", background: "var(--error)", border: "none", borderRadius: "5px", color: "white", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}
                            >
                              Ya
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowConfirmDelete(null)}
                              style={{ padding: "5px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "5px", color: "var(--text)", fontSize: "11px", cursor: "pointer" }}
                            >
                              Tidak
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                            {/* Unblock Quick Action */}
                            <button
                              type="button"
                              onClick={async () => {
                                setActionLoading(`ctrl-${u.email}`);
                                try {
                                  const res = await fetch("/api/admin/user-control", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      targetUserId: u.id,
                                      targetEmail: u.email,
                                      targetUsername: u.username,
                                      action: "unblock",
                                    }),
                                  });
                                  const d = await res.json() as { ok?: boolean; actionResult?: string };
                                  if (d.ok) showToast({ type: "unblock", title: "User Berhasil Di-unblock!", message: d.actionResult ?? `${u.email} telah dibebaskan`, duration: 6000 });
                                  else showToast({ type: "error", title: "Gagal Unblock", message: "Coba lagi atau cek log server" });
                                } catch { showToast({ type: "error", title: "Error", message: "Koneksi gagal" }); }
                                finally { setActionLoading(null); fetchUsers(); }
                              }}
                              disabled={actionLoading === `ctrl-${u.email}`}
                              title="Unblock akun ini di Redis & kirim email konfirmasi"
                              style={{
                                padding: "5px 10px",
                                background: "rgba(74,222,128,0.12)",
                                border: "1px solid rgba(74,222,128,0.3)",
                                borderRadius: "5px",
                                color: "#4ade80",
                                cursor: "pointer",
                                fontSize: "11px",
                                fontWeight: "700",
                              }}
                            >
                              🔓 Unblock
                            </button>

                            {/* Token Boost Quick Action */}
                            <button
                              type="button"
                              onClick={async () => {
                                setActionLoading(`ctrl-${u.email}`);
                                try {
                                  const res = await fetch("/api/admin/user-control", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      targetUserId: u.id,
                                      targetEmail: u.email,
                                      targetUsername: u.username,
                                      action: "boost_tokens",
                                    }),
                                  });
                                  const d = await res.json() as { ok?: boolean; actionResult?: string };
                                  if (d.ok) showToast({ type: "success", title: "Token Boosted! ⚡", message: d.actionResult ?? `Token ${u.email} berhasil di-boost` });
                                } catch { showToast({ type: "error", title: "Error", message: "Koneksi gagal" }); }
                                finally { setActionLoading(null); }
                              }}
                              disabled={actionLoading === `ctrl-${u.email}`}
                              title="Berikan token boost & kirim notifikasi"
                              style={{
                                padding: "5px 10px",
                                background: "rgba(251,191,36,0.12)",
                                border: "1px solid rgba(251,191,36,0.3)",
                                borderRadius: "5px",
                                color: "#fbbf24",
                                cursor: "pointer",
                                fontSize: "11px",
                                fontWeight: "700",
                              }}
                            >
                              ⚡ Boost
                            </button>

                            {/* Timeline Button */}
                            <button
                              type="button"
                              onClick={() => { setTimelineUserId(u.id); setTimelineUsername(u.username); }}
                              title="Lihat Activity Timeline"
                              style={{
                                padding: "5px 10px",
                                background: "rgba(96,165,250,0.12)",
                                border: "1px solid rgba(96,165,250,0.3)",
                                borderRadius: "5px",
                                color: "#60a5fa",
                                cursor: "pointer",
                                fontSize: "11px",
                                fontWeight: "600",
                              }}
                            >
                              📋 Timeline
                            </button>

                            {/* Reset Pass */}
                            <button
                              type="button"
                              onClick={() => setEditingUserId(u.id)}
                              style={{
                                padding: "5px 10px",
                                background: "var(--bg-secondary)",
                                border: "1px solid var(--border)",
                                borderRadius: "5px",
                                color: "var(--text)",
                                cursor: "pointer",
                                fontSize: "11px",
                              }}
                            >
                              🔑 Pass
                            </button>

                            {/* Delete */}
                            {u.email !== "nixxeltzy@gmail.com" && (
                              <button
                                type="button"
                                onClick={() => setShowConfirmDelete(u.id)}
                                style={{
                                  padding: "5px 10px",
                                  background: "rgba(239,68,68,0.12)",
                                  border: "1px solid var(--error)",
                                  color: "var(--error)",
                                  borderRadius: "5px",
                                  cursor: "pointer",
                                  fontSize: "11px",
                                  fontWeight: "600",
                                }}
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer Info */}
      <div
        style={{
          marginTop: "16px",
          padding: "12px 16px",
          background: "rgba(124,58,237,0.08)",
          border: "1px solid rgba(124,58,237,0.2)",
          borderRadius: "8px",
          fontSize: "12px",
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span>📧</span>
        <span>
          Sistem notifikasi email aktif · setiap login otomatis dikirim ke{" "}
          <strong style={{ color: "#a78bfa" }}>nixxeltzy@gmail.com</strong> · data direfresh setiap 15 detik
        </span>
      </div>
    </div>
  );
}
