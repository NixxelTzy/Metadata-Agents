import { NextRequest } from "next/server";
import { POST as masterPOST } from "../messenger/route";

export async function POST(request: NextRequest) {
  return masterPOST(request);
}
