"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { addUsage, formatTokens } from "@/lib/tokenStore";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  timestamp: number;
  tokens?: { prompt: number; completion: number; total: number };
  attachments?: AttachmentMeta[];
}

interface AttachmentMeta {
  name: string;
  type: string;
  size: number;
  icon: string;
}

interface PendingAttachment {
  id: string;
  file: File;
  name: string;
  type: string;
  size: number;
  icon: string;
  preview?: string; // base64 data URL for images
  content?: string; // text content for text-based files
}

// ── Helpers ──────────────────────────────────────────────────

function getFileIcon(type: string, name: string): string {
  if (type.startsWith("image/")) return "🖼️";
  if (type === "application/pdf") return "📄";
  if (name.endsWith(".md")) return "📝";
  if (name.endsWith(".csv")) return "📊";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "📊";
  if (name.endsWith(".docx") || name.endsWith(".doc")) return "📃";
  if (
    type.includes("javascript") ||
    type.includes("typescript") ||
    name.match(/\.(js|ts|jsx|tsx|py|json|html|css|xml|java|go|rs|rb|php|sh|yaml|yml)$/)
  )
    return "💻";
  if (type.startsWith("text/")) return "📋";
  return "📎";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const ACCEPTED_TYPES =
  "image/*,application/pdf,.txt,.md,.csv,.json,.js,.ts,.jsx,.tsx,.py,.html,.css,.xml,.docx,.xlsx,.java,.go,.rs,.rb,.php,.sh,.yaml,.yml";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ── Format content (markdown-ish) ───────────────────────────

function formatContent(content: string) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const match = /```(\w*)\n?([\s\S]*?)```/.exec(part);
      const lang = match?.[1] ?? "";
      const code = match?.[2]?.trim() ?? part.replace(/```/g, "").trim();
      return (
        <div key={i} className="chat-code-block">
          {lang && <div className="chat-code-lang">{lang}</div>}
          <pre><code>{code}</code></pre>
        </div>
      );
    }
    const inlineParts = part.split(/(\*\*.*?\*\*|\*.*?\*|_.*?_|~.*?~|`[^`]+`)/g);
    return (
      <span key={i}>
        {inlineParts.map((p, j) => {
          if (p.startsWith("**") && p.endsWith("**") && p.length >= 4)
            return <strong key={j}>{p.slice(2, -2)}</strong>;
          if (p.startsWith("*") && p.endsWith("*") && p.length >= 2)
            return <em key={j}>{p.slice(1, -1)}</em>;
          if (p.startsWith("_") && p.endsWith("_") && p.length >= 2)
            return <em key={j}>{p.slice(1, -1)}</em>;
          if (p.startsWith("~") && p.endsWith("~") && p.length >= 2)
            return <del key={j}>{p.slice(1, -1)}</del>;
          if (p.startsWith("`") && p.endsWith("`") && p.length >= 2)
            return <code key={j} className="chat-inline-code">{p.slice(1, -1)}</code>;
          return <span key={j}>{p}</span>;
        })}
      </span>
    );
  });
}

// ── Source chips placeholder data ───────────────────────────
const FAKE_SOURCES = [
  { color: "#4f46e5" },
  { color: "#0ea5e9" },
  { color: "#10b981" },
];

// ── Props ────────────────────────────────────────────────────
interface Props {
  onTokensUpdated?: () => void;
}

// ── Component ────────────────────────────────────────────────
export default function AIChat({ onTokensUpdated }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionTokens, setSessionTokens] = useState({ prompt: 0, completion: 0, total: 0 });

  // Streaming state
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const streamingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Enhanced loading state
  const [elapsedMs, setElapsedMs] = useState(0);
  const [progress, setProgress] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadStartRef = useRef<number>(0);

  // File attachments
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isEmpty = messages.length === 0;

  // ── Scroll to bottom ────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // ── Cleanup timers on unmount ────────────────────────────
  useEffect(() => {
    return () => {
      if (streamingRef.current) clearInterval(streamingRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, []);

  // ── Start streaming animation ────────────────────────────
  const startStreaming = useCallback((fullText: string, msgId: string) => {
    setStreamingId(msgId);
    setStreamingText("");

    let charIndex = 0;
    streamingRef.current = setInterval(() => {
      charIndex++;
      setStreamingText(fullText.slice(0, charIndex));
      if (charIndex >= fullText.length) {
        clearInterval(streamingRef.current!);
        streamingRef.current = null;
        setStreamingId(null);
        setStreamingText("");
      }
    }, 8);
  }, []);

  // ── Start loading indicators ─────────────────────────────
  const startLoadingIndicators = useCallback(() => {
    loadStartRef.current = Date.now();
    setElapsedMs(0);
    setProgress(0);

    elapsedRef.current = setInterval(() => {
      setElapsedMs(Date.now() - loadStartRef.current);
    }, 100);

    // Fake progress: ramp to ~70% in 2s
    let p = 0;
    progressRef.current = setInterval(() => {
      p = Math.min(p + (70 / 20), 70); // 20 steps over 2s = 100ms intervals
      setProgress(p);
    }, 100);
  }, []);

  const stopLoadingIndicators = useCallback(() => {
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null; }
    setProgress(100);
    setTimeout(() => setProgress(0), 400);
  }, []);

  // ── File handling ────────────────────────────────────────
  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string ?? "");
      reader.onerror = () => reject(new Error("Failed to read file"));

      if (file.type.startsWith("image/")) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // reset so same file can be re-added

    for (const file of files) {
      // Block video files
      if (file.type.startsWith("video/")) {
        setError("Video files tidak didukung.");
        continue;
      }
      // Size check
      if (file.size > MAX_FILE_SIZE) {
        setError(`File "${file.name}" melebihi batas 10MB.`);
        continue;
      }

      const icon = getFileIcon(file.type, file.name);
      const id = `att_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const pending: PendingAttachment = {
        id,
        file,
        name: file.name,
        type: file.type,
        size: file.size,
        icon,
      };

      try {
        if (file.type.startsWith("image/")) {
          pending.preview = await readFileContent(file);
        } else if (
          file.type.startsWith("text/") ||
          file.name.match(/\.(txt|md|csv|json|js|ts|jsx|tsx|py|html|css|xml|yaml|yml|sh|rb|go|rs|java|php)$/)
        ) {
          pending.content = await readFileContent(file);
        }
        // For pdf/docx/xlsx — no text extraction, just attach metadata
      } catch {
        // If read fails, still attach without content
      }

      setAttachments((prev) => [...prev, pending]);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // ── Build message content with attachments ───────────────
  const buildMessageContent = (text: string, atts: PendingAttachment[]): string => {
    if (atts.length === 0) return text;

    const parts: string[] = [text];

    for (const att of atts) {
      if (att.preview) {
        // Image: include as data URL reference
        parts.push(`\n\n[Image attached: ${att.name}]\n${att.preview}`);
      } else if (att.content) {
        // Text/code: include raw content
        const ext = att.name.split(".").pop() ?? "";
        parts.push(`\n\n[File: ${att.name}]\n\`\`\`${ext}\n${att.content.slice(0, 8000)}\n\`\`\``);
      } else {
        // Binary file (pdf, docx, xlsx)
        parts.push(`\n\n[File attached: ${att.name} — binary file, text extraction not available]`);
      }
    }

    return parts.join("");
  };

  // ── Send message ─────────────────────────────────────────
  const handleSend = async () => {
    const trimmed = input.trim();
    if ((!trimmed && attachments.length === 0) || loading) return;

    const messageContent = buildMessageContent(trimmed || "(file attached)", attachments);
    const attachmentMeta: AttachmentMeta[] = attachments.map((a) => ({
      name: a.name,
      type: a.type,
      size: a.size,
      icon: a.icon,
    }));

    const userMsg: Message = {
      id: `u${Date.now()}`,
      role: "user",
      content: messageContent,
      timestamp: Date.now(),
      attachments: attachmentMeta.length > 0 ? attachmentMeta : undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachments([]);
    setLoading(true);
    setError("");

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    startLoadingIndicators();

    try {
      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      const data = await res.json() as {
        content?: string;
        model?: string;
        error?: string;
        usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
      };

      if (!res.ok) {
        setError(data.error ?? "Gagal mendapat respons");
        return;
      }

      const u = data.usage;
      if (u) {
        addUsage(u.promptTokens, u.completionTokens, "chat");
        setSessionTokens((prev) => ({
          prompt: prev.prompt + u.promptTokens,
          completion: prev.completion + u.completionTokens,
          total: prev.total + u.totalTokens,
        }));
        onTokensUpdated?.();
      }

      const msgId = `a${Date.now()}`;
      const fullContent = data.content ?? "";

      const assistantMsg: Message = {
        id: msgId,
        role: "assistant",
        content: fullContent,
        model: data.model,
        timestamp: Date.now(),
        tokens: u
          ? { prompt: u.promptTokens, completion: u.completionTokens, total: u.totalTokens }
          : undefined,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      startStreaming(fullContent, msgId);
    } catch {
      setError("Koneksi gagal, coba lagi.");
    } finally {
      stopLoadingIndicators();
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  };

  const handleClear = () => {
    setMessages([]);
    setError("");
    setSessionTokens({ prompt: 0, completion: 0, total: 0 });
    setAttachments([]);
    if (streamingRef.current) clearInterval(streamingRef.current);
    setStreamingId(null);
    setStreamingText("");
  };

  // ── Render message content (with streaming) ──────────────
  const renderMessageContent = (msg: Message) => {
    const isCurrentlyStreaming = streamingId === msg.id;
    const displayContent = isCurrentlyStreaming ? streamingText : msg.content;

    return (
      <>
        <div className={`aichat__msg-content ${isCurrentlyStreaming ? "aichat__streaming-text" : ""}`}>
          {formatContent(displayContent)}
          {isCurrentlyStreaming && <span className="aichat__cursor" aria-hidden="true" />}
        </div>
        {/* Attachment metadata display */}
        {msg.attachments?.map((att, i) => (
          <div key={i} className="aichat__msg-attachment">
            <span>{att.icon}</span>
            <span>{att.name}</span>
            <span style={{ opacity: 0.6, fontSize: "10px" }}>{formatBytes(att.size)}</span>
          </div>
        ))}
      </>
    );
  };

  // ── Enhanced loading indicator ───────────────────────────
  const elapsedSec = (elapsedMs / 1000).toFixed(1);

  const renderLoadingBubble = () => (
    <div className="aichat__msg aichat__msg--assistant">
      <div className="aichat__msg-bubble">
        <div className="aichat__loading-state">
          <div className="aichat__loading-label">
            <span>Groq AI sedang memproses...</span>
            <span className="aichat__elapsed">{elapsedSec}s</span>
          </div>
          <div className="aichat__progress-bar">
            <div
              className="aichat__progress-bar-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          {/* Web search status (appears after 1.5s via CSS animation) */}
          <div className="aichat__search-status">
            <span>🔍 Mencari informasi</span>
            <span className="aichat__search-dots">
              <span>.</span><span>.</span><span>.</span>
            </span>
          </div>
          {/* Fake source chips (appear after 2s via CSS animation) */}
          <div className="aichat__sources">
            {FAKE_SOURCES.map((s, i) => (
              <div key={i} className="aichat__source-chip">
                <span className="aichat__source-dot" style={{ background: s.color }} />
                <span className="aichat__source-text" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Render ───────────────────────────────────────────────
  return (
    <div className={`aichat ${isEmpty ? "aichat--empty" : ""}`}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="aichat__file-input"
        accept={ACCEPTED_TYPES}
        multiple
        onChange={handleFileSelect}
        aria-label="Attach file"
      />

      <div className="aichat__body">
        {isEmpty ? (
          <div className="aichat__welcome">
            <div className="aichat__welcome-icon">🤖</div>
            <h2>AI Chat</h2>
            <p>Tanya apa saja — coding, informasi akurat, atau buat code untuk semua bahasa pemrograman.</p>
            <div className="aichat__suggestions">
              {[
                "Buatkan REST API dengan Express.js + TypeScript",
                "Jelaskan cara kerja async/await di JavaScript",
                "Apa itu Machine Learning dan cara kerjanya?",
                "Buatkan sorting algorithm quicksort dalam Python",
              ].map((s) => (
                <button
                  key={s}
                  type="button"
                  className="aichat__suggestion"
                  onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="aichat__messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`aichat__msg aichat__msg--${msg.role}`}>
                <div className="aichat__msg-bubble">
                  {renderMessageContent(msg)}
                  {/* Token info — only for assistant messages */}
                  {msg.role === "assistant" && msg.tokens && streamingId !== msg.id && (
                    <div className="aichat__msg-tokens">
                      <span>↑ {formatTokens(msg.tokens.prompt)}</span>
                      <span>↓ {formatTokens(msg.tokens.completion)}</span>
                      <span className="aichat__msg-tokens-total">{formatTokens(msg.tokens.total)} token</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && renderLoadingBubble()}

            {error && <div className="aichat__error">{error}</div>}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className={`aichat__footer ${isEmpty ? "aichat__footer--centered" : ""}`}>
        {!isEmpty && (
          <div className="aichat__toolbar">
            {sessionTokens.total > 0 && (
              <div className="aichat__session-tokens">
                <span className="aichat__session-tokens-label">Sesi ini</span>
                <span className="aichat__session-tokens-val">{formatTokens(sessionTokens.total)} token</span>
              </div>
            )}
            <button type="button" className="aichat__clear" onClick={handleClear}>
              🗑 Bersihkan
            </button>
          </div>
        )}

        {/* Attachments preview bar */}
        {attachments.length > 0 && (
          <div className="aichat__attachments">
            {attachments.map((att) => (
              <div key={att.id} className="aichat__attachment-chip">
                {att.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={att.preview}
                    alt={att.name}
                    className="aichat__attachment-thumb"
                  />
                ) : (
                  <span className="aichat__attachment-chip-icon">{att.icon}</span>
                )}
                <span className="aichat__attachment-chip-name">{att.name}</span>
                <span className="aichat__attachment-chip-size">{formatBytes(att.size)}</span>
                <button
                  type="button"
                  className="aichat__attachment-chip-remove"
                  onClick={() => removeAttachment(att.id)}
                  aria-label={`Hapus ${att.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="aichat__bar">
          {/* Attach button */}
          <button
            type="button"
            className="aichat__attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            aria-label="Lampirkan file"
            title="Lampirkan file (gambar, dokumen, kode)"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          <textarea
            ref={textareaRef}
            className="aichat__input"
            placeholder={
              isEmpty
                ? "Tanya apa saja, minta buatkan code, atau cari informasi..."
                : "Kirim pesan..."
            }
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
          />
          <button
            type="button"
            className="btn--send"
            onClick={handleSend}
            disabled={loading || (!input.trim() && attachments.length === 0)}
            aria-label="Kirim"
          >
            {loading ? <span className="spinner" /> : "↑"}
          </button>
        </div>
        <p className="aichat__hint">
          Enter kirim · Shift+Enter baris baru · 📎 lampirkan file · Groq AI ⚡
        </p>
      </div>
    </div>
  );
}
