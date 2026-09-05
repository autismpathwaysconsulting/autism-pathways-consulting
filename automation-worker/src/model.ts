export const PROVIDERS = ["meta", "tiktok", "youtube"] as const;
export type Provider = typeof PROVIDERS[number];
export type Checkpoint = "24h" | "7d" | "28d";

export type JsonRecord = { [key: string]: unknown };

export interface ConnectionRow {
  connection_id: string;
  provider: Provider;
  account_id: string;
  account_name: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
  scopes_json: string;
  metadata_json: string;
  status: "active" | "reconnect_required" | "disconnected";
  last_refreshed_at: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderAccount {
  provider: Provider;
  accountId: string;
  accountName: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
  metadata: JsonRecord;
}

export interface NormalizedMetrics {
  views: number | null;
  reach: number | null;
  averageWatchTimeSeconds: number | null;
  totalWatchTimeSeconds: number | null;
  likes: number | null;
  commentsCount: number | null;
  saves: number | null;
  shares: number | null;
}

export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function record(value: unknown, message = "Provider response is invalid."): JsonRecord {
  if (!isRecord(value)) throw new Error(message);
  return value;
}

export function textValue(value: unknown, maximum = 4096): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum ? value : null;
}

export function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0) return Number(value);
  return null;
}

export function integerValue(value: unknown): number | null {
  const number = numberValue(value);
  return number === null ? null : Math.round(number);
}

export function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

export function parseJsonRecord(value: string): JsonRecord {
  const parsed: unknown = JSON.parse(value);
  return record(parsed, "Stored connector metadata is invalid.");
}
