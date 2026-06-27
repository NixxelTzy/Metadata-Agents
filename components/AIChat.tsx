"use client";

import { useEffect, useRef, useState } from "react";
import { addUsage, formatTokens } from "@/lib/tokenStore";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  timestamp: number;
  tokens?: { prompt: number; completion: number; total: number };
}

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
    const inlineParts = part.split(/(`[^`]+`)/g);
    return (
      <span key={i}>
        {inlineParts.map((p, j) =>
          p.startsWith("`") && p.endsWith("`")
            ? <code key={j} className="chat-inline-code">{p.slice(1, -1)}</code>
            : <span key={j}>{p}</span>
        )}
      </span>
    );
  });
}

interface Props {
  onTokensUpdated?: () => void;
}

export default function AIChat({ onTokensUpdated }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Token total untuk sesi ini
  const [sessionTokens, setSessionTokens] = useState({ prompt: 0, completion: 0, total: 0 });
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isEmpty = messages.length === 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = {
      id: `u${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError("");

    if (textareaRef.current) textareaRef.current.style.height = "auto";

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

      // Catat token usage
      const u = data.usage;
      if (u) {
        addUsage(u.promptTokens, u.completionTokens);
        setSessionTokens((prev) => ({
          prompt: prev.prompt + u.promptTokens,
          completion: prev.completion + u.completionTokens,
          total: prev.total + u.totalTokens,
        }));
        onTokensUpdated?.();
      }

      const assistantMsg: Message = {
        id: `a${Date.now()}`,
        role: "assistant",
        content: data.content ?? "",
        model: data.model,
        timestamp: Date.now(),
        tokens: u ? { prompt: u.promptTokens, completion: u.completionTokens, total: u.totalTokens } : undefined,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setError("Koneksi gagal, coba lagi.");
    } finally {
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
  };

  return (
    <div className={`aichat ${isEmpty ? "aichat--empty" : ""}`}>
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
                <button key={s} type="button" className="aichat__suggestion"
                  onClick={() => { setInput(s); textareaRef.current?.focus(); }}>
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
                  <div className="aichat__msg-content">{formatContent(msg.content)}</div>
                  {/* Token info — hanya tampil di pesan assistant */}
                  {msg.role === "assistant" && msg.tokens && (
                    <div className="aichat__msg-tokens">
                      <span>↑ {formatTokens(msg.tokens.prompt)}</span>
                      <span>↓ {formatTokens(msg.tokens.completion)}</span>
                      <span className="aichat__msg-tokens-total">{formatTokens(msg.tokens.total)} token</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="aichat__msg aichat__msg--assistant">
                <div className="aichat__msg-bubble">
                  <div className="aichat__typing"><span /><span /><span /></div>
                </div>
              </div>
            )}

            {error && <div className="aichat__error">{error}</div>}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className={`aichat__footer ${isEmpty ? "aichat__footer--centered" : ""}`}>
        {!isEmpty && (
          <div className="aichat__toolbar">
            {/* Token sesi */}
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
        <div className="aichat__bar">
          <textarea
            ref={textareaRef}
            className="aichat__input"
            placeholder={isEmpty ? "Tanya apa saja, minta buatkan code, atau cari informasi..." : "Kirim pesan..."}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
          />
          <button type="button" className="btn--send" onClick={handleSend}
            disabled={loading || !input.trim()} aria-label="Kirim">
            {loading ? <span className="spinner" /> : "↑"}
          </button>
        </div>
        <p className="aichat__hint">
          Enter kirim · Shift+Enter baris baru · Groq AI ⚡
        </p>
      </div>
    </div>
  );
}
