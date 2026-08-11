import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true, message: "Logout berhasil" });

  // Must match EXACTLY the same attributes as when the cookie was set at login.
  // Mismatched attributes (secure, sameSite, path) cause browsers to ignore the delete.
  response.cookies.set("auth_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    expires: new Date(0),
    path: "/",
  });

  return response;
}
