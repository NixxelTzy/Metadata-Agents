import { NextRequest } from "next/server";
import { GET as masterGET, POST as masterPOST } from "../messenger/route";

export async function GET(request: NextRequest) {
  return masterGET(request);
}

export async function POST(request: NextRequest) {
  return masterPOST(request);
}
