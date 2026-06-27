"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  timestamp: number;
}

function formatContent(content: string) {
  // Render code blocks
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
    // Render inline code
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

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

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

      const data = await res.json() as { content?: string; model?: string; error?: string };

      if (!res.ok) {
        setError(data.error ?? "Gagal mendapat respons");
        return;
      }

      const assistantMsg: Message = {
        id: `a${Date.now()}`,
        role: "assistant",
        content: data.content ?? "",
        model: data.model,
        timestamp: Date.now(),
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
  };

  return (
    <div className={`aichat ${isEmpty ? "aichat--empty" : ""}`}>
      {/* Messages area */}
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
                  <div className="aichat__msg-content">
                    {formatContent(msg.content)}
                  </div>
                  {msg.model && (
                    <div className="aichat__msg-meta">model: {msg.model}</div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="aichat__msg aichat__msg--assistant">
                <div className="aichat__msg-bubble">
                  <div className="aichat__typing">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="aichat__error">{error}</div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className={`aichat__footer ${isEmpty ? "aichat__footer--centered" : ""}`}>
        {!isEmpty && (
          <div className="aichat__toolbar">
            <button type="button" className="aichat__clear" onClick={handleClear}>
              🗑 Bersihkan chat
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
          <button
            type="button"
            className="btn--send"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            aria-label="Kirim"
          >
            {loading ? <span className="spinner" /> : "↑"}
          </button>
        </div>
        <p className="aichat__hint">
          Enter kirim · Shift+Enter baris baru · Didukung oleh DeepSeek AI
        </p>
      </div>
    </div>
  );
}
