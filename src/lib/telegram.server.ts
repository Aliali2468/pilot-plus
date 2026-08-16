/** Server-only Telegram Bot API access through the Lovable connector gateway. */

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

function gatewayHeaders(): Record<string, string> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["TELEGRAM_API_KEY"];
  if (!lovableKey || !connectionKey) throw new Error("Telegram is not configured on the server");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
  };
}

export async function telegramApi<T = any>(method: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Telegram request failed [${res.status}]: ${text}`);
  const json = JSON.parse(text) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(json.description ?? "Telegram rejected the request");
  return json.result;
}

/** Opens a streaming read of a Telegram file without buffering it in memory. */
export async function telegramFileStream(fileId: string) {
  const file = await telegramApi<{ file_path?: string; file_size?: number }>("getFile", {
    file_id: fileId,
  });
  if (!file.file_path) throw new Error("Telegram could not provide this file (it may be too large)");
  const headers = gatewayHeaders();
  delete headers["Content-Type"];
  const res = await fetch(`${GATEWAY}/file/${file.file_path}`, { headers });
  if (!res.ok || !res.body) {
    throw new Error(`Downloading from Telegram failed [${res.status}]`);
  }
  return {
    body: res.body,
    size: file.file_size ?? Number(res.headers.get("content-length") ?? 0),
  };
}

/** Bot username the incoming media must have come through, for display only. */
export async function telegramBotUsername(): Promise<string | null> {
  const me = await telegramApi<{ username?: string }>("getMe");
  return me.username ? `@${me.username}` : null;
}
