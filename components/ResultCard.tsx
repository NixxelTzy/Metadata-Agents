"use client";

import { useState } from "react";
import type { MetadataResult } from "@/app/api/generate/route";
import { copyToClipboard, formatKeywords } from "@/lib/utils";

interface Props {
  result: MetadataResult;
  preview?: string;
}

export default function ResultCard({ result, preview }: Props) {
  const [copied, setCopied] = useState<"title" | "keywords" | "all" | null>(null);

  const handleCopy = async (type: "title" | "keywords" | "all") => {
    let text = "";
    if (type === "title") text = result.title;
    else if (type === "keywords") text = formatKeywords(result.keywords);
    else text = `Title: ${result.title}\nKeywords: ${formatKeywords(result.keywords)}`;

    await copyToClipboard(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  if (result.error) {
    return (
      <article className="result-card result-card--error">
        {preview && <img src={preview} alt={result.filename} className="result-card__thumb" />}
        <div className="result-card__body">
          <h3>{result.filename}</h3>
          <p className="error-msg">❌ {result.error}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="result-card">
      {preview && <img src={preview} alt={result.filename} className="result-card__thumb" />}
      <div className="result-card__body">
        <h3 className="result-card__filename">{result.filename}</h3>

        {result.modelUsed && (
          <div className="result-card__meta">
            <span className="result-card__meta-tag">{result.stabilized ? "Stabil" : "Cepat"}</span>
            <span className="result-card__meta-tag">{result.modelUsed}</span>
            {result.attempts && <span className="result-card__meta-tag">{result.attempts}x</span>}
          </div>
        )}

        <div className="field">
          <div className="field__header">
            <label>Title</label>
            <button type="button" className="copy-btn" onClick={() => handleCopy("title")}>
              {copied === "title" ? "✓ Tersalin" : "Salin"}
            </button>
          </div>
          <p className="field__value">{result.title}</p>
        </div>

        <div className="field">
          <div className="field__header">
            <label>Keywords ({result.keywords.length})</label>
            <button type="button" className="copy-btn" onClick={() => handleCopy("keywords")}>
              {copied === "keywords" ? "✓ Tersalin" : "Salin"}
            </button>
          </div>
          <div className="keywords">
            {result.keywords.map((kw) => (
              <span key={kw} className="keyword-tag">
                {kw}
              </span>
            ))}
          </div>
        </div>

        <button type="button" className="btn btn--small" onClick={() => handleCopy("all")}>
          {copied === "all" ? "✓ Semua Tersalin" : "Salin Semua"}
        </button>
      </div>
    </article>
  );
}
