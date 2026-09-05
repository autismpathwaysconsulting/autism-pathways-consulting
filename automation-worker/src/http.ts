const MAX_RESPONSE_BYTES = 1024 * 1024;

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

async function limitedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("Content-Length") || 0);
  if (declared > MAX_RESPONSE_BYTES) throw new ProviderHttpError("Provider response was too large.", 502, "response_too_large", false);
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel("Provider response exceeded limit.");
        throw new ProviderHttpError("Provider response was too large.", 502, "response_too_large", false);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)); }
  catch { throw new ProviderHttpError("Provider returned invalid JSON.", 502, "invalid_provider_json", false); }
}

export async function fetchJson(url: string, init: RequestInit = {}, attempts = 3): Promise<unknown> {
  let lastError: ProviderHttpError | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response;
    try { response = await fetch(url, init); }
    catch {
      lastError = new ProviderHttpError("Provider request failed.", 503, "provider_network_error", true);
      if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 250 * (2 ** attempt)));
      continue;
    }
    const body = await limitedJson(response);
    if (response.ok) return body;
    const retryable = response.status === 429 || response.status >= 500;
    lastError = new ProviderHttpError("Provider rejected the request.", response.status, `provider_http_${response.status}`, retryable);
    if (!retryable || attempt + 1 >= attempts) throw lastError;
    await new Promise(resolve => setTimeout(resolve, 250 * (2 ** attempt)));
  }
  throw lastError || new ProviderHttpError("Provider request failed.", 503, "provider_network_error", true);
}

export function formBody(values: Record<string, string>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  return body;
}
