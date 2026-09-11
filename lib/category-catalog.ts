export type BudgetScope = "personal" | "family" | "work";
export type OperationKind = "expense" | "income" | "transfer";

export type CategoryDefinition = {
  id: string;
  kind: OperationKind;
  scope: BudgetScope | "all";
  group: string;
  name: string;
  keywords: string[];
};

import { resolveMerchantCategory } from "./merchant-rules";

const category = (
  id: string,
  kind: OperationKind,
  scope: BudgetScope | "all",
  group: string,
  name: string,
  keywords: string[] = [],
): CategoryDefinition => ({ id, kind, scope, group, name, keywords });

export const categoryCatalog: CategoryDefinition[] = [
  category("groceries", "expense", "all", "Еда", "Продукты", ["продукт", "пятёроч", "перекрёст", "вкусвилл", "лента", "магнит", "рынок"]),
  category("restaurants", "expense", "all", "Еда", "Кафе и рестораны", ["кафе", "ресторан", "обед", "ужин", "ланч"]),
  category("delivery_food", "expense", "all", "Еда", "Доставка еды", ["доставка еды", "самокат", "лавка", "delivery", "яндекс еда"]),
  category("coffee_snacks", "expense", "all", "Еда", "Кофе и перекусы", ["кофе", "булоч", "перекус", "круассан", "выпечк"]),
  category("alcohol", "expense", "all", "Еда", "Алкоголь", ["алкоголь", "вино"]),

  category("rent", "expense", "family", "Дом", "Аренда жилья", ["аренда квартир", "съём квартир"]),
  category("mortgage", "expense", "family", "Дом", "Ипотека", ["ипотек"]),
  category("utilities", "expense", "family", "Дом", "Квартплата и ЖКХ", ["жкх", "квартплат", "коммунал", "водоканал", "электроэнерг"]),
  category("home_internet", "expense", "family", "Дом", "Домашний интернет и ТВ", ["домашний интернет", "ростелеком", "дом.ру"]),
  category("home_repairs", "expense", "family", "Дом", "Ремонт", ["ремонт квартир", "стройматериал", "сантехник", "электрик"]),
  category("furniture", "expense", "family", "Дом", "Мебель и техника", ["мебель", "бытовая техника", "холодильник", "телевизор"]),
  category("household", "expense", "family", "Дом", "Товары для дома", ["хозтовар", "для дома", "посуда", "уборка"]),
  category("home_services", "expense", "family", "Дом", "Домашние услуги", ["клининг", "домработ", "химчистк"]),

  category("fuel", "expense", "all", "Автомобиль", "Топливо и зарядка", ["азс", "заправ", "бенз", "дизель", "зарядка авто", "газпромнефть", "лукойл"]),
  category("car_service", "expense", "all", "Автомобиль", "ТО и ремонт", ["автосервис", "ремонт авто", "техобслуж", "шиномонтаж", "запчаст"]),
  category("car_insurance", "expense", "all", "Автомобиль", "ОСАГО и каско", ["осаго", "каско", "страховка авто"]),
  category("parking", "expense", "all", "Автомобиль", "Парковка и платные дороги", ["парков", "зсд", "платная дорога", "транспондер"]),
  category("car_wash", "expense", "all", "Автомобиль", "Мойка", ["автомой", "мойка авто"]),
  category("car_fines", "expense", "all", "Автомобиль", "Штрафы", ["гибдд", "штраф"]),
  category("car_other", "expense", "all", "Автомобиль", "Другие расходы на автомобиль"),
  category("taxi", "expense", "all", "Транспорт", "Такси", ["такси", "яндекс go", "uber"]),
  category("public_transport", "expense", "all", "Транспорт", "Общественный транспорт", ["метро", "автобус", "трамвай", "троллейбус", "подорожник"]),
  category("rail_air", "expense", "all", "Транспорт", "Поезда и самолёты", ["авиабилет", "жд билет", "ржд", "аэрофлот", "победа"]),

  category("doctors", "expense", "all", "Здоровье", "Врачи", ["врач", "клиника", "консультация", "медцентр"]),
  category("tests", "expense", "all", "Здоровье", "Анализы и обследования", ["анализ", "узи", "мрт", "рентген", "инвитро", "хеликс"]),
  category("medicines", "expense", "all", "Здоровье", "Лекарства", ["аптек", "лекарств", "таблет", "рецепт"]),
  category("dentistry", "expense", "all", "Здоровье", "Стоматология", ["стоматолог", "зуб", "ортодонт", "брекет"]),
  category("vision", "expense", "all", "Здоровье", "Зрение", ["очки", "линзы", "офтальмолог", "оптик"]),
  category("supplements", "expense", "all", "Здоровье", "Витамины и добавки", ["витамин", "бад", "добавк", "протеин"]),
  category("health_insurance", "expense", "all", "Здоровье", "Медицинская страховка", ["дмс", "медицинская страховка"]),

  category("child_education", "expense", "family", "Дети", "Школа и обучение", ["школ", "репетитор", "учебник", "канцтовар", "продлёнк"]),
  category("child_clubs", "expense", "family", "Дети", "Кружки и спорт", ["кружок", "секция", "вокал", "волейбол", "танцы", "тренер"]),
  category("child_care", "expense", "family", "Дети", "Няня и присмотр", ["няня", "детский сад", "лагерь"]),
  category("child_pocket", "expense", "family", "Дети", "Карманные деньги", ["карманные", "ребёнку на расходы", "дочке на расходы", "сыну на расходы"]),

  category("clothes", "expense", "all", "Покупки", "Одежда", ["одежд", "куртка", "платье", "брюки", "футболка"]),
  category("shoes", "expense", "all", "Покупки", "Обувь", ["обув", "туфли", "кроссовки", "ботинки"]),
  category("electronics", "expense", "all", "Покупки", "Электроника", ["телефон", "ноутбук", "планшет", "электроник"]),
  category("marketplaces", "expense", "all", "Покупки", "Маркетплейсы", ["озон", "ozon", "wildberries", "вайлдберриз", "яндекс маркет"]),
  category("other_shopping", "expense", "all", "Покупки", "Другие покупки", ["покупка"]),

  category("mobile", "expense", "all", "Связь и сервисы", "Мобильная связь", ["мтс", "мегафон", "билайн", "теле2", "t2", "мобильная связь"]),
  category("subscriptions", "expense", "all", "Связь и сервисы", "Подписки", ["подписк", "яндекс плюс", "icloud", "google one", "netflix", "кинопоиск"]),
  category("powerbank_rental", "expense", "all", "Связь и сервисы", "Аренда пауэрбанка", ["пауэрбанк", "powerbank"]),
  category("software_personal", "expense", "personal", "Связь и сервисы", "Приложения и программы", ["app store", "google play", "приложение", "программа"]),
  category("bank_fees", "expense", "all", "Финансы", "Комиссии банка", ["комиссия", "обслуживание карты", "смс банк"]),
  category("loan_payment", "expense", "all", "Финансы", "Кредиты и проценты", ["кредит", "проценты банку", "займ"]),
  category("taxes_personal", "expense", "personal", "Финансы", "Личные налоги", ["налог физлица", "имущественный налог", "транспортный налог"]),

  category("beauty", "expense", "all", "Личное", "Красота и уход", ["салон", "парикмахер", "маникюр", "косметик", "стрижк"]),
  category("hygiene", "expense", "all", "Личное", "Гигиена", ["гигиен", "шампун", "зубная паста"]),
  category("sport", "expense", "all", "Личное", "Спорт", ["фитнес", "спортзал", "бассейн", "тренировка"]),
  category("education", "expense", "all", "Личное", "Обучение и книги", ["курс", "обучение", "книга", "семинар"]),
  category("hobbies", "expense", "all", "Личное", "Хобби", ["хобби", "рукодел", "музыка"]),
  category("entertainment", "expense", "all", "Досуг", "Развлечения", ["кино", "театр", "концерт", "развлеч"]),
  category("games", "expense", "all", "Досуг", "Игры и цифровые покупки", ["игра", "игровой сервис"]),
  category("travel", "expense", "all", "Досуг", "Путешествия", ["отель", "гостиниц", "тур", "экскурсия", "путешеств"]),
  category("gifts", "expense", "all", "Досуг", "Подарки", ["подарок", "цветы", "день рождения"]),
  category("charity", "expense", "all", "Досуг", "Благотворительность", ["благотвор", "пожертвован", "донат"]),
  category("pets", "expense", "family", "Семья", "Питомцы", ["ветеринар", "зоомагазин", "корм для", "питомец"]),
  category("family_support", "expense", "family", "Семья", "Помощь родственникам", ["родителям", "маме", "папе", "родственник"]),
  category("alimony", "expense", "family", "Семья", "Алименты", ["алименты"]),
  category("unplanned", "expense", "all", "Прочее", "Непредвиденные расходы", ["непредвид", "срочно"]),
  category("other_expense", "expense", "all", "Прочее", "Другой расход"),

  category("salary_income", "income", "personal", "Регулярные доходы", "Зарплата", ["зарплата", "аванс с работы"]),
  category("bonus_income", "income", "personal", "Регулярные доходы", "Премия", ["премия", "бонус от работодателя"]),
  category("freelance_income", "income", "personal", "Дополнительные доходы", "Подработка", ["подработка", "фриланс"]),
  category("interest_income", "income", "personal", "Финансовые доходы", "Проценты и инвестиции", ["проценты по вкладу", "дивиденды", "купон"]),
  category("cashback_income", "income", "personal", "Финансовые доходы", "Кешбэк", ["кешбэк", "cashback"]),
  category("refund_income", "income", "all", "Возвраты", "Возврат покупки", ["возврат покупки", "возмещение"]),
  category("gift_income", "income", "personal", "Другие доходы", "Подарки", ["подарили", "подарок деньгами"]),
  category("sale_income", "income", "personal", "Другие доходы", "Продажа вещей", ["продал", "продала", "авито"]),
  category("rent_income", "income", "personal", "Другие доходы", "Доход от аренды", ["сдал квартиру", "арендная плата"]),
  category("benefits_income", "income", "family", "Другие доходы", "Пособия и выплаты", ["пособие", "соцвыплата", "алименты получены"]),
  category("other_income", "income", "all", "Другие доходы", "Другой доход"),

  category("sales_work", "income", "work", "Доходы бизнеса", "Продажа товаров и услуг", ["оплата клиента", "выручка", "продажа", "оказание услуг"]),
  category("advance_work", "income", "work", "Доходы бизнеса", "Аванс от клиента", ["аванс клиента", "предоплата"]),
  category("commission_work", "income", "work", "Доходы бизнеса", "Комиссия и вознаграждение", ["комиссия получена", "вознаграждение"]),
  category("reimbursement_work", "income", "work", "Доходы бизнеса", "Возмещение расходов", ["возмещение расходов", "компенсация от клиента"]),
  category("investment_work", "income", "work", "Финансирование", "Вклад собственника или заём", ["вклад собственника", "заём бизнесу", "инвестиция"]),
  category("other_work_income", "income", "work", "Доходы бизнеса", "Другой рабочий доход"),

  category("payroll_work", "expense", "work", "Команда", "Зарплаты", ["зарплата сотрудник", "выплатил зарплату", "выдал зарплату", "фот"]),
  category("contractors_work", "expense", "work", "Команда", "Подрядчики", ["подрядчик", "фрилансер", "исполнитель"]),
  category("taxes_work", "expense", "work", "Обязательные платежи", "Налоги и взносы", ["налог ип", "усн", "страховые взносы", "ндфл"]),
  category("duties_work", "expense", "work", "Обязательные платежи", "Пошлины и сборы", ["госпошлина", "таможенная пошлина", "утилизационный сбор", "утильсбор"]),
  category("advertising_work", "expense", "work", "Продвижение", "Реклама", ["реклама", "директ", "таргет", "продвижение"]),
  category("marketing_work", "expense", "work", "Продвижение", "Маркетинг и дизайн", ["маркетолог", "дизайн", "брендинг", "полиграфия"]),
  category("office_rent_work", "expense", "work", "Офис", "Аренда офиса", ["аренда офиса", "коворкинг"]),
  category("office_work", "expense", "work", "Офис", "Офисные расходы", ["канцелярия", "офисные расходы", "вода в офис"]),
  category("software_work", "expense", "work", "Сервисы", "Программы и подписки", ["crm", "хостинг", "домен", "облачный сервис", "программа для работы"]),
  category("communications_work", "expense", "work", "Сервисы", "Связь и интернет", ["корпоративная связь", "интернет офис"]),
  category("bank_work", "expense", "work", "Сервисы", "Банк и эквайринг", ["эквайринг", "рко", "комиссия банка"]),
  category("accounting_work", "expense", "work", "Профессиональные услуги", "Бухгалтерия и юристы", ["бухгалтер", "юрист", "нотариус"]),
  category("equipment_work", "expense", "work", "Операционные расходы", "Оборудование", ["оборудование", "оргтехника", "рабочий ноутбук"]),
  category("supplies_work", "expense", "work", "Операционные расходы", "Материалы и закупки", ["закупка", "материалы", "товар поставщика"]),
  category("delivery_work", "expense", "work", "Операционные расходы", "Логистика и доставка", ["логистика", "курьер", "доставка клиенту", "транспортная компания"]),
  category("travel_work", "expense", "work", "Операционные расходы", "Командировки", ["командировка", "деловая поездка"]),
  category("client_work", "expense", "work", "Операционные расходы", "Расходы по клиентам", ["для клиента", "клиентские расходы"]),
  category("documents_work", "expense", "work", "Операционные расходы", "Документы и оформление", ["эптс", "сбктс", "оформление документов", "сертификат"]),
  category("refund_work", "expense", "work", "Прочее", "Возврат клиенту", ["возврат клиенту"]),
  category("other_work_expense", "expense", "work", "Прочее", "Другой рабочий расход"),

  category("own_transfer", "transfer", "all", "Переводы", "Между своими счетами", ["между своими", "на свою карту", "с карты на карту"]),
  category("cash_withdrawal", "transfer", "all", "Переводы", "Снятие наличных", ["снятие наличных", "банкомат"]),
  category("cash_deposit", "transfer", "all", "Переводы", "Внесение наличных", ["внесение наличных"]),
  category("debt_given", "transfer", "all", "Переводы", "Дал в долг", ["дал в долг", "одолжил"]),
  category("debt_returned", "transfer", "all", "Переводы", "Возврат долга", ["вернули долг", "возврат долга"]),
  category("credit_card_payment", "transfer", "all", "Переводы", "Погашение кредитной карты", ["погашение кредитной карты"]),
  category("unknown_transfer", "transfer", "all", "Переводы", "Перевод — нужно уточнить"),
];

export function resolveCategory(text: string, scope?: BudgetScope) {
  const normalized = text.toLowerCase().replace(/ё/g, "е");
  const candidates = categoryCatalog.filter((item) => item.scope === "all" || !scope || item.scope === scope);
  const merchantMatch = resolveMerchantCategory(normalized, scope);
  if (merchantMatch) {
    const category = candidates.find((item) => item.id === merchantMatch.categoryId);
    if (category) return category;
  }
  return candidates.find((item) => item.keywords.some((keyword) => normalized.includes(keyword.replace(/ё/g, "е"))));
}
