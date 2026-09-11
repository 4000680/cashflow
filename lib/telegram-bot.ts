import { env } from "cloudflare:workers";

export const CASHFLOW_APP_URL = "https://cashflow.4000680.workers.dev";
export const CASHFLOW_BOT_USERNAME = "Cashflow_money_bot";

type CashflowEnv = {
  TELEGRAM_BOT_TOKEN?: string;
};

type TelegramResult<T = unknown> = {
  ok: boolean;
  result?: T;
  description?: string;
};

export function getTelegramToken() {
  const token = (env as unknown as CashflowEnv).TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  return token;
}

export async function createWebhookSecret(token: string) {
  const bytes = new TextEncoder().encode(`cashflow-webhook:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function callTelegram<T = unknown>(
  token: string,
  method: string,
  payload?: Record<string, unknown>,
) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: payload ? "POST" : "GET",
      headers: payload ? { "content-type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    },
  );

  const data = (await response.json()) as TelegramResult<T>;
  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram API error: ${response.status}`);
  }
  return data.result as T;
}

export function cashflowKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "Открыть Cashflow",
          web_app: { url: CASHFLOW_APP_URL },
        },
      ],
    ],
  };
}
