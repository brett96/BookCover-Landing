"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics-client";

export default function AnalyticsProvider() {
  useEffect(() => {
    trackEvent("page_view");
  }, []);
  return null;
}
