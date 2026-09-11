"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowUpRight, Bot, BriefcaseBusiness, Car, Check, ChevronDown,
  ChevronLeft, ChevronRight, CircleDollarSign, FileUp, Home, Landmark, Mic, Moon,
  Plus, ReceiptText, Settings2, Sparkles, Sun, Tags, Upload, UserRound, Users,
  WalletCards, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { categoryCatalog, resolveCategory, type BudgetScope } from "@/lib/category-catalog";

type Direction = "expense" | "income" | "transfer";
type ViewScope = "all" | BudgetScope | "car";
type AppTab = "overview" | "operations" | "import" | "settings";
type AddMode = "text" | "voice" | "file";
type ReviewStatus = "ready" | "review" | "duplicate";
type Transaction = {
  id: number; title: string; category: string; categoryId: string; group: string;
  scope: BudgetScope; amount: number; direction: Direction; source: string;
  status?: ReviewStatus;
};

const initialTransactions: Transaction[] = [
  { id: 1, title: "Оплата проекта", category: "Продажа товаров и услуг", categoryId: "sales_work", group: "Доходы бизнеса", scope: "work", amount: 85000, direction: "income", source: "Telegram" },
  { id: 2, title: "Подрядчик", category: "Подрядчики", categoryId: "contractors_work", group: "Команда", scope: "work", amount: 18000, direction: "expense", source: "Telegram" },
  { id: 3, title: "Реклама", category: "Реклама", categoryId: "advertising_work", group: "Продвижение", scope: "work", amount: 9500, direction: "expense", source: "Вручную" },
  { id: 4, title: "Супермаркет", category: "Продукты", categoryId: "groceries", group: "Еда", scope: "family", amount: 3180, direction: "expense", source: "Сбер" },
  { id: 5, title: "АЗС", category: "Топливо и зарядка", categoryId: "fuel", group: "Автомобиль", scope: "personal", amount: 2500, direction: "expense", source: "Сбер" },
  { id: 6, title: "Кофе", category: "Кофе и перекусы", categoryId: "coffee_snacks", group: "Еда", scope: "personal", amount: 350, direction: "expense", source: "Telegram" },
  { id: 7, title: "Перевод из другого банка", category: "Перевод — нужно уточнить", categoryId: "unknown_transfer", group: "Переводы", scope: "work", amount: 42000, direction: "transfer", source: "Сбер", status: "review" },
  { id: 8, title: "Кафе", category: "Кафе и рестораны", categoryId: "restaurants", group: "Еда", scope: "family", amount: 1640, direction: "expense", source: "Сбер", status: "duplicate" },
];

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
function detectScope(text: string): BudgetScope {
  if (/клиент|работ|реклам|подряд|сотрудник|выручк|проект|бизнес|бухгалтер/i.test(text)) return "work";
  if (/семь|жен|муж|реб[её]н|доч|сын|дом|школ/i.test(text)) return "family";
  return "personal";
}
function detectDirection(text: string): Direction {
  if (/перев[её]л|перевод|между своими|наличн|долг/i.test(text)) return "transfer";
  return /заработ|получил|доход|выручк|оплата от|преми|зарплата пришла/i.test(text) ? "income" : "expense";
}
function parseEntries(text: string) {
  return text.split(/[,;\n]+/).map((part) => part.trim()).map((part) => {
    const match = part.match(/-?\d(?:[\d\s]*\d)?(?:[.,]\d{1,2})?/);
    if (!match) return null;
    const amount = Math.abs(Number(match[0].replace(/\s/g, "").replace(",", ".")));
    const title = `${part.slice(0, match.index ?? 0)} ${part.slice((match.index ?? 0) + match[0].length)}`
      .replace(/\b(?:руб(?:лей|ля|ль)?|р)\.?\b|₽/gi, " ").replace(/\s+/g, " ").trim() || "Операция";
    const scope = detectScope(title);
    const direction = detectDirection(title);
    const resolved = resolveCategory(title, scope);
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
  const [transactions, setTransactions] = useState(initialTransactions);
  const [activeCategoryIds, setActiveCategoryIds] = useState(["groceries", "restaurants", "fuel", "subscriptions", "sales_work", "contractors_work", "advertising_work", "taxes_work", "accounting_work"]);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("text");
  const [entry, setEntry] = useState("1500 кофе, 300 булочка, 2500 заправка");
  const [voiceReady, setVoiceReady] = useState(false);
  const parsed = useMemo(() => parseEntries(entry), [entry]);

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

  function addEntries() {
    if (!parsed.length) return;
    const created = parsed.map((item, index): Transaction => ({
      id: Date.now() + index, title: item.title, category: item.category.name, categoryId: item.category.id,
      group: item.category.group, scope: item.scope, amount: item.amount, direction: item.direction,
      source: addMode === "voice" ? "Голос" : "Вручную",
      status: item.direction === "transfer" ? "review" : "ready",
    }));
    setTransactions((current) => [...created, ...current]);
    setActiveCategoryIds((current) => [...new Set([...current, ...created.map((item) => item.categoryId)])]);
    setEntry(""); setVoiceReady(false); setAddOpen(false);
  }
  function confirmReview(id: number, direction: Direction, category = "Другой рабочий доход") {
    setTransactions((current) => current.map((item) => item.id === id ? {
      ...item, direction, category,
      categoryId: direction === "income" ? "other_work_income" : direction === "expense" ? "other_work_expense" : "own_transfer",
      status: "ready",
    } : item));
  }

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

        {tab === "overview" && <>
          <section className="glass hero-card">
            <div className="period-row"><button className="icon-button small"><ChevronLeft /></button><button className="period-picker">{period}<ChevronDown /></button><button className="icon-button small" onClick={() => setPeriod(period === "Сентябрь" ? "Август" : "Сентябрь")}><ChevronRight /></button></div>
            <div className="hero-label">{scope === "work" ? "Чистая прибыль" : "Баланс за месяц"}</div>
            <div className="hero-amount">{money(totals.balance)}</div>
            <div className="hero-metrics"><div><span className="income-icon"><ArrowDownRight /></span><p>Доходы</p><strong>{money(totals.income)}</strong></div><div><span className="expense-icon"><ArrowUpRight /></span><p>Расходы</p><strong>{money(totals.expense)}</strong></div>{scope === "work" && <div><span className="turnover-icon"><BriefcaseBusiness /></span><p>Оборот</p><strong>{money(totals.income)}</strong></div>}</div>
          </section>
          <section className="glass analytics-card">
            <div className="section-head"><div><small>{scopeOptions.find((item) => item.id === scope)?.label}</small><h2>Куда уходят деньги</h2></div><button className="text-button" onClick={() => setTab("operations")}>Все операции</button></div>
            <div className="analytics-grid"><Donut items={breakdown} total={totals.expense} /><div className="legend">{breakdown.length ? breakdown.map((item) => <div key={item.name}><i style={{ background: item.color }} /><span>{item.name}<small>{item.count} оп.</small></span><strong>{money(item.value)}</strong></div>) : <p className="empty-copy">В этом разделе пока нет расходов</p>}</div></div>
          </section>
          {zeroCategories.length > 0 && <section className="glass zero-card"><div className="section-head"><div><small>Без операций в этом месяце</small><h2>Активные категории</h2></div></div>{zeroCategories.map((item) => <div className="zero-row" key={item.id}><span className="soft-icon"><Tags /></span><div><strong>{item.name}</strong><small>{item.group} · 0 ₽</small></div><button onClick={() => setActiveCategoryIds((current) => current.filter((id) => id !== item.id))} aria-label={`Скрыть ${item.name}`}><X /></button></div>)}</section>}
          <section className="glass activity-card"><div className="section-head"><div><small>Недавнее</small><h2>Операции</h2></div><span className="review-count">{reviewItems.length} на проверке</span></div>{scopedTransactions.slice(0, 5).map((item) => <TransactionRow key={item.id} item={item} />)}</section>
        </>}

        {tab === "operations" && <section className="glass page-card"><div className="section-head"><div><small>История</small><h2>Все операции</h2></div><button className="filter-button"><Settings2 /> Фильтры</button></div>{scopedTransactions.map((item) => <TransactionRow key={item.id} item={item} />)}</section>}

        {tab === "import" && <div className="page-stack">
          <section className="glass upload-card"><span className="large-icon"><Upload /></span><h2>Загрузить выписку</h2><p>Отправьте PDF, CSV или XLSX. Банк определится автоматически.</p><Button className="primary-button" onClick={() => { setAddMode("file"); setAddOpen(true); }}><FileUp /> Выбрать файл</Button><div className="bank-pills"><span>Сбер</span><span>Альфа-Банк</span><span>Т-Банк</span></div></section>
          <section className="glass review-card"><div className="section-head"><div><small>Сверка перед добавлением</small><h2>Нужно подтвердить</h2></div><span className="review-count">{reviewItems.length}</span></div>{reviewItems.map((item) => <div className="review-item" key={item.id}><div className="review-copy"><span className={item.status === "duplicate" ? "warn" : "question"}>{item.status === "duplicate" ? <ReceiptText /> : <Landmark />}</span><div><strong>{item.title}</strong><small>{item.status === "duplicate" ? "Похоже на ручную запись" : "Перевод не считается доходом автоматически"}</small></div><b>{money(item.amount)}</b></div>{item.status === "duplicate" ? <div className="review-actions"><button onClick={() => setTransactions((current) => current.filter((tx) => tx.id !== item.id))}>Объединить</button><button onClick={() => confirmReview(item.id, "expense", item.category)}>Оставить обе</button></div> : <div className="review-actions wrap"><button onClick={() => confirmReview(item.id, "income")}>Доход от работы</button><button onClick={() => confirmReview(item.id, "expense", "Рабочий расход")}>Расход</button><button onClick={() => confirmReview(item.id, "transfer", "Между своими счетами")}>Свои счета</button></div>}</div>)}</section>
        </div>}

        {tab === "settings" && <div className="page-stack">
          <section className="glass page-card"><div className="section-head"><div><small>Telegram</small><h2>Как работает бот</h2></div><Bot /></div><div className="telegram-chat"><div className="bot-bubble">Запишите расход текстом или голосом. Можно отправить сразу несколько операций.</div><div className="voice-bubble"><Mic /> Голосовое сообщение <span>0:12</span></div><div className="bot-bubble wide">Я распознал:<div className="chat-result"><span>Кофе</span><b>350 ₽</b><small>Еда → Кофе и перекусы</small><button><Check /> Подтвердить</button></div><div className="chat-result"><span>Реклама</span><b>9 500 ₽</b><small>Работа → Продвижение</small><button><Check /> Подтвердить</button></div></div><div className="bot-keyboard"><button>＋ Расход</button><button>＋ Доход</button><button>📄 Выписка</button><button>📊 Открыть приложение</button></div></div></section>
          <section className="glass page-card"><div className="section-head"><div><small>Автоматизация</small><h2>Настройки контроля</h2></div><Settings2 /></div><div className="settings-list">{[["Голосовые сообщения","Распознавать список операций и просить подтверждение",Mic],["Проверка переводов","Не считать доходом или расходом без подтверждения",Landmark],["Поиск дублей","Сверять ручные записи с банковской выпиской",ReceiptText]].map(([title,subtitle,Icon]) => { const RowIcon = Icon as typeof Mic; return <div key={title as string}><span><RowIcon /></span><p><strong>{title as string}</strong><small>{subtitle as string}</small></p><button className="toggle on"><i /></button></div>; })}</div></section>
        </div>}

        <button className="fab" onClick={() => { setAddMode("text"); setAddOpen(true); }} aria-label="Добавить операцию"><Plus /></button>
        <nav className="bottom-nav"><button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}><Home /><span>Главная</span></button><button className={tab === "operations" ? "active" : ""} onClick={() => setTab("operations")}><ReceiptText /><span>Операции</span></button><button className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}><Upload /><span>Импорт</span>{reviewItems.length > 0 && <i>{reviewItems.length}</i>}</button><button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Settings2 /><span>Настройки</span></button></nav>

        {addOpen && <div className="sheet-layer"><button className="sheet-backdrop" aria-label="Закрыть" onClick={() => setAddOpen(false)} /><section className="add-sheet"><div className="sheet-handle" /><div className="section-head"><div><small>Новая запись</small><h2>Добавить операции</h2></div><button className="icon-button" onClick={() => setAddOpen(false)}><X /></button></div><div className="mode-tabs"><button className={addMode === "text" ? "active" : ""} onClick={() => setAddMode("text")}><ReceiptText />Текст</button><button className={addMode === "voice" ? "active" : ""} onClick={() => setAddMode("voice")}><Mic />Голос</button><button className={addMode === "file" ? "active" : ""} onClick={() => setAddMode("file")}><FileUp />Выписка</button></div>
          {addMode === "text" && <><textarea value={entry} onChange={(event) => setEntry(event.target.value)} placeholder="Например: 350 кофе, 2500 заправка" /><ParsedList items={parsed} /></>}
          {addMode === "voice" && <div className="voice-panel">{!voiceReady ? <><button className="record-button" onClick={() => { setEntry("350 кофе, 9500 реклама для работы, 2500 заправка"); setVoiceReady(true); }}><Mic /></button><h3>Нажмите и продиктуйте расходы</h3><p>В Telegram достаточно отправить обычное голосовое сообщение боту.</p></> : <><div className="recognized"><Sparkles /> Распознано голосовое сообщение</div><ParsedList items={parsed} /></>}</div>}
          {addMode === "file" && <label className="file-drop"><input type="file" accept=".pdf,.csv,.xlsx,.xls,.ofx" /><FileUp /><strong>Выберите выписку</strong><span>PDF, CSV, XLSX или OFX</span></label>}
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
