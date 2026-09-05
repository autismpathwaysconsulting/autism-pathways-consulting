export const ANALYTICS_SCHEMA_VERSION: "apc.analytics.v1";
export const ANALYTICS_PROTOCOL_VERSION: "APC-META-2026-09";
export const ANALYTICS_CHECKPOINTS: readonly ["24h", "7d", "28d", "72h_legacy"];
export const ANALYTICS_METRICS: readonly [
  "views",
  "reach",
  "averageWatchTimeSeconds",
  "totalWatchTimeSeconds",
  "likes",
  "commentsCount",
  "saves",
  "shares"
];
export function assertValidPublication(publication: unknown): unknown;
export function assertValidAnalyticsSnapshot(snapshot: unknown): unknown;
export function validateAnalyticsSubmission(value: unknown): { valid: boolean; error: string | null };
