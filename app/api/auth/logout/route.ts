import { NextResponse } from "next/server";

function clearAuthCookie() {
  const response = NextResponse.json({ ok: true, message: "Logout berhasil" });

  // Set maxAge: 0, expires: 1970 to force browser cookie deletion
  response.cookies.set("auth_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    expires: new Date(0),
    path: "/",
  });

  // Explicitly delete token
  try {
    response.cookies.delete("auth_token");
  } catch { /* fallback */ }

  return response;
}

export async function POST() {
  return clearAuthCookie();
}

export async function GET() {
  return clearAuthCookie();
}

export async function DELETE() {
  return clearAuthCookie();
}
