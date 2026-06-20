'use client'

import { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Asset {
  id: string
  icon: string
  name: string
  fullName: string
  riskLevel: 1 | 2 | 3 | 4 | 5
  horizon: string
  tagline: string
  history: string
  howItWorks: string
  risks: string[]
  stats: { label: string; value: string }[]
  howToInvest: string
  tip: string
  tickers?: string[]
}

interface Account {
  id: string
  icon: string
  name: string
  fullName: string
  tag: string
  tagColor: string
  description: string
  pros: string[]
  cons: string[]
  limit: string
  bestFor: string
}

interface Bias {
  id: string
  icon: string
  name: string
  ua: string
  description: string
  example: string
  fix: string
}

// ─── Asset Data ─────────────────────────────────────────────────────────────

const ASSETS: Asset[] = [
  {
    id: 'sp500',
    icon: '📈',
    name: 'S&P 500',
    fullName: "Standard & Poor's 500",
    riskLevel: 3,
    horizon: '5+ років',
    tagline: '500 найбільших компаній США. Основа більшості інвестиційних портфелів у світі.',
    history: 'Створений у 1957 році компанією Standard & Poor\'s. До цього існував S&P 90 (з 1926). Перше значення індексу: 49.74 пункти. Ідея проста — замість вибору однієї компанії, відстежувати 500 найбільших одночасно. До 2025 року індекс перетнув позначку 5,500+ пунктів. Уоррен Баффет заповів своїй дружині тримати 90% в S&P 500 ETF після його смерті.',
    howItWorks: 'Індекс зважений за ринковою капіталізацією (ціна × кількість акцій). Топ-10 компаній (Apple, Microsoft, Nvidia, Amazon, Meta...) займають ~35% індексу. Коли ви купуєте ETF на S&P 500 — ви автоматично стаєте співвласником усіх 500 компаній пропорційно їхній розмірності.',
    risks: [
      'Ринковий ризик — весь ринок може впасти на 30–50% (2000, 2008, 2020)',
      'Концентрація у tech — якщо технологічний сектор падає, індекс падає',
      'Відновлення після -38% (2008) зайняло 5–6 років',
      'Тільки США — не покриває міжнародні ринки',
    ],
    stats: [
      { label: 'Середня дохідність (1957–2025)', value: '~10.5%/рік' },
      { label: 'Найгірший рік — 2008', value: '-38%' },
      { label: 'Найкращий рік — 1995', value: '+37.6%' },
      { label: '$10k вкладені у 2000 (пік кризи)', value: '~$57k у 2026' },
      { label: '$10k вкладені у 2010', value: '~$75k у 2026' },
      { label: 'Відсоток років з позитивною дохідністю', value: '~74%' },
    ],
    howToInvest: 'На Fidelity: FXAIX (0.015% — найдешевший), FZROX (0% — тільки Fidelity, Total Market). На інших: VOO (Vanguard 0.03%), IVV (BlackRock 0.03%), SPY (0.09%). Стратегія: купуйте фіксовану суму щомісяця (DCA) — не намагайтесь вгадати кращий момент.',
    tip: 'Баффет у 2007 поставив $1 млн що простий S&P 500 ETF переможе кошик хедж-фондів за 10 років. Він виграв: S&P 500 +125%, хедж-фонди +36%.',
    tickers: ['FXAIX', 'FZROX', 'VOO'],
  },
  {
    id: 'etf',
    icon: '🧺',
    name: 'ETF',
    fullName: 'Exchange-Traded Fund',
    riskLevel: 3,
    horizon: '3+ роки',
    tagline: 'Кошик з тисячами активів в одній акції. Головний інструмент сучасного пасивного інвестора.',
    history: 'Перший ETF — SPDR S&P 500 (SPY) — запущений 22 січня 1993 на NYSE компанією State Street. Ідею першого індексного фонду придумав Джек Богл (Vanguard) ще у 1976, але він був пайовим (купити/продати тільки в кінці дня). ETF вирішив це — торгується як акція протягом дня. До 2025 ринок ETF виріс до $12+ трильйонів.',
    howItWorks: 'ETF = контейнер з активами, що торгується на біржі. Купуєте 1 акцію ETF → автоматично тримаєте частку всіх активів усередині. Є ETF на все: акції США, міжнародні, облігації, нерухомість, золото, крипто, дивіденди, конкретні сектори (tech, healthcare, energy). Expense ratio — щорічна комісія за управління (знімається автоматично).',
    risks: [
      'ETF падає разом з тим, що відстежує — ринковий ризик не зникає',
      'Tracking error — ETF може відставати від індексу на 0.1–1%/рік',
      'Малі ETF (<$100M AUM) ризикують бути закритими',
      'Лікві дність — рідкісні ETF мають великий bid-ask spread',
    ],
    stats: [
      { label: 'Кількість ETF у світі (2025)', value: '~8,000+' },
      { label: 'AUM ринку ETF', value: '$12+ трлн' },
      { label: 'Середній expense ratio (пасивні)', value: '0.05–0.20%' },
      { label: 'Різниця 1% vs 0.05% на $100k за 30р', value: '~$200,000' },
      { label: 'Найбільший ETF — SPY', value: '$600+ млрд AUM' },
    ],
    howToInvest: 'Обирайте ETF: expense ratio <0.20%, AUM >$1 млрд, ліквідність (volume >500k акцій/день). Fidelity Zero ETF: FZROX (US Total Market, 0%), FZILX (International, 0%), FZRPX (Extended Market, 0%). Купуйте через звичайний ринковий ордер або limit order.',
    tip: 'Різниця між expense ratio 1% і 0.05% на $20,000 за 30 років при 10%/рік зростанні = ~$100,000 втрачених грошей. Expense ratio — найважливіший критерій вибору ETF.',
    tickers: ['FZROX', 'FZILX'],
  },
  {
    id: 'bonds',
    icon: '🏦',
    name: 'Bonds / Облігації',
    fullName: 'Fixed Income Securities',
    riskLevel: 2,
    horizon: '1–10 років',
    tagline: 'Позика урядам і корпораціям з фіксованим доходом. Стабілізатор портфеля.',
    history: 'Одні з найдавніших фінансових інструментів — перші держоблігації у Венеціанській республіці у 1157 році. США почали випускати Treasury Bonds з 1790 для фінансування революційного боргу. Сьогодні ринок облігацій США (~$50 трлн) більший за ринок акцій. 1980 рік — 10-річна ставка досягла 15.8% (рекорд). 2020–2021 — впала до 0.5%.',
    howItWorks: 'Ви позичаєте гроші уряду або компанії на термін. Отримуєте фіксований купон (відсоток) і повернення суми наприкінці. Приклад: Treasury 10Y, 4.3%/рік. Вклали $10,000 → $430/рік протягом 10 років → плюс $10,000 назад. ВАЖЛИВО: ціна облігацій падає коли ставки ростуть (і навпаки) — "interest rate risk".',
    risks: [
      'Процентний ризик — ставки виросли, ваші облігації подешевшали',
      '2022 рік: Total Bond Market -13% (через різкий ріст ставок Fed)',
      'Інфляційний ризик — 4% купон при інфляції 6% = реальний збиток',
      'Корпоративні облігації: кредитний ризик (дефолт компанії)',
    ],
    stats: [
      { label: 'US Treasury 10Y (поточна, 2025)', value: '~4.3%' },
      { label: 'US Treasury 10Y (мінімум, 2020)', value: '0.52%' },
      { label: 'US Treasury 10Y (максимум, 1981)', value: '15.8%' },
      { label: 'Total Bond Market — 2022', value: '-13% (найгірший рік)' },
      { label: 'Avg дохідність (20 років)', value: '~4–5%/рік' },
    ],
    howToInvest: 'ETF: FXNAX (Fidelity US Bond Index, 0.025%), BND (Vanguard), AGG (iShares). Короткострокові: SGOV (0-3M Treasury, ~5%), SCHO (1-3Y). Напряму: TreasuryDirect.gov — купити без брокера. I-Bonds — захист від інфляції, до $10k/рік. ВАЖЛИВО: тримайте бонди в IRA — вони генерують taxable income щороку.',
    tip: 'Класичне правило: % в облігаціях = ваш вік. 30 років → 30% бонди. Але при 5-річному горизонті молодому інвестору достатньо 15–20% як буфер волатильності.',
    tickers: ['FXNAX', 'SGOV'],
  },
  {
    id: 'reits',
    icon: '🏢',
    name: 'REITs',
    fullName: 'Real Estate Investment Trust',
    riskLevel: 3,
    horizon: '5+ років',
    tagline: 'Нерухомість без купівлі квартири. Зобов\'язані виплачувати 90%+ прибутку як дивіденди.',
    history: 'REITs придумав Конгрес США у 1960 році — щоб звичайні люди могли інвестувати в комерційну нерухомість (раніше доступну тільки дуже багатим). Перший REIT торгувався на NYSE у 1965. Найвідоміший — Realty Income (тікер O) — платить дивіденди щомісяця без перерви з 1969 року (56+ років поспіль). До 2025 ринок REITs США — $2.5+ трлн.',
    howItWorks: 'REIT — компанія, що володіє нерухомістю: торгові центри, офіси, склади, дата-центри, лікарні, апартаменти, вишки стільникового зв\'язку. За законом REIT зобов\'язаний виплачувати 90%+ прибутку акціонерам як дивіденди. Тому дивідендна дохідність: зазвичай 3–6%/рік + потенційне зростання ціни акції.',
    risks: [
      'Чутливість до процентних ставок: коли ставки ростуть — REITs падають',
      '2022: FREL -26% через різкий ріст ставок Fed',
      'Офісні REITs постраждали від remote work (Zoom era)',
      'Дивіденди REITs оподатковуються як звичайний дохід, не 15% qualified rate',
    ],
    stats: [
      { label: 'Середня дохідність (1972–2025)', value: '~11.5%/рік' },
      { label: 'Середня дивідендна дохідність', value: '3–5%/рік' },
      { label: 'Ринок REITs США', value: '$2.5+ трлн' },
      { label: '2022 (найгірший рік)', value: '-26%' },
      { label: 'Realty Income (O) — дивіденди', value: '56+ років без перерви' },
    ],
    howToInvest: 'ETF: FREL (Fidelity, 0.084%), VNQ (Vanguard, 0.13%). Перспективні сектори: дата-центри (EQIX, DLR — через ріст AI), cell towers (AMT, CCI), склади/логістика (PLD). ОБОВ\'ЯЗКОВО: тримайте REITs в Roth IRA, бо дивіденди оподатковуються як звичайний дохід.',
    tip: 'Data center REITs (Equinix, Digital Realty) — один з найбільш перспективних секторів через ріст AI і хмарних обчислень. Попит на серверні потужності зростає швидше ніж будуються нові дата-центри.',
    tickers: ['FREL', 'VNQ'],
  },
  {
    id: 'gold',
    icon: '🥇',
    name: 'Gold / Золото',
    fullName: 'Precious Metal Commodity',
    riskLevel: 2,
    horizon: '3+ роки',
    tagline: '5000 років як сховище цінності. Захист від інфляції та кризових ситуацій.',
    history: 'Золото використовується як гроші понад 5,000 років. Золотий стандарт в США існував до 1971 коли Ніксон "закрив золоте вікно" — долар відв\'язали від золота. Після цього золото почало вільно торгуватись. 2000 рік: $280/oz → 2011: $1,900 (перший пік) → 2020: $2,067 → 2024–2025: $2,800–3,200/oz. Центробанки у 2023 купили 1,037 тонн золота — абсолютний рекорд.',
    howItWorks: 'Золото — фізичний актив без внутрішнього грошового потоку (не платить дивіденди або відсотки). Ціна визначається: попитом центробанків, геополітичною нестабільністю, інфляцією, силою долара. Зростає під час: інфляції, банківських криз, геополітичної напруги, ослаблення долара.',
    risks: [
      'Не генерує дохід — тільки приріст ціни або збиток',
      'Короткострокова волатильність — може впасти на 20–30% за рік',
      'Фізичне золото: витрати на зберігання та страховку',
      'Поведінка непередбачувана на короткому горизонті',
    ],
    stats: [
      { label: 'Дохідність 2000–2025', value: '~10%/рік' },
      { label: 'Ціна у 2000', value: '$280/oz' },
      { label: 'Ціна у 2025', value: '~$2,900/oz (×10.4)' },
      { label: '2022 (рік падіння ринків)', value: '-0.3% (майже не впало!)' },
      { label: 'Купівля центробанків 2023', value: '1,037 т — рекорд' },
    ],
    howToInvest: 'ETF: GLDM (State Street, 0.10% — найкраще), IAU (iShares, 0.25%), GLD (0.40% — менш вигідний). Фізичне золото — тільки якщо є де безпечно зберігати. Оптимальна частка: 5–10% портфелю як кризовий буфер.',
    tip: '2008: S&P 500 -38%, золото +5%. 2022: S&P 500 -18%, золото -0.3%. Золото рухається проти акцій під час криз — тому навіть 5% в золоті помітно знижує волатильність портфеля.',
    tickers: ['GLDM', 'IAU'],
  },
  {
    id: 'money_market',
    icon: '💵',
    name: 'Money Market',
    fullName: 'Money Market Fund',
    riskLevel: 1,
    horizon: '0–2 роки',
    tagline: 'Краще банківського рахунку. ~4–5%/рік. Ідеально для cash та emergency fund.',
    history: 'Перший Money Market фонд — Reserve Fund — запущений у 1971 Брюсом Бентом. 2008: Reserve Fund "broke the buck" — пай впав нижче $1. Це спричинило паніку. Після цього SEC ввела суворі регуляції. Сьогодні SPAXX (Fidelity Government Money Market) — один з найбільших у світі з $300+ млрд AUM. На Fidelity він за замовчуванням тримає весь ваш незадіяний кеш.',
    howItWorks: 'Фонд інвестує в короткострокові боргові інструменти: US Treasury Bills, repo agreements, commercial paper. Ціна паю завжди = $1.00. Дохід приходить у вигляді нових паїв або готівки. SPAXX автоматично "підбирає" ваш кеш що лежить без роботи і дає ~4.4%/рік.',
    risks: [
      'НЕ застрахований FDIC (на відміну від банку) — але дуже малий реальний ризик',
      'Дохідність залежить від ставки Fed — якщо знизять, прибутковість впаде',
      'Теоретичний ризик "breaking the buck" — в реальності дуже малоймовірно',
    ],
    stats: [
      { label: 'SPAXX поточна дохідність (2025)', value: '~4.4%/рік' },
      { label: 'Vs середній банківський рахунок', value: '4.4% vs 0.5%' },
      { label: 'Ліквідність', value: 'Миттєва (T+0)' },
      { label: 'На $20,000 різниця за рік', value: '$780 "безкоштовних" $' },
      { label: 'AUM SPAXX', value: '$300+ млрд' },
    ],
    howToInvest: 'На Fidelity вже є автоматично — SPAXX. Незадіяний кеш автоматично туди йде. Альтернативи: FDRXX (тільки treasuries, трохи вища дохідність), SGOV (Treasury ETF, можна і в IRA). Для emergency fund: HYSA (High-Yield Savings Account) в банку — застрахований FDIC, ~4–5%.',
    tip: 'Якщо у вас $34k emergency fund в звичайному банку при 0.5% замість HYSA/Money Market при 4.5% — ви втрачаєте ~$1,360/рік. Перевести в Marcus by Goldman Sachs або Ally Bank — 15 хвилин роботи.',
    tickers: ['SPAXX', 'FDRXX'],
  },
  {
    id: 'crypto',
    icon: '₿',
    name: 'Crypto / Bitcoin',
    fullName: 'Cryptocurrency',
    riskLevel: 5,
    horizon: '3+ роки (тільки те що готові втратити)',
    tagline: 'Найвищий потенціал. Найвищий ризик. Просадки -80% — норма.',
    history: 'Bitcoin створений у 2008 анонімним(и) Satoshi Nakamoto. Перша транзакція — 12.01.2009. Перша реальна покупка: 2010 рік, 2 піци за 10,000 BTC (сьогодні ~$1 млрд). Ціни: 2010 — $0.08 → 2017 пік — $19k → 2018 дно — $3k → 2021 пік — $69k → 2022 дно — $15.5k → 2024–2025 — $100k+.',
    howItWorks: 'Bitcoin — децентралізована цифрова валюта на блокчейні без центрального банку. Максимальна емісія: 21 мільйон монет (до ~2140). Кожні ~4 роки "халвінг" — нагорода майнерам зменшується вдвічі, теоретично зменшуючи інфляцію. Ethereum — платформа для смарт-контрактів і DeFi.',
    risks: [
      'Просадки -80% — норма, було тричі: 2011, 2018, 2022',
      'Регуляторний ризик — уряди можуть обмежити або заборонити',
      'Ризик бірж — Mt.Gox і FTX — люди втрачали все',
      'Немає внутрішньої вартості — тільки те, що інші готові платити',
      'Квантові комп\'ютери — потенційна загроза в довгостроковій перспективі',
    ],
    stats: [
      { label: 'BTC 2010 → 2025', value: '$0.08 → $100k+ (×1.25 млн)' },
      { label: 'Максимальна просадка (2022)', value: '-77%' },
      { label: 'Відновлення 2023–2025', value: '+650%' },
      { label: 'Market Cap BTC (2025)', value: '~$2 трлн' },
      { label: '$10k у грудні 2017 (пік $19k)', value: '~$55k у 2026' },
    ],
    howToInvest: 'Максимум 5–10% портфелю. На Fidelity: Bitcoin ETF (FBTC, 0.25%). Або напряму: Coinbase, Kraken. НЕ тримайте більше місяця на біржі — hardware wallet (Ledger, Trezor). Тільки DCA — купуйте щомісяця фіксовану суму, не намагайтесь ловити дно.',
    tip: 'Якщо купили будь-коли і тримали щонайменше 4 роки — у 95%+ випадків були в плюсі. Але -80% перед цим витримати психологічно дуже важко. Перевірте себе: якщо ваші $2,000 перетворяться на $400 — ви не продасте в паніці?',
  },
  {
    id: 'stocks',
    icon: '🏭',
    name: 'Individual Stocks',
    fullName: 'Окремі акції компаній',
    riskLevel: 4,
    horizon: '5+ років',
    tagline: 'Власність частки компанії. Вищий потенціал і вищий ризик порівняно з ETF.',
    history: 'Перша акціонерна компанія — Голландська Ост-Індська компанія (VOC), 1602 рік. Амстердамська фондова біржа — перша у світі. NYSE заснована у 1792 під деревом Buttonwood в Нью-Йорку. Сьогодні на NYSE + NASDAQ торгується 5,000+ компаній з капіталізацією $40+ трлн. Amazon 1997: $18/акція → 2025: $220/акція (×12). Enron 2000: $90 → 2001: $0 (банкрутство).',
    howItWorks: 'Акція = частка власності. 1 акція Apple з 15 млрд акцій в обігу = 1/15,000,000,000 Apple. Прибуток: (1) зростання ціни, (2) дивіденди. Ключові метрики: P/E ratio (ціна/прибуток), Revenue Growth, Free Cash Flow, Debt/Equity. "Moat" (конкурентна перевага) — чому цю компанію важко витіснити конкурентам.',
    risks: [
      'Компанія може збанкрутувати — Enron, Lehman, FTX, Kodak',
      'Концентрований ризик — 1 акція = 1 ставка',
      'Ви конкуруєте з тисячами аналітиків і алгоритмами',
      'Емоційні рішення — купити на піку хайпу, продати на дні',
    ],
    stats: [
      { label: 'Apple 2000 → 2025', value: '~$0.50 → $220 (×440)' },
      { label: 'Amazon 2001 → 2025', value: '~$10 → $220 (×22)' },
      { label: 'Enron 2000 → 2001', value: '$90 → $0 (банкрутство)' },
      { label: '% активних фондів що б\'ють S&P500 (15р)', value: '~10%' },
    ],
    howToInvest: 'Не більше 10–20% портфелю. Решта — ETF. При виборі: розумійте бізнес-модель, перевірте P/E vs галузь, Free Cash Flow, Debt/Equity <1. Fidelity Stock Screener + Research від 10+ аналітиків — безкоштовно. Правило Баффета: "Buy companies you understand and would hold for 10+ years."',
    tip: 'Навіть Баффет радить більшості людей просто купити S&P 500 ETF. Якщо хочете "погратись" — виділіть окремий play money рахунок (5–10% портфелю) і не мішайте з основними заощадженнями.',
  },
]

// ─── Account Data ────────────────────────────────────────────────────────────

const ACCOUNTS: Account[] = [
  {
    id: 'roth',
    icon: '🌟',
    name: 'Roth IRA',
    fullName: 'Roth Individual Retirement Account',
    tag: 'НАЙКРАЩИЙ ДЛЯ БІЛЬШОСТІ',
    tagColor: '#22c55e',
    description: 'Вкладаєте гроші ПІСЛЯ сплати податків. Весь ріст і виведення після 59½ — повністю без податків. Найкращий рахунок для більшості молодих американців.',
    pros: [
      'Ріст і виведення після 59½ — 0% податків назавжди',
      'Можна виводити ВНЕСКИ (не заробіток) будь-коли без штрафів',
      'Немає обов\'язкових мінімальних виведень (RMD) — гроші ростуть скільки хочете',
      'Можна передати нащадкам — вони теж виводять без податків',
    ],
    cons: [
      'Ліміт доходу: не можна вносити якщо дохід >$161k (single) або >$240k (married)',
      'Ліміт внеску: $7,000/рік ($8,000 якщо вам 50+)',
      'Штраф 10% за дострокове виведення ЗАРОБІТКУ (не внесків) до 59½',
    ],
    limit: '$7,000/рік ($8,000 якщо 50+)',
    bestFor: 'Всі хто очікує бути в такому ж або вищому податковому брекеті на пенсії. Молодь — особливо. Якщо дохід вище ліміту — є Backdoor Roth стратегія.',
  },
  {
    id: 'traditional',
    icon: '🏛',
    name: 'Traditional IRA',
    fullName: 'Traditional Individual Retirement Account',
    tag: 'ЗНИЖУЄ ПОДАТКИ ЗАРАЗ',
    tagColor: '#3b82f6',
    description: 'Вкладаєте ДО сплати податків. Знижує оподатковуваний дохід зараз. Платите податки при виведенні на пенсії.',
    pros: [
      'Знижує оподатковуваний дохід зараз — якщо зараз у高ому брекеті',
      'Немає ліміту доходу для внеску (є для deductibility)',
      'Ріст — без щорічних податків',
    ],
    cons: [
      'Платите податки при виведенні (ставка пенсійного доходу)',
      'Обов\'язкові мінімальні виведення (RMD) з 73 років',
      'Штраф 10% за виведення до 59½',
    ],
    limit: '$7,000/рік ($8,000 якщо 50+)',
    bestFor: 'Якщо зараз у вищому брекеті ніж очікуєте на пенсії. Backdoor Roth: внести в Traditional → конвертувати в Roth (для тих хто перевищує ліміт доходу Roth).',
  },
  {
    id: '401k',
    icon: '🏢',
    name: '401(k)',
    fullName: 'Employer-Sponsored Retirement Plan',
    tag: 'БЕЗКОШТОВНІ ГРОШІ ВІД РОБОТОДАВЦЯ',
    tagColor: '#8b5cf6',
    description: 'Пенсійний план через роботодавця. Головна перевага: роботодавець часто "матчить" ваші внески — це буквально безкоштовні гроші.',
    pros: [
      'Employer match — роботодавець додає 50–100% ваших внесків до певного %',
      'Дуже великі ліміти (більше ніж IRA)',
      'Автоматичні відрахування з зарплати — легко і без зусиль',
      'Є Roth 401k варіант у більшості великих компаній',
    ],
    cons: [
      'Обмежений вибір інвестицій (тільки те що пропонує план)',
      'Штраф 10% + податки за виведення до 59½',
      'При зміні роботи потрібно робити rollover в IRA',
    ],
    limit: '$23,500/рік (+ $7,500 якщо 50+)',
    bestFor: 'Мінімум — внести стільки щоб отримати повний employer match. Це миттєвий 50–100% дохід. Потім: Roth IRA → решта 401k.',
  },
  {
    id: 'taxable',
    icon: '📊',
    name: 'Taxable Brokerage',
    fullName: 'Taxable Investment Account',
    tag: 'МАКСИМАЛЬНА ГНУЧКІСТЬ',
    tagColor: '#f59e0b',
    description: 'Звичайний брокерський рахунок без податкових пільг. Але повна свобода — виводьте будь-коли без штрафів.',
    pros: [
      'Без лімітів внеску',
      'Виводьте будь-коли без штрафів',
      'Повний вибір активів',
      'Tax-loss harvesting: продайте збиткові позиції для зниження податків',
    ],
    cons: [
      'Дивіденди і відсотки оподатковуються щороку (форма 1099)',
      'Продаж з прибутком = capital gains tax (15% якщо тримали >1 року)',
      'Немає податкових пільг для зростання',
    ],
    limit: 'Без обмежень',
    bestFor: 'Після того як максимізували IRA і 401k. Або якщо гроші можуть знадобитись до 59½.',
  },
  {
    id: 'utma',
    icon: '👶',
    name: 'UTMA / Custodial',
    fullName: 'Uniform Transfers to Minors Act',
    tag: 'ДЛЯ ДІТЕЙ',
    tagColor: '#ec4899',
    description: 'Інвестиційний рахунок для неповнолітніх. Батько управляє поки дитині не виповниться 18–21 (залежно від штату). Потім гроші юридично переходять дитині.',
    pros: [
      'Перші $1,300 доходу — без податків; наступні $1,300 — 10%',
      'Ніяких обмежень на що витрачати (на відміну від 529)',
      'Довгий горизонт = можна 100% акції',
    ],
    cons: [
      '"Kiddie tax" — дохід понад $2,600/рік оподатковується за ставкою батьків',
      'Гроші ЮРИДИЧНО переходять дитині в 18–21 — ви не контролюєте',
      'Може вплинути на FAFSA (фінансова допомога в коледжі)',
    ],
    limit: 'Без річних лімітів (але gift tax при >$18k/рік)',
    bestFor: 'Стартовий капітал для дитини. 17+ років горизонт → 80% FZROX + 20% FZILX, більше нічого не потрібно.',
  },
  {
    id: 'hsa',
    icon: '🏥',
    name: 'HSA',
    fullName: 'Health Savings Account',
    tag: 'ПОТРІЙНА ПОДАТКОВА ПІЛЬГА',
    tagColor: '#10b981',
    description: 'Рахунок для медичних витрат з ТРЬОМА податковими пільгами одночасно. Технічно найефективніший рахунок в США.',
    pros: [
      'Внески знижують оподатковуваний дохід',
      'Ріст — без податків',
      'Виведення на медичні витрати — без податків',
      'Після 65: виводьте на що завгодно (як Traditional IRA)',
      'Rollover — невикористані гроші ростуть необмежено довго',
    ],
    cons: [
      'Тільки для тих хто має High-Deductible Health Plan (HDHP)',
      'Можна витрачати тільки на медичні витрати (до 65)',
      'Малий ліміт внеску',
    ],
    limit: '$4,300 (individual) / $8,550 (family)',
    bestFor: 'Стратегія: платіть медичні рахунки зараз з кишені, зберігайте чеки, через 10–20 років виводьте без податків. HSA може стати додатковим пенсійним рахунком.',
  },
]

// ─── Psychology / Biases ─────────────────────────────────────────────────────

const BIASES: Bias[] = [
  {
    id: 'recency',
    icon: '🕐',
    name: 'Recency Bias',
    ua: 'Упередження нещодавності',
    description: 'Ми надаємо надто велику вагу нещодавнім подіям і думаємо що вони тривитимуть вічно.',
    example: '"Ринок ріс 3 роки — буде рости вічно" (думали у 1999, 2007, 2021). "Ринок падає — буде падати завжди" (думали у березні 2009 і березні 2020 — обидва рази були ідеальними для купівлі).',
    fix: 'Дивіться на 20–30-річну статистику, а не на останні 6–12 місяців. Ринок завжди рухається циклами. Поточний тренд не = майбутній тренд.',
  },
  {
    id: 'loss_aversion',
    icon: '😰',
    name: 'Loss Aversion',
    ua: 'Страх втрат',
    description: 'Психологічно програш $100 болить вдвічі сильніше ніж радує виграш $100. Це призводить до нераціональних рішень.',
    example: 'Продати після падіння на 10% "щоб не втратити більше" — і пропустити відновлення на 50%. Або тримати збиткові акції роками бо "якщо не продав — це ще не реальний збиток".',
    fix: 'Автоматизуйте інвестиції (auto-invest щомісяця). Встановіть правило: не дивитись на рахунок частіше ніж раз в квартал під час просадок. Просадка = знижка, не збиток.',
  },
  {
    id: 'fomo',
    icon: '🚀',
    name: 'FOMO',
    ua: 'Fear of Missing Out',
    description: 'Страх пропустити "наступний великий ріст" штовхає до купівлі після того, як актив вже виріс.',
    example: 'GameStop у 2021 (+2,700% за тиждень, потім -90%). BTC у листопаді 2021 ($69k, потім -77%). NFT у 2022. Всі ці активи куплені більшістю людей ПІСЛЯ 500%+ росту.',
    fix: 'Якщо ви вже чули про "гарячий актив" від таксиста, мами або в новинах — швидше за все вже пізно. Stick to your plan. Нудно = правильно.',
  },
  {
    id: 'timing',
    icon: '⏰',
    name: 'Market Timing',
    ua: 'Спроба вгадати ринок',
    description: '"Зачекаю поки ринок впаде, потім куплю" — найдорожча фраза в інвестиціях.',
    example: 'Дослідження Fidelity: клієнти, які пропустили 10 найкращих днів S&P 500 за 20 років, отримали ВДВІЧІ менший дохід ніж ті хто просто тримав. А 7 з 10 найкращих днів — в межах 15 днів від найгіршого.',
    fix: 'Time in the market завжди краще ніж timing the market. Є $20k — інвестуйте зараз. Або розбийте на 3–4 місяці якщо страшно, але не чекайте "кращого моменту" рік.',
  },
  {
    id: 'overconfidence',
    icon: '🦸',
    name: 'Overconfidence',
    ua: 'Самовпевненість',
    description: '80% водіїв вважають що вони кращі за середнього. 85% активних трейдерів впевнені що переграють ринок. Обидва помиляються.',
    example: '"Я проаналізував — Tesla точно виросте наступного кварталу." Але ви конкуруєте з тисячами аналітиків і алгоритмами що аналізують ту ж інформацію. 90% активних фондів програють S&P 500 за 15+ років.',
    fix: 'Index funds + низькі комісії + час + дисципліна = більшість активних стратегій. Це не натяк — це статистика.',
  },
  {
    id: 'panic',
    icon: '📉',
    name: 'Panic Selling',
    ua: 'Продаж в паніці',
    description: 'Продати активи на просадці = реалізувати збиток і гарантовано пропустити відновлення.',
    example: 'Ті хто продали S&P 500 у березні 2020 (-34%) і "чекали стабільності" — пропустили +100% за наступні 18 місяців. Те ж у 2009: хто продав у березні ($667 S&P), купив назад у червні ($943) — вже -30% від свого потенціалу.',
    fix: 'Якщо дуже страшно під час просадки — ваш ризик-профіль занадто агресивний. Додайте бонди. Але якщо вже маєте правильну алокацію — просто не дивіться на рахунок.',
  },
]

// ─── What-If Scenarios ───────────────────────────────────────────────────────

const SCENARIOS = [
  { icon: '😬', title: 'S&P 500 на піку dot-com', year: '2000', asset: 'S&P 500', amount: 10000, result: 57000, note: 'Найгірший момент — все одно x5.7 за 26 років' },
  { icon: '🎯', title: 'S&P 500 на дні кризи 2009', year: '2009', asset: 'S&P 500', amount: 10000, result: 95000, note: 'Ідеальний момент — x9.5 за 17 років' },
  { icon: '📈', title: 'S&P 500 у 2010', year: '2010', asset: 'S&P 500', amount: 10000, result: 75000, note: 'Звичайний момент — x7.5 за 16 років' },
  { icon: '🥇', title: 'Золото у 2000', year: '2000', asset: 'Gold', amount: 10000, result: 107000, note: '$280/oz → $2,980/oz за 26 років — x10.7' },
  { icon: '₿', title: 'Bitcoin у 2017 (пік $19k)', year: '2017', asset: 'Bitcoin', amount: 10000, result: 55000, note: 'Купили на піку — все одно x5.5 за 8 років (з -83% по дорозі)' },
  { icon: '💎', title: 'Bitcoin на дні 2022 ($16k)', year: '2022', asset: 'Bitcoin', amount: 10000, result: 62500, note: 'Купили на дні — x6.25 за 3 роки' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<number, string> = {
  1: '#22c55e',
  2: '#84cc16',
  3: '#eab308',
  4: '#f97316',
  5: '#ef4444',
}

const RISK_LABELS: Record<number, string> = {
  1: 'Мінімальний',
  2: 'Низький',
  3: 'Середній',
  4: 'Високий',
  5: 'Екстремальний',
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: number }) {
  return (
    <span style={{
      fontSize: '11px',
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: '4px',
      background: RISK_COLORS[level] + '22',
      color: RISK_COLORS[level],
      border: `1px solid ${RISK_COLORS[level]}44`,
      letterSpacing: '0.04em',
    }}>
      {RISK_LABELS[level]}
    </span>
  )
}

function Section({ title }: { title: string }) {
  return (
    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px', marginTop: '16px' }}>
      {title}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

type Tab = 'assets' | 'accounts' | 'calculator' | 'psychology'

export default function FinanceClient() {
  const [tab, setTab] = useState<Tab>('assets')
  const [openId, setOpenId] = useState<string | null>(null)

  // Calculator state
  const [principal, setPrincipal] = useState(20000)
  const [monthly, setMonthly] = useState(500)
  const [rate, setRate] = useState(9)
  const [years, setYears] = useState(10)

  const chartData = useMemo(() => {
    const data = []
    let balance = principal
    const mr = rate / 100 / 12
    for (let y = 1; y <= years; y++) {
      for (let m = 0; m < 12; m++) balance = balance * (1 + mr) + monthly
      const contributed = principal + monthly * 12 * y
      data.push({
        year: `${y}р`,
        'Загальна сума': Math.round(balance),
        'Вкладено': Math.round(contributed),
      })
    }
    return data
  }, [principal, monthly, rate, years])

  const finalValue = chartData[chartData.length - 1]?.['Загальна сума'] ?? 0
  const totalContributed = principal + monthly * 12 * years
  const totalEarnings = finalValue - totalContributed

  const TABS: { id: Tab; label: string }[] = [
    { id: 'assets', label: '📊 Активи' },
    { id: 'accounts', label: '🏦 Рахунки' },
    { id: 'calculator', label: '🧮 Калькулятор' },
    { id: 'psychology', label: '🧠 Психологія' },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>
          💰 ФІНАНСОВА БАЗА ЗНАНЬ
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '6px 0 0' }}>
          Активи, рахунки, калькулятори і психологія інвестора
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setOpenId(null) }}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: tab === t.id ? 'var(--accent)' : 'var(--bg2)',
              color: tab === t.id ? '#fff' : 'var(--muted)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ASSETS TAB ── */}
      {tab === 'assets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {ASSETS.map(asset => {
            const open = openId === asset.id
            return (
              <div key={asset.id} style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--bg2)' }}>
                {/* Card header */}
                <button
                  onClick={() => setOpenId(open ? null : asset.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: '24px', flexShrink: 0 }}>{asset.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>{asset.name}</span>
                      <RiskBadge level={asset.riskLevel} />
                      <span style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--bg)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                        {asset.horizon}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px' }}>{asset.tagline}</div>
                  </div>
                  <span style={{ color: 'var(--muted)', fontSize: '16px', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
                </button>

                {/* Expanded content */}
                {open && (
                  <div style={{ padding: '0 16px 18px', borderTop: '1px solid var(--border)' }}>
                    <Section title="Історія" />
                    <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>{asset.history}</p>

                    <Section title="Як це працює" />
                    <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>{asset.howItWorks}</p>

                    <Section title="Ризики" />
                    <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {asset.risks.map((r, i) => (
                        <li key={i} style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5 }}>{r}</li>
                      ))}
                    </ul>

                    <Section title="Статистика" />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                      {asset.stats.map((s, i) => (
                        <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{s.label}</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)' }}>{s.value}</div>
                        </div>
                      ))}
                    </div>

                    <Section title="Як інвестувати" />
                    <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>{asset.howToInvest}</p>

                    {asset.tickers && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                        {asset.tickers.map(t => (
                          <span key={t} style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', background: 'var(--accent)22', color: 'var(--accent)', border: '1px solid var(--accent)44', borderRadius: '6px' }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    <div style={{ marginTop: '14px', padding: '12px', background: 'var(--accent)11', border: '1px solid var(--accent)33', borderRadius: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em' }}>💡 ПРО-ПОРАДА  </span>
                      <span style={{ fontSize: '13px', color: 'var(--text)' }}>{asset.tip}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── ACCOUNTS TAB ── */}
      {tab === 'accounts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {ACCOUNTS.map(acc => {
            const open = openId === acc.id
            return (
              <div key={acc.id} style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--bg2)' }}>
                <button
                  onClick={() => setOpenId(open ? null : acc.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontSize: '24px', flexShrink: 0 }}>{acc.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>{acc.name}</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: acc.tagColor + '22', color: acc.tagColor, border: `1px solid ${acc.tagColor}44` }}>
                        {acc.tag}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px' }}>{acc.fullName} · ліміт {acc.limit}</div>
                  </div>
                  <span style={{ color: 'var(--muted)', fontSize: '16px', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
                </button>

                {open && (
                  <div style={{ padding: '0 16px 18px', borderTop: '1px solid var(--border)' }}>
                    <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, margin: '14px 0 0' }}>{acc.description}</p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '14px' }}>
                      <div style={{ background: '#22c55e11', border: '1px solid #22c55e33', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#22c55e', marginBottom: '8px', letterSpacing: '0.04em' }}>✓ ПЕРЕВАГИ</div>
                        {acc.pros.map((p, i) => <div key={i} style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '5px', lineHeight: 1.5 }}>• {p}</div>)}
                      </div>
                      <div style={{ background: '#ef444411', border: '1px solid #ef444433', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444', marginBottom: '8px', letterSpacing: '0.04em' }}>✗ НЕДОЛІКИ</div>
                        {acc.cons.map((c, i) => <div key={i} style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '5px', lineHeight: 1.5 }}>• {c}</div>)}
                      </div>
                    </div>

                    <div style={{ marginTop: '12px', padding: '12px', background: 'var(--accent)11', border: '1px solid var(--accent)33', borderRadius: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em' }}>🎯 ПІДХОДИТЬ ДЛЯ  </span>
                      <span style={{ fontSize: '13px', color: 'var(--text)' }}>{acc.bestFor}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── CALCULATOR TAB ── */}
      {tab === 'calculator' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Compound Interest */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>📈 Калькулятор складного відсотка</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              {[
                { label: 'Початкова сума ($)', value: principal, set: setPrincipal, min: 0, max: 1000000, step: 1000 },
                { label: 'Щомісячний внесок ($)', value: monthly, set: setMonthly, min: 0, max: 10000, step: 100 },
                { label: 'Річна дохідність (%)', value: rate, set: setRate, min: 1, max: 20, step: 0.5 },
                { label: 'Горизонт (роки)', value: years, set: setYears, min: 1, max: 40, step: 1 },
              ].map(({ label, value, set, min, max, step }) => (
                <div key={label}>
                  <label style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>{label}</label>
                  <input
                    type="number"
                    value={value}
                    min={min}
                    max={max}
                    step={step}
                    onChange={e => set(Number(e.target.value))}
                    style={{
                      width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)',
                      borderRadius: '8px', color: 'var(--text)', fontSize: '14px', fontWeight: 600,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Result cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
              {[
                { label: 'Підсумкова сума', value: fmt(finalValue), color: 'var(--accent)' },
                { label: 'Всього вкладено', value: fmt(totalContributed), color: 'var(--text)' },
                { label: 'Заробіток (складний %)', value: fmt(totalEarnings), color: '#22c55e' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>{label}</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Chart */}
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6b7280" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6b7280" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <Tooltip
                  formatter={(v: unknown) => [fmt(v as number)]}
                  contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="Загальна сума" stroke="var(--accent)" fill="url(#grad1)" strokeWidth={2} />
                <Area type="monotone" dataKey="Вкладено" stroke="#6b7280" fill="url(#grad2)" strokeWidth={1.5} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* What-If Scenarios */}
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>🔮 Що якби... (реальна статистика)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
              {SCENARIOS.map((s, i) => (
                <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '20px' }}>{s.icon}</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{s.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{s.year} · {s.asset}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Вклали</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{fmt(s.amount)}</div>
                    </div>
                    <div style={{ fontSize: '20px', color: 'var(--muted)' }}>→</div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Зараз</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)' }}>{fmt(s.result)}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Ріст</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#22c55e' }}>×{(s.result / s.amount).toFixed(1)}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>{s.note}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── PSYCHOLOGY TAB ── */}
      {tab === 'psychology' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 12px' }}>
            Найбільший ворог інвестора — не ринок, а власна психологія. Ось 6 упереджень що коштують людям мільйони.
          </p>
          {BIASES.map(b => {
            const open = openId === b.id
            return (
              <div key={b.id} style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--bg2)' }}>
                <button
                  onClick={() => setOpenId(open ? null : b.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontSize: '28px', flexShrink: 0 }}>{b.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>{b.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{b.ua}</div>
                  </div>
                  <span style={{ color: 'var(--muted)', fontSize: '16px' }}>{open ? '▲' : '▼'}</span>
                </button>
                {open && (
                  <div style={{ padding: '0 16px 18px', borderTop: '1px solid var(--border)' }}>
                    <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, margin: '14px 0 0' }}>{b.description}</p>

                    <Section title="Реальний приклад" />
                    <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>{b.example}</p>

                    <Section title="Як виправити" />
                    <div style={{ padding: '12px', background: '#22c55e11', border: '1px solid #22c55e33', borderRadius: '8px' }}>
                      <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>{b.fix}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
