import {
  identifyCashflowUser,
  unauthorized,
} from "@/lib/cashflow-auth";
import {
  createTransactions,
  deleteTransaction,
  listTransactions,
  updateTransaction,
  type NewStoredTransaction,
  type StoredDirection,
} from "@/lib/cashflow-store";
import type { BudgetScope } from "@/lib/category-catalog";

const scopes = new Set<BudgetScope>(["personal", "family", "work"]);
const directions = new Set<StoredDirection>(["expense", "income", "transfer"]);

function isEntry(value: unknown): value is NewStoredTransaction {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.title === "string" &&
    entry.title.trim().length > 0 &&
    entry.title.length <= 300 &&
    typeof entry.categoryKey === "string" &&
    entry.categoryKey.length <= 100 &&
    scopes.has(entry.scope as BudgetScope) &&
    directions.has(entry.direction as StoredDirection) &&
    typeof entry.amount === "number" &&
    Number.isFinite(entry.amount) &&
    entry.amount > 0 &&
    entry.amount <= 1_000_000_000 &&
    ["web", "telegram", "statement", "email", "api"].includes(
      String(entry.source),
    )
  );
}

export async function GET(request: Request) {
  try {
    const identity = await identifyCashflowUser(request);
    const transactions = await listTransactions(identity);
    return Response.json({ ok: true, transactions });
  } catch (error) {
    return unauthorized(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await identifyCashflowUser(request);
    const body = (await request.json()) as { entries?: unknown };
    if (
      !Array.isArray(body.entries) ||
      !body.entries.length ||
      body.entries.length > 50 ||
      !body.entries.every(isEntry)
    ) {
      return Response.json(
        { ok: false, error: "Некорректные операции" },
        { status: 400 },
      );
    }

    const transactions = await createTransactions(identity, body.entries);
    return Response.json({ ok: true, transactions }, { status: 201 });
  } catch (error) {
    return unauthorized(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await identifyCashflowUser(request);
    const body = (await request.json()) as {
      id?: unknown;
      direction?: unknown;
      categoryKey?: unknown;
    };

    if (
      !Number.isInteger(body.id) ||
      !directions.has(body.direction as StoredDirection) ||
      typeof body.categoryKey !== "string"
    ) {
      return Response.json(
        { ok: false, error: "Некорректное изменение" },
        { status: 400 },
      );
    }

    await updateTransaction(identity, Number(body.id), {
      direction: body.direction as StoredDirection,
      categoryKey: body.categoryKey,
      reviewStatus: "ready",
    });
    return Response.json({ ok: true });
  } catch (error) {
    return unauthorized(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await identifyCashflowUser(request);
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) {
      return Response.json(
        { ok: false, error: "Некорректная операция" },
        { status: 400 },
      );
    }

    await deleteTransaction(identity, id);
    return Response.json({ ok: true });
  } catch (error) {
    return unauthorized(error);
  }
}
