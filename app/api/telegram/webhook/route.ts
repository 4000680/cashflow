import {
  callTelegram,
  cashflowKeyboard,
  createWebhookSecret,
  getTelegramToken,
} from "@/lib/telegram-bot";
import {
  categoryCatalog,
  resolveCategory,
  type BudgetScope,
} from "@/lib/category-catalog";

type TelegramMessage = {
  chat?: { id?: number };
  text?: string;
  voice?: unknown;
  document?: { file_name?: string };
};

type TelegramUpdate = {
  message?: TelegramMessage;
};

type ParsedEntry = {
  amount: number;
  title: string;
  scope: BudgetScope;
  category: string;
};

function detectScope(text: string): BudgetScope {
  if (/клиент|работ|реклам|подряд|сотрудник|выручк|проект|бизнес|бухгалтер/i.test(text)) {
    return "work";
  }
  if (/семь|жен|муж|реб[её]н|доч|сын|дом|школ/i.test(text)) {
    return "family";
  }
  return "personal";
}

function isIncome(text: string) {
  return /заработ|получил|получила|доход|выручк|оплата от|преми|зарплата пришла/i.test(text);
}

function parseEntries(text: string): ParsedEntry[] {
  return text
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .map((part) => {
      const match = part.match(/-?\d(?:[\d\s]*\d)?(?:[.,]\d{1,2})?/);
      if (!match) return null;

      const amount = Math.abs(
        Number(match[0].replace(/\s/g, "").replace(",", ".")),
      );
      if (!Number.isFinite(amount) || amount <= 0) return null;

      const title =
        `${part.slice(0, match.index ?? 0)} ${part.slice(
          (match.index ?? 0) + match[0].length,
        )}`
          .replace(/\b(?:руб(?:лей|ля|ль)?|р)\.?\b|₽/gi, " ")
          .replace(/\s+/g, " ")
          .trim() || "Операция";

      const income = isIncome(title);
      const scope: BudgetScope = income ? "work" : detectScope(title);
      const resolved = resolveCategory(title, scope);
      const fallbackId = income
        ? "other_work_income"
        : scope === "work"
          ? "other_work_expense"
          : "other_expense";
      const fallback = categoryCatalog.find((item) => item.id === fallbackId);
      const category =
        resolved && resolved.kind === (income ? "income" : "expense")
          ? resolved
          : fallback;

      return {
        amount,
        title,
        scope,
        category: category?.name ?? "Прочее",
      };
    })
    .filter((entry): entry is ParsedEntry => Boolean(entry))
    .slice(0, 10);
}

function money(value: number) {
  return (
    new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value) +
    " ₽"
  );
}

function scopeName(scope: BudgetScope) {
  if (scope === "work") return "Работа";
  if (scope === "family") return "Семья";
  return "Личное";
}

async function sendMessage(chatId: number, text: string) {
  const token = getTelegramToken();
  await callTelegram(token, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: cashflowKeyboard(),
  });
}

async function sendWelcome(chatId: number) {
  await sendMessage(
    chatId,
    [
      "Здравствуйте! Я помогу вести доходы и расходы.",
      "",
      "Напишите одной строкой, например:",
      "350 кофе, 2500 бензин",
      "",
      "Можно указать сразу несколько операций.",
    ].join("\n"),
  );
}

export async function POST(request: Request) {
  try {
    const token = getTelegramToken();
    const expectedSecret = await createWebhookSecret(token);
    const receivedSecret = request.headers.get(
      "x-telegram-bot-api-secret-token",
    );

    if (receivedSecret !== expectedSecret) {
      return Response.json({ ok: false }, { status: 401 });
    }

    const update = (await request.json()) as TelegramUpdate;
    const message = update.message;
    const chatId = message?.chat?.id;

    if (!chatId) {
      return Response.json({ ok: true });
    }

    const text = message.text?.trim();
    if (text === "/start" || text === "/help" || text === "/app") {
      await sendWelcome(chatId);
      return Response.json({ ok: true });
    }

    if (message.voice) {
      await sendMessage(
        chatId,
        "Голосовое сообщение получено. Распознавание голоса подключим следующим этапом.",
      );
      return Response.json({ ok: true });
    }

    if (message.document) {
      await sendMessage(
        chatId,
        "Файл получен. Импорт банковских выписок подключим следующим этапом.",
      );
      return Response.json({ ok: true });
    }

    if (text) {
      const entries = parseEntries(text);
      if (!entries.length) {
        await sendMessage(
          chatId,
          "Не нашёл сумму. Напишите, например: 350 кофе, 2500 бензин.",
        );
        return Response.json({ ok: true });
      }

      const lines = entries.flatMap((entry) => [
        `• ${entry.title} — ${money(entry.amount)}`,
        `  ${scopeName(entry.scope)} → ${entry.category}`,
      ]);

      await sendMessage(
        chatId,
        [
          "Я распознал:",
          "",
          ...lines,
          "",
          "Пока это предварительный разбор — операции ещё не сохранены.",
        ].join("\n"),
      );
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ ok: true, service: "Cashflow Telegram webhook" });
}
