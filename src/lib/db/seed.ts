/**
 * Fictional demo dataset, ported from the former SQL seed and demo setup script. Everything is
 * built in memory relative to "now" in Tashkent: reference data, three partner organizations,
 * nine venues (one draft), activities with a two-week schedule, sample plans, demo accounts with
 * active/expired/revoked memberships, bookings (upcoming, attended, a no-show, a full session),
 * a paid demo order, notifications and audit entries.
 *
 * Ids are deterministic so links keep working across server instances, which each hold their
 * own copy of the data.
 */
import { addDays, isoWeekday, localDateString, zonedTimeToUtc } from "@/lib/time";
import { SEED_IMAGE_MARKER } from "@/lib/storage";
import { DEMO_ACCOUNTS } from "./demo-accounts";
import { type Actor, addMinutes, audit, bookingNoticeParams, insertBooking, insertRow, minIso } from "./core";
import type { Json } from "./database.types";
import { fixed, uuidFrom } from "./ids";
import type { Row, Tables } from "./query";

export const TZ = "Asia/Tashkent";
export const SESSION_DAYS_BACK = 3;
export const SESSION_DAYS_AHEAD = 13;
const DEMO_CANCEL_REASON = "Demo: instructor unavailable";

const L = (uz: string, ru: string, en: string): Json => ({ uz, ru, en });

export const ids = {
  city: fixed("c1", 1),
  district: (n: number) => fixed("d1", n),
  category: (n: number) => fixed("ca", n),
  amenity: (n: number) => fixed("a1", n),
  org: (n: number) => fixed("0a", n),
  venue: (n: number) => fixed("e1", n),
  activity: (n: number) => fixed("ac", n),
  plan: (n: number) => fixed("b1", n),
  planVersion: (n: number) => fixed("b2", n),
  user: (key: string) => uuidFrom(`uzfit:user:${key}`),
  membership: (key: string) => uuidFrom(`uzfit:membership:${key}`),
  order: (key: string) => uuidFrom(`uzfit:order:${key}`),
  image: (venue: number, index: number) =>
    `${SEED_IMAGE_MARKER}0000-0000-4000-8000-${String(venue * 10 + index).padStart(12, "0")}`,
};

export function seedImagePath(venue: number, index: number): string {
  return `venues/${ids.venue(venue)}/${ids.image(venue, index)}.webp`;
}

const SYSTEM: Actor = { uid: null, aal: "aal1", role: "service_role", requestId: null };
const actorFor = (uid: string): Actor => ({ uid, aal: "aal1", role: "authenticated", requestId: null });

/* ---------- reference data ---------- */

const DISTRICTS: Array<[string, Json]> = [
  ["bektemir", L("Bektemir", "Бектемир", "Bektemir")],
  ["chilonzor", L("Chilonzor", "Чиланзар", "Chilanzar")],
  ["mirobod", L("Mirobod", "Мирабад", "Mirabad")],
  ["mirzo-ulugbek", L("Mirzo Ulugʻbek", "Мирзо-Улугбек", "Mirzo Ulugbek")],
  ["olmazor", L("Olmazor", "Алмазар", "Almazar")],
  ["sergeli", L("Sergeli", "Сергели", "Sergeli")],
  ["shayxontohur", L("Shayxontohur", "Шайхантахур", "Shaykhantakhur")],
  ["uchtepa", L("Uchtepa", "Учтепа", "Uchtepa")],
  ["yakkasaroy", L("Yakkasaroy", "Яккасарай", "Yakkasaray")],
  ["yashnobod", L("Yashnobod", "Яшнабад", "Yashnabad")],
  ["yangihayot", L("Yangihayot", "Янгихаёт", "Yangihayot")],
  ["yunusobod", L("Yunusobod", "Юнусабад", "Yunusabad")],
];

const CATEGORIES: Array<[string, Json, string]> = [
  ["gym", L("Trenajyor zali", "Тренажёрный зал", "Gym"), "dumbbell"],
  ["yoga", L("Yoga", "Йога", "Yoga"), "flower"],
  ["swimming", L("Suzish", "Плавание", "Swimming"), "waves"],
  ["boxing", L("Boks va yakkakurash", "Бокс и единоборства", "Boxing & martial arts"), "swords"],
  ["dance", L("Raqs", "Танцы", "Dance"), "music"],
  ["functional", L("Funksional mashgʻulot", "Функциональный тренинг", "Functional training"), "activity"],
];

const AMENITIES: Array<[string, Json, string]> = [
  ["showers", L("Dush", "Душ", "Showers"), "shower-head"],
  ["lockers", L("Kiyim shkaflari", "Шкафчики", "Lockers"), "lock"],
  ["parking", L("Avtoturargoh", "Парковка", "Parking"), "car"],
  ["towels", L("Sochiq", "Полотенца", "Towels"), "shirt"],
  ["sauna", L("Sauna", "Сауна", "Sauna"), "flame"],
  ["wifi", L("Wi-Fi", "Wi-Fi", "Wi-Fi"), "wifi"],
  ["water", L("Ichimlik suvi", "Питьевая вода", "Drinking water"), "glass-water"],
  ["step-free", L("Toʻsiqsiz kirish", "Доступный вход", "Step-free access"), "accessibility"],
];

const ORGANIZATIONS = ["Demo Sport Group", "Demo Wellness Studios", "Demo Aqua Club"];

interface VenueSeed {
  n: number;
  org: number;
  slug: string;
  name: Json;
  description: Json;
  address: Json;
  rules: Json;
  district: number;
  lat: number;
  lng: number;
  phone: string | null;
  published: boolean;
  categories: number[];
  amenities: string[];
  hours: { opens: string; closes: string; sunday: [string, string] | null };
}

const VENUES: VenueSeed[] = [
  {
    n: 1,
    org: 1,
    slug: "olmos-fitness-yunusobod",
    name: L("Olmos Fitness Yunusobod", "Olmos Fitness Юнусабад", "Olmos Fitness Yunusabad"),
    description: L(
      "Zamonaviy trenajyorlar, erkin ogʻirliklar zonasi va kichik guruhlarda funksional mashgʻulotlar.",
      "Современные тренажёры, зона свободных весов и функциональные тренировки в малых группах.",
      "Modern machines, a free-weights area, and small-group functional training.",
    ),
    address: L(
      "Yunusobod tumani, Namuna koʻchasi, 12",
      "Юнусабадский район, ул. Намуна, 12",
      "12 Namuna Street, Yunusabad",
    ),
    rules: L(
      "Toza sport poyabzali va sochiq olib keling. Kirishda UzFit QR-kodingizni koʻrsating.",
      "Приходите в чистой спортивной обуви и с полотенцем. Покажите QR-код UzFit на ресепшене.",
      "Bring clean indoor shoes and a towel. Show your UzFit QR code at reception.",
    ),
    district: 12,
    lat: 41.3656,
    lng: 69.2891,
    phone: "+998711000001",
    published: true,
    categories: [1, 6],
    amenities: ["showers", "lockers", "parking", "wifi", "water"],
    hours: { opens: "07:00", closes: "23:00", sunday: ["09:00", "21:00"] },
  },
  {
    n: 2,
    org: 1,
    slug: "olmos-fitness-chilonzor",
    name: L("Olmos Fitness Chilonzor", "Olmos Fitness Чиланзар", "Olmos Fitness Chilanzar"),
    description: L(
      "Katta zal, boks ringi va har kuni ochiq trenajyor zali.",
      "Просторный зал, боксёрский ринг и ежедневный открытый тренажёрный зал.",
      "A spacious hall, a boxing ring, and open gym access every day.",
    ),
    address: L(
      "Chilonzor tumani, Namuna koʻchasi, 34",
      "Чиланзарский район, ул. Намуна, 34",
      "34 Namuna Street, Chilanzar",
    ),
    rules: L(
      "Mashgʻulotdan 10 daqiqa oldin keling. Boks qoʻlqoplarini oʻzingiz bilan olib keling.",
      "Приходите за 10 минут до занятия. Боксёрские перчатки — свои.",
      "Arrive 10 minutes before class. Bring your own boxing gloves.",
    ),
    district: 2,
    lat: 41.2756,
    lng: 69.2034,
    phone: "+998711000002",
    published: true,
    categories: [1, 4],
    amenities: ["showers", "lockers", "sauna", "water"],
    hours: { opens: "07:00", closes: "23:00", sunday: ["09:00", "21:00"] },
  },
  {
    n: 3,
    org: 1,
    slug: "temir-gym",
    name: L("Temir Gym", "Temir Gym", "Temir Gym"),
    description: L(
      "Kuch mashqlari uchun jihozlangan zal va murabbiy bilan kichik guruhlar.",
      "Зал для силовых тренировок и малые группы с тренером.",
      "A strength-focused gym with coached small groups.",
    ),
    address: L(
      "Mirzo Ulugʻbek tumani, Namuna koʻchasi, 5",
      "Мирзо-Улугбекский район, ул. Намуна, 5",
      "5 Namuna Street, Mirzo Ulugbek",
    ),
    rules: L(
      "Jihozlarni ishlatgandan keyin joyiga qoʻying.",
      "Возвращайте оборудование на место после использования.",
      "Return equipment after use.",
    ),
    district: 4,
    lat: 41.3264,
    lng: 69.335,
    phone: null,
    published: true,
    categories: [1],
    amenities: ["showers", "lockers", "water"],
    hours: { opens: "07:00", closes: "22:00", sunday: ["09:00", "20:00"] },
  },
  {
    n: 4,
    org: 1,
    slug: "zarb-boxing-club",
    name: L("Zarb Boxing Club", "Zarb Boxing Club", "Zarb Boxing Club"),
    description: L(
      "Boks va kikboksing boʻyicha guruh mashgʻulotlari, boshlovchilar uchun ham.",
      "Групповые занятия боксом и кикбоксингом, в том числе для начинающих.",
      "Boxing and kickboxing group classes, including beginner-friendly sessions.",
    ),
    address: L(
      "Yakkasaroy tumani, Namuna koʻchasi, 21",
      "Яккасарайский район, ул. Намуна, 21",
      "21 Namuna Street, Yakkasaray",
    ),
    rules: L(
      "Himoya vositalari majburiy. Mashgʻulot boshlanganidan keyin kirish mumkin emas.",
      "Защитная экипировка обязательна. После начала занятия вход закрыт.",
      "Protective gear is required. No entry after class starts.",
    ),
    district: 9,
    lat: 41.2872,
    lng: 69.2637,
    phone: null,
    published: true,
    categories: [4, 6],
    amenities: ["showers", "lockers", "water"],
    hours: { opens: "09:00", closes: "22:00", sunday: null },
  },
  {
    n: 5,
    org: 2,
    slug: "nafas-yoga-studio",
    name: L("Nafas Yoga Studio", "Nafas Yoga Studio", "Nafas Yoga Studio"),
    description: L(
      "Tinch muhitdagi yoga studiyasi: hatha yoga va kechki choʻzilish mashgʻulotlari.",
      "Спокойная студия йоги: хатха-йога и вечерняя растяжка.",
      "A calm yoga studio offering hatha yoga and evening stretch classes.",
    ),
    address: L("Mirobod tumani, Namuna koʻchasi, 8", "Мирабадский район, ул. Намуна, 8", "8 Namuna Street, Mirabad"),
    rules: L(
      "Gilamchalar beriladi. Iltimos, telefoningizni ovozsiz rejimga oʻtkazing.",
      "Коврики предоставляются. Пожалуйста, выключите звук телефона.",
      "Mats are provided. Please silence your phone.",
    ),
    district: 3,
    lat: 41.293,
    lng: 69.28,
    phone: "+998711000005",
    published: true,
    categories: [2],
    amenities: ["showers", "towels", "wifi", "water", "step-free"],
    hours: { opens: "08:00", closes: "21:30", sunday: ["08:00", "21:30"] },
  },
  {
    n: 6,
    org: 2,
    slug: "ritm-dance-studio",
    name: L("Ritm Dance Studio", "Ritm Dance Studio", "Ritm Dance Studio"),
    description: L(
      "Lotin raqslari va zamonaviy raqs boʻyicha kechki guruhlar.",
      "Вечерние группы латиноамериканских и современных танцев.",
      "Evening groups for Latin and contemporary dance.",
    ),
    address: L(
      "Shayxontohur tumani, Namuna koʻchasi, 17",
      "Шайхантахурский район, ул. Намуна, 17",
      "17 Namuna Street, Shaykhantakhur",
    ),
    rules: L("Almashtiriladigan poyabzal kerak.", "Нужна сменная обувь.", "Bring a change of shoes."),
    district: 7,
    lat: 41.323,
    lng: 69.235,
    phone: null,
    published: true,
    categories: [5, 2],
    amenities: ["lockers", "wifi", "water"],
    hours: { opens: "10:00", closes: "22:00", sunday: null },
  },
  {
    n: 7,
    org: 2,
    slug: "chaqqon-functional-lab",
    name: L("Chaqqon Functional Lab", "Chaqqon Functional Lab", "Chaqqon Functional Lab"),
    description: L(
      "Funksional tayyorgarlik, intervalli mashgʻulotlar va ochiq zal.",
      "Функциональная подготовка, интервальные тренировки и открытый зал.",
      "Functional conditioning, interval classes, and open gym time.",
    ),
    address: L(
      "Yashnobod tumani, Namuna koʻchasi, 40",
      "Яшнабадский район, ул. Намуна, 40",
      "40 Namuna Street, Yashnabad",
    ),
    rules: L(
      "Suv idishi olib keling. Kechikkanlar isinishni mustaqil bajaradi.",
      "Возьмите бутылку воды. Опоздавшие разминаются самостоятельно.",
      "Bring a water bottle. Late arrivals warm up on their own.",
    ),
    district: 10,
    lat: 41.29,
    lng: 69.34,
    phone: null,
    published: true,
    categories: [6, 1],
    amenities: ["showers", "lockers", "parking", "water"],
    hours: { opens: "07:00", closes: "22:00", sunday: ["07:00", "22:00"] },
  },
  {
    n: 8,
    org: 3,
    slug: "moviy-suv-aqua-center",
    name: L("Moviy Suv Aqua Center", "Moviy Suv Aqua Center", "Moviy Suv Aqua Center"),
    description: L(
      "25 metrli basseyn: erkin suzish va akva-aerobika.",
      "25-метровый бассейн: свободное плавание и аквааэробика.",
      "A 25-metre pool with open swim lanes and aqua aerobics.",
    ),
    address: L("Olmazor tumani, Namuna koʻchasi, 3", "Алмазарский район, ул. Намуна, 3", "3 Namuna Street, Almazar"),
    rules: L(
      "Suzish qalpogʻi majburiy. Basseynga kirishdan oldin dush qabul qiling.",
      "Шапочка для плавания обязательна. Перед бассейном примите душ.",
      "A swim cap is required. Shower before entering the pool.",
    ),
    district: 5,
    lat: 41.345,
    lng: 69.215,
    phone: "+998711000008",
    published: true,
    categories: [3],
    amenities: ["showers", "lockers", "towels", "sauna", "parking", "step-free"],
    hours: { opens: "07:00", closes: "22:00", sunday: ["07:00", "22:00"] },
  },
  {
    n: 9,
    org: 1,
    slug: "yangi-kuch-gym",
    name: L("Yangi Kuch Gym (qoralama)", "Yangi Kuch Gym (черновик)", "Yangi Kuch Gym (draft)"),
    description: L("Tez orada ochiladi.", "Скоро открытие.", "Opening soon."),
    address: L(
      "Sergeli tumani, Namuna koʻchasi, 50",
      "Сергелийский район, ул. Намуна, 50",
      "50 Namuna Street, Sergeli",
    ),
    rules: { uz: "" },
    district: 6,
    lat: 41.227,
    lng: 69.22,
    phone: null,
    published: false,
    categories: [1],
    amenities: ["showers"],
    hours: { opens: "08:00", closes: "22:00", sunday: ["10:00", "20:00"] },
  },
];

interface ActivitySeed {
  n: number;
  venue: number;
  category: number;
  kind: "class" | "open_gym";
  title: Json;
  description: Json;
  duration: number;
  capacity: number;
}

const OPEN_GYM = {
  title: L("Ochiq zal", "Открытый зал", "Open gym"),
  description: L(
    "Trenajyor zalida erkin mashgʻulot.",
    "Свободная тренировка в тренажёрном зале.",
    "Self-guided training in the gym.",
  ),
};

const ACTIVITIES: ActivitySeed[] = [
  { n: 1, venue: 1, category: 1, kind: "open_gym", ...OPEN_GYM, duration: 120, capacity: 25 },
  {
    n: 2,
    venue: 1,
    category: 6,
    kind: "class",
    title: L("Funksional aylana", "Функциональный круг", "Functional circuit"),
    description: L(
      "Murabbiy bilan 60 daqiqalik aylana mashqlar.",
      "60-минутная круговая тренировка с тренером.",
      "A 60-minute coached circuit workout.",
    ),
    duration: 60,
    capacity: 12,
  },
  { n: 3, venue: 2, category: 1, kind: "open_gym", ...OPEN_GYM, duration: 120, capacity: 30 },
  {
    n: 4,
    venue: 2,
    category: 4,
    kind: "class",
    title: L("Boks asoslari", "Основы бокса", "Boxing basics"),
    description: L(
      "Boshlovchilar uchun texnika va harakatlar.",
      "Техника и передвижение для начинающих.",
      "Technique and footwork for beginners.",
    ),
    duration: 60,
    capacity: 10,
  },
  { n: 5, venue: 3, category: 1, kind: "open_gym", ...OPEN_GYM, duration: 120, capacity: 20 },
  {
    n: 6,
    venue: 3,
    category: 1,
    kind: "class",
    title: L("Kuch mashgʻuloti", "Силовая тренировка", "Strength class"),
    description: L(
      "Asosiy kuch mashqlari murabbiy nazoratida.",
      "Базовые силовые упражнения под контролем тренера.",
      "Foundational lifts under a coach's supervision.",
    ),
    duration: 60,
    capacity: 8,
  },
  {
    n: 7,
    venue: 4,
    category: 4,
    kind: "class",
    title: L("Boks texnikasi", "Техника бокса", "Boxing technique"),
    description: L(
      "Zarbalar, himoya va sparring mashqlari.",
      "Удары, защита и упражнения в парах.",
      "Punches, defence, and partner drills.",
    ),
    duration: 90,
    capacity: 12,
  },
  {
    n: 8,
    venue: 4,
    category: 4,
    kind: "class",
    title: L("Kikboksing", "Кикбоксинг", "Kickboxing"),
    description: L(
      "Qoʻl va oyoq zarbalari kombinatsiyalari.",
      "Комбинации ударов руками и ногами.",
      "Punch and kick combinations.",
    ),
    duration: 60,
    capacity: 12,
  },
  {
    n: 9,
    venue: 5,
    category: 2,
    kind: "class",
    title: L("Hatha yoga", "Хатха-йога", "Hatha yoga"),
    description: L(
      "Barcha darajalar uchun sokin yoga mashgʻuloti.",
      "Спокойная практика для любого уровня.",
      "A calm practice for all levels.",
    ),
    duration: 75,
    capacity: 14,
  },
  {
    n: 10,
    venue: 5,
    category: 2,
    kind: "class",
    title: L("Kechki choʻzilish", "Вечерняя растяжка", "Evening stretch"),
    description: L(
      "Kun oxirida mushaklarni boʻshashtirish.",
      "Расслабление мышц в конце дня.",
      "Release tension at the end of the day.",
    ),
    duration: 60,
    capacity: 14,
  },
  {
    n: 11,
    venue: 6,
    category: 5,
    kind: "class",
    title: L("Lotin raqslari", "Латина", "Latin dance"),
    description: L("Salsa va bachata asoslari.", "Основы сальсы и бачаты.", "Salsa and bachata basics."),
    duration: 60,
    capacity: 16,
  },
  {
    n: 12,
    venue: 6,
    category: 5,
    kind: "class",
    title: L("Zamonaviy raqs", "Современный танец", "Contemporary dance"),
    description: L(
      "Erkin harakat va choreografiya.",
      "Свободное движение и хореография.",
      "Free movement and choreography.",
    ),
    duration: 60,
    capacity: 12,
  },
  {
    n: 13,
    venue: 7,
    category: 6,
    kind: "class",
    title: L("Kross-trening", "Кросс-тренинг", "Cross-training"),
    description: L(
      "Intervalli yuqori intensivlikdagi mashgʻulot.",
      "Интервальная тренировка высокой интенсивности.",
      "High-intensity interval training.",
    ),
    duration: 60,
    capacity: 12,
  },
  { n: 14, venue: 7, category: 1, kind: "open_gym", ...OPEN_GYM, duration: 120, capacity: 20 },
  {
    n: 15,
    venue: 8,
    category: 3,
    kind: "open_gym",
    title: L("Erkin suzish", "Свободное плавание", "Open swim"),
    description: L(
      "Basseyn yoʻlaklarida erkin suzish.",
      "Свободное плавание по дорожкам.",
      "Lane swimming at your own pace.",
    ),
    duration: 60,
    capacity: 20,
  },
  {
    n: 16,
    venue: 8,
    category: 3,
    kind: "class",
    title: L("Akva-aerobika", "Аквааэробика", "Aqua aerobics"),
    description: L("Suvdagi yengil kardio mashgʻuloti.", "Лёгкое кардио в воде.", "Low-impact cardio in the water."),
    duration: 45,
    capacity: 15,
  },
  {
    n: 17,
    venue: 9,
    category: 1,
    kind: "open_gym",
    title: OPEN_GYM.title,
    description: { uz: "" },
    duration: 120,
    capacity: 20,
  },
];

/** (activity, local start times, ISO weekdays; empty = every day) */
const SCHEDULE: Array<[number, string[], number[]]> = [
  [1, ["09:00", "12:00", "15:00", "18:00"], []],
  [2, ["19:30"], []],
  [2, ["08:00"], [2, 4, 6]],
  [3, ["09:00", "12:00", "15:00", "18:00"], []],
  [4, ["18:30"], [1, 3, 5]],
  [5, ["10:00", "14:00", "17:30"], []],
  [6, ["18:00"], [2, 4, 6]],
  [7, ["10:00", "19:00"], [1, 2, 3, 4, 5, 6]],
  [8, ["17:00"], [2, 4]],
  [9, ["08:30", "18:00"], []],
  [10, ["20:00"], []],
  [11, ["19:00"], [1, 2, 3, 4, 5, 6]],
  [12, ["17:30"], [2, 4, 6]],
  [13, ["07:30", "19:00"], []],
  [14, ["10:00", "14:00"], []],
  [15, ["07:00", "09:00", "12:00", "15:00", "18:00", "20:00"], []],
  [16, ["11:00"], [1, 3, 5]],
  [17, ["10:00"], []],
];

interface PlanVersionSeed {
  n: number;
  plan: number;
  version: number;
  name: Json;
  description: Json;
  price: number;
  allowance: number;
  venues: number[];
  status: "published" | "retired";
}

const PLAN_VERSIONS: PlanVersionSeed[] = [
  {
    n: 1,
    plan: 1,
    version: 1,
    name: L("Start", "Start", "Start"),
    description: L(
      "Tanlangan demo maskanlarda oyiga 8 ta tashrif.",
      "8 посещений в месяц в выбранных демо-залах.",
      "8 visits a month at selected demo venues.",
    ),
    price: 27_900_000,
    allowance: 8,
    venues: [1, 3, 5],
    status: "retired",
  },
  {
    n: 2,
    plan: 1,
    version: 2,
    name: L("Start", "Start", "Start"),
    description: L(
      "Tanlangan demo maskanlarda oyiga 8 ta tashrif.",
      "8 посещений в месяц в выбранных демо-залах.",
      "8 visits a month at selected demo venues.",
    ),
    price: 29_900_000,
    allowance: 8,
    venues: [1, 3, 5, 7],
    status: "published",
  },
  {
    n: 3,
    plan: 2,
    version: 1,
    name: L("Active", "Active", "Active"),
    description: L(
      "Kengroq demo maskanlar tanlovida oyiga 16 ta tashrif.",
      "16 посещений в месяц в расширенной подборке демо-залов.",
      "16 visits a month across a broader selection of demo venues.",
    ),
    price: 49_900_000,
    allowance: 16,
    venues: [1, 2, 3, 5, 6, 7],
    status: "published",
  },
  {
    n: 4,
    plan: 3,
    version: 1,
    name: L("Max", "Max", "Max"),
    description: L(
      "Barcha demo maskanlarda oyiga 30 ta tashrif.",
      "30 посещений в месяц во всех демо-залах.",
      "30 visits a month at every eligible demo venue.",
    ),
    price: 69_900_000,
    allowance: 30,
    venues: [1, 2, 3, 4, 5, 6, 7, 8],
    status: "published",
  },
];

const IMAGE_ALT = L("Demo rasm", "Демо-изображение", "Demo image");

/* ---------- builders ---------- */

const TABLE_NAMES = [
  "auth_users",
  "profiles",
  "account_statuses",
  "platform_roles",
  "organizations",
  "organization_members",
  "cities",
  "districts",
  "categories",
  "amenities",
  "venues",
  "venue_categories",
  "venue_amenities",
  "venue_images",
  "venue_opening_hours",
  "venue_revisions",
  "activities",
  "sessions",
  "plans",
  "plan_versions",
  "plan_version_venues",
  "orders",
  "payments",
  "payment_events",
  "memberships",
  "bookings",
  "checkin_tokens",
  "checkins",
  "favorites",
  "notifications",
  "audit_logs",
] as const;

export function emptyTables(): Tables {
  return Object.fromEntries(TABLE_NAMES.map((name) => [name, [] as Row[]]));
}

/** Adds the scheduled sessions for every local date in [from, to]; existing sessions are kept. */
export function extendSessions(
  tables: Tables,
  from: string,
  to: string,
  createdAt: string,
  cancelDate: string | null,
): void {
  const existing = new Set((tables.sessions ?? []).map((s) => String(s.id)));
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const weekday = isoWeekday(day);
    for (const [activityNumber, times, weekdays] of SCHEDULE) {
      if (weekdays.length > 0 && !weekdays.includes(weekday)) continue;
      const activity = tables.activities!.find((a) => a.id === ids.activity(activityNumber));
      if (!activity) continue;
      for (const time of times) {
        const id = uuidFrom(`uzfit:session:${activity.id}:${day}T${time}`);
        if (existing.has(id)) continue;
        existing.add(id);
        const startsAt = zonedTimeToUtc(day, time, TZ).toISOString();
        const cancelled = cancelDate === day && (activityNumber === 9 || activityNumber === 11);
        insertRow(tables, "sessions", {
          id,
          venue_id: activity.venue_id,
          activity_id: activity.id,
          starts_at: startsAt,
          ends_at: addMinutes(startsAt, Number(activity.duration_minutes)),
          capacity: activity.default_capacity,
          occupied_count: 0,
          status: cancelled ? "cancelled" : "scheduled",
          cancellation_reason: cancelled ? DEMO_CANCEL_REASON : null,
          cancelled_at: cancelled ? createdAt : null,
          cancelled_by: null,
          created_by: null,
          created_at: createdAt,
          updated_at: createdAt,
        });
      }
    }
  }
}

function policySnapshot(pv: Row, venue: Row): Json {
  return {
    plan_version_id: String(pv.id),
    free_cancellation_minutes: Number(pv.free_cancellation_minutes),
    checkin_opens_minutes: Number(pv.checkin_opens_minutes),
    checkin_closes_minutes: Number(pv.checkin_closes_minutes),
    daily_visit_limit: Number(pv.daily_visit_limit),
    max_future_bookings: Number(pv.max_future_bookings),
    timezone: String(venue.timezone),
  };
}

/** Builds the booking row the way create_booking does (snapshots and windows from the plan). */
export function bookingFields(
  uid: string,
  session: Row,
  membership: Row,
  pv: Row,
  venue: Row,
  idempotencyKey: string,
): Row {
  const startsAt = String(session.starts_at);
  const endsAt = String(session.ends_at);
  return {
    user_id: uid,
    session_id: session.id,
    membership_id: membership.id,
    venue_id: venue.id,
    local_date: localDateString(new Date(startsAt), String(venue.timezone)),
    session_starts_at: startsAt,
    session_ends_at: endsAt,
    cancellation_deadline: addMinutes(startsAt, -Number(pv.free_cancellation_minutes)),
    checkin_opens_at: addMinutes(startsAt, -Number(pv.checkin_opens_minutes)),
    checkin_closes_at: minIso(addMinutes(startsAt, Number(pv.checkin_closes_minutes)), endsAt),
    policy_snapshot: policySnapshot(pv, venue),
    idempotency_key: idempotencyKey,
  };
}

export function buildSeed(now: Date): { tables: Tables; generatedThrough: string } {
  const tables = emptyTables();
  const nowIso = now.toISOString();
  const daysAgo = (days: number, extraMinutes = 0) =>
    new Date(now.getTime() - days * 86_400_000 + extraMinutes * 60_000).toISOString();
  const today = localDateString(now, TZ);

  // Reference data
  insertRow(tables, "cities", {
    id: ids.city,
    slug: "tashkent",
    name: L("Toshkent", "Ташкент", "Tashkent"),
    timezone: TZ,
    is_active: true,
    sort_order: 1,
  });
  DISTRICTS.forEach(([slug, name], index) =>
    insertRow(tables, "districts", {
      id: ids.district(index + 1),
      city_id: ids.city,
      slug,
      name,
      sort_order: index + 1,
    }),
  );
  CATEGORIES.forEach(([slug, name, icon], index) =>
    insertRow(tables, "categories", { id: ids.category(index + 1), slug, name, icon, sort_order: index + 1 }),
  );
  AMENITIES.forEach(([slug, name, icon], index) =>
    insertRow(tables, "amenities", { id: ids.amenity(index + 1), slug, name, icon, sort_order: index + 1 }),
  );
  ORGANIZATIONS.forEach((name, index) =>
    insertRow(tables, "organizations", {
      id: ids.org(index + 1),
      name,
      status: "active",
      status_reason: null,
      is_demo: true,
      created_at: daysAgo(90),
      updated_at: daysAgo(90),
    }),
  );

  // Venues
  const amenityIdBySlug = new Map(AMENITIES.map(([slug], index) => [slug, ids.amenity(index + 1)]));
  for (const v of VENUES) {
    const name = v.name as Record<string, string>;
    insertRow(tables, "venues", {
      id: ids.venue(v.n),
      organization_id: ids.org(v.org),
      slug: v.slug,
      name: v.name,
      description: v.description,
      address: v.address,
      rules: v.rules,
      district_id: ids.district(v.district),
      latitude: v.lat,
      longitude: v.lng,
      timezone: TZ,
      contact_phone: v.phone,
      publication_status: v.published ? "published" : "draft",
      operational_status: "active",
      status_reason: null,
      is_demo: true,
      search_text: `${name.uz ?? ""} ${name.ru ?? ""} ${name.en ?? ""}`.toLowerCase(),
      published_at: v.published ? daysAgo(80) : null,
      created_at: daysAgo(85),
      updated_at: daysAgo(80),
    });
    for (const c of v.categories) {
      insertRow(tables, "venue_categories", { venue_id: ids.venue(v.n), category_id: ids.category(c) });
    }
    for (const slug of v.amenities) {
      insertRow(tables, "venue_amenities", { venue_id: ids.venue(v.n), amenity_id: amenityIdBySlug.get(slug) });
    }
    for (let weekday = 1; weekday <= 7; weekday++) {
      const sunday = weekday === 7;
      const closed = sunday && v.hours.sunday === null;
      insertRow(tables, "venue_opening_hours", {
        venue_id: ids.venue(v.n),
        weekday,
        opens_at: closed ? null : sunday ? v.hours.sunday![0] : v.hours.opens,
        closes_at: closed ? null : sunday ? v.hours.sunday![1] : v.hours.closes,
        is_closed: closed,
      });
    }
    const imageCount = v.published ? 2 : 1;
    for (let index = 0; index < imageCount; index++) {
      insertRow(tables, "venue_images", {
        id: uuidFrom(`uzfit:venue-image:${v.n}:${index}`),
        venue_id: ids.venue(v.n),
        storage_path: seedImagePath(v.n, index),
        alt: IMAGE_ALT,
        sort_order: index,
        created_at: daysAgo(80),
      });
    }
  }

  // Activities and sessions
  for (const a of ACTIVITIES) {
    insertRow(tables, "activities", {
      id: ids.activity(a.n),
      venue_id: ids.venue(a.venue),
      category_id: ids.category(a.category),
      kind: a.kind,
      title: a.title,
      description: a.description,
      duration_minutes: a.duration,
      default_capacity: a.capacity,
      is_active: true,
      created_at: daysAgo(80),
      updated_at: daysAgo(80),
    });
  }
  const generatedThrough = addDays(today, SESSION_DAYS_AHEAD);
  extendSessions(tables, addDays(today, -SESSION_DAYS_BACK), generatedThrough, daysAgo(14), addDays(today, 2));

  // Plans
  ["start", "active", "max"].forEach((code, index) =>
    insertRow(tables, "plans", {
      id: ids.plan(index + 1),
      code,
      sort_order: index + 1,
      is_active: true,
      created_at: daysAgo(90),
    }),
  );
  for (const pv of PLAN_VERSIONS) {
    insertRow(tables, "plan_versions", {
      id: ids.planVersion(pv.n),
      plan_id: ids.plan(pv.plan),
      version: pv.version,
      status: pv.status,
      name: pv.name,
      description: pv.description,
      price_minor: pv.price,
      currency: "UZS",
      duration_days: 30,
      visit_allowance: pv.allowance,
      daily_visit_limit: 1,
      max_future_bookings: 3,
      booking_window_days: 7,
      free_cancellation_minutes: 120,
      checkin_opens_minutes: 15,
      checkin_closes_minutes: 30,
      is_demo: true,
      published_at: pv.status === "retired" ? daysAgo(60) : daysAgo(20),
      retired_at: pv.status === "retired" ? daysAgo(20) : null,
      created_at: daysAgo(61),
      created_by: null,
    });
    for (const venue of pv.venues) {
      insertRow(tables, "plan_version_venues", { plan_version_id: ids.planVersion(pv.n), venue_id: ids.venue(venue) });
    }
  }

  // Demo accounts
  for (const account of DEMO_ACCOUNTS) {
    const uid = ids.user(account.key);
    insertRow(tables, "auth_users", {
      id: uid,
      email: account.email,
      email_confirmed_at: daysAgo(60),
      last_sign_in_at: null,
      raw_user_meta_data: { display_name: account.name, locale: account.locale },
      password_hash: null,
      is_demo: true,
      deleted_at: null,
      created_at: daysAgo(60),
    });
    insertRow(tables, "profiles", {
      id: uid,
      display_name: account.name,
      phone_e164: account.key === "member" ? "+998901234567" : null,
      locale: account.locale,
      anonymized_at: null,
      created_at: daysAgo(60),
      updated_at: daysAgo(60),
    });
    insertRow(tables, "account_statuses", {
      user_id: uid,
      status: "active",
      reason: null,
      updated_at: daysAgo(60),
      updated_by: null,
    });
  }
  const uid = (key: string) => ids.user(key);
  insertRow(tables, "platform_roles", {
    user_id: uid("admin"),
    role: "admin",
    created_at: daysAgo(60),
    created_by: null,
  });
  const staff: Array<[number, string, "manager" | "receptionist"]> = [
    [1, "partnerA", "manager"],
    [1, "receptionA", "receptionist"],
    [2, "partnerB", "manager"],
    [3, "partnerC", "manager"],
  ];
  for (const [org, key, role] of staff) {
    insertRow(tables, "organization_members", {
      organization_id: ids.org(org),
      user_id: uid(key),
      role,
      created_at: daysAgo(59),
      created_by: uid("admin"),
    });
  }

  // Memberships and payment history
  const membership = (key: string, planVersion: number, startDays: number, endDays: number, extra: Row = {}): Row =>
    insertRow(tables, "memberships", {
      id: ids.membership(key),
      user_id: uid(key),
      plan_version_id: ids.planVersion(planVersion),
      starts_at: daysAgo(startDays),
      ends_at: daysAgo(endDays),
      status: "active",
      source: "admin",
      order_id: null,
      is_demo: true,
      granted_by: uid("admin"),
      grant_reason: "Demo fixture",
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
      created_at: daysAgo(startDays),
      ...extra,
    });

  const paidOrder = insertRow(tables, "orders", {
    id: ids.order("member"),
    user_id: uid("member"),
    plan_version_id: ids.planVersion(3),
    amount_minor: 49_900_000,
    currency: "UZS",
    provider: "demo",
    is_demo: true,
    status: "paid",
    needs_reconciliation: false,
    reconciliation_note: null,
    expires_at: daysAgo(5, 30),
    paid_at: daysAgo(5, 2),
    failed_at: null,
    cancelled_at: null,
    refunded_at: null,
    refund_reference: null,
    created_at: daysAgo(5),
    updated_at: daysAgo(5, 2),
  });
  const paidPayment = insertRow(tables, "payments", {
    id: uuidFrom("uzfit:payment:member"),
    order_id: paidOrder.id,
    provider: "demo",
    provider_transaction_id: `demo_${uuidFrom("uzfit:txn:member")}`,
    amount_minor: 49_900_000,
    currency: "UZS",
    status: "succeeded",
    succeeded_at: daysAgo(5, 2),
    failed_at: null,
    refunded_at: null,
    created_at: daysAgo(5, 2),
    updated_at: daysAgo(5, 2),
  });
  insertRow(tables, "payment_events", {
    id: uuidFrom("uzfit:event:member"),
    provider: "demo",
    dedup_key: `event:${uuidFrom("uzfit:event-id:member")}`,
    event_type: "demo.payment.succeeded",
    order_id: paidOrder.id,
    payment_id: paidPayment.id,
    provider_transaction_id: paidPayment.provider_transaction_id,
    outcome: "processed",
    outcome_code: "MEMBERSHIP_ACTIVATED",
    safe_metadata: { demo: true },
    received_at: daysAgo(5, 2),
  });
  const memberMembership = membership("member", 3, 5, -25, {
    source: "demo",
    order_id: paidOrder.id,
    granted_by: null,
    grant_reason: null,
    created_at: daysAgo(5, 2),
  });
  membership("memberExpired", 1, 40, 10);
  membership("filler1", 4, 1, -29);
  membership("filler2", 4, 1, -29);
  membership("memberRevoked", 2, 3, -27, {
    status: "revoked",
    revoked_at: daysAgo(1),
    revoked_by: uid("admin"),
    revoke_reason: "Demo fixture: revoked membership",
  });

  const failedOrder = insertRow(tables, "orders", {
    id: ids.order("memberNew"),
    user_id: uid("memberNew"),
    plan_version_id: ids.planVersion(2),
    amount_minor: 29_900_000,
    currency: "UZS",
    provider: "demo",
    is_demo: true,
    status: "failed",
    needs_reconciliation: false,
    reconciliation_note: null,
    expires_at: daysAgo(2, 30),
    paid_at: null,
    failed_at: daysAgo(2, 1),
    cancelled_at: null,
    refunded_at: null,
    refund_reference: null,
    created_at: daysAgo(2),
    updated_at: daysAgo(2, 1),
  });
  const failedPayment = insertRow(tables, "payments", {
    id: uuidFrom("uzfit:payment:memberNew"),
    order_id: failedOrder.id,
    provider: "demo",
    provider_transaction_id: `demo_${uuidFrom("uzfit:txn:memberNew")}`,
    amount_minor: 29_900_000,
    currency: "UZS",
    status: "failed",
    succeeded_at: null,
    failed_at: daysAgo(2, 1),
    refunded_at: null,
    created_at: daysAgo(2, 1),
    updated_at: daysAgo(2, 1),
  });
  insertRow(tables, "payment_events", {
    id: uuidFrom("uzfit:event:memberNew"),
    provider: "demo",
    dedup_key: `event:${uuidFrom("uzfit:event-id:memberNew")}`,
    event_type: "demo.payment.failed",
    order_id: failedOrder.id,
    payment_id: failedPayment.id,
    provider_transaction_id: failedPayment.provider_transaction_id,
    outcome: "processed",
    outcome_code: "ORDER_FAILED",
    safe_metadata: { demo: true },
    received_at: daysAgo(2, 1),
  });

  // Bookings for the demo member
  const memberId = uid("member");
  const memberActor = actorFor(memberId);
  const activePv = tables.plan_versions!.find((p) => p.id === ids.planVersion(3))!;
  const venueRow = (n: number) => tables.venues!.find((v) => v.id === ids.venue(n))!;
  const upcoming = (venue: number, hoursAhead: number) =>
    tables
      .sessions!.filter(
        (s) =>
          s.venue_id === ids.venue(venue) &&
          s.status === "scheduled" &&
          String(s.starts_at) > new Date(now.getTime() + hoursAhead * 3_600_000).toISOString(),
      )
      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))[0];

  for (const [index, target] of [
    { venue: 1, hours: 20 },
    { venue: 5, hours: 44 },
  ].entries()) {
    const session = upcoming(target.venue, target.hours);
    if (!session) continue;
    const booking = insertBooking(tables, {
      id: uuidFrom(`uzfit:booking:member:upcoming:${index}`),
      ...bookingFields(
        memberId,
        session,
        memberMembership,
        activePv,
        venueRow(target.venue),
        uuidFrom(`uzfit:idem:${index}`),
      ),
      created_at: daysAgo(1, index * 7),
      updated_at: daysAgo(1, index * 7),
    });
    const notice = insertRow(tables, "notifications", {
      id: uuidFrom(`uzfit:notification:booking:${index}`),
      user_id: memberId,
      message_key: "booking_confirmed",
      params: bookingNoticeParams(tables, booking.id),
      created_at: daysAgo(1, index * 7),
      read_at: index === 0 ? daysAgo(0, -60) : null,
    });
    void notice;
    audit(tables, memberActor, "member", "booking.create", "booking", String(booking.id), null, null, null, {
      session_id: String(session.id),
      state: "confirmed",
      membership_id: String(memberMembership.id),
    });
  }

  // Attendance history: one session per past local day at venues 1 and 3
  const past = tables
    .sessions!.filter(
      (s) =>
        [ids.venue(1), ids.venue(3)].includes(String(s.venue_id)) &&
        s.status === "scheduled" &&
        String(s.ends_at) < nowIso &&
        String(s.starts_at) > daysAgo(4),
    )
    .sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at)));
  const perDay = new Map<string, Row>();
  for (const s of past) {
    const day = localDateString(new Date(String(s.starts_at)), TZ);
    if (!perDay.has(day)) perDay.set(day, s);
  }
  const receptionActor = actorFor(uid("receptionA"));
  [...perDay.values()].slice(0, 3).forEach((session, index) => {
    const state = index === 2 ? "no_show" : "checked_in";
    const startsAt = String(session.starts_at);
    const venue = tables.venues!.find((v) => v.id === session.venue_id)!;
    const booking = insertBooking(tables, {
      id: uuidFrom(`uzfit:booking:member:past:${index}`),
      ...bookingFields(memberId, session, memberMembership, activePv, venue, uuidFrom(`uzfit:idem:past:${index}`)),
      state,
      checked_in_at: state === "checked_in" ? addMinutes(startsAt, -5) : null,
      finalized_at: state === "no_show" ? session.ends_at : null,
      created_at: addMinutes(startsAt, -60 * 20),
      updated_at: state === "checked_in" ? addMinutes(startsAt, -5) : String(session.ends_at),
    });
    if (state === "checked_in") {
      insertRow(tables, "checkins", {
        id: uuidFrom(`uzfit:checkin:${index}`),
        booking_id: booking.id,
        venue_id: venue.id,
        checked_in_at: addMinutes(startsAt, -5),
        verified_by: uid("receptionA"),
        token_id: null,
        created_at: addMinutes(startsAt, -5),
      });
      insertRow(tables, "notifications", {
        id: uuidFrom(`uzfit:notification:checkin:${index}`),
        user_id: memberId,
        message_key: "checkin_completed",
        params: bookingNoticeParams(tables, booking.id),
        created_at: addMinutes(startsAt, -5),
        read_at: addMinutes(startsAt, 30),
      });
      audit(
        tables,
        receptionActor,
        "staff",
        "booking.check_in",
        "booking",
        String(booking.id),
        null,
        { state: "confirmed" },
        { state: "checked_in" },
        { venue_id: String(venue.id) },
      );
    } else {
      insertRow(tables, "notifications", {
        id: uuidFrom(`uzfit:notification:no-show:${index}`),
        user_id: memberId,
        message_key: "no_show_recorded",
        params: bookingNoticeParams(tables, booking.id),
        created_at: String(session.ends_at),
        read_at: null,
      });
      audit(tables, SYSTEM, "system", "booking.no_show_batch", "booking", null, null, null, null, { count: 1 });
    }
  });

  insertRow(tables, "notifications", {
    id: uuidFrom("uzfit:notification:membership"),
    user_id: memberId,
    message_key: "membership_activated",
    params: { membership_id: String(memberMembership.id), plan_name: activePv.name as Json, is_demo: true },
    created_at: daysAgo(5, 2),
    read_at: daysAgo(5, 1),
  });
  audit(tables, SYSTEM, "system", "membership.activate", "membership", String(memberMembership.id), null, null, null, {
    order_id: String(paidOrder.id),
    user_id: memberId,
    plan_version_id: String(activePv.id),
    source: "demo",
  });
  insertRow(tables, "notifications", {
    id: uuidFrom("uzfit:notification:revoked"),
    user_id: uid("memberRevoked"),
    message_key: "membership_revoked",
    params: { membership_id: ids.membership("memberRevoked"), released_bookings: 0 },
    created_at: daysAgo(1),
    read_at: null,
  });

  // A full session: a small class tomorrow at the boxing club, filled by two demo members
  const full = tables
    .sessions!.filter(
      (s) =>
        s.venue_id === ids.venue(4) &&
        s.activity_id === ids.activity(7) &&
        s.status === "scheduled" &&
        String(s.starts_at) > new Date(now.getTime() + 24 * 3_600_000).toISOString(),
    )
    .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))[0];
  if (full) {
    full.capacity = 2;
    const maxPv = tables.plan_versions!.find((p) => p.id === ids.planVersion(4))!;
    for (const key of ["filler1", "filler2"]) {
      const fillerMembership = tables.memberships!.find((m) => m.id === ids.membership(key))!;
      insertBooking(tables, {
        id: uuidFrom(`uzfit:booking:${key}:full`),
        ...bookingFields(uid(key), full, fillerMembership, maxPv, venueRow(4), uuidFrom(`uzfit:idem:${key}`)),
        created_at: daysAgo(0, -30),
        updated_at: daysAgo(0, -30),
      });
    }
  }

  // Favorites for the member
  for (const venue of [1, 5]) {
    insertRow(tables, "favorites", { user_id: memberId, venue_id: ids.venue(venue), created_at: daysAgo(4) });
  }

  // The draft venue has a submitted revision waiting for admin review
  const draft = VENUES.find((v) => v.n === 9)!;
  insertRow(tables, "venue_revisions", {
    id: uuidFrom("uzfit:revision:yangi-kuch"),
    venue_id: ids.venue(9),
    status: "submitted",
    content: {
      name: draft.name,
      address: draft.address,
      description: L(
        "Sergeli tumanidagi yangi zal: zamonaviy trenajyorlar, erkin ogʻirliklar va ertalabki ochiq zal.",
        "Новый зал в Сергели: современные тренажёры, свободные веса и утренний открытый зал.",
        "A new gym in Sergeli: modern machines, free weights and early-morning open gym.",
      ),
      rules: L("Toza poyabzal majburiy.", "Чистая сменная обувь обязательна.", "Clean indoor shoes are required."),
      district_id: ids.district(6),
      latitude: draft.lat,
      longitude: draft.lng,
      contact_phone: "+998711000009",
      category_ids: [ids.category(1), ids.category(6)],
      amenity_ids: [amenityIdBySlug.get("showers")!, amenityIdBySlug.get("lockers")!],
      images: [{ path: seedImagePath(9, 0), alt: IMAGE_ALT }],
      opening_hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
        weekday === 7
          ? { weekday, is_closed: false, opens_at: "10:00", closes_at: "20:00" }
          : { weekday, is_closed: false, opens_at: "08:00", closes_at: "22:00" },
      ),
    } as Json,
    created_by: uid("partnerA"),
    created_at: daysAgo(3),
    updated_at: daysAgo(2),
    submitted_at: daysAgo(2),
    submitted_by: uid("partnerA"),
    reviewed_at: null,
    reviewed_by: null,
    review_note: null,
  });
  audit(
    tables,
    actorFor(uid("partnerA")),
    "staff",
    "venue_revision.submit",
    "venue_revision",
    uuidFrom("uzfit:revision:yangi-kuch"),
    null,
    null,
    null,
    {
      venue_id: ids.venue(9),
    },
  );

  // Older audit trail entries from the platform admin
  const adminActor = actorFor(uid("admin"));
  for (const pv of PLAN_VERSIONS.filter((p) => p.status === "published")) {
    audit(tables, adminActor, "admin", "plan_version.publish", "plan_version", ids.planVersion(pv.n), null, null, {
      status: "published",
    });
  }
  for (const v of VENUES.filter((x) => x.published)) {
    audit(
      tables,
      adminActor,
      "admin",
      "venue_revision.approve",
      "venue_revision",
      uuidFrom(`uzfit:revision:${v.slug}`),
      "Initial listing",
      {
        venue_id: ids.venue(v.n),
        publication_status: "draft",
      },
    );
  }
  // Spread the audit timestamps so the log reads like a history.
  const logs = tables.audit_logs!;
  logs.forEach((row, index) => {
    if (String(row.action).startsWith("plan_version.") || String(row.action).startsWith("venue_revision.approve")) {
      row.created_at = daysAgo(80, index);
    }
  });
  logs.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  logs.forEach((row, index) => {
    row.id = index + 1;
  });

  void nowIso;
  return { tables, generatedThrough };
}
