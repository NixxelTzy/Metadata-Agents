import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  saveMetadataJob,
  getMetadataJob,
  syncJobToUserHistory,
  recordPhotoProcessing,
  MetadataJob,
  MetadataJobItem,
} from "@/lib/db";
import { generateMetadataWithRetry } from "@/app/api/generate/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Allow long background execution

interface QueueImage {
  filename: string;
  dataUrl: string;
  visualHints?: string;
  existingPrompt?: string;
}

const activeJobWorkers = new Set<string>();

async function runJobWorker(
  jobId: string,
  userId: string,
  username: string,
  platform: "adobe_stock" | "shutterstock" | "magnific",
  complianceGuard: boolean,
  images: QueueImage[]
) {
  if (activeJobWorkers.has(jobId)) return;
  activeJobWorkers.add(jobId);

  try {
    // Array with exact fixed slot for every single image index to prevent any race condition
    const jobResults: (MetadataJobItem | null)[] = new Array(images.length).fill(null);

    // If job already had previous results in Redis, restore them
    const existingJob = await getMetadataJob(jobId);
    if (existingJob && Array.isArray(existingJob.results)) {
      existingJob.results.forEach((item, i) => {
        if (i < jobResults.length && item) {
          jobResults[i] = item;
        }
      });
    }

    // Serialized Redis sync chain to completely prevent race conditions between workers
    let syncQueue = Promise.resolve();
    const safeSync = () => {
      syncQueue = syncQueue.then(async () => {
        const completed = jobResults.filter((r): r is MetadataJobItem => r !== null);
        const job = await getMetadataJob(jobId);
        if (job) {
          job.results = completed;
          job.progress = completed.length;
          if (job.progress >= job.total) {
            job.status = "completed";
          }
          await saveMetadataJob(job);
        }
        await syncJobToUserHistory(userId, jobId, platform, completed);
      }).catch((err) => {
        console.error("[QueueWorker] Redis sync error:", err);
      });
      return syncQueue;
    };

    // 3 concurrent workers in parallel on the server
    const CONCURRENCY = Math.min(3, images.length);
    let nextIndex = 0;

    const worker = async () => {
      while (true) {
        const idx = nextIndex++;
        if (idx >= images.length) break;
        const img = images[idx];
        if (!img) break;

        // If already completed previously, skip
        if (jobResults[idx] !== null) continue;

        try {
          const res = await generateMetadataWithRetry(
            img.dataUrl,
            img.filename,
            img.visualHints,
            platform,
            complianceGuard,
            img.existingPrompt
          );

          // Assign to fixed slot (100% thread-safe in JS single-threaded event loop)
          jobResults[idx] = res;

          // Safe serialized sync to Redis
          await safeSync();

          // Increment Leaderboard & Daily Counter in Redis
          await recordPhotoProcessing(userId, username || "Kreator", 1);
        } catch (err) {
          console.error(`[QueueWorker] Failed to process ${img.filename}:`, err);
          jobResults[idx] = {
            filename: img.filename,
            title: "",
            keywords: [],
            error: err instanceof Error ? err.message : "Gagal memproses gambar",
          };

          await safeSync();
        }

        // Gentle pause to avoid rate limits
        await new Promise((r) => setTimeout(r, 350));
      }
    };

    // Run workers concurrently
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    // ── AUTO-RESTART PASS FOR FAILED PHOTOS ──────────────────────────────
    // Jika ada foto yang mengalami kegagalan (error / title kosong), sistem
    // otomatis me-restart proses untuk foto yang gagal tersebut hingga 3 siklus pemulihan!
    const MAX_AUTO_RESTART_PASSES = 3;
    for (let pass = 1; pass <= MAX_AUTO_RESTART_PASSES; pass++) {
      const failedIndices = jobResults
        .map((res, idx) => ({ res, idx }))
        .filter(({ res }) => !res || Boolean(res.error) || !res.title)
        .map(({ idx }) => idx);

      if (failedIndices.length === 0) {
        console.log(`[QueueWorker] ✨ Semua ${images.length} foto sukses 100%! Auto-restart tidak diperlukan.`);
        break;
      }

      console.log(`[QueueWorker] 🔄 Auto-restart pass #${pass}: Me-restart ${failedIndices.length} foto yang gagal...`);
      // Jeda 2 detik agar koneksi / rate limit cooldown
      await new Promise((r) => setTimeout(r, 2000 * pass));

      for (const idx of failedIndices) {
        const img = images[idx];
        if (!img) continue;

        try {
          console.log(`[QueueWorker] 🔁 Auto-restarting foto [${idx + 1}/${images.length}]: "${img.filename}"...`);
          const recovered = await generateMetadataWithRetry(
            img.dataUrl,
            img.filename,
            img.visualHints,
            platform,
            complianceGuard,
            img.existingPrompt,
            4
          );

          if (recovered && recovered.title && !recovered.error) {
            jobResults[idx] = recovered;
            console.log(`[QueueWorker] ✅ Berhasil auto-restart foto "${img.filename}"!`);
            await safeSync();
            await recordPhotoProcessing(userId, username || "Kreator", 1);
          }
        } catch (retryErr) {
          console.warn(`[QueueWorker] Percobaan auto-restart foto "${img.filename}" pada pass #${pass} gagal:`, retryErr);
        }

        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // Wait for all sync operations to finish
    await syncQueue;

    // Final mark as completed
    const finalCompleted = jobResults.filter((r): r is MetadataJobItem => r !== null);
    const finalJob = await getMetadataJob(jobId);
    if (finalJob) {
      finalJob.results = finalCompleted;
      finalJob.progress = finalCompleted.length;
      finalJob.status = "completed";
      await saveMetadataJob(finalJob);
    }
    await syncJobToUserHistory(userId, jobId, platform, finalCompleted);

  } catch (workerErr) {
    console.error("[QueueWorker] Fatal error:", workerErr);
  } finally {
    activeJobWorkers.delete(jobId);
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      jobId?: string;
      images: QueueImage[];
      platform?: "adobe_stock" | "shutterstock" | "magnific";
      complianceGuard?: boolean;
    };

    if (!Array.isArray(body.images) || body.images.length === 0) {
      return NextResponse.json({ error: "Daftar foto tidak boleh kosong" }, { status: 400 });
    }

    const platform = body.platform === "shutterstock" ? "shutterstock" : body.platform === "magnific" ? "magnific" : "adobe_stock";
    const jobId = body.jobId || `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const complianceGuard = body.complianceGuard === true;

    // Create or update job with exact total
    let job = await getMetadataJob(jobId);
    if (!job) {
      job = {
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
      await saveMetadataJob(job);
    } else {
      job.total = body.images.length;
      await saveMetadataJob(job);
    }

    // Launch concurrent background workers with ALL images
    void runJobWorker(jobId, payload.userId, payload.username || "Kreator", platform, complianceGuard, body.images);

    return NextResponse.json({
      success: true,
      jobId,
      status: "processing",
      total: body.images.length,
    });
  } catch (err) {
    console.error("POST /api/metadata/queue error:", err);
    return NextResponse.json({ error: "Gagal memasukkan ke antrian server" }, { status: 500 });
  }
}
