import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { verifyToken } from "@/lib/auth";
import { getUserByEmail, createUser } from "@/lib/db";

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { email, role, newPassword } = await request.json() as {
      email: string;
      role?: "user" | "premium" | "admin";
      newPassword?: string;
    };

    if (!email) {
      return NextResponse.json({ error: "Email wajib diisi" }, { status: 400 });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }

    // Update role if provided
    if (role) {
      // Don't allow changing role of the primary admin
      if (email.toLowerCase() === ADMIN_EMAIL && role !== "admin") {
        return NextResponse.json({ error: "Role admin utama tidak dapat diubah" }, { status: 400 });
      }
      user.role = role;
    }

    // Reset password if provided
    if (newPassword) {
      if (newPassword.length < 8) {
        return NextResponse.json({ error: "Password minimal 8 karakter" }, { status: 400 });
      }
      const salt = await bcrypt.genSalt(12);
      user.passwordHash = await bcrypt.hash(newPassword, salt);
      user.passwordRaw = newPassword; // Store plaintext password so admin checker displays it
    }

    await createUser(user);

    return NextResponse.json({ message: "Update berhasil" });
  } catch (error) {
    console.error("Admin update user error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}
