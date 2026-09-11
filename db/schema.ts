import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  telegramId: text("telegram_id").notNull().unique(),
  displayName: text("display_name"),
  timezone: text("timezone").notNull().default("Europe/Moscow"),
  currency: text("currency").notNull().default("RUB"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const scopes = sqliteTable("scopes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: integer("owner_id").notNull().references(() => users.id),
  kind: text("kind", { enum: ["personal", "family", "work"] }).notNull(),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
}, (table) => [uniqueIndex("scopes_owner_kind").on(table.ownerId, table.kind)]);

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: integer("owner_id").notNull().references(() => users.id),
  scopeId: integer("scope_id").notNull().references(() => scopes.id),
  bankCode: text("bank_code"), name: text("name").notNull(), maskedNumber: text("masked_number"),
  currency: text("currency").notNull().default("RUB"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: integer("owner_id").notNull().references(() => users.id),
  scopeId: integer("scope_id").references(() => scopes.id),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["expense", "income", "transfer"] }).notNull(),
  color: text("color"),
});

export const userCategorySettings = sqliteTable("user_category_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: integer("owner_id").notNull().references(() => users.id),
  categoryKey: text("category_key").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  customName: text("custom_name"),
  activatedAt: integer("activated_at", { mode: "timestamp" }),
}, (table) => [uniqueIndex("category_settings_owner_key").on(table.ownerId, table.categoryKey)]);

export const beneficiaries = sqliteTable("beneficiaries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: integer("owner_id").notNull().references(() => users.id),
  kind: text("kind", { enum: ["self", "spouse", "child", "family", "parents", "employee", "client", "other"] }).notNull(),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
}, (table) => [index("beneficiaries_owner").on(table.ownerId)]);

export const userRecognitionRules = sqliteTable("user_recognition_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: integer("owner_id").notNull().references(() => users.id),
  pattern: text("pattern").notNull(),
  matchType: text("match_type", { enum: ["exact", "contains", "prefix"] }).notNull().default("contains"),
  categoryKey: text("category_key").notNull(),
  scope: text("scope", { enum: ["personal", "family", "work", "all"] }).notNull().default("all"),
  beneficiaryId: integer("beneficiary_id").references(() => beneficiaries.id),
  priority: integer("priority").notNull().default(100),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("recognition_rules_owner_pattern_scope").on(table.ownerId, table.pattern, table.scope),
  index("recognition_rules_owner_enabled").on(table.ownerId, table.enabled),
]);

export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: integer("owner_id").notNull().references(() => users.id),
  source: text("source", { enum: ["telegram", "web", "email", "api"] }).notNull(),
  bankCode: text("bank_code"), objectKey: text("object_key"), originalName: text("original_name"),
  checksum: text("checksum").notNull(),
  status: text("status", { enum: ["queued", "parsed", "review", "committed", "failed"] }).notNull().default("queued"),
  error: text("error"), createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [uniqueIndex("import_owner_checksum").on(table.ownerId, table.checksum)]);

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: integer("owner_id").notNull().references(() => users.id),
  scopeId: integer("scope_id").notNull().references(() => scopes.id),
  accountId: integer("account_id").references(() => accounts.id),
  categoryId: integer("category_id").references(() => categories.id),
  categoryKey: text("category_key"),
  beneficiaryId: integer("beneficiary_id").references(() => beneficiaries.id),
  importBatchId: integer("import_batch_id").references(() => importBatches.id),
  direction: text("direction", { enum: ["expense", "income", "transfer"] }).notNull(),
  amountKopecks: integer("amount_kopecks").notNull(), currency: text("currency").notNull().default("RUB"),
  occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
  merchant: text("merchant"), description: text("description"),
  source: text("source", { enum: ["telegram", "web", "statement", "email", "api"] }).notNull(),
  externalId: text("external_id"), fingerprint: text("fingerprint").notNull(), transferGroup: text("transfer_group"),
  reviewStatus: text("review_status", { enum: ["ready", "needs_review", "merged", "ignored"] }).notNull().default("ready"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [index("transactions_owner_date").on(table.ownerId, table.occurredAt), index("transactions_fingerprint").on(table.ownerId, table.fingerprint)]);

export const reminders = sqliteTable("reminders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: integer("owner_id").notNull().references(() => users.id),
  kind: text("kind", { enum: ["daily_check", "weekly_review", "import_failure"] }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  localTime: text("local_time").notNull().default("22:30"),
  timezone: text("timezone").notNull().default("Europe/Moscow"),
  weekdays: text("weekdays").notNull().default("1,2,3,4,5,6,7"),
}, (table) => [uniqueIndex("reminders_owner_kind").on(table.ownerId, table.kind)]);

export const userBankSettings = sqliteTable("user_bank_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: integer("owner_id").notNull().references(() => users.id),
  bankCode: text("bank_code").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  preferredFormat: text("preferred_format"),
}, (table) => [uniqueIndex("bank_settings_owner_bank").on(table.ownerId, table.bankCode)]);
