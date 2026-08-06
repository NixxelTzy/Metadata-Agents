import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: "ok",
    mode: "direct_client_render",
    message: "Motion Studio runs 100% client-side with zero server latency."
  });
}
