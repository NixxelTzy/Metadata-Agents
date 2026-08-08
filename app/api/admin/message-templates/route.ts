import { NextRequest, NextResponse } from "next/server";
import { GET as masterGET, POST as masterPOST } from "../messenger/route";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  url.searchParams.set("view", "templates");
  const subReq = new NextRequest(url.toString(), { headers: request.headers });
  return masterGET(subReq);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { action?: string; template?: any; id?: string };
  const action = body.action === "create" || body.action === "update" ? "template_save" : body.action === "delete" ? "template_delete" : "template_save";
  const subReq = new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ action, templateId: body.id, template: body.template }),
  });
  return masterPOST(subReq);
}
