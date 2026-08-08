import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export interface MessageTemplate {
  id: string;
  name: string;
  type: "message" | "refresh" | "block";
  title: string;
  body: string;
  reason?: string;
  tags: string[];
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

const REDIS_KEY = "admin:message_templates";

/**
 * GET /api/admin/message-templates
 * List all saved message templates.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const raw = await redis.get<MessageTemplate[]>(REDIS_KEY);
    return NextResponse.json({ templates: raw ?? [] });
  } catch {
    return NextResponse.json({ templates: [] });
  }
}

/**
 * POST /api/admin/message-templates
 * Create, update or delete a template.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json() as {
      action: "create" | "update" | "delete" | "use";
      template?: Partial<MessageTemplate>;
      id?: string;
    };

    const existing = (await redis.get<MessageTemplate[]>(REDIS_KEY)) ?? [];

    if (body.action === "create") {
      if (!body.template?.name || !body.template?.title || !body.template?.body) {
        return NextResponse.json({ error: "name, title, body wajib diisi" }, { status: 400 });
      }
      const newTpl: MessageTemplate = {
        id: `tpl-${Date.now()}`,
        name: body.template.name,
        type: body.template.type ?? "message",
        title: body.template.title,
        body: body.template.body,
        reason: body.template.reason,
        tags: body.template.tags ?? [],
        usageCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await redis.set(REDIS_KEY, [...existing, newTpl]);
      return NextResponse.json({ ok: true, template: newTpl });
    }

    if (body.action === "update" && body.id) {
      const updated = existing.map((t) =>
        t.id === body.id ? { ...t, ...body.template, updatedAt: new Date().toISOString() } : t
      );
      await redis.set(REDIS_KEY, updated);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete" && body.id) {
      await redis.set(REDIS_KEY, existing.filter((t) => t.id !== body.id));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "use" && body.id) {
      const updated = existing.map((t) =>
        t.id === body.id ? { ...t, usageCount: (t.usageCount ?? 0) + 1, updatedAt: new Date().toISOString() } : t
      );
      await redis.set(REDIS_KEY, updated);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Action tidak valid" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: "Gagal memproses template" }, { status: 500 });
  }
}
