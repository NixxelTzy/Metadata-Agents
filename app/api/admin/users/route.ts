import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getAllUsers, deleteUser, getUserByEmail, getAllUserActivities, getAllOnlineUsers } from "@/lib/db";

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const users = await getAllUsers();
    
    // Merge activity data per user
    const activities = await getAllUserActivities();
    const onlineUsers = await getAllOnlineUsers();

    const activityMap: Record<string, { lastSeen: string; currentFeature: string }> = {};
    for (const a of activities) {
      activityMap[a.userId] = { lastSeen: a.lastSeen, currentFeature: a.currentFeature };
    }

    const formatted = users.map((u) => {
      const act = activityMap[u.id] || (u.email ? activityMap[u.email.toLowerCase()] : undefined);
      const online =
        onlineUsers[u.id] ||
        (u.email ? onlineUsers[u.email.toLowerCase()] : undefined) ||
        (u.username ? onlineUsers[u.username.toLowerCase()] : undefined);

      return {
        id: u.id,
        email: u.email,
        username: u.username,
        role: u.role ?? 'user',
        createdAt: u.createdAt,
        passwordRaw: u.passwordRaw || null,
        passwordHash: u.passwordHash,
        lastSeen: online?.lastSeen ?? act?.lastSeen ?? null,
        currentFeature: online?.feature ?? act?.currentFeature ?? null,
        isOnline: !!online,
      };
    });

    return NextResponse.json({ users: formatted });
  } catch (error) {
    console.error("Admin list users error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { email } = await request.json() as { email: string };
    if (!email) {
      return NextResponse.json({ error: "Email wajib diisi" }, { status: 400 });
    }

    if (email.toLowerCase() === ADMIN_EMAIL) {
      return NextResponse.json({ error: "Tidak dapat menghapus akun admin utama" }, { status: 400 });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }

    await deleteUser(user.email, user.id);
    return NextResponse.json({ message: "User berhasil dihapus" });
  } catch (error) {
    console.error("Admin delete user error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}
