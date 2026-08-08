"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountUser {
  id: string;
  email: string;
  username: string;
  recipientId?: string;
  role: "user" | "premium" | "admin";
  isOnline: boolean;
  lastSeen: string | null;
  secondsAgo?: number | null;
}

interface SentMessage {
  id: string;
  type: "message" | "refresh" | "block";
  title: string;
  body: string;
  reason?: string;
  targetUserId: string | "all";
  targetEmail: string | "all";
  targetUsername: string | "all";
  sentAt: string;
  sentByEmail: string;
}

type MsgType = "message" | "refresh" | "block";

const TYPE_META: Record<MsgType, { icon: string; color: string; label: string; desc: string }> = {
  message: { icon: "💬", color: "#60a5fa", label: "Pesan Biasa", desc: "Tampilkan notifikasi di layar pengguna" },
  refresh: { icon: "🔄", color: "#4ade80", label: "Refresh / Buka Ulang", desc: "Minta pengguna untuk membuka ulang web" },
  block:   { icon: "🚫", color: "#f87171", label: "Blokir Sementara", desc: "Blokir akses hingga pengguna reload dengan alasan" },
};

// ─── Debug Types ──────────────────────────────────────────────────────────────

interface DebugKeyInfo {
  key: string;
  exists: boolean;
  count: number;
  items: unknown[];
}

interface DebugResolvedMsg {
  id: string;
  type: string;
  title: string;
  targetUserId: string;
  targetEmail: string;
  targetUsername: string;
  sentAt: string;
  matchReason: string;
  skippedBySeen: boolean;
}

interface DebugResult {
  userId: string;
  email: string;
  username: string;
  seenIds: string[];
  userKeys: DebugKeyInfo[];
  broadcastKey: DebugKeyInfo;
  sentlogKey: DebugKeyInfo;
  resolvedMessages: DebugResolvedMsg[];
  errors: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m}m lalu`;
  if (h < 24) return `${h}j lalu`;
  return `${d}h lalu`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Debug Panel ─────────────────────────────────────────────────────────────

function DebugPanel({ users }: { users: AccountUser[] }) {
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DebugResult | null>(null);
  const [error, setError] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const selectedUser = users.find((u) => String(u.id) === selectedId);

  const runDiag = async () => {
    if (!selectedId && !selectedUser) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const params = new URLSearchParams();
      if (selectedUser?.id) params.set("userId", selectedUser.id);
      if (selectedUser?.email) params.set("email", selectedUser.email);
      if (selectedUser?.username) params.set("username", selectedUser.username);
      const res = await fetch(`/api/admin/inbox-debug?${params.toString()}`);
      const data = await res.json() as DebugResult & { error?: string };
      if (!res.ok) { setError(data.error ?? "Gagal mengambil data debug"); return; }
      setResult(data);
    } catch (e) {
      setError("Koneksi gagal: " + String(e));
    } finally {
      setLoading(false);
    }
  };

  const chip = (label: string, color: string, bg: string) => (
    <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "6px", background: bg, color, letterSpacing: "0.04em" }}>
      {label}
    </span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* User Selector */}
      <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "12px", padding: "18px" }}>
        <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "10px" }}>
          🔍 Pilih Akun untuk Diagnosa Inbox
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
          {users.filter((u) => u.role !== "admin").map((u) => {
            const sel = String(selectedId) === String(u.id);
            return (
              <button
                key={u.id}
                onClick={() => setSelectedId(u.id)}
                style={{
                  padding: "7px 13px",
                  borderRadius: "8px",
                  border: `2px solid ${sel ? "#a78bfa" : "var(--border)"}`,
                  background: sel ? "rgba(167,139,250,0.15)" : "var(--surface)",
                  color: sel ? "#a78bfa" : "var(--text)",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.15s",
                }}
              >
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: u.isOnline ? "#4ade80" : "#475569", flexShrink: 0 }} />
                {u.username}
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{u.email}</span>
              </button>
            );
          })}
        </div>
        {selectedUser && (
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "10px" }}>
            Target: <strong style={{ color: "var(--text)" }}>{selectedUser.username}</strong> &nbsp;·&nbsp;
            ID: <code style={{ fontSize: "11px", background: "var(--bg-secondary)", padding: "1px 5px", borderRadius: "4px" }}>{selectedUser.id}</code> &nbsp;·&nbsp;
            Email: <code style={{ fontSize: "11px", background: "var(--bg-secondary)", padding: "1px 5px", borderRadius: "4px" }}>{selectedUser.email}</code>
          </div>
        )}
        <button
          onClick={runDiag}
          disabled={!selectedId || loading}
          style={{
            padding: "10px 20px",
            borderRadius: "8px",
            border: "none",
            background: !selectedId || loading ? "var(--bg-secondary)" : "linear-gradient(135deg, #7c3aed, #a78bfa)",
            color: !selectedId || loading ? "var(--text-muted)" : "#fff",
            fontWeight: "700",
            fontSize: "13px",
            cursor: !selectedId || loading ? "not-allowed" : "pointer",
            transition: "all 0.2s",
          }}
        >
          {loading ? "⏳ Sedang Diagnosa..." : "🔍 Jalankan Diagnosa Redis"}
        </button>
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "14px 16px", fontSize: "13px", color: "#f87171" }}>
          ❌ {error}
        </div>
      )}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* Errors from server */}
          {result.errors.length > 0 && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "10px", padding: "14px 16px" }}>
              <div style={{ fontSize: "11px", fontWeight: "800", color: "#f87171", textTransform: "uppercase", marginBottom: "8px" }}>⚠️ Error dari Server</div>
              {result.errors.map((e, i) => (
                <div key={i} style={{ fontSize: "12px", color: "#fca5a5", fontFamily: "monospace", marginBottom: "4px" }}>• {e}</div>
              ))}
            </div>
          )}

          {/* Seen Set */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "14px 16px" }}>
            <div style={{ fontSize: "11px", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
              🕵️ Seen Set (Redis) — {result.seenIds.length} ID Tersimpan
            </div>
            {result.seenIds.length === 0 ? (
              <span style={{ fontSize: "12px", color: "#4ade80" }}>✅ Kosong — belum ada pesan yang di-mark seen</span>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {result.seenIds.map((id) => (
                  <code key={id} style={{ fontSize: "10px", background: "rgba(239,68,68,0.1)", color: "#f87171", padding: "2px 7px", borderRadius: "5px" }}>
                    {id}
                  </code>
                ))}
              </div>
            )}
          </div>

          {/* User Keys */}
          {result.userKeys.map((k) => (
            <div key={k.key} style={{ background: "var(--surface)", border: `1px solid ${k.exists ? "rgba(74,222,128,0.25)" : "rgba(239,68,68,0.2)"}`, borderRadius: "10px", overflow: "hidden" }}>
              <div
                onClick={() => setExpandedKey(expandedKey === k.key ? null : k.key)}
                style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", userSelect: "none" }}
              >
                <span style={{ fontSize: "16px" }}>{k.exists ? "✅" : "❌"}</span>
                <code style={{ fontSize: "12px", color: "var(--text)", flex: 1 }}>{k.key}</code>
                {chip(`${k.count} item`, k.exists ? "#4ade80" : "#f87171", k.exists ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)")}
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{expandedKey === k.key ? "▲" : "▼"}</span>
              </div>
              {expandedKey === k.key && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px", maxHeight: "300px", overflowY: "auto" }}>
                  {k.count === 0 ? (
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Key ini kosong atau tidak ada di Redis.</div>
                  ) : (
                    (k.items as Array<{ id?: string; type?: string; title?: string; sentAt?: string }>).map((item, i) => (
                      <div key={i} style={{ fontSize: "11px", fontFamily: "monospace", background: "var(--bg-secondary)", borderRadius: "6px", padding: "8px 10px", marginBottom: "6px", color: "var(--text-muted)", wordBreak: "break-all" }}>
                        {JSON.stringify(item, null, 2)}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Broadcast + Sentlog summary */}
          {[result.broadcastKey, result.sentlogKey].map((k) => (
            <div key={k.key} style={{ background: "var(--surface)", border: `1px solid ${k.exists ? "rgba(96,165,250,0.25)" : "rgba(239,68,68,0.15)"}`, borderRadius: "10px", overflow: "hidden" }}>
              <div
                onClick={() => setExpandedKey(expandedKey === k.key ? null : k.key)}
                style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", userSelect: "none" }}
              >
                <span style={{ fontSize: "16px" }}>{k.exists ? "📦" : "📭"}</span>
                <code style={{ fontSize: "12px", color: "var(--text)", flex: 1 }}>{k.key}</code>
                {chip(`${k.count} item`, "#60a5fa", "rgba(96,165,250,0.1)")}
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{expandedKey === k.key ? "▲" : "▼"}</span>
              </div>
              {expandedKey === k.key && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px", maxHeight: "300px", overflowY: "auto" }}>
                  {k.count === 0 ? (
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Tidak ada data.</div>
                  ) : (
                    (k.items as Array<{ id?: string; type?: string; title?: string; targetUserId?: string; sentAt?: string }>).map((item, i) => (
                      <div key={i} style={{ fontSize: "11px", fontFamily: "monospace", background: "var(--bg-secondary)", borderRadius: "6px", padding: "8px 10px", marginBottom: "6px", color: "var(--text-muted)", wordBreak: "break-all" }}>
                        {JSON.stringify(item, null, 2)}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Resolved Messages — real-time status for target user */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", background: "linear-gradient(135deg, rgba(124,58,237,0.08), rgba(96,165,250,0.05))" }}>
              <div style={{ fontWeight: "800", fontSize: "13px", color: "var(--text)" }}>📥 Status Pesan Aktif di Akun Pengguna ({result.resolvedMessages.length})</div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Status langsung dari database Redis untuk akun terpilih</div>
            </div>
            <div style={{ padding: "12px 16px" }}>
              {result.resolvedMessages.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px", color: "var(--text-muted)", fontSize: "13px" }}>
                  ⚠️ Tidak ada pesan aktif untuk akun ini.
                </div>
              ) : (
                result.resolvedMessages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      padding: "12px 14px",
                      marginBottom: "8px",
                      borderRadius: "8px",
                      border: `1px solid ${msg.skippedBySeen ? "rgba(239,68,68,0.25)" : "rgba(74,222,128,0.25)"}`,
                      background: msg.skippedBySeen ? "rgba(239,68,68,0.04)" : "rgba(74,222,128,0.04)",
                    }}
                  >
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "5px", flexWrap: "wrap" }}>
                      {chip(msg.type.toUpperCase(), "#a78bfa", "rgba(167,139,250,0.12)")}
                      {msg.skippedBySeen
                        ? chip("TERBACA / DISMISS", "#f87171", "rgba(239,68,68,0.12)")
                        : chip("✅ TAMPIL DI LAYAR", "#4ade80", "rgba(74,222,128,0.12)")
                      }
                      {chip(msg.matchReason, "#60a5fa", "rgba(96,165,250,0.1)")}
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text)", marginBottom: "3px" }}>{msg.title}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                      ID: {msg.id} &nbsp;·&nbsp; {new Date(msg.sentAt).toLocaleString("id-ID")}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "3px" }}>
                      Target → userId: <code>{msg.targetUserId}</code> &nbsp;| email: <code>{msg.targetEmail}</code> &nbsp;| username: <code>{msg.targetUsername}</code>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Compose Panel ────────────────────────────────────────────────────────────

function ComposePanelForm({
  users,
  onSent,
}: {
  users: AccountUser[];
  onSent: () => void;
}) {
  const [msgType, setMsgType] = useState<MsgType>("message");
  const [target, setTarget] = useState<"all" | string>("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reason, setReason] = useState("");
  const [sendEmailAlso, setSendEmailAlso] = useState(true);
  const [sending, setSending] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const selectedUser = users.find(
    (u) => String(u.id) === String(target) || u.email.toLowerCase() === String(target).toLowerCase() || u.username.toLowerCase() === String(target).toLowerCase()
  );
  const meta = TYPE_META[msgType];

  const handleAiDraft = async () => {
    setGeneratingAi(true);
    try {
      const targetName = target === "all" ? "Semua Pengguna" : (selectedUser?.username ?? "User");
      const targetEmail = target === "all" ? "admin@nixelstudio.com" : (selectedUser?.email ?? "user@example.com");

      const res = await fetch("/api/admin/ai-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toEmail: targetEmail,
          toUsername: targetName,
          actionType: msgType === "block" ? "block_reason" : "draft_message",
          customPrompt: msgType === "block"
            ? "Pemberitahuan audit keamanan dan kepatuhan sistem"
            : "Panduan pembaruan sistem dan info fitur baru",
        }),
      });
      const data = await res.json() as { ok?: boolean; generatedText?: string };
      if (data.ok && data.generatedText) {
        if (msgType === "block") {
          setTitle("🚫 Pemblokiran Akun Sementara");
          setReason("Kepatuhan Aturan Keamanan & Batasan Sistem");
          setBody(data.generatedText);
        } else if (msgType === "refresh") {
          setTitle("⚠️ Pembaruan Sistem — Mohon Muat Ulang Web");
          setBody(data.generatedText);
        } else {
          setTitle("📢 Pesan Informasi dari Admin AI Assistant");
          setBody(data.generatedText);
        }
      }
    } catch {
      alert("Gagal membuat draf AI");
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      setResult({ ok: false, msg: "Judul dan isi pesan wajib diisi!" });
      return;
    }
    if (msgType === "block" && !reason.trim()) {
      setResult({ ok: false, msg: "Alasan blokir wajib diisi!" });
      return;
    }

    setSending(true);
    setResult(null);

    const calcTargetEmail = target === "all" ? "all" : (selectedUser?.email ?? (target.includes("@") ? target.trim() : target.trim()));
    const calcTargetUsername = target === "all" ? "all" : (selectedUser?.username ?? calcTargetEmail);
    const calcTargetUserId = target === "all" ? "all" : (selectedUser?.id ?? target.trim());

    try {
      // 1. Send via MessageWeb API (In-App)
      const res = await fetch("/api/admin/messageweb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: msgType,
          title: title.trim(),
          body: body.trim(),
          reason: reason.trim() || undefined,
          targetUserId: calcTargetUserId,
          targetEmail: calcTargetEmail,
          targetUsername: calcTargetUsername,
        }),
      });

      // 2. Also send Email if option enabled
      const emailToUse = selectedUser?.email || (target.includes("@") ? target.trim() : undefined);
      if (sendEmailAlso && target !== "all" && emailToUse) {
        await fetch("/api/admin/ai-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toEmail: emailToUse,
            toUsername: calcTargetUsername,
            targetUserId: calcTargetUserId,
            actionType: msgType === "block" ? "block_reason" : "reply_user",
            userMessage: body.trim(),
            customPrompt: title.trim(),
          }),
        }).catch(() => {});
      }

      const data = await res.json() as { ok?: boolean; error?: string; messageId?: string };
      if (data.ok) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("trigger_inbox_poll"));
          if ("BroadcastChannel" in window) {
            try {
              const bc = new BroadcastChannel("admin_inbox_system_channel");
              bc.postMessage({ type: "POLL_NOW" });
              bc.close();
            } catch { /* fallback */ }
          }
        }

        setResult({ ok: true, msg: `✅ Pesan berhasil dikirim! ${sendEmailAlso && target !== "all" ? "(In-App + Email)" : ""}` });
        setTitle("");
        setBody("");
        setReason("");
        onSent();
      } else {
        setResult({ ok: false, msg: data.error ?? "Gagal mengirim" });
      }
    } catch {
      setResult({ ok: false, msg: "Gagal terhubung ke server" });
    } finally {
      setSending(false);
    }
  };

  const handleTestSelf = async () => {
    const testTitle = title.trim() || "⚡ Uji Coba Tampilan Notifikasi Admin";
    const testBody = body.trim() || "Ini adalah pesan uji coba otomatis untuk memverifikasi bahwa notifikasi di layar website berfungsi 100% tanpa kendala.";

    setSending(true);
    try {
      await fetch("/api/admin/messageweb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: msgType,
          title: testTitle,
          body: testBody,
          reason: msgType === "block" ? (reason.trim() || "Uji Coba Sistem") : undefined,
          targetUserId: "all",
          targetEmail: "all",
          targetUsername: "all",
        }),
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("trigger_inbox_poll"));
        if ("BroadcastChannel" in window) {
          try {
            const bc = new BroadcastChannel("admin_inbox_system_channel");
            bc.postMessage({ type: "POLL_NOW" });
            bc.close();
          } catch { /* fallback */ }
        }
      }

      setResult({ ok: true, msg: "⚡ Pesan tes broadcast berhasil terkirim! Notifikasi langsung tampil di layar web." });
      onSent();
    } catch {
      setResult({ ok: false, msg: "Gagal mengirim pesan tes" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Tipe Pesan */}
      <div>
        <label style={labelStyle}>Tipe Pesan</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "10px" }}>
          {(Object.entries(TYPE_META) as [MsgType, typeof TYPE_META[MsgType]][]).map(([k, m]) => {
            const active = msgType === k;
            return (
              <button
                key={k}
                onClick={() => setMsgType(k)}
                style={{
                  padding: "14px 16px",
                  borderRadius: "12px",
                  border: `2px solid ${active ? m.color : "var(--border)"}`,
                  background: active ? `${m.color}18` : "var(--bg-secondary)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "20px" }}>{m.icon}</span>
                  <span style={{ fontWeight: "700", fontSize: "13px", color: active ? m.color : "var(--text)" }}>
                    {m.label}
                  </span>
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.4 }}>
                  {m.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Target */}
      <div>
        <label style={labelStyle}>Kirim Kepada</label>

        {/* Dropdown Selector for 1-click targeting */}
        <div style={{ marginBottom: "10px" }}>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            style={{
              width: "100%",
              padding: "11px 14px",
              borderRadius: "10px",
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              color: "var(--text)",
              fontSize: "13px",
              fontWeight: "600",
            }}
          >
            <option value="all">🌐 Semua Pengguna ({users.length} akun)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.isOnline ? "🟢" : "⚪"} {u.username} — {u.email} ({u.recipientId ?? u.id})
              </option>
            ))}
          </select>
        </div>

        {/* User Chips */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={() => setTarget("all")}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              border: `2px solid ${target === "all" ? "#a78bfa" : "var(--border)"}`,
              background: target === "all" ? "rgba(167,139,250,0.15)" : "var(--bg-secondary)",
              color: target === "all" ? "#a78bfa" : "var(--text)",
              cursor: "pointer",
              fontWeight: "700",
              fontSize: "13px",
              transition: "all 0.2s",
            }}
          >
            🌐 Semua Pengguna
            <span style={{
              marginLeft: "8px",
              fontSize: "10px",
              background: target === "all" ? "rgba(167,139,250,0.25)" : "rgba(255,255,255,0.08)",
              padding: "1px 6px",
              borderRadius: "8px",
            }}>
              {users.length}
            </span>
          </button>
          {users.map((u) => {
            const sel = String(target) === String(u.id) || target.toLowerCase() === u.email.toLowerCase() || target.toUpperCase() === u.recipientId?.toUpperCase();
            const isOnline = u.isOnline;
            const secsAgo = u.secondsAgo != null ? `${u.secondsAgo}d lalu` : "";

            return (
              <button
                key={u.id}
                onClick={() => setTarget(u.id)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: `2px solid ${sel ? "#60a5fa" : isOnline ? "rgba(74,222,128,0.4)" : "var(--border)"}`,
                  background: sel ? "rgba(96,165,250,0.15)" : isOnline ? "rgba(74,222,128,0.06)" : "var(--bg-secondary)",
                  color: sel ? "#60a5fa" : "var(--text)",
                  cursor: "pointer",
                  fontWeight: "600",
                  fontSize: "12px",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: isOnline ? "#4ade80" : "#64748b",
                    boxShadow: isOnline ? "0 0 8px rgba(74,222,128,0.6)" : "none",
                    flexShrink: 0,
                  }}
                />
                {u.username}
                {u.recipientId && (
                  <span style={{ fontSize: "10px", background: "rgba(255,255,255,0.1)", padding: "1px 4px", borderRadius: "4px", color: "var(--text-muted)" }}>
                    {u.recipientId}
                  </span>
                )}
                <span style={{ fontSize: "10px", color: isOnline ? "#4ade80" : "var(--text-muted)", fontWeight: isOnline ? "700" : "400" }}>
                  {isOnline ? `Online ${secsAgo}` : "Offline"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Manual Target Email Input */}
        <div style={{ marginTop: "10px", display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Atau ketik email / username target manual (contoh: storekyoraz@gmail.com)..."
            value={target === "all" ? "" : (selectedUser ? selectedUser.email : target)}
            onChange={(e) => {
              const val = e.target.value.trim();
              if (!val) {
                setTarget("all");
              } else {
                setTarget(val);
              }
            }}
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              color: "var(--text)",
              fontSize: "12px",
            }}
          />
          {target !== "all" && (
            <button
              type="button"
              onClick={() => setTarget("all")}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "none",
                background: "rgba(239,68,68,0.15)",
                color: "#f87171",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              Reset ke Semua
            </button>
          )}
        </div>

        {/* Target preview */}
        <div style={{
          marginTop: "10px",
          padding: "10px 14px",
          background: "rgba(167,139,250,0.08)",
          border: "1px solid rgba(167,139,250,0.2)",
          borderRadius: "8px",
          fontSize: "12px",
          color: "var(--text-muted)",
        }}>
          📮 Pesan akan dikirim ke:{" "}
          <strong style={{ color: "#a78bfa" }}>
            {target === "all" ? `Semua ${users.length} pengguna` : selectedUser ? `${selectedUser.username} (${selectedUser.email})` : target}
          </strong>
          {target !== "all" && (
            <span style={{ marginLeft: "8px" }}>
              · Status: {selectedUser?.isOnline
                ? <span style={{ color: "#4ade80" }}>🟢 Online</span>
                : <span style={{ color: "#64748b" }}>⚫ Offline</span>}
            </span>
          )}
        </div>
      </div>

      {/* AI Assistance Button Bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "linear-gradient(135deg, rgba(37,99,235,0.1), rgba(124,58,237,0.08))",
        border: "1px solid rgba(37,99,235,0.25)",
        borderRadius: "10px",
        padding: "10px 14px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "16px" }}>🤖</span>
          <span style={{ fontSize: "12px", color: "var(--text)", fontWeight: "600" }}>
            Asisten Groq AI Auto-Draft
          </span>
        </div>
        <button
          type="button"
          onClick={handleAiDraft}
          disabled={generatingAi}
          style={{
            padding: "6px 14px",
            borderRadius: "7px",
            border: "none",
            background: "linear-gradient(135deg, #2563eb, #7c3aed)",
            color: "white",
            fontSize: "12px",
            fontWeight: "700",
            cursor: generatingAi ? "not-allowed" : "pointer",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {generatingAi ? "⏳ Membuat Draf AI..." : "✨ Buat Teks dengan AI"}
        </button>
      </div>

      {/* Title */}
      <div>
        <label style={labelStyle}>Judul Pesan</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={msgType === "refresh" ? "⚠️ Mohon buka ulang halaman" : msgType === "block" ? "🚫 Akses Diblokir Sementara" : "📢 Pengumuman dari Admin"}
          maxLength={100}
          style={inputStyle}
        />
      </div>

      {/* Body */}
      <div>
        <label style={labelStyle}>Isi Pesan</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            msgType === "refresh"
              ? "Kami telah melakukan pembaruan sistem. Silakan tutup dan buka kembali halaman ini."
              : msgType === "block"
              ? "Akses Anda sementara dibatasi oleh admin. Silakan hubungi admin untuk informasi lebih lanjut."
              : "Ketik pesan untuk pengguna di sini..."
          }
          rows={4}
          maxLength={500}
          style={{ ...inputStyle, resize: "vertical", minHeight: "100px" }}
        />
        <div style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "right", marginTop: "4px" }}>
          {body.length}/500
        </div>
      </div>

      {/* Reason (block only) */}
      {msgType === "block" && (
        <div>
          <label style={{ ...labelStyle, color: "#f87171" }}>
            🚫 Alasan Pemblokiran <span style={{ color: "#f87171" }}>*</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: Pelanggaran aturan, penggunaan berlebihan, dll."
            maxLength={200}
            style={{ ...inputStyle, borderColor: reason ? "#f87171aa" : undefined }}
          />
          <div style={{ fontSize: "11px", color: "#f87171", marginTop: "6px" }}>
            ⚠️ User akan diblokir dan hanya bisa mengakses setelah melakukan reload paksa atau dibuka oleh admin.
          </div>
        </div>
      )}

      {/* Email Dispatch Checkbox */}
      <label style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        padding: "12px 14px",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "13px",
        color: "var(--text)",
      }}>
        <input
          type="checkbox"
          checked={sendEmailAlso}
          onChange={(e) => setSendEmailAlso(e.target.checked)}
          style={{ width: "16px", height: "16px", accentColor: "#2563eb", cursor: "pointer" }}
        />
        <span>
          📧 Kirim juga pesan ini ke email pengirim secara otomatis melalui <strong>Gmail SMTP / AI Mailer</strong>
        </span>
      </label>

      {/* Result */}
      {result && (
        <div style={{
          padding: "12px 16px",
          borderRadius: "8px",
          background: result.ok ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
          border: `1px solid ${result.ok ? "#4ade8044" : "#f8717144"}`,
          color: result.ok ? "#4ade80" : "#f87171",
          fontSize: "13px",
          fontWeight: "600",
        }}>
          {result.msg}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <button
          onClick={handleSend}
          disabled={sending}
          style={{
            flex: 1,
            padding: "14px 24px",
            borderRadius: "10px",
            border: "none",
            background: sending
              ? "rgba(255,255,255,0.1)"
              : msgType === "block"
              ? "linear-gradient(135deg,#dc2626,#991b1b)"
              : msgType === "refresh"
              ? "linear-gradient(135deg,#059669,#065f46)"
              : "linear-gradient(135deg,#7c3aed,#4f46e5)",
            color: "white",
            fontWeight: "800",
            fontSize: "14px",
            cursor: sending ? "not-allowed" : "pointer",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            letterSpacing: "0.02em",
            boxShadow: sending ? "none" : "0 4px 20px rgba(0,0,0,0.3)",
          }}
        >
          {sending ? (
            <>⏳ Mengirim...</>
          ) : (
            <>
              {meta.icon} Kirim {meta.label}{" "}
              {target === "all" ? `ke Semua (${users.length})` : `ke ${selectedUser?.username ?? "..."}`}
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleTestSelf}
          disabled={sending}
          style={{
            padding: "14px 20px",
            borderRadius: "10px",
            border: "1px solid rgba(96,165,250,0.4)",
            background: "rgba(96,165,250,0.12)",
            color: "#60a5fa",
            fontWeight: "700",
            fontSize: "13px",
            cursor: sending ? "not-allowed" : "pointer",
            transition: "all 0.2s",
            whiteSpace: "nowrap",
          }}
        >
          ⚡ Tes Notifikasi Layar Real-Time
        </button>
      </div>
    </div>
  );
}

// ─── Sent Log ─────────────────────────────────────────────────────────────────

function SentLogPanel({ messages, onRefresh }: { messages: SentMessage[]; onRefresh: () => void }) {
  if (messages.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>📭</div>
        <div style={{ fontSize: "16px", fontWeight: "600" }}>Belum ada pesan yang terkirim</div>
        <div style={{ fontSize: "13px", marginTop: "6px" }}>Pesan yang kamu kirim akan tampil di sini</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {messages.map((msg) => {
        const meta = TYPE_META[msg.type];
        return (
          <div
            key={msg.id}
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              display: "flex",
              gap: "14px",
              alignItems: "flex-start",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                background: `${meta.color}18`,
                border: `1.5px solid ${meta.color}44`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "16px",
                flexShrink: 0,
              }}
            >
              {meta.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                <span style={{ fontWeight: "700", fontSize: "14px", color: "var(--text)" }}>
                  {msg.title}
                </span>
                <span style={{
                  fontSize: "10px",
                  fontWeight: "800",
                  color: meta.color,
                  background: `${meta.color}18`,
                  padding: "2px 7px",
                  borderRadius: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                }}>
                  {meta.label}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px", lineHeight: 1.5 }}>
                {msg.body}
              </div>
              {msg.reason && (
                <div style={{ fontSize: "11px", color: "#f87171", marginBottom: "6px" }}>
                  🚫 Alasan: {msg.reason}
                </div>
              )}
              <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  📮 Kepada:{" "}
                  <strong style={{ color: "var(--text)" }}>
                    {msg.targetUserId === "all" ? "🌐 Semua Pengguna" : msg.targetUsername}
                  </strong>
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  🕐 {fmtDate(msg.sentAt)}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "auto" }}>
                  {relTime(msg.sentAt)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Read Receipts Supporting System ──────────────────────────────────────────

interface ReadReceiptItem {
  messageId: string;
  readCount: number;
  totalRecipients: number;
  readRatePct: number;
  readers: {
    userId: string;
    email: string;
    username: string;
  }[];
}

function ReadReceiptsPanel() {
  const [loading, setLoading] = useState(false);
  const [receipts, setReceipts] = useState<Record<string, ReadReceiptItem>>({});
  const [error, setError] = useState("");

  const fetchReceipts = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/read-receipts");
      const data = await res.json() as { receipts?: Record<string, ReadReceiptItem>; error?: string };
      if (!res.ok) { setError(data.error ?? "Gagal memuat tanda terima"); return; }
      setReceipts(data.receipts ?? {});
    } catch (e) {
      setError("Koneksi gagal: " + String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchReceipts();
  }, []);

  const items = Object.values(receipts);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <div style={{ fontWeight: "800", fontSize: "14px", color: "var(--text)" }}>
            👁️ Tanda Terima & Persentase Keterbacaan Pesan
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
            Lacak secara real-time akun mana saja yang telah membuka dan membaca pesan dari Admin
          </div>
        </div>
        <button
          onClick={fetchReceipts}
          disabled={loading}
          style={{
            padding: "7px 14px", borderRadius: "8px", border: "1px solid var(--border)",
            background: "var(--bg-secondary)", color: "var(--text)", fontSize: "12px",
            fontWeight: "600", cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "⏳ Memuat..." : "🔄 Refresh Tanda Terima"}
        </button>
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "10px 14px", fontSize: "12px", color: "#f87171" }}>
          ❌ {error}
        </div>
      )}

      {items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)", fontSize: "13px" }}>
          📭 Belum ada data tanda terima dibaca.
        </div>
      ) : (
        items.map((r) => (
          <div
            key={r.messageId}
            style={{
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px",
              padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
              <code style={{ fontSize: "11px", color: "var(--text-muted)", background: "var(--bg-secondary)", padding: "2px 6px", borderRadius: "4px" }}>
                ID: {r.messageId}
              </code>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: "800", color: "#4ade80" }}>
                  👁️ {r.readCount}/{r.totalRecipients} Akun ({r.readRatePct}%)
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ width: "100%", height: "6px", background: "var(--bg-secondary)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ width: `${r.readRatePct}%`, height: "100%", background: "linear-gradient(90deg, #2563eb, #4ade80)", transition: "width 0.5s ease" }} />
            </div>

            {/* Readers chips */}
            {r.readers.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                {r.readers.map((u) => (
                  <span
                    key={u.userId}
                    style={{
                      fontSize: "11px", background: "rgba(74,222,128,0.12)", color: "#4ade80",
                      padding: "3px 9px", borderRadius: "6px", border: "1px solid rgba(74,222,128,0.25)",
                      display: "inline-flex", alignItems: "center", gap: "4px",
                    }}
                  >
                    ✓ {u.username} ({u.email})
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                ⏳ Belum ada pengguna yang membaca pesan ini.
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ─── System Error Sentinel Supporting Panel ───────────────────────────────────

interface SystemErrorLog {
  id: string;
  category: string;
  message: string;
  stack?: string;
  endpoint?: string;
  userEmail?: string;
  ip?: string;
  timestamp: string;
}

function SystemErrorAlertsPanel() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<SystemErrorLog[]>([]);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/system-errors");
      const data = await res.json() as { logs?: SystemErrorLog[]; error?: string };
      if (!res.ok) { setError(data.error ?? "Gagal memuat log error"); return; }
      setLogs(data.logs ?? []);
    } catch (e) {
      setError("Koneksi gagal: " + String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!confirm("Hapus semua log error system?")) return;
    try {
      await fetch("/api/admin/system-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      void fetchLogs();
    } catch { /* silent */ }
  };

  const handleTestTrigger = async () => {
    try {
      await fetch("/api/admin/system-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      alert("⚡ Notifikasi error tes berhasil dikirim ke Admin Inbox!");
      void fetchLogs();
    } catch { /* silent */ }
  };

  useEffect(() => {
    void fetchLogs();
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <div style={{ fontWeight: "800", fontSize: "14px", color: "var(--text)" }}>
            🚨 System Anti-Error & Bug Sentinel Logs ({logs.length})
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
            Laporan otomatis real-time jika terjadi crash, exception API, atau bug pada sistem
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleTestTrigger}
            style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid rgba(96,165,250,0.4)", background: "rgba(96,165,250,0.12)", color: "#60a5fa", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}
          >
            ⚡ Tes Sentinel Alert
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", fontSize: "12px", fontWeight: "600", cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "⏳" : "🔄"} Refresh
          </button>
          {logs.length > 0 && (
            <button
              onClick={handleClear}
              style={{ padding: "7px 12px", borderRadius: "8px", border: "none", background: "rgba(239,68,68,0.15)", color: "#f87171", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}
            >
              🗑️ Hapus Log
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "10px 14px", fontSize: "12px", color: "#f87171" }}>
          ❌ {error}
        </div>
      )}

      {logs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#4ade80", fontSize: "13px", background: "rgba(74,222,128,0.05)", borderRadius: "12px", border: "1px solid rgba(74,222,128,0.2)" }}>
          ✅ <strong>Sistem Bersih 100%!</strong> Tidak ada error atau bug yang terdeteksi saat ini.
        </div>
      ) : (
        logs.map((log) => (
          <div
            key={log.id}
            style={{
              background: "var(--surface)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px",
              overflow: "hidden",
            }}
          >
            <div
              onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
              style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}
            >
              <span style={{ fontSize: "10px", fontWeight: "800", background: "rgba(239,68,68,0.15)", color: "#f87171", padding: "2px 7px", borderRadius: "5px", textTransform: "uppercase" }}>
                {log.category}
              </span>
              <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text)", flex: 1, minWidth: "200px" }}>
                {log.message}
              </div>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {new Date(log.timestamp).toLocaleString("id-ID")}
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{expandedId === log.id ? "▲" : "▼"}</span>
            </div>

            {expandedId === log.id && (
              <div style={{ borderTop: "1px solid var(--border)", padding: "14px 16px", background: "var(--bg-secondary)", fontSize: "12px" }}>
                <div style={{ marginBottom: "6px", color: "var(--text-muted)" }}>
                  Endpoint: <code>{log.endpoint ?? "Client"}</code> &nbsp;·&nbsp; User: <code>{log.userEmail ?? "Anonim"}</code> &nbsp;·&nbsp; IP: <code>{log.ip ?? "Unknown"}</code>
                </div>
                {log.stack && (
                  <pre style={{ margin: 0, padding: "10px", background: "#0f172a", borderRadius: "6px", color: "#fca5a5", fontSize: "11px", fontFamily: "monospace", overflowX: "auto", whiteSpace: "pre-wrap" }}>
                    {log.stack}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}


// ─── Health Check Panel ───────────────────────────────────────────────────────

interface ServiceHealth { service: string; status: string; latencyMs: number; details: string; }
interface HealthReport { overallStatus: string; timestamp: string; services: ServiceHealth[]; }

function HealthCheckPanel() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<HealthReport | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/health-check");
      const data = await res.json() as HealthReport;
      setReport(data);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  useEffect(() => { void run(); }, []);

  const statusColor = (s: string) =>
    s === "HEALTHY" ? "#4ade80" : s === "DEGRADED" ? "#fb923c" : "#f87171";

  const statusBg = (s: string) =>
    s === "HEALTHY" ? "rgba(74,222,128,0.12)" : s === "DEGRADED" ? "rgba(251,146,60,0.12)" : "rgba(248,113,113,0.12)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text)" }}>🏥 System Health Monitor — Real-Time Service Probe</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            Pemeriksaan otomatis seluruh layanan: Redis, AI Engine, Mailer
          </div>
        </div>
        <button onClick={run} disabled={loading} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", fontSize: 12, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "⏳ Memeriksa..." : "🔄 Jalankan Probe"}
        </button>
      </div>

      {report && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: statusBg(report.overallStatus), border: `1px solid ${statusColor(report.overallStatus)}40` }}>
            <span style={{ fontSize: 22 }}>{report.overallStatus === "HEALTHY" ? "✅" : report.overallStatus === "DEGRADED" ? "⚠️" : "🚨"}</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: statusColor(report.overallStatus) }}>Overall: {report.overallStatus}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Diperiksa pada {new Date(report.timestamp).toLocaleString("id-ID")}</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {report.services.map((svc) => (
              <div key={svc.service} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, background: "var(--surface)", border: `1px solid ${statusColor(svc.status)}30` }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(svc.status), flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{svc.service}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{svc.details}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: statusColor(svc.status), background: statusBg(svc.status), padding: "2px 8px", borderRadius: 5 }}>
                  {svc.status} {svc.latencyMs > 0 ? `(${svc.latencyMs}ms)` : ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Maintenance Mode Panel ───────────────────────────────────────────────────

interface MaintenanceCfg { enabled: boolean; title: string; message: string; estimatedEnd?: string; allowedEmails: string[]; }

function MaintenancePanel() {
  const [cfg, setCfg] = useState<MaintenanceCfg | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState("");

  useEffect(() => {
    fetch("/api/admin/maintenance").then((r) => r.json()).then((d: MaintenanceCfg) => setCfg(d)).catch(() => {});
  }, []);

  const save = async (patch: Partial<MaintenanceCfg>) => {
    setSaving(true); setResult("");
    try {
      const res = await fetch("/api/admin/maintenance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const d = await res.json() as { ok?: boolean; config?: MaintenanceCfg; error?: string };
      if (d.ok && d.config) { setCfg(d.config); setResult("✅ Konfigurasi berhasil disimpan!"); }
      else setResult("❌ " + (d.error ?? "Gagal menyimpan"));
    } catch { setResult("❌ Koneksi gagal"); } finally { setSaving(false); }
  };

  if (!cfg) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>⏳ Memuat konfigurasi...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text)" }}>🔧 Maintenance Mode Controller</div>

      {/* Toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: 10, background: cfg.enabled ? "rgba(251,146,60,0.1)" : "var(--surface)", border: `1px solid ${cfg.enabled ? "#fb923c" : "var(--border)"}` }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: cfg.enabled ? "#fb923c" : "var(--text)" }}>
            {cfg.enabled ? "🔴 Maintenance Mode AKTIF" : "🟢 Situs Normal (Online)"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            {cfg.enabled ? "Pengguna tidak dapat mengakses situs saat ini" : "Semua pengguna dapat mengakses situs"}
          </div>
        </div>
        <button
          onClick={() => save({ enabled: !cfg.enabled })}
          disabled={saving}
          style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: cfg.enabled ? "#4ade80" : "#f87171", color: "#fff", fontWeight: 800, fontSize: 13, cursor: saving ? "not-allowed" : "pointer" }}
        >
          {cfg.enabled ? "✅ Nonaktifkan" : "🔴 Aktifkan Maintenance"}
        </button>
      </div>

      {/* Config fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Judul Halaman Maintenance</label>
        <input
          defaultValue={cfg.title}
          onBlur={(e) => setCfg((p) => p ? { ...p, title: e.target.value } : p)}
          style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", fontSize: 13 }}
        />
        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Pesan ke Pengguna</label>
        <textarea
          defaultValue={cfg.message}
          rows={3}
          onBlur={(e) => setCfg((p) => p ? { ...p, message: e.target.value } : p)}
          style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", fontSize: 13, resize: "vertical" }}
        />
        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Estimasi Selesai (opsional)</label>
        <input
          type="datetime-local"
          defaultValue={cfg.estimatedEnd ? cfg.estimatedEnd.slice(0, 16) : ""}
          onBlur={(e) => setCfg((p) => p ? { ...p, estimatedEnd: e.target.value ? new Date(e.target.value).toISOString() : undefined } : p)}
          style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", fontSize: 13 }}
        />
      </div>

      <button
        onClick={() => save(cfg)}
        disabled={saving}
        style={{ padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: saving ? "not-allowed" : "pointer" }}
      >
        {saving ? "⏳ Menyimpan..." : "💾 Simpan Konfigurasi"}
      </button>

      {result && <div style={{ fontSize: 12, fontWeight: 700, color: result.startsWith("✅") ? "#4ade80" : "#f87171" }}>{result}</div>}
    </div>
  );
}

// ─── Message Templates Panel ─────────────────────────────────────────────────

interface MsgTemplate { id: string; name: string; type: "message" | "refresh" | "block"; title: string; body: string; reason?: string; tags: string[]; usageCount: number; }

function TemplatesPanel({ onUseTemplate }: { onUseTemplate?: (t: MsgTemplate) => void }) {
  const [templates, setTemplates] = useState<MsgTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newType, setNewType] = useState<"message" | "refresh" | "block">("message");
  const [saving, setSaving] = useState(false);

  const fetch_ = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/message-templates");
      const d = await res.json() as { templates?: MsgTemplate[] };
      setTemplates(d.templates ?? []);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  useEffect(() => { void fetch_(); }, []);

  const handleCreate = async () => {
    if (!newName.trim() || !newTitle.trim() || !newBody.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/admin/message-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", template: { name: newName, type: newType, title: newTitle, body: newBody, tags: [] } }),
      });
      setShowCreate(false); setNewName(""); setNewTitle(""); setNewBody("");
      void fetch_();
    } catch { /* silent */ } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus template ini?")) return;
    await fetch("/api/admin/message-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    void fetch_();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text)" }}>📁 Pustaka Template Pesan Admin</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Simpan & gunakan ulang pesan standar dengan 1 klik</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowCreate(!showCreate)} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#7c3aed,#2563eb)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {showCreate ? "✕ Batal" : "+ Template Baru"}
          </button>
          <button onClick={fetch_} disabled={loading} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {loading ? "⏳" : "🔄"}
          </button>
        </div>
      </div>

      {showCreate && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>✏️ Buat Template Baru</div>
          <select value={newType} onChange={(e) => setNewType(e.target.value as "message" | "refresh" | "block")} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", fontSize: 13 }}>
            <option value="message">💬 Pesan Biasa</option>
            <option value="refresh">🔄 Refresh/Reload</option>
            <option value="block">🚫 Blokir Akun</option>
          </select>
          <input placeholder="Nama template..." value={newName} onChange={(e) => setNewName(e.target.value)} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", fontSize: 13 }} />
          <input placeholder="Judul pesan..." value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", fontSize: 13 }} />
          <textarea placeholder="Isi pesan..." value={newBody} onChange={(e) => setNewBody(e.target.value)} rows={3} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", fontSize: 13, resize: "vertical" }} />
          <button onClick={handleCreate} disabled={saving || !newName || !newTitle || !newBody} style={{ padding: "10px", borderRadius: 8, border: "none", background: saving ? "#334155" : "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "⏳ Menyimpan..." : "💾 Simpan Template"}
          </button>
        </div>
      )}

      {templates.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>📁 Belum ada template tersimpan.</div>
      ) : (
        templates.map((t) => (
          <div key={t.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", padding: "2px 7px", borderRadius: 5, background: t.type === "block" ? "rgba(239,68,68,0.15)" : t.type === "refresh" ? "rgba(74,222,128,0.12)" : "rgba(37,99,235,0.12)", color: t.type === "block" ? "#f87171" : t.type === "refresh" ? "#4ade80" : "#60a5fa" }}>
                  {t.type === "block" ? "🚫 Blokir" : t.type === "refresh" ? "🔄 Refresh" : "💬 Pesan"}
                </span>
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{t.name}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>({t.usageCount}x digunakan)</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {onUseTemplate && (
                  <button onClick={() => { onUseTemplate(t); }} style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: "#2563eb", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    ⚡ Gunakan
                  </button>
                )}
                <button onClick={() => handleDelete(t.id)} style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: "rgba(239,68,68,0.15)", color: "#f87171", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  🗑️
                </button>
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>{t.title}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{t.body.slice(0, 120)}{t.body.length > 120 ? "..." : ""}</div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Activity Feed Panel ──────────────────────────────────────────────────────

interface ActEvent { id: string; userId: string; email: string; username: string; action: string; path?: string; detail?: string; ip?: string; timestamp: string; }

function ActivityFeedPanel({ users }: { users: { id: string; email: string; username: string }[] }) {
  const [events, setEvents] = useState<ActEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUid, setSelectedUid] = useState<string>("global");

  const fetchEvents = async (uid: string) => {
    setLoading(true);
    try {
      const query = uid !== "global" ? `?userId=${encodeURIComponent(uid)}` : "";
      const res = await fetch(`/api/user/activity${query}`);
      const d = await res.json() as { events?: ActEvent[] };
      setEvents(d.events ?? []);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  useEffect(() => { void fetchEvents("global"); }, []);

  const actionIcon: Record<string, string> = {
    login: "🔑", logout: "🚪", page_view: "👁️", upload: "📤", generate: "⚡",
    error: "🚨", block_attempt: "🛡️",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text)" }}>📊 Activity Feed — Riwayat Aktivitas Pengguna</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Lacak login, upload, generate, dan error per pengguna secara real-time</div>
        </div>
        <button onClick={() => fetchEvents(selectedUid)} disabled={loading} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          {loading ? "⏳" : "🔄"} Refresh
        </button>
      </div>

      {/* User filter chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {[{ id: "global", username: "Semua Aktivitas" }, ...users].map((u) => {
          const sel = selectedUid === u.id;
          return (
            <button key={u.id} onClick={() => { setSelectedUid(u.id); void fetchEvents(u.id); }} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${sel ? "#7c3aed" : "var(--border)"}`, background: sel ? "rgba(124,58,237,0.2)" : "transparent", color: sel ? "#a78bfa" : "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {u.username}
            </button>
          );
        })}
      </div>

      {events.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>📭 Belum ada aktivitas terekam.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {events.map((ev) => (
            <div key={ev.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{actionIcon[ev.action] ?? "📌"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                  <span style={{ color: "#a78bfa" }}>{ev.username}</span> · {ev.action.replace("_", " ")}
                  {ev.path ? <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> @ {ev.path}</span> : null}
                </div>
                {ev.detail && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{ev.detail}</div>}
              </div>
              <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0, textAlign: "right" }}>
                {new Date(ev.timestamp).toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shared Styles ────────────────────────────────────────────────────────────


const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: "700",
  textTransform: "uppercase" as const,
  letterSpacing: "0.07em",
  color: "var(--text-muted)",
  marginBottom: "8px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  color: "var(--text)",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box" as const,
  transition: "border-color 0.2s",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MessageWebPanel() {
  const [activeView, setActiveView] = useState<"compose" | "log" | "receipts" | "errors" | "health" | "maintenance" | "templates" | "activity" | "debug">("compose");
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) return;
      const data = await res.json() as { users: AccountUser[] };
      setUsers(data.users ?? []);
    } catch { /* silent */ }
  }, []);

  const fetchLog = useCallback(async () => {
    setLoadingLog(true);
    try {
      const res = await fetch("/api/admin/messageweb");
      if (!res.ok) return;
      const data = await res.json() as { messages: SentMessage[] };
      setSentMessages(data.messages ?? []);
    } catch { /* silent */ }
    finally { setLoadingLog(false); }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchLog();
    const id = setInterval(fetchUsers, 3000);
    return () => clearInterval(id);
  }, [fetchUsers, fetchLog]);

  const onlineCount = users.filter((u) => u.isOnline).length;

  return (
    <div className="uploader">
      <style>{`
        @keyframes msgPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(167,139,250,0.5); }
          50% { box-shadow: 0 0 0 8px rgba(167,139,250,0); }
        }
        @keyframes slideIn {
          from { opacity:0; transform:translateY(8px); }
          to { opacity:1; transform:translateY(0); }
        }
        .mw-tab-btn { transition: all 0.2s; }
        .mw-tab-btn:hover { background: rgba(255,255,255,0.06) !important; }
        .input-focus:focus { border-color: #7c3aed !important; box-shadow: 0 0 0 3px rgba(124,58,237,0.2); }
      `}</style>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="uploader__hero" style={{ marginBottom: "24px" }}>
        <h2>📨 Message Web</h2>
        <p>
          Kirim pesan, perintah refresh, atau blokir akses ke pengguna tertentu atau semua pengguna.
          Pesan tampil sebagai notifikasi langsung di layar pengguna secara real-time.
        </p>
      </div>

      {/* ── Stats Bar ────────────────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: "12px",
        marginBottom: "24px",
      }}>
        {[
          { icon: "👥", label: "Total User", val: users.length, color: "#60a5fa" },
          { icon: "🟢", label: "Online Sekarang", val: onlineCount, color: "#4ade80" },
          { icon: "📬", label: "Pesan Terkirim", val: sentMessages.length, color: "#a78bfa" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: "var(--surface)",
              border: `1px solid ${s.color}33`,
              borderRadius: "12px",
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              background: `${s.color}18`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
            }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: "20px", fontWeight: "800", color: "var(--text)", lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>{s.label}</div>
            </div>
          </div>
        ))}

        {/* Online User Quick Chips */}
        {onlineCount > 0 && (
          <div style={{
            background: "rgba(74,222,128,0.06)",
            border: "1px solid rgba(74,222,128,0.2)",
            borderRadius: "12px",
            padding: "14px 18px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}>
            <div style={{ fontSize: "11px", fontWeight: "700", color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              🟢 Sedang Online
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {users.filter((u) => u.isOnline).map((u) => (
                <span
                  key={u.id}
                  style={{
                    fontSize: "11px",
                    fontWeight: "600",
                    background: "rgba(74,222,128,0.15)",
                    color: "#4ade80",
                    padding: "2px 9px",
                    borderRadius: "20px",
                    border: "1px solid rgba(74,222,128,0.3)",
                  }}
                >
                  {u.username}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Tab Switch ───────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        gap: "4px",
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "4px",
        marginBottom: "20px",
        width: "fit-content",
      }}>
        {([
          { id: "compose", icon: "✏️", label: "Tulis Pesan" },
          { id: "log", icon: "📋", label: `Riwayat (${sentMessages.length})` },
          { id: "receipts", icon: "👁️", label: "Tanda Terima" },
          { id: "errors", icon: "🚨", label: "Error Logs" },
          { id: "health", icon: "🏥", label: "Health Check" },
          { id: "maintenance", icon: "🔧", label: "Maintenance" },
          { id: "templates", icon: "📁", label: "Templates" },
          { id: "activity", icon: "📊", label: "Activity Feed" },
          { id: "debug", icon: "🔍", label: "Debug Log" },
        ] as const).map((tab) => {
          const active = activeView === tab.id;
          return (
            <button
              key={tab.id}
              className="mw-tab-btn"
              onClick={() => { setActiveView(tab.id); if (tab.id === "log") fetchLog(); }}
              style={{
                padding: "9px 18px",
                borderRadius: "9px",
                border: "none",
                background: active
                  ? "linear-gradient(135deg, rgba(124,58,237,0.4), rgba(236,72,153,0.2))"
                  : "transparent",
                color: active ? "var(--text)" : "var(--text-muted)",
                cursor: "pointer",
                fontWeight: active ? "700" : "500",
                fontSize: "13px",
                boxShadow: active ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "7px",
              }}
            >
              {tab.icon} {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Main Card ────────────────────────────────────────────────────────── */}
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "16px",
        overflow: "hidden",
        animation: "slideIn 0.3s ease",
      }}>

        {/* Card Header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid var(--border)",
          background: activeView === "compose"
            ? "linear-gradient(135deg, rgba(124,58,237,0.1), rgba(236,72,153,0.06))"
            : "linear-gradient(135deg, rgba(14,165,233,0.08), rgba(124,58,237,0.06))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
        }}>
          <div>
            <div style={{ fontWeight: "800", fontSize: "16px", color: "var(--text)" }}>
              {activeView === "compose" ? "✏️ Tulis & Kirim Pesan" : activeView === "log" ? "📋 Riwayat Pesan Terkirim" : "🔍 Debug Log — Status & Diagnosa Real-Time"}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "3px" }}>
              {activeView === "compose"
                ? "Pilih tipe, target, dan isi pesan untuk dikirim ke pengguna"
                : activeView === "log"
                ? "Semua pesan yang pernah dikirim admin · diurutkan terbaru"
                : "Periksa Redis key, status terbaca, log error, dan status aktif per akun"}
            </div>
          </div>
          {activeView === "log" && (
            <button
              onClick={fetchLog}
              disabled={loadingLog}
              style={{
                padding: "7px 14px",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--text)",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "600",
              }}
            >
              {loadingLog ? "⏳" : "🔄"} Refresh
            </button>
          )}
        </div>

        {/* Card Body */}
        <div style={{ padding: activeView !== "log" ? "24px" : "0" }}>
          {activeView === "compose" ? (
            <ComposePanelForm users={users} onSent={fetchLog} />
          ) : activeView === "receipts" ? (
            <ReadReceiptsPanel />
          ) : activeView === "errors" ? (
            <SystemErrorAlertsPanel />
          ) : activeView === "health" ? (
            <HealthCheckPanel />
          ) : activeView === "maintenance" ? (
            <MaintenancePanel />
          ) : activeView === "templates" ? (
            <TemplatesPanel />
          ) : activeView === "activity" ? (
            <ActivityFeedPanel users={users} />
          ) : activeView === "debug" ? (
            <DebugPanel users={users} />
          ) : loadingLog ? (
            <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>
              <span className="spinner" style={{ marginBottom: "12px" }} />
              <div>Memuat riwayat...</div>
            </div>
          ) : (
            <SentLogPanel messages={sentMessages} onRefresh={fetchLog} />
          )}
        </div>
      </div>

      {/* ── Info Footer ──────────────────────────────────────────────────────── */}
      <div style={{
        marginTop: "16px",
        padding: "12px 16px",
        background: "rgba(124,58,237,0.07)",
        border: "1px solid rgba(124,58,237,0.2)",
        borderRadius: "8px",
        fontSize: "12px",
        color: "var(--text-muted)",
        display: "flex",
        gap: "8px",
        alignItems: "flex-start",
      }}>
        <span style={{ fontSize: "16px" }}>ℹ️</span>
        <div>
          <strong style={{ color: "var(--text)" }}>Cara kerja sistem:</strong>{" "}
          Pengguna yang sedang aktif di web akan menerima pesan secara real-time (polling setiap 10 detik).
          Pesan jenis <strong>🔄 Refresh</strong> menampilkan notifikasi untuk meminta reload.
          Pesan jenis <strong>🚫 Blokir</strong> akan langsung memblokir layar pengguna dengan overlay penuh hingga mereka reload.
        </div>
      </div>
    </div>
  );
}
