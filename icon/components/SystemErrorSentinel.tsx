"use client";

import { useEffect } from "react";

/**
 * SystemErrorSentinel Component.
 * Catches unhandled browser JS exceptions and Promise rejections,
 * then dispatches a real-time error report directly to Admin Inbox.
 */
export default function SystemErrorSentinel() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleGlobalError = (event: ErrorEvent) => {
      try {
        const payload = {
          category: "CLIENT_RUNTIME",
          message: event.message || "Unhandled Client Exception",
          stack: event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`,
          endpoint: window.location.pathname,
        };

        void fetch("/api/admin/system-errors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch { /* silent */ }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      try {
        const reason = event.reason;
        const msg = reason instanceof Error ? reason.message : String(reason ?? "Unhandled Promise Rejection");
        const stack = reason instanceof Error ? reason.stack : String(reason ?? "");

        void fetch("/api/admin/system-errors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: "CLIENT_RUNTIME",
            message: `[Promise Rejection] ${msg}`,
            stack,
            endpoint: window.location.pathname,
          }),
        });
      } catch { /* silent */ }
    };

    window.addEventListener("error", handleGlobalError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleGlobalError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
