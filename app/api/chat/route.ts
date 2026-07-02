import { NextRequest, NextResponse } from "next/server";
import { callGroq, type GroqMessage } from "@/lib/groq";
import { inspect, getClientIp, recordIpError } from "@/lib/security/core";

const SYSTEM_PROMPT = `You are an elite AI assistant with deep expertise in:
- Software development (all programming languages, frameworks, architectures)
- Code generation (write complete, production-ready, well-commented code)
- Technical problem solving and debugging
- Research and factual information (always accurate, cite uncertainty clearly)
- Mathematics, science, engineering, and general knowledge

Core principles:
1. ACCURACY: Only state facts you are highly confident about. If uncertain, say so explicitly.
2. CODE QUALITY: Write clean, efficient, well-structured code with proper error handling.
3. COMPLETENESS: Provide complete solutions, not just fragments.
4. CLARITY: Explain complex topics clearly and concisely.

For code requests:
- Always specify the language with syntax highlighting markers
- Include necessary imports/dependencies
- Add meaningful comments
- Handle edge cases

For factual questions:
- Be precise and accurate
- If information might be outdated, mention it
- Distinguish between facts and opinions`;

export async function POST(request: NextRequest) {
  const headersObj: Record<string, string> = {};
  request.headers.forEach((v, k) => { headersObj[k] = v; });
  const ip = getClientIp(headersObj);

  try {
    const body = await request.json() as { messages?: { role: "user" | "assistant"; content: string }[] };
    const { messages } = body;

    // ── Security inspection (payload-level — body available here) ──
    const sec = await inspect({
      ip,
      endpoint: "/api/chat",
      method: "POST",
      userAgent: headersObj["user-agent"] ?? "",
      headers: headersObj,
      body,
    });
    if (sec.blocked) {
      recordIpError(ip);
      return NextResponse.json({ error: "Akses ditolak", reason: sec.reason, threatScore: sec.threatScore }, { status: sec.signals.some(s => s.type === "rate_limit") ? 429 : 403 });
    }

    if (!messages?.length) {
      return NextResponse.json({ error: "Messages diperlukan" }, { status: 400 });
    }

    const groqMessages: GroqMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const result = await callGroq(groqMessages, {
      temperature: 0.7,
      max_tokens: 8192,
    });

    return NextResponse.json({
      content: result.text,
      model: result.modelUsed,
      usage: result.usage,
    });
  } catch (err) {
    recordIpError(ip);
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
