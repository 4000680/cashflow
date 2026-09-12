"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowUpRight, Bot, BriefcaseBusiness, Car, Check, ChevronDown,
  ChevronLeft, ChevronRight, CircleDollarSign, Download, FileUp, Home, Landmark, Mic, Moon,
  Plus, ReceiptText, Settings2, Sun, Tags, Upload, UserRound, Users,
  WalletCards, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { categoryCatalog, resolveCategory, type BudgetScope } from "@/lib/category-catalog";

type Direction = "expense" | "income" | "transfer";
type ViewScope = "all" | BudgetScope | "car";
type EntryScope = Exclude<ViewScope, "all">;
type AppTab = "overview" | "operations" | "import" | "settings";
type AddMode = "text" | "voice" | "file";
type ReviewStatus = "ready" | "review" | "duplicate";
type Transaction = {
  id: number; title: string; category: string; categoryId: string; group: string;
  scope: BudgetScope; amount: number; direction: Direction; source: string;
  status?: ReviewStatus;
};

const DEVICE_STORAGE_KEY = "cashflow.device-id.v1";

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
      ready?: () => void;
      expand?: () => void;
    };
  };
};

async function waitForTelegramWebApp() {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    const webApp = (window as TelegramWindow).Telegram?.WebApp;
    if (webApp?.initData) return webApp;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  return (window as TelegramWindow).Telegram?.WebApp;
}

function cashflowHeaders() {
  const telegram = (window as TelegramWindow).Telegram?.WebApp;
  if (telegram?.initData) {
    return { authorization: `tma ${telegram.initData}` };
  }

  let deviceId = window.localStorage.getItem(DEVICE_STORAGE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
  }
  return { "x-cashflow-device-id": deviceId };
}

async function cashflowFetch(path: string, init: RequestInit = {}) {
  return fetch(path, {
    ...init,
    headers: {
      ...cashflowHeaders(),
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
}

const scopeOptions: { id: ViewScope; label: string; icon: typeof Home }[] = [
  { id: "all", label: "Все", icon: WalletCards },
  { id: "work", label: "Работа", icon: BriefcaseBusiness },
  { id: "family", label: "Семья", icon: Users },
  { id: "personal", label: "Личное", icon: UserRound },
  { id: "car", label: "Автомобиль", icon: Car },
];
const colors = ["#7057ff", "#1fc8a0", "#ffb347", "#ff6d8d", "#47a7ff", "#a8d641"];

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value) + " ₽";
}
function parseEntries(text: string, entryScope: EntryScope, direction: Direction) {
  return text.split(/[,;\n]+/).map((part) => part.trim()).map((part) => {
    const match = part.match(/-?\d(?:[\d\s]*\d)?(?:[.,]\d{1,2})?/);
    if (!match) return null;
    const amount = Math.abs(Number(match[0].replace(/\s/g, "").replace(",", ".")));
    const title = `${part.slice(0, match.index ?? 0)} ${part.slice((match.index ?? 0) + match[0].length)}`
      .replace(/\b(?:руб(?:лей|ля|ль)?|р)\.?\b|₽/gi, " ").replace(/\s+/g, " ").trim() || "Операция";
    const scope: BudgetScope = entryScope === "car" ? "personal" : entryScope;
    const automaticCategory = resolveCategory(title, scope);
    const resolved = entryScope === "car" && automaticCategory?.group !== "Автомобиль"
      ? categoryCatalog.find((item) => item.id === "car_other")
      : automaticCategory;
    const fallbackId = direction === "transfer" ? "unknown_transfer" : scope === "work"
      ? direction === "income" ? "other_work_income" : "other_work_expense"
      : direction === "income" ? "other_income" : "other_expense";
    const category = resolved?.kind === direction ? resolved : categoryCatalog.find((item) => item.id === fallbackId)!;
    return { amount, title, scope, direction, category };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function Donut({ items, total }: { items: { value: number; color: string }[]; total: number }) {
  let cursor = 0;
  const stops = items.map((item) => {
    const start = cursor;
    cursor += total ? (item.value / total) * 100 : 0;
    return `${item.color} ${start}% ${cursor}%`;
  });
  return <div className="donut" style={{ background: total ? `conic-gradient(${stops.join(",")})` : "var(--donut-empty)" }}><div><span>Расходы</span><strong>{money(total)}</strong></div></div>;
}

export default function HomePage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [scope, setScope] = useState<ViewScope>("all");
  const [tab, setTab] = useState<AppTab>("overview");
  const [period, setPeriod] = useState("Сентябрь");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeCategoryIds, setActiveCategoryIds] = useState<string[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("text");
  const [entry, setEntry] = useState("");
  const [entryDirection, setEntryDirection] = useState<Direction>("expense");
  const [entryScope, setEntryScope] = useState<EntryScope>("personal");
  const parsed = useMemo(() => parseEntries(entry, entryScope, entryDirection), [entry, entryDirection, entryScope]);

  useEffect(() => {
    let active = true;

    async function loadTransactions() {
      try {
        const telegram = await waitForTelegramWebApp();
        telegram?.ready?.();
        telegram?.expand?.();
        const response = await cashflowFetch("/api/transactions");
        const data = (await response.json()) as {
          ok?: boolean;
          transactions?: Transaction[];
          error?: string;
        };
        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Не удалось загрузить операции");
        }
        if (!active) return;
        const loaded = data.transactions ?? [];
        setTransactions(loaded);
        setActiveCategoryIds([...new Set(loaded.map((item) => item.categoryId))]);
        setSyncError("");
      } catch {
        if (active) {
          setSyncError("Хранилище пока не подключено. Добавленные данные не будут сохранены.");
        }
      } finally {
        if (active) setStorageReady(true);
      }
    }

    void loadTransactions();
    return () => {
      active = false;
    };
  }, []);

  const scopedTransactions = useMemo(() => transactions.filter((item) => {
    if (scope === "all") return true;
    if (scope === "car") return item.group === "Автомобиль";
    return item.scope === scope;
  }), [scope, transactions]);
  const totals = useMemo(() => {
    const income = scopedTransactions.filter((item) => item.direction === "income" && item.status !== "review").reduce((sum, item) => sum + item.amount, 0);
    const expense = scopedTransactions.filter((item) => item.direction === "expense" && item.status !== "duplicate").reduce((sum, item) => sum + item.amount, 0);
    return { income, expense, balance: income - expense };
  }, [scopedTransactions]);
  const budgetSummary = useMemo(() => {
    const ready = transactions.filter((item) => item.status !== "duplicate" && item.status !== "review");
    const workIncome = ready.filter((item) => item.scope === "work" && item.direction === "income").reduce((sum, item) => sum + item.amount, 0);
    const workExpense = ready.filter((item) => item.scope === "work" && item.direction === "expense").reduce((sum, item) => sum + item.amount, 0);
    const otherIncome = ready.filter((item) => item.scope !== "work" && item.direction === "income").reduce((sum, item) => sum + item.amount, 0);
    const personalExpense = ready.filter((item) => item.scope !== "work" && item.direction === "expense").reduce((sum, item) => sum + item.amount, 0);
    const workProfit = workIncome - workExpense;
    return {
      workIncome,
      workExpense,
      workProfit,
      availableForPersonal: workProfit + otherIncome,
      remaining: workProfit + otherIncome - personalExpense,
    };
  }, [transactions]);
  const breakdown = useMemo(() => {
    const map = new Map<string, { value: number; count: number }>();
    scopedTransactions.filter((item) => item.direction === "expense" && item.status !== "duplicate").forEach((item) => {
      const key = scope === "work" || scope === "car" ? item.category : item.group;
      const current = map.get(key) ?? { value: 0, count: 0 };
      map.set(key, { value: current.value + item.amount, count: current.count + 1 });
    });
    return [...map.entries()].map(([name, values], index) => ({ name, ...values, color: colors[index % colors.length] })).sort((a, b) => b.value - a.value);
  }, [scope, scopedTransactions]);
  const zeroCategories = useMemo(() => activeCategoryIds.map((id) => categoryCatalog.find((item) => item.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item)).filter((item) => {
    if (scope === "work" && item.scope !== "work") return false;
    if (scope === "car" && item.group !== "Автомобиль") return false;
    if (scope === "family" && item.scope !== "family" && item.scope !== "all") return false;
    if (scope === "personal" && item.scope !== "personal" && item.scope !== "all") return false;
    return !scopedTransactions.some((tx) => tx.categoryId === item.id);
  }).slice(0, 3), [activeCategoryIds, scope, scopedTransactions]);
  const reviewItems = transactions.filter((item) => item.status === "review" || item.status === "duplicate");

  const openAdd = (direction: Direction = "expense") => {
    setEntry("");
    setEntryDirection(direction);
    setEntryScope(scope === "all" ? direction === "income" ? "work" : "personal" : scope);
    setAddMode("text");
    setAddOpen(true);
  };

  const chooseEntryDirection = (direction: Direction) => {
    setEntryDirection(direction);
    if (direction === "income" && scope === "all") setEntryScope("work");
  };

  async function addEntries() {
    if (!parsed.length) return;
    try {
      const response = await cashflowFetch("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          entries: parsed.map((item) => ({
            title: item.title,
            categoryKey: item.category.id,
            scope: item.scope,
            amount: item.amount,
            direction: item.direction,
            source: "web",
            reviewStatus: item.direction === "transfer" ? "needs_review" : "ready",
          })),
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        transactions?: Transaction[];
        error?: string;
      };
      if (!response.ok || !data.ok) throw new Error(data.error || "Ошибка сохранения");
      const created = data.transactions ?? [];
      setTransactions((current) => [...created, ...current]);
      setActiveCategoryIds((current) => [
        ...new Set([...current, ...created.map((item) => item.categoryId)]),
      ]);
      setSyncError("");
      setEntry("");
      setAddOpen(false);
    } catch {
      setSyncError("Не удалось сохранить операцию. Текст оставлен в форме — попробуйте ещё раз.");
    }
  }

  async function confirmReview(id: number, direction: Direction, category = "Другой рабочий доход") {
    const categoryId = direction === "income" ? "other_work_income" : direction === "expense" ? "other_work_expense" : "own_transfer";
    try {
      const response = await cashflowFetch("/api/transactions", {
        method: "PATCH",
        body: JSON.stringify({ id, direction, categoryKey: categoryId }),
      });
      if (!response.ok) throw new Error("Ошибка изменения");
      setTransactions((current) => current.map((item) => item.id === id ? {
        ...item, direction, category, categoryId, status: "ready",
      } : item));
      setSyncError("");
    } catch {
      setSyncError("Не удалось изменить операцию. Попробуйте ещё раз.");
    }
  }

  async function removeTransaction(id: number) {
    try {
      const response = await cashflowFetch(`/api/transactions?id=${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Ошибка удаления");
      setTransactions((current) => current.filter((item) => item.id !== id));
      setSyncError("");
    } catch {
      setSyncError("Не удалось удалить операцию. Попробуйте ещё раз.");
    }
  }

  async function exportForExcel() {
    setExporting(true);
    try {
      const response = await cashflowFetch("/api/transactions/export");
      if (!response.ok) throw new Error("Ошибка выгрузки");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cashflow-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSyncError("");
    } catch {
      setSyncError("Не удалось подготовить таблицу Excel. Попробуйте ещё раз.");
    } finally {
      setExporting(false);
    }
  }

  const heroLabel = scope === "work" ? "Чистая прибыль" : scope === "all" ? "Осталось за месяц" : "Общий остаток";
  const heroAmount = scope === "work" ? budgetSummary.workProfit : budgetSummary.remaining;

  return (
    <main className="budget-app" data-theme={theme}>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand"><span><CircleDollarSign /></span><div><strong>Баланс</strong><small>Ваши деньги под контролем</small></div></div>
          <button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Переключить тему">{theme === "light" ? <Moon /> : <Sun />}</button>
        </header>
        <nav className="scope-strip" aria-label="Раздел бюджета">
          {scopeOptions.map((item) => <button key={item.id} className={scope === item.id ? "active" : ""} onClick={() => setScope(item.id)}><item.icon />{item.label}</button>)}
        </nav>
        {syncError && <div className="sync-warning" role="status">{syncError}</div>}

        {tab === "overview" && <>
          <section className="glass hero-card">
            <div className="period-row"><button className="icon-button small"><ChevronLeft /></button><button className="period-picker">{period}<ChevronDown /></button><button className="icon-button small" onClick={() => setPeriod(period === "Сентябрь" ? "Август" : "Сентябрь")}><ChevronRight /></button></div>
            <div className="hero-label">{heroLabel}</div>
            <div className="hero-amount">{money(heroAmount)}</div>
            {scope === "work" ? <div className="hero-metrics"><div><span className="income-icon"><ArrowDownRight /></span><p>Доходы</p><strong>{money(budgetSummary.workIncome)}</strong></div><div><span className="expense-icon"><ArrowUpRight /></span><p>Расходы</p><strong>{money(budgetSummary.workExpense)}</strong></div><div><span className="turnover-icon"><BriefcaseBusiness /></span><p>В личный бюджет</p><strong>{money(Math.max(0, budgetSummary.workProfit))}</strong></div></div> : scope === "all" ? <div className="hero-metrics"><div><span className="income-icon"><ArrowDownRight /></span><p>Все доходы</p><strong>{money(totals.income)}</strong></div><div><span className="expense-icon"><ArrowUpRight /></span><p>Все расходы</p><strong>{money(totals.expense)}</strong></div></div> : <div className="hero-metrics"><div><span className="income-icon"><ArrowDownRight /></span><p>Из работы</p><strong>{money(Math.max(0, budgetSummary.workProfit))}</strong></div><div><span className="expense-icon"><ArrowUpRight /></span><p>Расходы раздела</p><strong>{money(totals.expense)}</strong></div><div><span className="turnover-icon"><BriefcaseBusiness /></span><p>Доходы раздела</p><strong>{money(totals.income)}</strong></div></div>}
          </section>
          <section className="glass analytics-card">
            <div className="section-head"><div><small>{scopeOptions.find((item) => item.id === scope)?.label}</small><h2>Куда уходят деньги</h2></div><button className="text-button" onClick={() => setTab("operations")}>Все операции</button></div>
            <div className="analytics-grid"><Donut items={breakdown} total={totals.expense} /><div className="legend">{breakdown.length ? breakdown.map((item) => <div key={item.name}><i style={{ background: item.color }} /><span>{item.name}<small>{item.count} оп.</small></span><strong>{money(item.value)}</strong></div>) : <p className="empty-copy">В этом разделе пока нет расходов</p>}</div></div>
          </section>
          {zeroCategories.length > 0 && <section className="glass zero-card"><div className="section-head"><div><small>Без операций в этом месяце</small><h2>Активные категории</h2></div></div>{zeroCategories.map((item) => <div className="zero-row" key={item.id}><span className="soft-icon"><Tags /></span><div><strong>{item.name}</strong><small>{item.group} · 0 ₽</small></div><button onClick={() => setActiveCategoryIds((current) => current.filter((id) => id !== item.id))} aria-label={`Скрыть ${item.name}`}><X /></button></div>)}</section>}
          <section className="glass activity-card"><div className="section-head"><div><small>Недавнее</small><h2>Операции</h2></div>{reviewItems.length > 0 && <span className="review-count">{reviewItems.length} на проверке</span>}</div>{scopedTransactions.length ? scopedTransactions.slice(0, 5).map((item) => <TransactionRow key={item.id} item={item} />) : <div className="empty-state"><strong>Пока нет операций</strong><span>Нажмите «+», чтобы добавить первый доход или расход.</span></div>}</section>
        </>}

        {tab === "operations" && <section className="glass page-card"><div className="section-head"><div><small>История</small><h2>Все операции</h2></div><button className="filter-button" onClick={() => void exportForExcel()} disabled={exporting}><Download /> {exporting ? "Готовим…" : "Excel"}</button></div>{scopedTransactions.length ? scopedTransactions.map((item) => <TransactionRow key={item.id} item={item} />) : <div className="empty-state"><strong>История пока пустая</strong><span>Добавленные операции появятся здесь.</span></div>}</section>}

        {tab === "import" && <div className="page-stack">
          <section className="glass upload-card"><span className="large-icon"><Upload /></span><h2>Загрузить выписку</h2><p>Отправьте PDF, CSV или XLSX. Банк определится автоматически.</p><Button className="primary-button" onClick={() => { setAddMode("file"); setAddOpen(true); }}><FileUp /> Выбрать файл</Button><div className="bank-pills"><span>Сбер</span><span>Альфа-Банк</span><span>Т-Банк</span></div></section>
          <section className="glass review-card"><div className="section-head"><div><small>Сверка перед добавлением</small><h2>Нужно подтвердить</h2></div>{reviewItems.length > 0 && <span className="review-count">{reviewItems.length}</span>}</div>{reviewItems.length ? reviewItems.map((item) => <div className="review-item" key={item.id}><div className="review-copy"><span className={item.status === "duplicate" ? "warn" : "question"}>{item.status === "duplicate" ? <ReceiptText /> : <Landmark />}</span><div><strong>{item.title}</strong><small>{item.status === "duplicate" ? "Похоже на ручную запись" : "Перевод не считается доходом автоматически"}</small></div><b>{money(item.amount)}</b></div>{item.status === "duplicate" ? <div className="review-actions"><button onClick={() => void removeTransaction(item.id)}>Объединить</button><button onClick={() => confirmReview(item.id, "expense", item.category)}>Оставить обе</button></div> : <div className="review-actions wrap"><button onClick={() => confirmReview(item.id, "income")}>Доход от работы</button><button onClick={() => confirmReview(item.id, "expense", "Рабочий расход")}>Расход</button><button onClick={() => confirmReview(item.id, "transfer", "Между своими счетами")}>Свои счета</button></div>}</div>) : <div className="empty-state"><strong>Всё проверено</strong><span>Неясные переводы и возможные дубли появятся здесь.</span></div>}</section>
        </div>}

        {tab === "settings" && <div className="page-stack">
          <section className="glass page-card"><div className="section-head"><div><small>Telegram</small><h2>Как будет работать бот</h2></div><Bot /></div><div className="telegram-chat"><div className="bot-bubble">Отправьте боту доход или расход текстом. После подтверждения операция появится здесь в выбранном разделе.</div><div className="bot-keyboard"><button>＋ Расход</button><button>＋ Доход</button><button>📄 Выписка</button><button>📊 Открыть приложение</button></div></div></section>
          <section className="glass page-card"><div className="section-head"><div><small>Автоматизация</small><h2>Настройки контроля</h2></div><Settings2 /></div><div className="settings-list">{[["Голосовые сообщения","Распознавать список операций и просить подтверждение",Mic],["Проверка переводов","Не считать доходом или расходом без подтверждения",Landmark],["Поиск дублей","Сверять ручные записи с банковской выпиской",ReceiptText]].map(([title,subtitle,Icon]) => { const RowIcon = Icon as typeof Mic; return <div key={title as string}><span><RowIcon /></span><p><strong>{title as string}</strong><small>{subtitle as string}</small></p><button className="toggle on"><i /></button></div>; })}</div></section>
        </div>}

        <button className="fab" onClick={() => openAdd()} aria-label="Добавить операцию"><Plus /></button>
        <nav className="bottom-nav"><button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}><Home /><span>Главная</span></button><button className={tab === "operations" ? "active" : ""} onClick={() => setTab("operations")}><ReceiptText /><span>Операции</span></button><button className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}><Upload /><span>Импорт</span>{reviewItems.length > 0 && <i>{reviewItems.length}</i>}</button><button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Settings2 /><span>Настройки</span></button></nav>

        {addOpen && <div className="sheet-layer"><button className="sheet-backdrop" aria-label="Закрыть" onClick={() => setAddOpen(false)} /><section className="add-sheet"><div className="sheet-handle" /><div className="section-head"><div><small>Новая запись</small><h2>Добавить операции</h2></div><button className="icon-button" onClick={() => setAddOpen(false)}><X /></button></div><div className="mode-tabs"><button className={addMode === "text" ? "active" : ""} onClick={() => setAddMode("text")}><ReceiptText />Текст</button><button className={addMode === "voice" ? "active" : ""} onClick={() => setAddMode("voice")}><Mic />Голос</button><button className={addMode === "file" ? "active" : ""} onClick={() => setAddMode("file")}><FileUp />Выписка</button></div>
          {addMode === "text" && <div className="entry-controls"><div><small>Тип операции</small><div className="choice-pills"><button className={entryDirection === "expense" ? "active" : ""} onClick={() => chooseEntryDirection("expense")}>Расход</button><button className={entryDirection === "income" ? "active" : ""} onClick={() => chooseEntryDirection("income")}>Доход</button><button className={entryDirection === "transfer" ? "active" : ""} onClick={() => chooseEntryDirection("transfer")}>Перевод</button></div></div><div><small>Раздел</small><div className="choice-pills scopes"><button className={entryScope === "work" ? "active" : ""} onClick={() => setEntryScope("work")}>Работа</button><button className={entryScope === "family" ? "active" : ""} onClick={() => setEntryScope("family")}>Семья</button><button className={entryScope === "personal" ? "active" : ""} onClick={() => setEntryScope("personal")}>Личное</button><button className={entryScope === "car" ? "active" : ""} onClick={() => setEntryScope("car")}>Авто</button></div>{entryDirection === "income" && <p className="entry-hint">Обычный доход относится к работе. Для подарка или другого личного поступления выберите «Личное».</p>}</div></div>}
          {addMode === "text" && <><textarea value={entry} onChange={(event) => setEntry(event.target.value)} placeholder="Например: 350 кофе, 2500 заправка" /><ParsedList items={parsed} /></>}
          {addMode === "voice" && <div className="voice-panel"><span className="large-icon"><Mic /></span><h3>Голосовой ввод подключается</h3><p>Он заработает после подключения Telegram-бота к общей базе.</p></div>}
          {addMode === "file" && <div className="file-drop"><FileUp /><strong>Импорт выписки подключается</strong><span>Файлы станут доступны после подключения защищённого хранилища.</span></div>}
          {addMode !== "file" && <Button className="primary-button full" disabled={!parsed.length} onClick={addEntries}>Добавить {parsed.length || ""} {parsed.length === 1 ? "операцию" : "операции"}</Button>}
        </section></div>}
      </div>
    </main>
  );
}

function TransactionRow({ item }: { item: Transaction }) {
  return <div className="transaction-row"><span className={`transaction-symbol ${item.direction}`}>{item.direction === "income" ? <ArrowDownRight /> : item.direction === "transfer" ? <Landmark /> : <ArrowUpRight />}</span><div><strong>{item.title}</strong><small>{item.category} · {item.source}</small></div>{item.status && item.status !== "ready" && <em className={item.status}>{item.status === "duplicate" ? "Возможный дубль" : "Уточнить"}</em>}<b className={item.direction}>{item.direction === "income" ? "+" : item.direction === "expense" ? "−" : ""}{money(item.amount)}</b></div>;
}
function ParsedList({ items }: { items: ReturnType<typeof parseEntries> }) {
  return <div className="parsed-list">{items.map((item, index) => <div key={`${item.title}-${index}`}><span><Check /></span><p><strong>{item.title}</strong><small>{item.scope === "work" ? "Работа" : item.scope === "family" ? "Семья" : "Личное"} → {item.category.name}</small></p><b>{money(item.amount)}</b></div>)}</div>;
}
