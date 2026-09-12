import { env } from "cloudflare:workers";
import {
  CASHFLOW_APP_URL,
  callTelegram,
  cashflowKeyboard,
  createWebhookSecret,
  downloadTelegramFile,
  getTelegramToken,
} from "@/lib/telegram-bot";
import {
  categoryCatalog,
  resolveCategory,
  type BudgetScope,
} from "@/lib/category-catalog";
import {
  createImportBatch,
  createTransactions,
  deleteImportBatch,
  deleteTransaction,
  finishImportBatch,
  getImportBatch,
  latestImportBatch,
  listRecentTransactions,
  nextReviewTransaction,
  updateTransaction,
  type OwnerIdentity,
  type StoredDirection,
} from "@/lib/cashflow-store";
import {
  extractDelimitedStatement,
  extractPdfStatement,
  type ImportedTransaction,
} from "@/lib/statement-import";

type TelegramMessage = {
  chat?: { id?: number };
  from?: {
    id?: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  text?: string;
  voice?: { file_id: string; file_size?: number; duration?: number; mime_type?: string };
  document?: { file_id: string; file_name?: string; file_size?: number; mime_type?: string };
};

type TelegramCallbackQuery = {
  id: string;
  from?: TelegramMessage["from"];
  data?: string;
  message?: { message_id?: number; chat?: { id?: number } };
};

type TelegramUpdate = {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

type ParsedEntry = {
  amount: number;
  title: string;
  scope: BudgetScope;
  category: string;
  categoryKey: string;
  direction: StoredDirection;
  needsReview: boolean;
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

function detectDirection(text: string): StoredDirection {
  if (/перев[её]л|перевод|между своими|наличн|долг/i.test(text)) return "transfer";
  if (/заработ|получил|получила|доход|выручк|оплата от|преми|зарплата пришла/i.test(text)) return "income";
  return "expense";
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

      const direction = detectDirection(title);
      const scope: BudgetScope = direction === "income" ? "work" : detectScope(title);
      const resolved = resolveCategory(title, scope);
      const fallbackId =
        direction === "transfer"
          ? "unknown_transfer"
          : direction === "income"
            ? "other_work_income"
            : scope === "work"
              ? "other_work_expense"
              : "other_expense";
      const exactCategory = resolved?.kind === direction ? resolved : null;
      const category =
        exactCategory ?? categoryCatalog.find((item) => item.id === fallbackId);

      return {
        amount,
        title,
        scope,
        category: category?.name ?? "Прочее",
        categoryKey: category?.id ?? fallbackId,
        direction,
        needsReview: direction === "transfer" || !exactCategory,
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

function shortDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC" }).format(date);
}

async function sendMessage(chatId: number, text: string) {
  const token = getTelegramToken();
  await callTelegram(token, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: cashflowKeyboard(),
  });
}

async function sendMessageWithMarkup(
  chatId: number,
  text: string,
  replyMarkup: Record<string, unknown>,
) {
  await callTelegram(getTelegramToken(), "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
  });
}

async function sendWelcome(chatId: number) {
  await sendMessage(
    chatId,
    [
      "Привет! Я Cashflow — финансовый помощник, который собирает бюджет вместо тебя 💚",
      "",
      "Присылай мне:",
      "📄 банковские выписки — я разберу операции и занесу их в бюджет;",
      "🎙 голосовые сообщения — просто расскажи о доходах и тратах;",
      "✍️ обычный текст — можно записать сразу несколько операций.",
      "",
      "Я сам распределю суммы по разделам «Работа», «Семья» и «Личное». Если встречу перевод или непонятное пополнение, задам короткий вопрос — деньги не попадут не в ту колонку.",
      "",
      "Всё сохранится в Cashflow и будет доступно для отчётов и выгрузки в Excel.",
    ].join("\n"),
  );
}

function ownerFromUser(user: TelegramMessage["from"]): OwnerIdentity | null {
  if (!user?.id) return null;
  return {
    key: `telegram:${user.id}`,
    displayName:
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      user.username ||
      null,
  };
}

async function sha256(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function statementSummary(entries: ImportedTransaction[]) {
  const expenses = entries.filter((item) => item.direction === "expense");
  const incomes = entries.filter((item) => item.direction === "income");
  const reviews = entries.filter((item) => item.needsReview);
  const total = (items: ImportedTransaction[]) => items.reduce((sum, item) => sum + item.amount, 0);
  return [
    `В выписке найдено ${entries.length} операций ✅`,
    "",
    `Автоматически обработано: ${entries.length - reviews.length}`,
    `Нужно разобрать вместе: ${reviews.length}`,
    "",
    `Расходы: ${expenses.length} на ${money(total(expenses))}`,
    `Пополнения и доходы: ${incomes.length} на ${money(total(incomes))}`,
    reviews.length
      ? "Сейчас по очереди покажу неясные переводы с датой и назначением."
      : "Неясных переводов не нашёл.",
    "",
    "Операции уже добавлены в Cashflow.",
  ].join("\n");
}

function importResultKeyboard(batchId: number) {
  return {
    inline_keyboard: [
      [{ text: "Открыть Cashflow", web_app: { url: CASHFLOW_APP_URL } }],
      [{ text: "↩️ Отменить импорт этой выписки", callback_data: `undo:${batchId}` }],
    ],
  };
}

function reviewKeyboard(item: Awaited<ReturnType<typeof nextReviewTransaction>>) {
  if (!item) return { inline_keyboard: [] };
  if (item.direction === "income") {
    return {
      inline_keyboard: [
        [{ text: "Личное поступление", callback_data: `review:${item.id}:income:personal` }],
        [{ text: "Доход от работы", callback_data: `review:${item.id}:income:work` }],
        [{ text: "Между своими счетами", callback_data: `review:${item.id}:transfer:personal` }],
        [{ text: "Не учитывать", callback_data: `review:${item.id}:ignore:personal` }],
      ],
    };
  }
  return {
    inline_keyboard: [
      [
        { text: "Личный расход", callback_data: `review:${item.id}:expense:personal` },
        { text: "Семейный расход", callback_data: `review:${item.id}:expense:family` },
      ],
      [{ text: "Рабочий расход", callback_data: `review:${item.id}:expense:work` }],
      ...(item.direction === "transfer"
        ? [[{ text: "Между своими счетами", callback_data: `review:${item.id}:transfer:personal` }]]
        : []),
      [{ text: "Не учитывать", callback_data: `review:${item.id}:ignore:personal` }],
    ],
  };
}

async function sendReviewQuestion(chatId: number, identity: OwnerIdentity) {
  const item = await nextReviewTransaction(identity);
  if (!item) {
    await sendMessage(chatId, "Все неясные операции разобраны ✅");
    return;
  }
  await sendMessageWithMarkup(
    chatId,
    [
      item.direction === "income" ? "Помоги определить поступление:" : "Помоги определить списание:",
      "",
      `Дата: ${shortDate(item.occurredAt)}`,
      `Сумма: ${money(item.amount)}`,
      `Получатель / назначение: ${item.title}`,
      "",
      "Куда отнести эту сумму?",
    ].join("\n"),
    reviewKeyboard(item),
  );
}

async function removeBotMessage(chatId: number, messageId?: number) {
  if (!messageId) return;
  try {
    await callTelegram(getTelegramToken(), "deleteMessage", {
      chat_id: chatId,
      message_id: messageId,
    });
  } catch (error) {
    console.error("Unable to delete Telegram message", error);
  }
}

async function handleReviewCallback(query: TelegramCallbackQuery) {
  const token = getTelegramToken();
  const chatId = query.message?.chat?.id;
  const identity = ownerFromUser(query.from);
  const match = query.data?.match(/^review:(\d+):(expense|income|transfer|ignore):(personal|family|work)$/);
  if (!chatId || !identity || !match) {
    await callTelegram(token, "answerCallbackQuery", { callback_query_id: query.id });
    return;
  }

  const transactionId = Number(match[1]);
  const choice = match[2];
  const scope = match[3] as BudgetScope;
  if (choice === "ignore") {
    await deleteTransaction(identity, transactionId);
  } else {
    const direction = choice as StoredDirection;
    const categoryKey =
      direction === "transfer"
        ? "own_transfer"
        : direction === "income"
          ? scope === "work" ? "other_work_income" : "other_income"
          : scope === "work" ? "other_work_expense" : "other_expense";
    await updateTransaction(identity, transactionId, {
      direction,
      categoryKey,
      scope,
      reviewStatus: "ready",
    });
  }

  await callTelegram(token, "answerCallbackQuery", {
    callback_query_id: query.id,
    text: "Сохранено",
  });
  if (query.message?.message_id) {
    await removeBotMessage(chatId, query.message.message_id);
  }
  await sendReviewQuestion(chatId, identity);
}

async function askToUndoImport(chatId: number, identity: OwnerIdentity, batchId?: number) {
  const batch = batchId
    ? await getImportBatch(identity, batchId)
    : await latestImportBatch(identity);
  if (!batch || !batch.transactionCount) {
    await sendMessage(chatId, "Не нашёл загруженную выписку, которую можно отменить.");
    return;
  }
  await sendMessageWithMarkup(
    chatId,
    [
      "Удалить весь импорт выписки?",
      "",
      `Файл: ${batch.fileName}`,
      `Будет удалено операций: ${batch.transactionCount}`,
      "",
      "Это действие нельзя отменить.",
    ].join("\n"),
    {
      inline_keyboard: [
        [{ text: "Да, удалить импорт", callback_data: `undo_yes:${batch.id}` }],
        [{ text: "Отмена", callback_data: "cancel" }],
      ],
    },
  );
}

async function showDeleteMenu(chatId: number, identity: OwnerIdentity) {
  const items = await listRecentTransactions(identity, 6);
  if (!items.length) {
    await sendMessage(chatId, "Пока нет операций для удаления.");
    return;
  }
  await sendMessageWithMarkup(chatId, "Какую из последних операций удалить?", {
    inline_keyboard: [
      ...items.map((item) => [{
        text: `${shortDate(item.occurredAt)} · ${money(item.amount)} · ${item.title.slice(0, 28)}`,
        callback_data: `delete:${item.id}`,
      }]),
      [{ text: "Отмена", callback_data: "cancel" }],
    ],
  });
}

async function handleManagementCallback(query: TelegramCallbackQuery) {
  const chatId = query.message?.chat?.id;
  const identity = ownerFromUser(query.from);
  const data = query.data ?? "";
  if (!chatId || !identity) return;

  await callTelegram(getTelegramToken(), "answerCallbackQuery", { callback_query_id: query.id });
  if (data === "cancel") {
    await removeBotMessage(chatId, query.message?.message_id);
    return;
  }

  const undo = data.match(/^undo:(\d+)$/);
  if (undo) {
    await askToUndoImport(chatId, identity, Number(undo[1]));
    return;
  }
  const confirmedUndo = data.match(/^undo_yes:(\d+)$/);
  if (confirmedUndo) {
    const removed = await deleteImportBatch(identity, Number(confirmedUndo[1]));
    await removeBotMessage(chatId, query.message?.message_id);
    await sendMessage(
      chatId,
      removed
        ? `Импорт «${removed.fileName}» удалён. Убрано операций: ${removed.transactionCount} ✅`
        : "Этот импорт уже удалён.",
    );
    return;
  }

  const selected = data.match(/^delete:(\d+)$/);
  if (selected) {
    const item = (await listRecentTransactions(identity, 10)).find(
      (candidate) => candidate.id === Number(selected[1]),
    );
    if (!item) {
      await sendMessage(chatId, "Эта операция уже удалена.");
      return;
    }
    await sendMessageWithMarkup(
      chatId,
      `Удалить «${item.title}» на ${money(item.amount)}?`,
      {
        inline_keyboard: [
          [{ text: "Да, удалить", callback_data: `delete_yes:${item.id}` }],
          [{ text: "Отмена", callback_data: "cancel" }],
        ],
      },
    );
    return;
  }
  const confirmedDelete = data.match(/^delete_yes:(\d+)$/);
  if (confirmedDelete) {
    await deleteTransaction(identity, Number(confirmedDelete[1]));
    await removeBotMessage(chatId, query.message?.message_id);
    await sendMessage(chatId, "Операция удалена ✅");
  }
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function transcribeVoice(buffer: ArrayBuffer) {
  const ai = (env as unknown as {
    AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  }).AI;
  if (!ai) throw new Error("Workers AI binding is unavailable");
  const result = (await ai.run("@cf/openai/whisper-large-v3-turbo", {
    audio: toBase64(buffer),
    language: "ru",
    task: "transcribe",
    initial_prompt: "Доходы и расходы в российских рублях.",
  })) as { text?: string };
  if (!result.text?.trim()) throw new Error("Voice transcript is empty");
  return result.text.trim();
}

async function saveParsedEntries(
  chatId: number,
  identity: OwnerIdentity,
  entries: ParsedEntry[],
  intro?: string,
) {
  await createTransactions(
    identity,
    entries.map((entry) => ({
      title: entry.title,
      categoryKey: entry.categoryKey,
      scope: entry.scope,
      amount: entry.amount,
      direction: entry.direction,
      source: "telegram",
      reviewStatus: entry.needsReview ? "needs_review" : "ready",
    })),
  );

  const lines = entries.flatMap((entry) => [
    `• ${entry.title} — ${money(entry.amount)}`,
    `  ${scopeName(entry.scope)} → ${entry.category}`,
  ]);
  await sendMessage(
    chatId,
    [
      intro,
      entries.some((entry) => entry.needsReview)
        ? "Операции добавлены. Неясные записи отмечены для проверки:"
        : "Сохранено:",
      "",
      ...lines,
      "",
      "Все записи уже доступны в приложении.",
    ].filter(Boolean).join("\n"),
  );
  if (entries.some((entry) => entry.needsReview)) await sendReviewQuestion(chatId, identity);
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
    if (update.callback_query) {
      if (update.callback_query.data?.startsWith("review:")) {
        await handleReviewCallback(update.callback_query);
      } else {
        await handleManagementCallback(update.callback_query);
      }
      return Response.json({ ok: true });
    }

    const message = update.message;
    const chatId = message?.chat?.id;

    if (!chatId) {
      return Response.json({ ok: true });
    }

    const text = message.text?.trim();
    const command = text?.split("@")[0];
    if (command === "/start" || command === "/help" || command === "/app") {
      await sendWelcome(chatId);
      return Response.json({ ok: true });
    }

    const identity = ownerFromUser(message.from);
    if (!identity) return Response.json({ ok: false }, { status: 400 });

    if (command === "/undo") {
      await askToUndoImport(chatId, identity);
      return Response.json({ ok: true });
    }
    if (command === "/delete") {
      await showDeleteMenu(chatId, identity);
      return Response.json({ ok: true });
    }

    if (message.voice) {
      if ((message.voice.file_size ?? 0) > 8 * 1024 * 1024) {
        await sendMessage(chatId, "Голосовое слишком длинное. Пришлите запись короче 8 МБ.");
        return Response.json({ ok: true });
      }
      await sendMessage(chatId, "Слушаю голосовое и разбираю операции… 🎙");
      try {
        const audio = await downloadTelegramFile(token, message.voice.file_id);
        const transcript = await transcribeVoice(audio);
        const entries = parseEntries(transcript);
        if (!entries.length) {
          await sendMessage(chatId, `Я услышал: «${transcript}»\n\nНо не нашёл сумму. Назовите сумму и назначение траты или дохода.`);
        } else {
          await saveParsedEntries(chatId, identity, entries, `Я услышал: «${transcript}»\n`);
        }
      } catch (error) {
        console.error("Voice processing error", error);
        await sendMessage(chatId, "Не получилось разобрать голосовое. Попробуйте ещё раз или напишите операцию текстом.");
      }
      return Response.json({ ok: true });
    }

    if (message.document) {
      const fileName = message.document.file_name ?? "bank-statement";
      const extension = fileName.split(".").pop()?.toLowerCase();
      if (!extension || !["pdf", "csv", "txt"].includes(extension)) {
        await sendMessage(chatId, "Пока я принимаю банковские выписки в PDF или CSV. Пришлите файл из приложения банка в одном из этих форматов.");
        return Response.json({ ok: true });
      }
      if ((message.document.file_size ?? 0) > 10 * 1024 * 1024) {
        await sendMessage(chatId, "Выписка больше 10 МБ. Выберите в банке меньший период и пришлите файл ещё раз.");
        return Response.json({ ok: true });
      }

      await sendMessage(chatId, "Получил выписку. Сейчас разберу операции и распределю их по бюджету… 📄");
      let batchId: number | null = null;
      try {
        const file = await downloadTelegramFile(token, message.document.file_id);
        const batch = await createImportBatch(identity, {
          checksum: await sha256(file),
          fileName,
          bankCode: /сбер|sber/i.test(fileName) ? "sber" : null,
        });
        batchId = batch.id;
        if (batch.duplicate) {
          await sendMessage(chatId, "Эта выписка уже была загружена — повторно операции не добавляю ✅");
          return Response.json({ ok: true });
        }

        const entries = extension === "pdf"
          ? await extractPdfStatement(file)
          : extractDelimitedStatement(file);
        if (!entries.length) throw new Error("statement_has_no_transactions");

        await createTransactions(
          identity,
          entries.map((entry) => ({ ...entry, importBatchId: batch.id })),
        );
        await finishImportBatch(
          identity,
          batch.id,
          entries.some((entry) => entry.needsReview) ? "review" : "committed",
        );
        await sendMessageWithMarkup(
          chatId,
          statementSummary(entries),
          importResultKeyboard(batch.id),
        );
        if (entries.some((entry) => entry.needsReview)) await sendReviewQuestion(chatId, identity);
      } catch (error) {
        console.error("Statement processing error", error);
        if (batchId) {
          await finishImportBatch(identity, batchId, "failed", error instanceof Error ? error.message.slice(0, 300) : "Unknown error");
        }
        await sendMessage(
          chatId,
          "Не удалось прочитать операции в этом файле. Лучше выгрузить выписку из банка как обычный PDF с текстом или CSV и прислать её ещё раз.",
        );
      }
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

      await saveParsedEntries(chatId, identity, entries);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    service: "Cashflow Telegram webhook",
    features: [
      "bank-statements",
      "voice",
      "transfer-review",
      "statement-operation-column-v2",
      "merchant-category-priority-v2",
      "row-bound-amount-v3",
      "structured-statement-json-v4",
      "telegram-cloud-identity-v5",
      "telegram-signature-validation-v6",
      "import-undo",
      "transaction-delete",
    ],
  });
}
