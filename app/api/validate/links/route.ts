import { NextRequest, NextResponse } from "next/server";
import { inspect } from "@/lib/security/core";

type InputBody = {
  links: string[];
  // Optional: expected base url for safety
  expectedBase?: string; // default: https://www.adobestock.com/search/
};

function normalizeUrl(u: string) {
  const trimmed = (u ?? "").trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    // Only keep origin + pathname + search
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    // If it's not a valid absolute URL, ignore
    return "";
  }
}

function validateAdobestockSearchUrl(urlStr: string, expectedBase: string) {
  const normalized = normalizeUrl(urlStr);
  if (!normalized) {
    return { ok: false, reason: "Invalid URL" };
  }

  if (!normalized.startsWith(expectedBase)) {
    return { ok: false, reason: `Wrong base (expected ${expectedBase})` };
  }

  try {
    const url = new URL(normalized);
    // Ensure ?k= exists and non-empty
    const k = url.searchParams.get("k");
    if (!k || !k.trim()) {
      return { ok: false, reason: "Missing query parameter k" };
    }

    // Basic sanity: limit length
    if (k.length > 160) {
      return { ok: false, reason: "Query too long" };
    }

    return { ok: true as const, url: normalized };
  } catch {
    return { ok: false, reason: "URL parse failed" };
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    const ip =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "127.0.0.1";
    const headersObj: Record<string, string> = {};
    request.headers.forEach((v, k) => { headersObj[k] = v; });

    let body: InputBody | null = null;
    try {
      body = (await request.json()) as InputBody;
    } catch {
      body = { links: [] };
    }

    if (!token) {
      const sec = await inspect({
        ip,
        endpoint: "/api/validate/links",
        method: "POST",
        userAgent: headersObj["user-agent"] ?? "",
        headers: headersObj,
        body,
      });
      if (sec.blocked) {
        return NextResponse.json(
          { error: "Akses ditolak", reason: sec.reason, threatScore: sec.threatScore },
          { status: 403 }
        );
      }
    }

    const links = Array.isArray(body?.links) ? body.links : [];
    const expectedBase = body?.expectedBase ?? "https://stock.adobe.com/search";

    if (!links.length) {
      return NextResponse.json({ error: "links harus array dan minimal 1" }, { status: 400 });
    }

    const out = links.map((l) => {
      const v = validateAdobestockSearchUrl(l, expectedBase);
      if (v.ok) return { ok: true as const, link: v.url };
      return { ok: false as const, link: normalizeUrl(l) || l, reason: v.reason };
    });

    return NextResponse.json({ results: out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


