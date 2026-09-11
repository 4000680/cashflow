import type { BudgetScope, OperationKind } from "./category-catalog";

export type MerchantRule = {
  id: string;
  categoryId: string;
  patterns: RegExp[];
  confidence: "high" | "medium";
};

export type StatementResolution = {
  categoryId?: string;
  kind?: OperationKind;
  needsReview: boolean;
  source: "merchant" | "bank_category" | "transfer" | "unknown";
};

// Только общие шаблоны операций. Персональные правила и названия торговых
// точек из пользовательских выписок хранятся в закрытой базе пользователя.
export const merchantRules: MerchantRule[] = [
  { id: "fuel", categoryId: "fuel", patterns: [/\bазс\b/i, /\bзаправк/i, /\bfuel\b/i], confidence: "high" },
  { id: "toll_roads", categoryId: "parking", patterns: [/платн(?:ая|ые) дорог/i, /\btoll\b/i], confidence: "high" },
  { id: "groceries", categoryId: "groceries", patterns: [/супермаркет/i, /продукт(?:ы|овый)/i, /\bgrocery\b/i], confidence: "medium" },
  { id: "restaurants", categoryId: "restaurants", patterns: [/ресторан/i, /кафе/i, /\bcafe\b/i], confidence: "medium" },
  { id: "food_delivery", categoryId: "delivery_food", patterns: [/доставка еды/i, /\bfood delivery\b/i], confidence: "medium" },
  { id: "subscriptions", categoryId: "subscriptions", patterns: [/подписк/i, /\bsubscription\b/i], confidence: "medium" },
  { id: "powerbank", categoryId: "powerbank_rental", patterns: [/пауэрбанк/i, /\bpowerbank\b/i], confidence: "medium" },
  { id: "travel", categoryId: "travel", patterns: [/турагент/i, /путешеств/i], confidence: "medium" },
  { id: "marketplace", categoryId: "marketplaces", patterns: [/маркетплейс/i, /\bmarketplace\b/i], confidence: "medium" },
  { id: "flowers", categoryId: "gifts", patterns: [/цветочн/i, /\bflowers\b/i], confidence: "medium" },
  { id: "home_improvement", categoryId: "home_repairs", patterns: [/стройматериал/i, /ремонт дома/i], confidence: "medium" },
  { id: "gaming", categoryId: "games", patterns: [/игровой сервис/i, /\bgaming\b/i], confidence: "medium" },
];

const bankCategoryFallbacks: Record<string, string> = {
  "супермаркеты": "groceries",
  "рестораны и кафе": "restaurants",
  "все для дома": "household",
  "автомобиль": "car_other",
};

const reviewBankCategories = new Set([
  "прочие расходы",
  "прочие операции",
  "оплата по qr-коду сбп",
]);

const transferBankCategories = new Set([
  "перевод на карту",
  "перевод с карты",
  "перевод сбп",
]);

export const transferInstitutionPatterns = [
  /\bt-?bank\b/i,
  /альфа-?банк/i,
  /\bvtb\b/i,
  /\bozon bank\b/i,
  /\bmts dengi\b/i,
  /\bsovcombank\b/i,
  /\byandex\b/i,
];

const normalize = (value: string) => value.toLowerCase().replace(/ё/g, "е").trim();

export function resolveMerchantCategory(text: string, scope?: BudgetScope) {
  const normalized = normalize(text);
  const match = merchantRules.find((rule) => rule.patterns.some((pattern) => pattern.test(normalized)));
  if (!match) return undefined;

  // Категория может быть ограничена контуром; это проверит вызывающий каталог.
  return { ...match, scope };
}

export function resolveStatementCategory(bankCategory: string, description: string): StatementResolution {
  const merchant = resolveMerchantCategory(description);
  if (merchant) return { categoryId: merchant.categoryId, kind: "expense", needsReview: false, source: "merchant" };

  const normalizedBankCategory = normalize(bankCategory);
  if (transferBankCategories.has(normalizedBankCategory) || transferInstitutionPatterns.some((pattern) => pattern.test(description))) {
    return { categoryId: "unknown_transfer", kind: "transfer", needsReview: true, source: "transfer" };
  }

  const categoryId = bankCategoryFallbacks[normalizedBankCategory];
  if (categoryId) return { categoryId, kind: "expense", needsReview: false, source: "bank_category" };
  if (reviewBankCategories.has(normalizedBankCategory)) return { needsReview: true, source: "unknown" };

  return { needsReview: true, source: "unknown" };
}
