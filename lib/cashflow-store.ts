import { env } from "cloudflare:workers";
import type { D1Database } from "@cloudflare/workers-types";
import { categoryCatalog, type BudgetScope } from "@/lib/category-catalog";

export type StoredDirection = "expense" | "income" | "transfer";
export type StoredSource = "telegram" | "web" | "statement" | "email" | "api";

export type NewStoredTransaction = {
  title: string;
  categoryKey: string;
  scope: BudgetScope;
  amount: number;
  direction: StoredDirection;
  source: StoredSource;
  occurredAt?: Date;
  reviewStatus?: "ready" | "needs_review";
};

type OwnerIdentity = {
  key: string;
  displayName?: string | null;
};

type TransactionRow = {
  id: number;
  scope: BudgetScope;
  category_key: string | null;
  direction: StoredDirection;
  amount_kopecks: number;
  occurred_at: number;
  description: string | null;
  source: StoredSource;
  review_status: "ready" | "needs_review" | "merged" | "ignored";
};

function getD1() {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new Error("Cloudflare D1 binding DB is unavailable");
  return database;
}

function unixTime(date = new Date()) {
  return Math.floor(date.getTime() / 1000);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function ensureOwner(identity: OwnerIdentity) {
  const database = getD1();
  const createdAt = unixTime();

  await database
    .prepare(
      `INSERT OR IGNORE INTO users
       (telegram_id, display_name, timezone, currency, created_at)
       VALUES (?, ?, 'Europe/Moscow', 'RUB', ?)`,
    )
    .bind(identity.key, identity.displayName ?? null, createdAt)
    .run();

  if (identity.displayName) {
    await database
      .prepare("UPDATE users SET display_name = ? WHERE telegram_id = ?")
      .bind(identity.displayName, identity.key)
      .run();
  }

  const owner = await database
    .prepare("SELECT id FROM users WHERE telegram_id = ?")
    .bind(identity.key)
    .first<{ id: number }>();

  if (!owner) throw new Error("Unable to create Cashflow user");

  const scopeStatements = [
    ["personal", "Личное"],
    ["family", "Семья"],
    ["work", "Работа"],
  ].map(([kind, name]) =>
    database
      .prepare(
        "INSERT OR IGNORE INTO scopes (owner_id, kind, name, enabled) VALUES (?, ?, ?, 1)",
      )
      .bind(owner.id, kind, name),
  );

  await database.batch(scopeStatements);
  return owner.id;
}

async function getScopeId(ownerId: number, scope: BudgetScope) {
  const row = await getD1()
    .prepare("SELECT id FROM scopes WHERE owner_id = ? AND kind = ?")
    .bind(ownerId, scope)
    .first<{ id: number }>();
  if (!row) throw new Error("Budget scope is unavailable");
  return row.id;
}

function mapTransaction(row: TransactionRow) {
  const category = categoryCatalog.find((item) => item.id === row.category_key);
  const source =
    row.source === "telegram"
      ? "Telegram"
      : row.source === "statement"
        ? "Выписка"
        : "Вручную";

  return {
    id: row.id,
    title: row.description || "Операция",
    category: category?.name ?? "Прочее",
    categoryId: row.category_key ?? "other_expense",
    group: category?.group ?? "Прочее",
    scope: row.scope,
    amount: row.amount_kopecks / 100,
    direction: row.direction,
    source,
    status:
      row.review_status === "needs_review"
        ? "review"
        : row.review_status === "ready"
          ? "ready"
          : "duplicate",
    occurredAt: new Date(row.occurred_at * 1000).toISOString(),
  };
}

export async function listTransactions(identity: OwnerIdentity) {
  const ownerId = await ensureOwner(identity);
  const result = await getD1()
    .prepare(
      `SELECT
         t.id, s.kind AS scope, t.category_key, t.direction,
         t.amount_kopecks, t.occurred_at, t.description, t.source,
         t.review_status
       FROM transactions t
       JOIN scopes s ON s.id = t.scope_id
       WHERE t.owner_id = ?
       ORDER BY t.occurred_at DESC, t.id DESC
       LIMIT 5000`,
    )
    .bind(ownerId)
    .all<TransactionRow>();

  return result.results.map(mapTransaction);
}

export async function createTransactions(
  identity: OwnerIdentity,
  entries: NewStoredTransaction[],
) {
  const database = getD1();
  const ownerId = await ensureOwner(identity);
  const createdIds: number[] = [];

  for (const entry of entries) {
    const scopeId = await getScopeId(ownerId, entry.scope);
    const occurredAt = unixTime(entry.occurredAt);
    const amountKopecks = Math.round(entry.amount * 100);
    const fingerprint = await sha256(
      [
        ownerId,
        entry.direction,
        amountKopecks,
        occurredAt,
        entry.title.trim().toLowerCase(),
      ].join("|"),
    );

    const result = await database
      .prepare(
        `INSERT INTO transactions
         (owner_id, scope_id, category_key, direction, amount_kopecks,
          currency, occurred_at, description, source, fingerprint,
          review_status, created_at)
         VALUES (?, ?, ?, ?, ?, 'RUB', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        ownerId,
        scopeId,
        entry.categoryKey,
        entry.direction,
        amountKopecks,
        occurredAt,
        entry.title.trim(),
        entry.source,
        fingerprint,
        entry.reviewStatus ?? "ready",
        unixTime(),
      )
      .run();

    if (result.meta.last_row_id) createdIds.push(Number(result.meta.last_row_id));
  }

  if (!createdIds.length) return [];

  const placeholders = createdIds.map(() => "?").join(",");
  const result = await database
    .prepare(
      `SELECT
         t.id, s.kind AS scope, t.category_key, t.direction,
         t.amount_kopecks, t.occurred_at, t.description, t.source,
         t.review_status
       FROM transactions t
       JOIN scopes s ON s.id = t.scope_id
       WHERE t.owner_id = ? AND t.id IN (${placeholders})
       ORDER BY t.id DESC`,
    )
    .bind(ownerId, ...createdIds)
    .all<TransactionRow>();

  return result.results.map(mapTransaction);
}

export async function updateTransaction(
  identity: OwnerIdentity,
  id: number,
  values: {
    direction: StoredDirection;
    categoryKey: string;
    reviewStatus: "ready" | "needs_review";
  },
) {
  const ownerId = await ensureOwner(identity);
  await getD1()
    .prepare(
      `UPDATE transactions
       SET direction = ?, category_key = ?, review_status = ?
       WHERE id = ? AND owner_id = ?`,
    )
    .bind(
      values.direction,
      values.categoryKey,
      values.reviewStatus,
      id,
      ownerId,
    )
    .run();
}

export async function deleteTransaction(identity: OwnerIdentity, id: number) {
  const ownerId = await ensureOwner(identity);
  await getD1()
    .prepare("DELETE FROM transactions WHERE id = ? AND owner_id = ?")
    .bind(id, ownerId)
    .run();
}

export async function rowsForExport(identity: OwnerIdentity) {
  const ownerId = await ensureOwner(identity);
  const result = await getD1()
    .prepare(
      `SELECT
         t.occurred_at, t.direction, s.name AS scope_name,
         t.category_key, t.description, t.amount_kopecks,
         t.currency, t.source, t.review_status
       FROM transactions t
       JOIN scopes s ON s.id = t.scope_id
       WHERE t.owner_id = ?
       ORDER BY t.occurred_at DESC, t.id DESC`,
    )
    .bind(ownerId)
    .all<{
      occurred_at: number;
      direction: StoredDirection;
      scope_name: string;
      category_key: string | null;
      description: string | null;
      amount_kopecks: number;
      currency: string;
      source: StoredSource;
      review_status: string;
    }>();

  return result.results.map((row) => ({
    date: new Date(row.occurred_at * 1000),
    direction: row.direction,
    scope: row.scope_name,
    category:
      categoryCatalog.find((item) => item.id === row.category_key)?.name ??
      "Прочее",
    description: row.description ?? "",
    amount: row.amount_kopecks / 100,
    currency: row.currency,
    source: row.source,
    status: row.review_status,
  }));
}
