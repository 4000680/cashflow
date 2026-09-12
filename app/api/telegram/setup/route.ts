import {
  CASHFLOW_APP_URL,
  CASHFLOW_BOT_USERNAME,
  callTelegram,
  createWebhookSecret,
  getTelegramToken,
} from "@/lib/telegram-bot";

type BotInfo = {
  id: number;
  username?: string;
};

type WebhookInfo = {
  url: string;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
};

const WEBHOOK_URL = `${CASHFLOW_APP_URL}/api/telegram/webhook`;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("bot") !== CASHFLOW_BOT_USERNAME) {
      return Response.json(
        { ok: false, error: "Activation parameter is missing" },
        { status: 400 },
      );
    }

    const token = getTelegramToken();
    const bot = await callTelegram<BotInfo>(token, "getMe");

    if (bot.username?.toLowerCase() !== CASHFLOW_BOT_USERNAME.toLowerCase()) {
      return Response.json(
        {
          ok: false,
          error: "The configured token belongs to another Telegram bot",
          configured_bot: bot.username ? `@${bot.username}` : null,
          expected_bot: `@${CASHFLOW_BOT_USERNAME}`,
        },
        { status: 409 },
      );
    }

    const secretToken = await createWebhookSecret(token);

    await callTelegram(token, "setWebhook", {
      url: WEBHOOK_URL,
      secret_token: secretToken,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });

    await callTelegram(token, "setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text: "Открыть Cashflow",
        web_app: { url: CASHFLOW_APP_URL },
      },
    });

    await callTelegram(token, "setMyCommands", {
      commands: [
        { command: "start", description: "Начать работу" },
        { command: "app", description: "Открыть приложение" },
        { command: "undo", description: "Отменить последнюю выписку" },
        { command: "delete", description: "Удалить отдельную операцию" },
        { command: "help", description: "Помощь" },
      ],
    });

    const webhookInfo = await callTelegram<WebhookInfo>(token, "getWebhookInfo");

    return Response.json({
      ok: true,
      bot: `@${bot.username}`,
      webhook: WEBHOOK_URL,
      menu_button: CASHFLOW_APP_URL,
      telegram_status: {
        webhook_matches: webhookInfo.url === WEBHOOK_URL,
        pending_updates: webhookInfo.pending_update_count,
        last_error_at: webhookInfo.last_error_date
          ? new Date(webhookInfo.last_error_date * 1000).toISOString()
          : null,
        last_error: webhookInfo.last_error_message ?? null,
      },
    });
  } catch (error) {
    console.error("Telegram setup error", error);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Setup failed",
      },
      { status: 500 },
    );
  }
}
