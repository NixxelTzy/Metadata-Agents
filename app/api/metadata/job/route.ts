import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  saveMetadataJob,
  getMetadataJob,
  MetadataJob,
  MetadataJobItem,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("id");
  if (!jobId) return NextResponse.json({ error: "Job ID required" }, { status: 400 });

  try {
    const job = await getMetadataJob(jobId);
    if (!job) return NextResponse.json({ error: "Job tidak ditemukan" }, { status: 404 });

    // Auto-heal: if job has been in "processing" for > 5 minutes and
    // progress hasn't moved, force-complete it so the frontend unblocks.
    const shouldForceComplete =
      job.status === "processing" &&
      job.progress >= job.total &&
      job.results.length >= job.total;

    if (shouldForceComplete) {
      job.status = "completed";
      job.updatedAt = new Date().toISOString();
      await saveMetadataJob(job);
      console.log(`[job/GET] Auto-healed stuck job ${jobId} → completed`);
    }

    return NextResponse.json({ success: true, job });
  } catch (err) {
    console.error("GET /api/metadata/job error:", err);
    return NextResponse.json({ error: "Gagal mengambil data job" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("id");
  if (!jobId) return NextResponse.json({ error: "Job ID required" }, { status: 400 });

  try {
    const job = await getMetadataJob(jobId);
    if (!job) return NextResponse.json({ error: "Job tidak ditemukan" }, { status: 404 });

    // Only the job owner can cancel
    if (job.userId !== payload.userId) {
      return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
    }

    // Mark as failed/cancelled so polling stops
    job.status = "failed";
    job.error = "Dibatalkan oleh pengguna";
    job.updatedAt = new Date().toISOString();
    await saveMetadataJob(job);

    return NextResponse.json({ success: true, message: "Job dibatalkan" });
  } catch (err) {
    console.error("DELETE /api/metadata/job error:", err);
    return NextResponse.json({ error: "Gagal membatalkan job" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      action: "create" | "update";
      jobId?: string;
      platform?: string;
      total?: number;
      progress?: number;
      status?: "pending" | "processing" | "completed" | "failed";
      results?: MetadataJobItem[];
      resultItem?: MetadataJobItem;
      error?: string;
    };

    if (body.action === "create") {
      const jobId = body.jobId || `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newJob: MetadataJob = {
        id: jobId,
        userId: payload.userId,
        username: payload.username || "Kreator",
        platform: body.platform || "adobe_stock",
        status: "processing",
        progress: 0,
        total: body.total || 1,
        results: body.results || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveMetadataJob(newJob);
      return NextResponse.json({ success: true, job: newJob });
    }

    if (body.action === "update" && body.jobId) {
      const existing = await getMetadataJob(body.jobId);
      if (!existing) {
        return NextResponse.json({ error: "Job tidak ditemukan" }, { status: 404 });
      }

      if (body.resultItem) {
        existing.results.push(body.resultItem);
      }
      if (body.results) {
        existing.results = body.results;
      }
      if (body.progress !== undefined) {
        existing.progress = body.progress;
      }
      if (body.status) {
        existing.status = body.status;
      }
      if (body.error) {
        existing.error = body.error;
      }

      await saveMetadataJob(existing);
      return NextResponse.json({ success: true, job: existing });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("POST /api/metadata/job error:", err);
    return NextResponse.json({ error: "Gagal memproses job" }, { status: 500 });
  }
}
