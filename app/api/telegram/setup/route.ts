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
      allowed_updates: ["message"],
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
        { command: "help", description: "Помощь" },
      ],
    });

    return Response.json({
      ok: true,
      bot: `@${bot.username}`,
      webhook: WEBHOOK_URL,
      menu_button: CASHFLOW_APP_URL,
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
