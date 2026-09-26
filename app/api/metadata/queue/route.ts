import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  saveMetadataJob,
  getMetadataJob,
  flushJobBufferToHistory,
  recordPhotoProcessing,
  appendPhotoToUserHistory,
  MetadataJob,
  MetadataJobItem,
} from "@/lib/db";
import { generateMetadataWithRetry } from "@/app/api/generate/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby max = 60s per invocation

interface QueueImage {
  filename: string;
  dataUrl: string;
  thumbnailUrl?: string;   // small compressed thumbnail from client (max ~8KB base64)
  visualHints?: string;
  existingPrompt?: string;
}

/** Thumbnails are generated client-side and sent as thumbnailUrl in QueueImage */

/**
 * POST /api/metadata/queue
 *
 * Two modes controlled by `mode` field in body:
 *
 * mode = "init"  (called once at start)
 *   → Creates job record in Redis, returns jobId.
 *   → Does NOT process images (avoids timeout on large batches).
 *
 * mode = "process" (called once PER IMAGE by frontend loop)
 *   → Processes exactly 1 image by index, saves result to Redis.
 *   → Frontend polls /api/metadata/job for progress.
 *   → Fits within 60s Vercel Hobby limit per invocation.
 *
 * This replaces the old fire-and-forget background worker pattern
 * which was killed by Vercel immediately after response was sent.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      mode?: "init" | "process";
      jobId?: string;
      images?: QueueImage[];
      image?: QueueImage;      // single image for process mode (includes thumbnailUrl)
      imageIndex?: number;     // index in the job for process mode
      platform?: "adobe_stock" | "shutterstock" | "magnific";
      complianceGuard?: boolean;
    };

    const platform = body.platform === "shutterstock"
      ? "shutterstock"
      : body.platform === "magnific"
      ? "magnific"
      : "adobe_stock";
    const complianceGuard = body.complianceGuard === true;

    // ── MODE: INIT ─────────────────────────────────────────────────────────
    // Called once at start. Creates the job slot in Redis.
    if (!body.mode || body.mode === "init") {
      if (!Array.isArray(body.images) || body.images.length === 0) {
        return NextResponse.json({ error: "Daftar foto tidak boleh kosong" }, { status: 400 });
      }

      const jobId = body.jobId || `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const newJob: MetadataJob = {
        id: jobId,
        userId: payload.userId,
        username: payload.username || "Kreator",
        platform,
        status: "processing",
        progress: 0,
        total: body.images.length,
        results: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveMetadataJob(newJob);

      return NextResponse.json({
        success: true,
        jobId,
        status: "processing",
        total: body.images.length,
        mode: "init",
      });
    }

    // ── MODE: PROCESS ──────────────────────────────────────────────────────
    // Called once per image. Processes image and saves result to Redis.
    if (body.mode === "process") {
      const { jobId, image, imageIndex } = body;

      if (!jobId || !image || imageIndex === undefined) {
        return NextResponse.json({ error: "jobId, image, dan imageIndex wajib diisi" }, { status: 400 });
      }

      const job = await getMetadataJob(jobId);
      if (!job) {
        return NextResponse.json({ error: "Job tidak ditemukan" }, { status: 404 });
      }

      // Guard: don't reprocess if already done
      const existing = job.results[imageIndex];
      if (existing && existing.title && !existing.error) {
        return NextResponse.json({ success: true, skipped: true, result: existing });
      }

      let result: MetadataJobItem;
      try {
        result = await generateMetadataWithRetry(
          image.dataUrl,
          image.filename,
          image.visualHints,
          platform,
          complianceGuard,
          image.existingPrompt
        );
        // Attach thumbnail from client so history can display the photo
        if (image.thumbnailUrl) {
          result.thumbnailUrl = image.thumbnailUrl;
        }
      } catch (err) {
        result = {
          filename: image.filename,
          title: "",
          keywords: [],
          thumbnailUrl: image.thumbnailUrl,
          error: err instanceof Error ? err.message : "Gagal memproses gambar",
        };
      }

      // Save result at correct index
      const updatedJob = await getMetadataJob(jobId);
      if (updatedJob) {
        // Ensure results array is large enough
        while (updatedJob.results.length <= imageIndex) {
          updatedJob.results.push({ filename: "", title: "", keywords: [] });
        }
        updatedJob.results[imageIndex] = result;

        // Count real completed (non-placeholder) items
        const realCompleted = updatedJob.results.filter(
          (r) => r && r.filename && (r.title || r.error)
        ).length;
        updatedJob.progress = realCompleted;

        if (updatedJob.progress >= updatedJob.total) {
          updatedJob.status = "completed";
        }
        updatedJob.updatedAt = new Date().toISOString();
        await saveMetadataJob(updatedJob);

        // ── Atomic per-photo save to buffer (race-condition-proof via Redis Hash) ──
        await appendPhotoToUserHistory(
          payload.userId,
          jobId,
          platform,
          result
        );

        // After every photo, flush entire buffer to history list (latest state)
        await flushJobBufferToHistory(payload.userId, jobId);
      }

      // Record processing count on success
      if (result.title && !result.error) {
        await recordPhotoProcessing(payload.userId, payload.username || "Kreator", 1);
      }

      return NextResponse.json({
        success: true,
        result,
        progress: (await getMetadataJob(jobId))?.progress ?? imageIndex + 1,
        total: job.total,
      });
    }

    return NextResponse.json({ error: "Mode tidak valid. Gunakan 'init' atau 'process'." }, { status: 400 });
  } catch (err) {
    console.error("POST /api/metadata/queue error:", err);
    return NextResponse.json({ error: "Gagal memproses antrian" }, { status: 500 });
  }
}
