import { getTelegramToken } from "@/lib/telegram-bot";

export type CashflowIdentity = {
  key: string;
  displayName?: string | null;
};

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function hmac(
  key: ArrayBuffer | Uint8Array,
  value: string,
) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(value),
  );
}

async function verifyTelegramInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) return null;

  const authDate = Number(params.get("auth_date"));
  if (
    !Number.isFinite(authDate) ||
    Math.abs(Math.floor(Date.now() / 1000) - authDate) > 24 * 60 * 60
  ) {
    return null;
  }

  params.delete("hash");
  params.delete("signature");
  const checkString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await hmac(
    new TextEncoder().encode("WebAppData"),
    getTelegramToken(),
  );
  const calculatedHash = bytesToHex(await hmac(secretKey, checkString));

  if (calculatedHash !== receivedHash.toLowerCase()) return null;

  const rawUser = params.get("user");
  if (!rawUser) return null;

  const user = JSON.parse(rawUser) as {
    id?: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  if (!user.id) return null;

  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.username ||
    null;

  return {
    key: `telegram:${user.id}`,
    displayName,
  } satisfies CashflowIdentity;
}

export async function identifyCashflowUser(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("tma ")) {
    const identity = await verifyTelegramInitData(authorization.slice(4));
    if (identity) return identity;
    throw new Error("Telegram authorization is invalid");
  }

  const deviceId = request.headers.get("x-cashflow-device-id");
  if (
    deviceId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      deviceId,
    )
  ) {
    return {
      key: `web:${deviceId.toLowerCase()}`,
      displayName: "Веб-пользователь",
    } satisfies CashflowIdentity;
  }

  throw new Error("Cashflow user is not identified");
}

export function unauthorized(error: unknown) {
  return Response.json(
    {
      ok: false,
      error: error instanceof Error ? error.message : "Unauthorized",
    },
    { status: 401 },
  );
}
