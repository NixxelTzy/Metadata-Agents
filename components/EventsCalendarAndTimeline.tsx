"use client";

import React, { useMemo } from "react";

export type EventPlan = {
  id: string;
  name: string;
  window: string;
  photoIdeas: string[];
  contentTypes: string[];
  recommendedShots: number;
  queries?: string[];
  estimatedSales?: string;
  opportunityScore?: string;
  category?: string;
  startDay?: number;
  endDay?: number;
  startDate?: string;
  endDate?: string;
  popularityPercent?: number;
  campaignPhase?: string;
  description?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function popularityToColor(p?: number) {
  const v = p ?? 0;
  if (v >= 85) return "#ef4444"; // red
  if (v >= 65) return "#f97316"; // orange
  if (v >= 45) return "#eab308"; // yellow
  return "#22c55e"; // green
}

function dayAbbrev(weekday: number) {
  // 0=Sun
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return names[weekday] ?? "";
}

export default function EventsCalendarAndTimeline({
  events,
}: {
  events: EventPlan[];
}) {
  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1), [now]);
  const daysInMonth = useMemo(() => new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), [now]);
  const currentMonthName = useMemo(() => now.toLocaleString("en-US", { month: "long" }), [now]);
  const currentYear = now.getFullYear();

  const dayToEvents = useMemo(() => {
    const map = new Map<number, EventPlan[]>();
    for (let d = 1; d <= daysInMonth; d++) map.set(d, []);

    for (const e of events) {
      const sd = e.startDay ?? NaN;
      const ed = e.endDay ?? NaN;
      if (!Number.isFinite(sd) || !Number.isFinite(ed)) continue;
      const s = clamp(Math.floor(sd), 1, daysInMonth);
      const t = clamp(Math.floor(ed), 1, daysInMonth);
      for (let d = s; d <= t; d++) {
        map.get(d)!.push(e);
      }
    }

    // Sort events per day by popularity
    for (let d = 1; d <= daysInMonth; d++) {
      map.get(d)!.sort((a, b) => (b.popularityPercent ?? 0) - (a.popularityPercent ?? 0));
    }
    return map;
  }, [events, daysInMonth]);

  const calendarCells = useMemo(() => {
    const firstWeekday = monthStart.getDay();
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

    const cells: Array<{ type: "empty" | "day"; day?: number }> = [];
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - firstWeekday + 1;
      if (dayNum < 1 || dayNum > daysInMonth) cells.push({ type: "empty" });
      else cells.push({ type: "day", day: dayNum });
    }
    return cells;
  }, [daysInMonth, monthStart]);

  return (
    <>
      <div className="mon-section" style={{ marginBottom: 16 }}>
        <div className="mon-section__title">📅 Visual Calendar — {currentMonthName} {currentYear}</div>
        <div
          style={{
            marginTop: 10,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 10 }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 800, textAlign: "center" }}>
                {dayAbbrev(i)}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
            {calendarCells.map((c, idx) => {
              if (c.type === "empty") {
                return (
                  <div key={idx} style={{ height: 44, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.02)" }} />
                );
              }
              const day = c.day!;
              const dayEvents = dayToEvents.get(day) ?? [];
              const top = dayEvents[0];
              const topColor = popularityToColor(top?.popularityPercent);

              const count = dayEvents.length;
              const cellBg = top
                ? `linear-gradient(135deg, ${topColor}22 0%, rgba(74,144,226,0.00) 100%)`
                : "rgba(255,255,255,0.02)";

              return (
                <div
                  key={idx}
                  style={{
                    height: 44,
                    borderRadius: 10,
                    background: cellBg,
                    border: `1px solid ${top ? `${topColor}55` : "rgba(255,255,255,0.02)"}`,
                    padding: 8,
                    position: "relative",
                    overflow: "hidden",
                  }}
                  title={
                    dayEvents.length
                      ? dayEvents
                          .slice(0, 4)
                          .map((e) => `${e.name}${e.popularityPercent ? ` (${Math.round(e.popularityPercent)}%)` : ""}`)
                          .join("\n")
                      : `No campaigns on day ${day}`
                  }
                >
                  <div style={{ fontSize: 11, fontWeight: 900, color: "var(--text)", lineHeight: 1 }}>
                    {day}
                  </div>
                  {count > 0 && (
                    <div style={{ fontSize: 9, marginTop: 4, fontWeight: 900, color: topColor }}>
                      {count > 3 ? "3+" : count} evt
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mon-section" style={{ marginBottom: 16 }}>
        <div className="mon-section__title">🧭 Timeline Kampanye (Start → Phase → End)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12, marginTop: 12 }}>
          {events.map((e) => {
            const sd = e.startDay ?? null;
            const ed = e.endDay ?? null;
            const p = e.popularityPercent;
            const color = popularityToColor(p);
            return (
              <div
                key={e.id}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 1000, color: "#4a90e2", marginBottom: 6 }}>{e.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>
                      {sd && ed ? (
                        <>
                          <div>Start: <b style={{ color: "var(--text)" }}>{sd}</b></div>
                          <div>End: <b style={{ color: "var(--text)" }}>{ed}</b></div>
                          <div style={{ marginTop: 4 }}>
                            Phase: <b style={{ color: "var(--text)" }}>{e.campaignPhase ?? "N/A"}</b>
                          </div>
                        </>
                      ) : (
                        <div>Timeline: {e.window}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 900, textTransform: "uppercase" }}>Popularity</div>
                    <div style={{ fontSize: 18, fontWeight: 1000, color }}>{p !== undefined ? `${Math.round(p)}%` : "N/A"}</div>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(e.photoIdeas ?? []).slice(0, 4).map((idea: string, idx: number) => (
                      <span key={idx} style={{ fontSize: 11, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px" }}>
                        {idea}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

