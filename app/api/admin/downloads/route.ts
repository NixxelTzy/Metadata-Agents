import { NextResponse } from "next/server";

// Route dihapus — endpoint ini tidak aktif lagi.
export async function GET() {
  return NextResponse.json({ error: "Endpoint tidak tersedia" }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: "Endpoint tidak tersedia" }, { status: 404 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Endpoint tidak tersedia" }, { status: 404 });
}
