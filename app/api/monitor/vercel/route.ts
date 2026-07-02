import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

const ADMIN_EMAIL = "nixxeltzy@gmail.com";
const VERCEL_API = "https://api.vercel.com";

async function vercelGet(path: string, token: string) {
  const res = await fetch(`${VERCEL_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vercel API ${res.status}: ${err}`);
  }
  return res.json();
}

export async function GET(request: NextRequest) {
  // Auth: admin only
  const cookie = request.cookies.get("auth_token")?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = verifyToken(cookie);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID; // optional

  if (!token) {
    return NextResponse.json({ error: "VERCEL_API_TOKEN not configured" }, { status: 500 });
  }

  const teamParam = teamId ? `?teamId=${teamId}` : "";

  try {
    // Fetch multiple Vercel API endpoints in parallel
    const [deploymentsRaw, projectRaw] = await Promise.allSettled([
      vercelGet(`/v6/deployments${teamParam ? teamParam + "&" : "?"}projectId=${projectId}&limit=10`, token),
      projectId ? vercelGet(`/v9/projects/${projectId}${teamParam}`, token) : Promise.resolve(null),
    ]);

    const deployments = deploymentsRaw.status === "fulfilled" ? deploymentsRaw.value : null;
    const project = projectRaw.status === "fulfilled" ? projectRaw.value : null;

    // Build clean response
    const depList = (deployments?.deployments ?? []).slice(0, 10).map((d: Record<string, unknown>) => ({
      uid: d.uid,
      name: d.name,
      url: d.url,
      state: d.state,       // READY, ERROR, BUILDING, QUEUED
      target: d.target,     // production, preview
      createdAt: d.createdAt,
      buildingAt: d.buildingAt,
      ready: d.ready,
      source: d.meta,
    }));

    const latest = depList[0] ?? null;

    return NextResponse.json({
      timestamp: Date.now(),
      project: project ? {
        id: project.id,
        name: project.name,
        framework: project.framework,
        nodeVersion: project.nodeVersion,
        productionUrl: project.targets?.production?.url ?? null,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      } : null,
      deployments: depList,
      latestDeployment: latest,
      stats: {
        total: depList.length,
        ready: depList.filter((d: Record<string, unknown>) => d.state === "READY").length,
        error: depList.filter((d: Record<string, unknown>) => d.state === "ERROR").length,
        building: depList.filter((d: Record<string, unknown>) => d.state === "BUILDING").length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch Vercel data" },
      { status: 500 }
    );
  }
}

