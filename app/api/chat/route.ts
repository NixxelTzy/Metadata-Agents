import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek, type DeepSeekMessage } from "@/lib/deepseek";

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
  try {
    const { messages } = await request.json() as {
      messages: { role: "user" | "assistant"; content: string }[];
    };

    if (!messages?.length) {
      return NextResponse.json({ error: "Messages diperlukan" }, { status: 400 });
    }

    // Convert to DeepSeek format
    const deepseekMessages: DeepSeekMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const result = await callDeepSeek(deepseekMessages, {
      temperature: 0.7,
      max_tokens: 8192,
    });

    return NextResponse.json({
      content: result.text,
      model: `DeepSeek (${result.modelUsed})`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
