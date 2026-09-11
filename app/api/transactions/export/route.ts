import {
  identifyCashflowUser,
  unauthorized,
} from "@/lib/cashflow-auth";
import { rowsForExport } from "@/lib/cashflow-store";

function csvCell(value: string | number) {
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

function directionName(direction: string) {
  if (direction === "income") return "Доход";
  if (direction === "expense") return "Расход";
  return "Перевод";
}

function sourceName(source: string) {
  if (source === "telegram") return "Telegram";
  if (source === "statement") return "Банковская выписка";
  if (source === "web") return "Приложение";
  return source;
}

function statusName(status: string) {
  if (status === "ready") return "Подтверждено";
  if (status === "needs_review") return "Требует проверки";
  if (status === "merged") return "Объединено";
  return "Исключено";
}

export async function GET(request: Request) {
  try {
    const identity = await identifyCashflowUser(request);
    const rows = await rowsForExport(identity);
    const header = [
      "Дата",
      "Тип",
      "Раздел",
      "Категория",
      "Описание",
      "Сумма",
      "Валюта",
      "Источник",
      "Статус",
    ];

    const lines = [
      header.map(csvCell).join(";"),
      ...rows.map((row) =>
        [
          row.date.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" }),
          directionName(row.direction),
          row.scope,
          row.category,
          row.description,
          row.amount.toFixed(2).replace(".", ","),
          row.currency,
          sourceName(row.source),
          statusName(row.status),
        ]
          .map(csvCell)
          .join(";"),
      ),
    ];

    const date = new Date().toISOString().slice(0, 10);
    return new Response("\uFEFF" + lines.join("\r\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="cashflow-${date}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return unauthorized(error);
  }
}
