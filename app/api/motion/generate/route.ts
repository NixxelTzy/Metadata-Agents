import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { callGroq } from '@/lib/groq';

export const maxDuration = 30;

const MOTION_SYSTEM_PROMPT = `You are an expert creative canvas animation coder. Generate JavaScript canvas animation code based on the user's prompt.

OUTPUT RULES (CRITICAL - follow exactly):
1. Output ONLY a raw JavaScript code block — no markdown, no explanation, no backticks
2. The code must define a single function: function render(ctx, canvas, t, duration)
   - ctx: CanvasRenderingContext2D
   - canvas: HTMLCanvasElement (use canvas.width, canvas.height for dimensions)
   - t: current time in seconds (0 to duration)
   - duration: total animation duration in seconds
3. The render() function will be called every frame by the player
4. Always CLEAR the canvas at the start: ctx.clearRect(0, 0, canvas.width, canvas.height)
5. Use t/duration (0.0 to 1.0) as the normalized progress for animation
6. Use Math.sin(), Math.cos(), gradients, arcs, paths for beautiful animations
7. Make the animation LOOP SEAMLESSLY (frame at t=0 should match frame at t=duration)
8. Create visually stunning, smooth, creative animations with multiple elements
9. Use canvas.width and canvas.height for ALL positioning (never hardcode pixel values)
10. The code must be pure vanilla JavaScript — no imports, no external libraries

EXAMPLE OUTPUT FORMAT:
function render(ctx, canvas, t, duration) {
  const progress = t / duration;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // animation code here
}`;

export async function POST(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  try {
    const body = await request.json() as {
      prompt: string;
      fps: number;
      resolution: string;
      duration: number;
      renderMode: string;
    };

    if (!body.prompt?.trim()) {
      return NextResponse.json({ error: 'Prompt tidak boleh kosong' }, { status: 400 });
    }

    const userPrompt = `Create a canvas animation: ${body.prompt}
Settings: ${body.fps}fps, ${body.resolution} resolution, ${body.duration} seconds duration, ${body.renderMode} render mode.
Make it visually stunning and perfectly looping.`;

    const result = await callGroq(
      [{ role: 'system', content: MOTION_SYSTEM_PROMPT }, { role: 'user', content: userPrompt }],
      { temperature: 0.7, max_tokens: 4096 }
    );

    // Clean code: strip any accidental markdown fences
    let code = result.text.trim();
    code = code.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();

    return NextResponse.json({
      code,
      modelUsed: result.modelUsed,
      usage: result.usage,
    });
  } catch (error) {
    console.error('Motion generate error:', error);
    const msg = error instanceof Error ? error.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
