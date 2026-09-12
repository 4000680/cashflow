import { extractText, extractTextItems, getDocumentProxy } from "unpdf";
import { categoryCatalog, resolveCategory, type BudgetScope } from "./category-catalog";
import type { NewStoredTransaction, StoredDirection } from "./cashflow-store";

const DATE_RE = /\b([0-3]?\d)[./-]([01]?\d)[./-]((?:20)?\d{2})\b/;
const MONEY_RE = /(?:^|\s)([+\-−–]?\s*\d+(?:[\s\u00a0]\d{3})*(?:[.,]\d{2}))(?:\s*(?:₽|руб\.?|RUB))?(?=\s|$)/gi;
const SUMMARY_RE = /итого|остаток|баланс|лимит|оборот|всего расходов|всего поступлений|начальн\w* остаток|конечн\w* остаток|дата формирования/i;
const TRANSFER_RE = /перевод|сбп|card2card|card to card|с карты|на карту|выдача наличных|снятие наличных|внесение наличных/i;
const INCOME_RE = /зачислен|поступлен|пополнен|возврат|кешб[эе]к|cashback|зарплат|процент/i;
const EXPENSE_RE = /покупк|оплат|списан|комисси|плат[её]ж|выдача наличных|снятие наличных/i;

export type ImportedTransaction = NewStoredTransaction & {
  needsReview: boolean;
};

function parseDate(value: string) {
  const match = value.match(DATE_RE);
  if (!match) return undefined;
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const date = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[1]), 12));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseAmount(value: string) {
  const normalized = value
    .replace(/[₽\s\u00a0]|руб\.?|RUB/gi, "")
    .replace(/[−–]/g, "-")
    .replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function detectDirection(row: string, signedAmount: number): StoredDirection | null {
  if (TRANSFER_RE.test(row)) return "transfer";
  if (signedAmount < 0 || EXPENSE_RE.test(row)) return "expense";
  if (/\+\s*\d/.test(row) || INCOME_RE.test(row)) return "income";
  return null;
}

function detectScope(description: string, direction: StoredDirection): BudgetScope {
  if (direction === "income") return "work";
  if (/клиент|работ|бизнес|реклам|подряд|налог|тамож|утилизац|сбктс|эптс/i.test(description)) {
    return "work";
  }
  if (/семь|реб[её]н|школ|садик|квартплат|жкх|дом/i.test(description)) return "family";
  return "personal";
}

function cleanDescription(row: string) {
  return row
    .replace(new RegExp(DATE_RE.source, "g"), " ")
    .replace(new RegExp(MONEY_RE.source, "gi"), " ")
    .replace(/\b\d{2}:\d{2}(?::\d{2})?\b/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[|,;:\-–—\s]+|[|,;:\-–—\s]+$/g, "")
    .slice(0, 220) || "Операция из выписки";
}

function fallbackCategory(direction: StoredDirection, scope: BudgetScope) {
  if (direction === "transfer") return "unknown_transfer";
  if (direction === "income") return scope === "work" ? "other_work_income" : "other_income";
  return scope === "work" ? "other_work_expense" : "other_expense";
}

function parseRow(row: string): ImportedTransaction | null {
  const compact = row.replace(/\s+/g, " ").trim();
  const occurredAt = parseDate(compact);
  if (!occurredAt || SUMMARY_RE.test(compact)) return null;

  const matches = [...compact.matchAll(new RegExp(MONEY_RE.source, "gi"))];
  const amounts = matches
    .map((match) => parseAmount(match[1]))
    .filter((amount): amount is number => amount !== null && amount !== 0);
  if (!amounts.length) return null;

  // Bank statements often repeat the operation amount in account currency.
  // The final signed amount is the most reliable column after text extraction.
  const signedAmount = amounts.at(-1)!;
  const direction = detectDirection(compact, signedAmount);
  if (!direction) return null;

  const title = cleanDescription(compact);
  const scope = detectScope(title, direction);
  const resolved = resolveCategory(title, scope);
  const exactCategory = resolved?.kind === direction ? resolved : null;
  const categoryKey = exactCategory?.id ?? fallbackCategory(direction, scope);

  return {
    title,
    categoryKey,
    scope,
    amount: Math.abs(signedAmount),
    direction,
    source: "statement",
    occurredAt,
    reviewStatus: direction === "transfer" ? "needs_review" : "ready",
    needsReview: direction === "transfer",
  };
}

function transactionBlocks(lines: string[]) {
  const blocks: string[] = [];
  let current = "";
  for (const sourceLine of lines) {
    const line = sourceLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (DATE_RE.test(line)) {
      if (current) blocks.push(current);
      current = line;
    } else if (current) {
      current += ` ${line}`;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function rowsFromItems(items: Awaited<ReturnType<typeof extractTextItems>>["items"]) {
  return items.flatMap((page) => {
    const rows: Array<{ y: number; parts: Array<{ x: number; text: string }> }> = [];
    for (const item of page) {
      let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2.5);
      if (!row) {
        row = { y: item.y, parts: [] };
        rows.push(row);
      }
      row.parts.push({ x: item.x, text: item.str });
    }
    return rows
      .sort((a, b) => b.y - a.y)
      .map((row) => row.parts.sort((a, b) => a.x - b.x).map((part) => part.text).join(" "));
  });
}

function deduplicate(entries: ImportedTransaction[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = [entry.occurredAt?.toISOString().slice(0, 10), entry.amount, entry.direction, entry.title].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseStatementLines(lines: string[]) {
  const direct = transactionBlocks(lines).map(parseRow).filter((item): item is ImportedTransaction => Boolean(item));
  return deduplicate(direct).slice(0, 1500);
}

export async function extractPdfStatement(buffer: ArrayBuffer) {
  if (buffer.byteLength > 10 * 1024 * 1024) throw new Error("statement_too_large");
  const pdf = await getDocumentProxy(new Uint8Array(buffer), { maxImageSize: 16_777_216 });
  if (pdf.numPages > 40) throw new Error("statement_too_many_pages");

  const extraction = Promise.all([
    extractTextItems(pdf),
    extractText(pdf, { mergePages: true }),
  ]);
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("statement_timeout")), 20_000),
  );
  const [positioned, plain] = await Promise.race([extraction, timeout]);
  const positionedEntries = parseStatementLines(rowsFromItems(positioned.items));
  if (positionedEntries.length) return positionedEntries;

  const text = Array.isArray(plain.text) ? plain.text.join("\n") : plain.text;
  return parseStatementLines(text.split(/\r?\n/));
}

export function extractDelimitedStatement(buffer: ArrayBuffer) {
  let text = new TextDecoder("utf-8").decode(buffer);
  if ((text.match(/�/g)?.length ?? 0) > 3) {
    text = new TextDecoder("windows-1251").decode(buffer);
  }
  return parseStatementLines(text.split(/\r?\n/));
}

export function categoryName(categoryKey: string) {
  return categoryCatalog.find((item) => item.id === categoryKey)?.name ?? "Прочее";
}
