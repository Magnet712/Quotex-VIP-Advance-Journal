"use client";

import { useReportWebVitals } from "next/web-vitals";

export function WebVitals() {
  useReportWebVitals((metric) => {
    // In development mode, we log Web Vitals directly to the console for inspection.
    // In production, these metrics can be forwarded to Sentry, Google Analytics, or a custom API.
    if (process.env.NODE_ENV === "development") {
      console.log(`[Web Vitals] ${metric.name}:`, metric.value, metric.rating);
    }
  });

  return null;
}
