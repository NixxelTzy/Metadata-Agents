import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { updateUserActivity } from '@/lib/db';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  try {
    const body = await request.json() as { feature?: string };
    const feature = body.feature ?? 'unknown';

    await updateUserActivity(
      payload.userId,
      payload.email,
      payload.username,
      feature
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Activity update error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
