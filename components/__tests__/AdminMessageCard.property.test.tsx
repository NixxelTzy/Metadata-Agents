/**
 * Property-based tests for AdminMessageCard
 * Feature: admin-message-card
 * Uses fast-check with numRuns: 100 per property
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import * as fc from "fast-check";
import AdminMessageCard, { ActionButton } from "../AdminMessageCard";
import type { AdminMessage } from "../UserInboxBanner";

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

const arbitraryAdminMessage = (): fc.Arbitrary<AdminMessage> =>
  fc.record({
    id: fc.string({ minLength: 1 }),
    type: fc.constantFrom("message" as const, "refresh" as const, "block" as const),
    title: fc.oneof(
      fc.string(),
      fc.constant(""),
      fc.constant(null as unknown as string),
    ),
    body: fc.string(),
    sentAt: fc.oneof(
      fc.date({ min: new Date("2000-01-01"), max: new Date("2099-12-31") }).map(
        (d) => d.toISOString(),
      ),
      fc.string(), // includes invalid dates
    ),
    reason: fc.option(fc.string(), { nil: undefined }),
    targetUserId: fc.option(fc.string(), { nil: undefined }),
    targetEmail: fc.option(fc.string(), { nil: undefined }),
    targetUsername: fc.option(fc.string(), { nil: undefined }),
    sentByEmail: fc.option(fc.string(), { nil: undefined }),
  });

const arbitraryNonEmptyActions = (): fc.Arbitrary<ActionButton[]> =>
  fc.array(
    fc.record({
      label: fc.string({ minLength: 1 }),
      onClick: fc.oneof(
        fc.constant(undefined),
        fc.constant(() => {}),
      ),
      variant: fc.option(fc.constantFrom("primary" as const, "secondary" as const), {
        nil: undefined,
      }),
    }),
    { minLength: 1 },
  );

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderCard(
  message: AdminMessage | null,
  actions?: ActionButton[],
  onDismiss?: (msg: AdminMessage) => void,
  senderLogoUrl?: string,
) {
  return render(
    <AdminMessageCard
      message={message}
      actions={actions}
      onDismiss={onDismiss}
      senderLogoUrl={senderLogoUrl}
    />,
  );
}

// ─── Property 1: Struktur tiga-bagian untuk semua pesan valid ─────────────────
// Feature: admin-message-card, Property 1 — Validates: Requirements 1.1
test("Property 1: struktur tiga-bagian untuk semua pesan valid", () => {
  fc.assert(
    fc.property(
      arbitraryAdminMessage(),
      arbitraryNonEmptyActions(),
      (msg, actions) => {
        const { container, unmount } = renderCard(msg, actions);
        const region = container.querySelector("[role='region']");
        expect(region).not.toBeNull();
        // header: contains "NixelStudio"
        expect(region!.textContent).toContain("NixelStudio");
        // body: contains title or fallback
        const titleEl = container.querySelector("h3");
        expect(titleEl).not.toBeNull();
        // footer: at least one button
        const buttons = container.querySelectorAll("button");
        expect(buttons.length).toBeGreaterThan(0);
        unmount();
      },
    ),
    { numRuns: 100 },
  );
});

// ─── Property 2: Fallback konten Body ────────────────────────────────────────
// Feature: admin-message-card, Property 2 — Validates: Requirements 3.1, 3.2
test("Property 2: fallback title saat title kosong/null", () => {
  fc.assert(
    fc.property(
      fc.record({
        id: fc.string({ minLength: 1 }),
        type: fc.constant("message" as const),
        title: fc.oneof(fc.constant(""), fc.constant(null as unknown as string)),
        body: fc.string(),
        sentAt: fc.date().map((d) => d.toISOString()),
      }),
      (msg) => {
        const { container, unmount } = renderCard(msg as AdminMessage, [
          { label: "OK", onClick: () => {} },
        ]);
        const titleEl = container.querySelector("h3");
        expect(titleEl?.textContent).toBe("(Tanpa Judul)");
        unmount();
      },
    ),
    { numRuns: 100 },
  );
});

test("Property 2: non-empty title ditampilkan persis", () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
      (title) => {
        const msg: AdminMessage = {
          id: "1",
          type: "message",
          title,
          body: "body",
          sentAt: new Date().toISOString(),
        };
        const { container, unmount } = renderCard(msg, [{ label: "OK", onClick: () => {} }]);
        const titleEl = container.querySelector("h3");
        expect(titleEl?.textContent).toBe(title);
        unmount();
      },
    ),
    { numRuns: 100 },
  );
});

test("Property 2: fallback body saat body kosong/null", () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.constant(""), fc.constant(null as unknown as string)),
      (body) => {
        const msg: AdminMessage = {
          id: "1",
          type: "message",
          title: "Test",
          body,
          sentAt: new Date().toISOString(),
        };
        const { container, unmount } = renderCard(msg, [{ label: "OK", onClick: () => {} }]);
        expect(container.textContent).toContain("(Tidak ada isi pesan)");
        unmount();
      },
    ),
    { numRuns: 100 },
  );
});

// ─── Property 3: Validasi dan formatting timestamp ────────────────────────────
// Feature: admin-message-card, Property 3 — Validates: Requirements 3.3
test("Property 3: valid ISO 8601 menghasilkan formatted timestamp (bukan fallback)", () => {
  fc.assert(
    fc.property(
      fc.date({ min: new Date("2000-01-01"), max: new Date("2099-12-31") }),
      (date) => {
        const msg: AdminMessage = {
          id: "1",
          type: "message",
          title: "T",
          body: "B",
          sentAt: date.toISOString(),
        };
        const { container, unmount } = renderCard(msg, [{ label: "OK", onClick: () => {} }]);
        expect(container.textContent).not.toContain("(Waktu tidak tersedia)");
        unmount();
      },
    ),
    { numRuns: 100 },
  );
});

test("Property 3: string non-ISO menghasilkan fallback timestamp", () => {
  // Strings that are clearly not valid dates
  const invalidDates = ["not-a-date", "abc123", "hello world", "99/99/9999", ""];
  invalidDates.forEach((sentAt) => {
    const msg: AdminMessage = {
      id: "1",
      type: "message",
      title: "T",
      body: "B",
      sentAt,
    };
    const { container, unmount } = renderCard(msg, [{ label: "OK", onClick: () => {} }]);
    expect(container.textContent).toContain("(Waktu tidak tersedia)");
    unmount();
  });
});

// ─── Property 4: Multiline body splitting ────────────────────────────────────
// Feature: admin-message-card, Property 4 — Validates: Requirements 3.4
test("Property 4: jumlah blok = jumlah segmen non-empty setelah split newline", () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1 }).filter((s) => s.includes("\n") && s.trim().length > 0),
      (body) => {
        const expectedCount = body
          .split("\n")
          .filter((seg) => seg.trim().length > 0).length;
        if (expectedCount === 0) return; // skip degenerate case
        const msg: AdminMessage = {
          id: "1",
          type: "message",
          title: "T",
          body,
          sentAt: new Date().toISOString(),
        };
        const { container, unmount } = renderCard(msg, [{ label: "OK", onClick: () => {} }]);
        // Count span[display:block] inside body area
        const bodyDiv = container.querySelectorAll("span[style]");
        const blockSpans = Array.from(bodyDiv).filter(
          (el) => (el as HTMLElement).style.display === "block",
        );
        expect(blockSpans.length).toBe(expectedCount);
        unmount();
      },
    ),
    { numRuns: 100 },
  );
});

// ─── Property 5: Jumlah tombol = panjang actions (tanpa onDismiss) ───────────
// Feature: admin-message-card, Property 5 — Validates: Requirements 4.1
test("Property 5: jumlah button = panjang actions saat tidak ada onDismiss", () => {
  fc.assert(
    fc.property(
      arbitraryAdminMessage(),
      arbitraryNonEmptyActions(),
      (msg, actions) => {
        // Ensure no action is labeled "Tutup" so no auto-inject happens
        const safeActions = actions.map((a, i) => ({ ...a, label: `Action${i}` }));
        const { container, unmount } = renderCard(msg, safeActions, undefined);
        const buttons = container.querySelectorAll("button");
        // +1 because "Tutup" is auto-injected when onDismiss is undefined (it's not)
        // Actually onDismiss is undefined so no injection — should equal safeActions.length
        expect(buttons.length).toBe(safeActions.length);
        unmount();
      },
    ),
    { numRuns: 100 },
  );
});

// ─── Property 6: Gaya variant tombol ─────────────────────────────────────────
// Feature: admin-message-card, Property 6 — Validates: Requirements 4.6, 4.7, 4.8
test("Property 6: primary variant → background solid (bukan transparent)", () => {
  fc.assert(
    fc.property(arbitraryAdminMessage(), (msg) => {
      const actions: ActionButton[] = [{ label: "Aksi", onClick: () => {}, variant: "primary" }];
      const { container, unmount } = renderCard(msg, actions, undefined);
      const btn = container.querySelector("button") as HTMLButtonElement;
      expect(btn).not.toBeNull();
      expect(btn.style.background).not.toBe("transparent");
      expect(btn.style.background.length).toBeGreaterThan(0);
      unmount();
    }),
    { numRuns: 100 },
  );
});

test("Property 6: secondary/undefined variant → background transparent + border", () => {
  fc.assert(
    fc.property(
      arbitraryAdminMessage(),
      fc.constantFrom("secondary" as const, undefined),
      (msg, variant) => {
        const actions: ActionButton[] = [{ label: "Aksi", onClick: () => {}, variant }];
        const { container, unmount } = renderCard(msg, actions, undefined);
        const btn = container.querySelector("button") as HTMLButtonElement;
        expect(btn).not.toBeNull();
        expect(btn.style.background).toBe("transparent");
        expect(btn.style.border.length).toBeGreaterThan(0);
        unmount();
      },
    ),
    { numRuns: 100 },
  );
});

// ─── Property 7: Logo fallback untuk senderLogoUrl tidak valid ───────────────
// Feature: admin-message-card, Property 7 — Validates: Requirements 2.6
test("Property 7: falsy/empty senderLogoUrl → inisial NS, tidak ada <img>", () => {
  const falsyValues = ["", undefined];
  fc.assert(
    fc.property(arbitraryAdminMessage(), (msg) => {
      falsyValues.forEach((url) => {
        const { container, unmount } = renderCard(
          msg,
          [{ label: "OK", onClick: () => {} }],
          undefined,
          url,
        );
        expect(container.textContent).toContain("NS");
        expect(container.querySelector("img")).toBeNull();
        unmount();
      });
    }),
    { numRuns: 100 },
  );
});

// ─── Property 8: Injeksi tombol "Tutup" idempotency ──────────────────────────
// Feature: admin-message-card, Property 8 — Validates: Requirements 6.2, 6.3
test("Property 8: onDismiss + no Tutup in actions → tepat 1 tombol Tutup", () => {
  fc.assert(
    fc.property(
      arbitraryAdminMessage(),
      // actions without "Tutup"
      fc.array(
        fc.record({
          label: fc.string({ minLength: 1 }).filter((s) => s !== "Tutup"),
          onClick: fc.constant(() => {}),
          variant: fc.constant("secondary" as const),
        }),
        { maxLength: 5 },
      ),
      (msg, actions) => {
        const { container, unmount } = renderCard(msg, actions, () => {});
        const buttons = Array.from(container.querySelectorAll("button"));
        const tutupButtons = buttons.filter((b) => b.textContent === "Tutup");
        expect(tutupButtons.length).toBe(1);
        unmount();
      },
    ),
    { numRuns: 100 },
  );
});

test("Property 8: onDismiss + Tutup sudah ada → tidak duplikat", () => {
  fc.assert(
    fc.property(arbitraryAdminMessage(), (msg) => {
      const actions: ActionButton[] = [{ label: "Tutup", onClick: () => {} }];
      const { container, unmount } = renderCard(msg, actions, () => {});
      const buttons = Array.from(container.querySelectorAll("button"));
      const tutupButtons = buttons.filter((b) => b.textContent === "Tutup");
      expect(tutupButtons.length).toBe(1);
      unmount();
    }),
    { numRuns: 100 },
  );
});

// ─── Property 9: ARIA region pada semua instance ─────────────────────────────
// Feature: admin-message-card, Property 9 — Validates: Requirements 7.1
test("Property 9: ARIA region + aria-label pada semua pesan valid", () => {
  fc.assert(
    fc.property(arbitraryAdminMessage(), (msg) => {
      const { container, unmount } = renderCard(msg, [{ label: "OK", onClick: () => {} }]);
      const region = container.querySelector("[role='region']");
      expect(region).not.toBeNull();
      expect(region!.getAttribute("aria-label")).toBe("Pesan resmi dari NixelStudio");
      unmount();
    }),
    { numRuns: 100 },
  );
});

// ─── Property 10: Isolasi rendering tanpa provider ───────────────────────────
// Feature: admin-message-card, Property 10 — Validates: Requirements 6.5
test("Property 10: render tanpa provider tidak throw, output non-null", () => {
  fc.assert(
    fc.property(arbitraryAdminMessage(), arbitraryNonEmptyActions(), (msg, actions) => {
      expect(() => {
        const { container, unmount } = render(
          <div>
            <AdminMessageCard message={msg} actions={actions} />
          </div>,
        );
        expect(container.firstChild).not.toBeNull();
        unmount();
      }).not.toThrow();
    }),
    { numRuns: 100 },
  );
});
