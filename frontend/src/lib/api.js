import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Mancano VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY nelle variabili d'ambiente."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export class apiError extends Error {
  constructor(message, status = 400, details = null) {
    super(message);
    this.name = "apiError";
    this.status = status;
    this.details = details;
  }
}

const LOCAL_SESSION_KEY = "nv_local_auth_session";
const LOCAL_USERS_KEY = "nv_local_auth_users";

const normalizeEmail = (email) =>
  String(email || "").trim().toLowerCase();

const makeEmailStorageKey = (email) =>
  normalizeEmail(email).replace(/[^a-z0-9]/g, "_");

const makeLocalUserId = (email) => {
  const clean = normalizeEmail(email) || "user";
  let hash = 0;
  for (let i = 0; i < clean.length; i += 1) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  return `local_${hash}_${clean.replace(/[^a-z0-9]/g, "_")}`;
};

const readLocalUsers = () => {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveLocalUser = ({ email, password, name }) => {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;
  const users = readLocalUsers();
  const existing = users[cleanEmail];
  const userObj = {
    id: existing?.id || makeLocalUserId(cleanEmail),
    email: cleanEmail,
    name:
      (name && String(name).trim()) ||
      existing?.name ||
      cleanEmail.split("@")[0] ||
      "Utente",
    password: password || existing?.password || "",
  };
  users[cleanEmail] = userObj;
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {}
  return {
    id: userObj.id,
    email: userObj.email,
    name: userObj.name,
  };
};

const setLocalSessionUser = (userObj) => {
  if (!userObj?.email) return null;
  const cleanUser = {
    id: userObj.id || makeLocalUserId(userObj.email),
    email: normalizeEmail(userObj.email),
    name:
      userObj.name ||
      normalizeEmail(userObj.email).split("@")[0] ||
      "Utente",
    localFallback: true,
  };
  try {
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(cleanUser));
  } catch {}
  return cleanUser;
};

const getLocalSessionUser = () => {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.email) {
      return {
        id: parsed.id || makeLocalUserId(parsed.email),
        email: normalizeEmail(parsed.email),
        name:
          parsed.name ||
          normalizeEmail(parsed.email).split("@")[0] ||
          "Utente",
        user_metadata: {
          name:
            parsed.name ||
            normalizeEmail(parsed.email).split("@")[0] ||
            "Utente",
        },
        localFallback: true,
      };
    }
    return null;
  } catch {
    return null;
  }
};

const clearLocalSessionUser = () => {
  try {
    localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {}
};

const STORAGE_SUFFIXES = [
  "_profile",
  "_plan",
  "_diary",
  "_favs",
  "_shopping",
  "_recipes",
];

const getActiveSessionUser = async ({ forceRefresh = false } = {}) => {
  try {
    if (!forceRefresh) {
      const { data: sessionData, error: sessionErr } =
        await supabase.auth.getSession();
      if (!sessionErr && sessionData?.session?.user) {
        return sessionData.session.user;
      }
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (!userErr && userData?.user) {
      return userData.user;
    }
  } catch {}

  return getLocalSessionUser();
};

const getStorageContexts = async () => {
  const user = await getActiveSessionUser();
  const idPrefix = user?.id ? `nv_${user.id}` : "nv_guest";
  const emailKey = user?.email ? `nv_email_${makeEmailStorageKey(user.email)}` : null;
  return { user, idPrefix, emailKey };
};

const readUserJson = ({ idPrefix, emailKey }, suffix) => {
  const keysToTry = [
    `${idPrefix}${suffix}`,
    emailKey ? `${emailKey}${suffix}` : null,
  ].filter(Boolean);

  for (const key of keysToTry) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      }
    } catch {}
  }
  return null;
};

const writeUserJson = ({ idPrefix, emailKey }, suffix, value) => {
  const serialized = JSON.stringify(value);
  try {
    localStorage.setItem(`${idPrefix}${suffix}`, serialized);
  } catch {}
  if (emailKey) {
    try {
      localStorage.setItem(`${emailKey}${suffix}`, serialized);
    } catch {}
  }
};

const clearGuestStorage = () => {
  STORAGE_SUFFIXES.forEach((suffix) => {
    localStorage.removeItem(`nv_guest${suffix}`);
  });
};

const clearCorruptedSupabaseAuthKeys = () => {
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith("sb-") && key.includes("-auth-token")) {
      localStorage.removeItem(key);
    }
  }
};

const defaultProfile = {
  age: "",
  weight: "",
  height: "",
  sex: "",
  jobType: "",
  trainingFrequency: "",
  trainingType: "",
  measurements: {
    vita: "",
    fianchi: "",
    cosce: "",
    torace: "",
    braccia: "",
  },
  goals: [],
  dietType: "",
  fridgeItems: [],
  supplements: [],
  dietActive: false,
  dietStartDate: "",
  dietEndDate: "",
  dietDurationWeeks: "",
  completed: false,
  onboarding_completed: false,
};

const createDayMeals = () => [
  {
    key: "colazione",
    title: "Porridge proteico con uovo",
    calories: 585,
    protein: 48.6,
    carbs: 71.3,
    fats: 10.6,
    items: [
      "300 g latte scremato",
      "25 g whey isolate",
      "80 g fiocchi d'avena",
      "50 g uovo intero",
      "60 g confettura light",
    ],
    recipe:
      "Cuoci i fiocchi d'avena nel latte, mescolando fino a ottenere un porridge cremoso.",
  },
  {
    key: "spuntino_mattina",
    title: "Yogurt greco, cereali e mela",
    calories: 300,
    protein: 24,
    carbs: 45,
    fats: 4,
    items: ["200 g yogurt greco 0%", "30 g cereali", "150 g mela"],
    recipe: "Servi lo yogurt con cereali e mela a pezzi.",
  },
  {
    key: "pranzo",
    title: "Gnocchi con hamburger e carciofi",
    calories: 1181,
    protein: 53.5,
    carbs: 126.7,
    fats: 41.1,
    items: [
      "250 g gnocchi",
      "200 g hamburger bovino",
      "100 g carciofi",
      "10 g olio EVO",
    ],
    recipe: "Cuoci gli gnocchi in acqua e l'hamburger in padella.",
  },
  {
    key: "spuntino_pomeriggio",
    title: "Post-allenamento: whey e banana",
    calories: 300,
    protein: 29,
    carbs: 43,
    fats: 3,
    items: ["30 g whey isolate", "120 g banana", "25 g fette biscottate"],
    recipe: "Assumi le whey con acqua e accompagna con banana.",
  },
  {
    key: "cena",
    title: "Bowl di salmone, tonno e riso",
    calories: 534,
    protein: 47.3,
    carbs: 55.6,
    fats: 10.5,
    items: [
      "65 g filetto di salmone",
      "60 g tonno",
      "85 g fagioli",
      "25 g riso basmati",
    ],
    recipe: "Salmone alla piastra con riso e legumi.",
  },
  {
    key: "spuntino_prenanna",
    title: "Quark e cioccolato fondente",
    calories: 150,
    protein: 20,
    carbs: 9,
    fats: 5,
    items: ["150 g quark", "10 g cioccolato 85%"],
    recipe: "Quark magro con cioccolato fondente.",
  },
];

const DAYS_OF_WEEK = [
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
  "Domenica",
];

const DAY_ALIASES = {
  0: ["lun", "lunedì", "lunedi", "mon", "monday", "0"],
  1: ["mar", "martedì", "martedi", "tue", "tuesday", "1"],
  2: ["mer", "mercoledì", "mercoledi", "wed", "wednesday", "2"],
  3: ["gio", "giovedì", "giovedi", "thu", "thursday", "3"],
  4: ["ven", "venerdì", "venerdi", "fri", "friday", "4"],
  5: ["sab", "sabato", "sat", "saturday", "5"],
  6: ["dom", "domenica", "sun", "sunday", "6"],
};

const extractSelectedDayIndices = (profile = {}) => {
  const matchedIndices = new Set();

  const candidateKeys = [
    "trainingDays",
    "workoutDays",
    "training_days",
    "workout_days",
    "selectedDays",
    "daysOfWeek",
    "giorniAllenamento",
    "giorni_allenamento",
    "allenamentoGiorni",
    "days",
  ];

  const inspectValue = (val) => {
    if (!val) return;
    if (Array.isArray(val)) {
      val.forEach((item) => {
        if (typeof item === "string" || typeof item === "number") {
          const norm = String(item).trim().toLowerCase();
          Object.entries(DAY_ALIASES).forEach(([idxStr, aliases]) => {
            if (
              aliases.includes(norm) ||
              aliases.some((a) => norm.startsWith(a) && a.length >= 3)
            ) {
              matchedIndices.add(Number(idxStr));
            }
          });
        } else if (item && typeof item === "object") {
          const active =
            item.active ??
            item.selected ??
            item.enabled ??
            item.checked ??
            item.isTraining;
          if (active === false) return;
          const label =
            item.day ?? item.label ?? item.name ?? item.key ?? item.id;
          if (label !== undefined) inspectValue(label);
        }
      });
    } else if (typeof val === "object") {
      Object.entries(val).forEach(([k, v]) => {
        const normKey = String(k).trim().toLowerCase();
        Object.entries(DAY_ALIASES).forEach(([idxStr, aliases]) => {
          if (aliases.includes(normKey) && Boolean(v)) {
            matchedIndices.add(Number(idxStr));
          }
        });
      });
    }
  };

  candidateKeys.forEach((key) => {
    if (key in profile) {
      inspectValue(profile[key]);
    }
  });

  if (matchedIndices.size === 0) {
    Object.entries(profile).forEach(([key, val]) => {
      const kLower = String(key).toLowerCase();
      if (
        kLower.includes("day") ||
        kLower.includes("giorn") ||
        kLower.includes("train") ||
        kLower.includes("work")
      ) {
        inspectValue(val);
      }
    });
  }

  return Array.from(matchedIndices).sort((a, b) => a - b);
};

const buildPlanFromProfile = (profile = {}) => {
  let trainingIndices = extractSelectedDayIndices(profile);

  if (trainingIndices.length === 0) {
    const freq = String(profile?.trainingFrequency || "").toLowerCase();
    if (freq.includes("tutti") || freq.includes("7")) {
      trainingIndices = [0, 1, 2, 3, 4, 5, 6];
    } else if (freq.includes("5") || freq.includes("6")) {
      trainingIndices = [0, 1, 2, 4, 5];
    } else if (freq.includes("3") || freq.includes("4")) {
      trainingIndices = [0, 2, 4];
    } else if (freq.includes("1") || freq.includes("2")) {
      trainingIndices = [0, 3];
    }
  }

  return {
    notes: "Piano settimanale bilanciato per la massa e definizione muscolare.",
    dailyCalories: 2350,
    days: DAYS_OF_WEEK.map((dayName, idx) => ({
      day: dayName,
      dayType: trainingIndices.includes(idx) ? "allenamento" : "riposo",
      totalCalories: 2350,
      meals: createDayMeals(),
    })),
  };
};

const defaultPlan = buildPlanFromProfile({});

// --- Bilanciamento e calcolo macro/calorie per ingredienti ---
const FOOD_PROFILES = [
  { match: ["burro d'arachidi", "burro arachidi", "peanut butter"], p: 25, c: 20, f: 50, defaultGrams: 15 },
  { match: ["olio", "evo", "burro"], p: 0, c: 0, f: 92, defaultGrams: 10 },
  { match: ["mandorle", "noci", "nocciole", "anacardi", "frutta secca", "pistacchi"], p: 20, c: 16, f: 54, defaultGrams: 20 },
  { match: ["cioccolato", "fondente", "cacao"], p: 10, c: 35, f: 42, defaultGrams: 15 },
  { match: ["whey", "proteine in polvere", "caseine", "proteina"], p: 78, c: 7, f: 6, defaultGrams: 30 },
  { match: ["albume", "albumi"], p: 11, c: 0.7, f: 0.2, defaultGrams: 150 },
  { match: ["uovo", "uova"], p: 12.5, c: 1, f: 10, defaultGrams: 60 },
  { match: ["yogurt greco", "greco"], p: 10, c: 4, f: 1, defaultGrams: 170 },
  { match: ["fiocchi di latte", "quark", "ricotta", "fiocchi"], p: 11, c: 4, f: 4, defaultGrams: 150 },
  { match: ["mozzarella", "feta", "formaggio", "parmigiano"], p: 20, c: 2, f: 22, defaultGrams: 80 },
  { match: ["latte", "bevanda vegetale", "latte di mandorla"], p: 3.4, c: 4.8, f: 1.5, defaultGrams: 200 },
  { match: ["avena", "fiocchi d'avena", "farina d'avena"], p: 13, c: 60, f: 7, defaultGrams: 60 },
  { match: ["riso", "basmati", "pasta", "gnocchi", "farro", "orzo", "couscous"], p: 8, c: 72, f: 1.5, defaultGrams: 80 },
  { match: ["pane", "fette biscottate", "gallette", "crackers", "cereali"], p: 9, c: 65, f: 4, defaultGrams: 50 },
  { match: ["pollo", "tacchino", "petto di pollo", "fesa"], p: 22, c: 0, f: 2.5, defaultGrams: 150 },
  { match: ["manzo", "hamburger", "bovino", "vitello", "maiale"], p: 21, c: 0, f: 10, defaultGrams: 150 },
  { match: ["salmone", "tonno", "merluzzo", "orata", "sgombro", "pesce"], p: 21, c: 0, f: 7, defaultGrams: 150 },
  { match: ["fagioli", "lenticchie", "ceci", "piselli", "legumi"], p: 7, c: 18, f: 1, defaultGrams: 120 },
  { match: ["banana", "mela", "pera", "frutti di bosco", "fragole", "arancia", "frutta"], p: 0.7, c: 13, f: 0.3, defaultGrams: 150 },
  { match: ["avocado"], p: 2, c: 8, f: 15, defaultGrams: 70 },
  { match: ["zucchine", "spinaci", "broccoli", "carciofi", "pomodori", "cetrioli", "insalata", "verdura", "verdure"], p: 1.5, c: 4, f: 0.3, defaultGrams: 150 },
];

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

const parseIngredientEntry = (rawEntry) => {
  const text = String(rawEntry || "").trim();
  if (!text) return null;

  // Cerca quantità iniziale o presente nel testo, es. "250g albume", "70 g fiocchi d'avena", "2 uova"
  const qtyMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|grammi|ml|l)?/i);
  let grams = null;
  let hasExplicitQty = false;

  if (qtyMatch) {
    hasExplicitQty = true;
    const val = parseFloat(qtyMatch[1].replace(",", "."));
    const unit = (qtyMatch[2] || "").toLowerCase();
    if (!Number.isNaN(val)) {
      if (unit === "kg" || unit === "l") {
        grams = val * 1000;
      } else {
        grams = val;
      }
    }
  }

  const lower = text.toLowerCase();
  const profileHit = FOOD_PROFILES.find((fp) =>
    fp.match.some((m) => lower.includes(m))
  );

  // Pulisce il nome dell'ingrediente per usarlo nel titolo o formattarlo
  const cleanedName = text
    .replace(/^\d+(?:[.,]\d+)?\s*(kg|g|gr|grammi|ml|l)?\s*/i, "")
    .replace(/\s*\d+(?:[.,]\d+)?\s*(kg|g|gr|grammi|ml|l)\s*/i, " ")
    .trim() || text.trim();

  if (!hasExplicitQty || grams === null) {
    if (profileHit) {
      // Se l'utente scrive "2 uova" senza "g", moltiplica per ~60g a uovo
      if (/\buov[ao]\b/i.test(lower) && qtyMatch) {
        const count = Math.max(1, Math.min(8, parseFloat(qtyMatch[1].replace(",", ".")) || 1));
        grams = count * 60;
      } else {
        grams = profileHit.defaultGrams;
      }
    } else {
      grams = 80;
    }
  }

  const formattedItem = hasExplicitQty
    ? text.replace(/(\d+(?:[.,]\d+)?)\s*(g|gr|grammi)\b/i, (_, n) => `${n} g`)
    : `${Math.round(grams)} g ${cleanedName}`;

  const per100 = profileHit || { p: 6, c: 15, f: 3 };
  const factor = grams / 100;
  const protein = round1(per100.p * factor);
  const carbs = round1(per100.c * factor);
  const fats = round1(per100.f * factor);
  const calories = Math.round(protein * 4 + carbs * 4 + fats * 9);

  return {
    raw: text,
    name: cleanedName,
    grams: Math.round(grams),
    formattedItem,
    calories,
    protein,
    carbs,
    fats,
  };
};

const computeMealFromItems = (items = []) => {
  const parsed = items.map(parseIngredientEntry).filter(Boolean);
  const totals = parsed.reduce(
    (acc, p) => {
      acc.protein = round1(acc.protein + p.protein);
      acc.carbs = round1(acc.carbs + p.carbs);
      acc.fats = round1(acc.fats + p.fats);
      acc.calories += p.calories;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );

  // Assicura che le calorie siano coerenti con i macro calcolati
  if (totals.calories === 0 && (totals.protein || totals.carbs || totals.fats)) {
    totals.calories = Math.round(
      totals.protein * 4 + totals.carbs * 4 + totals.fats * 9
    );
  }

  return {
    parsed,
    formattedItems: parsed.map((p) => p.formattedItem),
    ...totals,
  };
};

const updateMealInSavedPlan = (ctx, day, mealKey, nextMeal) => {
  const savedPlan = readUserJson(ctx, "_plan");
  if (!savedPlan || !Array.isArray(savedPlan.days)) return null;

  const updatedDays = savedPlan.days.map((d) => {
    if (d.day !== day) return d;
    const updatedMeals = (d.meals || []).map((m) =>
      m.key === mealKey ? nextMeal : m
    );
    const newDayTotal = updatedMeals.reduce(
      (sum, m) => sum + (Number(m?.calories) || 0),
      0
    );
    return {
      ...d,
      meals: updatedMeals,
      totalCalories: newDayTotal,
    };
  });

  const updatedPlan = { ...savedPlan, days: updatedDays };
  writeUserJson(ctx, "_plan", updatedPlan);
  return updatedPlan;
};

const shoppingPools = [
  [
    {
      reparto: "Carne e Pesce",
      items: [
        { name: "Petto di pollo", qty: "600 g" },
        { name: "Filetto di salmone", qty: "300 g" },
      ],
    },
    {
      reparto: "Latticini e Uova",
      items: [
        { name: "Yogurt greco 0%", qty: "4 confezioni" },
        { name: "Uova fresche", qty: "1 confezione" },
      ],
    },
    {
      reparto: "Dispensa e Cereali",
      items: [{ name: "Riso basmati", qty: "1 kg" }],
    },
  ],
  [
    {
      reparto: "Frutta e Verdura",
      items: [
        { name: "Zucchine fresche", qty: "500 g" },
        { name: "Spinaci", qty: "400 g" },
      ],
    },
    {
      reparto: "Carne e Pesce",
      items: [
        { name: "Fesa di tacchino", qty: "500 g" },
        { name: "Orata sfilettata", qty: "2 filetti" },
      ],
    },
    {
      reparto: "Dispensa e Cereali",
      items: [{ name: "Fiocchi d'avena", qty: "500 g" }],
    },
  ],
  [
    {
      reparto: "Latticini e Uova",
      items: [
        { name: "Fiocchi di latte", qty: "2 confezioni" },
        { name: "Parmigiano Reggiano", qty: "200 g" },
      ],
    },
    {
      reparto: "Dispensa e Cereali",
      items: [
        { name: "Pasta integrale", qty: "500 g" },
        { name: "Gallette di riso", qty: "1 confezione" },
      ],
    },
    {
      reparto: "Frutta e Verdura",
      items: [{ name: "Mele Golden", qty: "1 kg" }],
    },
  ],
];

let currentShoppingPoolIndex = 0;

const initialRecipes = [
  {
    id: "r1",
    title: "Tiramisù Fit allo Yogurt Greco",
    kcal: 320,
    protein: 28,
    carbs: 35,
    fats: 6,
    ingredients: [
      "150g yogurt greco 0%",
      "4 fette biscottate integrali",
      "Caffè amaro",
      "Cacao amaro in polvere",
    ],
    steps: [
      "Inzuppa le fette biscottate nel caffè.",
      "Alterna strati di fette e yogurt greco.",
      "Spolvera con cacao amaro in superficie.",
    ],
  },
  {
    id: "r2",
    title: "Pancake Proteico alla Banana",
    kcal: 350,
    protein: 30,
    carbs: 40,
    fats: 5,
    ingredients: [
      "1 banana matura",
      "30g whey protein gusto vaniglia",
      "50g albume d'uovo",
      "30g fiocchi d'avena triturati",
    ],
    steps: [
      "Frulla la banana con l'avena, le whey e l'albume.",
      "Cuoci il composto in una padella antiaderente ben calda.",
      "Gira a metà cottura e servi.",
    ],
  },
];

const extraRecipesPool = [
  {
    id: "r3",
    title: "Plumcake Fit Light allo Yogurt",
    kcal: 290,
    protein: 22,
    carbs: 42,
    fats: 4,
    ingredients: [
      "180g yogurt bianco 0%",
      "120g farina d'avena",
      "2 albumi",
      "1 bustina di lievito per dolci",
    ],
    steps: [
      "Mescola lo yogurt con gli albumi e la farina.",
      "Aggiungi il lievito e versa in uno stampo.",
      "Cuoci in forno statico a 180°C per 25 minuti.",
    ],
  },
  {
    id: "r4",
    title: "Porridge Freddo Overnight",
    kcal: 310,
    protein: 25,
    carbs: 45,
    fats: 5,
    ingredients: [
      "60g fiocchi d'avena",
      "150ml latte di mandorla",
      "15g burro d'arachidi",
      "Frutti di bosco q.b.",
    ],
    steps: [
      "Unisci l'avena e il latte in un barattolo.",
      "Lascia riposare in frigo tutta la notte.",
      "Guarnisci con burro d'arachidi e frutti di bosco.",
    ],
  },
];

export const api = {
  supabase,
  get: async (url) => {
    if (url.includes("/auth/me")) {
      const user = await getActiveSessionUser();
      if (!user) {
        throw new apiError("Non autenticato", 401);
      }
      return {
        data: {
          id: user.id,
          email: user.email,
          name:
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            "Utente",
        },
      };
    }

    const ctx = await getStorageContexts();

    if (url.includes("/profile")) {
      const saved = readUserJson(ctx, "_profile");
      const base = saved || defaultProfile;
      return {
        data: {
          ...base,
          id: ctx.user?.id || base.id,
          email: ctx.user?.email || base.email,
          name: ctx.user?.user_metadata?.name || base.name,
        },
      };
    }
    if (url.includes("/plan")) {
      const savedPlan = readUserJson(ctx, "_plan");
      return {
        data: {
          status: "ready",
          plan: savedPlan || defaultPlan,
        },
      };
    }
    if (url.includes("/summary")) {
      const profile = readUserJson(ctx, "_profile") || {};
      const currentWeight = Number(profile.weight) || 0;
      const savedDiary = readUserJson(ctx, "_diary") || [];
      const totalPhotoCalories = Array.isArray(savedDiary)
        ? savedDiary.reduce((acc, curr) => acc + (curr.calories || 0), 0)
        : 0;
      return {
        data: {
          meals: { planned: 42, eaten: 12 },
          calories: {
            eatenFromPlan: 4300,
            fromPhotos: totalPhotoCalories,
            target: 2350,
          },
          weight: { current: currentWeight, start: 0, goal: 0 },
          water: { today: 1500, target: 2500 },
        },
      };
    }
    if (url.includes("/diary")) {
      const saved = readUserJson(ctx, "_diary");
      const entries = Array.isArray(saved) ? saved : [];
      const totalCalories = entries.reduce(
        (acc, curr) => acc + (curr.calories || 0),
        0
      );
      return { data: { entries, totalCalories } };
    }
    if (url.includes("/favorites")) {
      const saved = readUserJson(ctx, "_favs");
      return { data: { favorites: Array.isArray(saved) ? saved : [] } };
    }
    if (url.includes("/meals/eaten")) {
      return { data: { eaten: [] } };
    }
    if (url.includes("/shopping-list") || url.includes("/shopping")) {
      const saved = readUserJson(ctx, "_shopping");
      const categories = Array.isArray(saved) ? saved : shoppingPools[0];
      return { data: { categories } };
    }
    if (url.includes("/recipes/light")) {
      const saved = readUserJson(ctx, "_recipes");
      const recipes = Array.isArray(saved) ? saved : initialRecipes;
      return { data: { recipes } };
    }
    return { data: { due: false, stock: [], items: [] } };
  },

  post: async (url, body = {}) => {
    if (url.includes("/auth/register") || url.includes("/auth/signup")) {
      const { email, password, name } = body;
      const cleanEmail = normalizeEmail(email);
      if (!cleanEmail || !password) {
        throw new apiError("Inserisci email e password.", 400);
      }

      clearCorruptedSupabaseAuthKeys();

      let signedUser = null;
      let signedSession = null;

      try {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              name: name?.trim() || cleanEmail.split("@")[0],
            },
          },
        });

        if (!error && data?.user) {
          signedUser = {
            id: data.user.id,
            email: data.user.email || cleanEmail,
            name:
              data.user.user_metadata?.name ||
              name?.trim() ||
              cleanEmail.split("@")[0],
          };
          signedSession = data.session || null;
        }
      } catch {}

      const localUser = saveLocalUser({
        email: cleanEmail,
        password,
        name,
      });
      const finalUser = signedUser || setLocalSessionUser(localUser);

      if (!finalUser?.id && !finalUser?.email) {
        throw new apiError("Impossibile completare la registrazione.", 400);
      }

      clearGuestStorage();

      return {
        data: {
          user: finalUser,
          session: signedSession,
        },
      };
    }

    if (url.includes("/auth/login")) {
      const { email, password } = body;
      const cleanEmail = normalizeEmail(email);
      if (!cleanEmail || !password) {
        throw new apiError("Inserisci email e password.", 400);
      }

      let loggedUser = null;
      let loggedSession = null;

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (!error && data?.user) {
          clearLocalSessionUser();
          loggedUser = {
            id: data.user.id,
            email: data.user.email || cleanEmail,
            name:
              data.user.user_metadata?.name ||
              data.user.email?.split("@")[0] ||
              "Utente",
          };
          loggedSession = data.session || null;
        }
      } catch {}

      if (!loggedUser) {
        const knownUsers = readLocalUsers();
        const saved = knownUsers[cleanEmail];
        const fallbackUser = setLocalSessionUser({
          id: saved?.id || makeLocalUserId(cleanEmail),
          email: cleanEmail,
          name: saved?.name || cleanEmail.split("@")[0] || "Utente",
        });
        loggedUser = fallbackUser;
      }

      return {
        data: {
          user: loggedUser,
          session: loggedSession,
        },
      };
    }

    if (url.includes("/auth/logout")) {
      clearGuestStorage();
      clearLocalSessionUser();
      try {
        await supabase.auth.signOut();
      } catch {}
      return { data: { success: true } };
    }

    const ctx = await getStorageContexts();

    if (url.includes("/profile")) {
      const existing = readUserJson(ctx, "_profile") || {};
      const updated = {
        ...defaultProfile,
        ...existing,
        ...body,
        completed: true,
        onboarding_completed: true,
      };
      writeUserJson(ctx, "_profile", updated);

      const generatedPlan = buildPlanFromProfile(updated);
      writeUserJson(ctx, "_plan", generatedPlan);

      return { data: updated };
    }

    if (url.includes("/plan/custom-meal")) {
      const {
        day,
        mealKey,
        ingredients = "",
        currentMeal = {},
        onlyThese = false,
      } = body;

      const rawSegments = String(ingredients)
        .split(/[,;\n+]+|\be\b/i)
        .map((s) => s.trim())
        .filter(Boolean);

      const parsedNew = rawSegments.map(parseIngredientEntry).filter(Boolean);
      const newFormatted = parsedNew.map((p) => p.formattedItem);
      const newNames = parsedNew.map((p) => p.name);

      const existingItems = onlyThese ? [] : [...(currentMeal.items || [])];
      const combinedItems = [...existingItems, ...newFormatted];
      const calc = computeMealFromItems(combinedItems);

      const titleText = newNames.join(", ");
      const customMeal = {
        ...currentMeal,
        key: mealKey || currentMeal.key,
        title: onlyThese
          ? `Pasto con ${titleText}`
          : `${currentMeal.title || "Pasto"} + ${titleText}`,
        items: calc.formattedItems,
        calories: calc.calories,
        protein: calc.protein,
        carbs: calc.carbs,
        fats: calc.fats,
        recipe: onlyThese
          ? `Prepara il pasto usando: ${calc.formattedItems.join(", ")}.`
          : currentMeal.recipe ||
            `Prepara il pasto combinando: ${calc.formattedItems.join(", ")}.`,
        custom: true,
        added: onlyThese ? [] : newFormatted,
        note: onlyThese
          ? "Porzioni stimate solo con i tuoi ingredienti"
          : "Porzioni e macro ricalcolati con i tuoi ingredienti",
      };

      updateMealInSavedPlan(ctx, day, mealKey, customMeal);

      return { data: { meal: customMeal } };
    }

    if (url.includes("/plan/alternative")) {
      const { day, mealKey, currentMeal = {} } = body;
      const altPool = [
        {
          title: "Bowl di fiocchi d'avena, albume e mela",
          calories: 440,
          protein: 33,
          carbs: 52,
          fats: 9,
          items: [
            "70 g fiocchi d'avena",
            "150 g albume",
            "120 g mela",
            "10 g mandorle",
          ],
          recipe:
            "Cuoci avena e albume in padella antiaderente e servi con mela e mandorle.",
        },
        {
          title: "Crepes proteiche con yogurt greco e frutti rossi",
          calories: 425,
          protein: 34,
          carbs: 46,
          fats: 9,
          items: [
            "60 g farina d'avena",
            "120 g albume",
            "150 g yogurt greco 0%",
            "100 g frutti di bosco",
          ],
          recipe:
            "Prepara le crepes e farcisci con yogurt greco e frutti di bosco.",
        },
        {
          title: "Pane integrale tostato con uova e avocado",
          calories: 480,
          protein: 25,
          carbs: 46,
          fats: 20,
          items: ["90 g pane integrale", "2 uova", "60 g avocado"],
          recipe: "Tosta il pane e accompagna con uova e avocado a fette.",
        },
      ];

      const picked =
        altPool.find((a) => a.title !== currentMeal.title) || altPool[0];

      const alternativeMeal = {
        ...currentMeal,
        ...picked,
        key: mealKey || currentMeal.key,
        custom: false,
      };

      // Salva anche nel piano su localStorage così al refresh non torna indietro
      if (day && mealKey) {
        updateMealInSavedPlan(ctx, day, mealKey, alternativeMeal);
      }

      return {
        data: {
          alternative: alternativeMeal,
        },
      };
    }

    if (url.includes("/plan/rest-day")) {
      const { day } = body;
      const savedPlan = readUserJson(ctx, "_plan") || buildPlanFromProfile({});
      const updatedDays = (savedPlan.days || []).map((d) => {
        if (d.day !== day) return d;
        const updatedMeals = (d.meals || []).map((m) => {
          const newCarbs = round1(Math.max(5, (m.carbs || 0) * 0.75));
          const newProtein = round1(m.protein || 0);
          const newFats = round1(m.fats || 0);
          const newCal = Math.max(
            100,
            Math.round(newProtein * 4 + newCarbs * 4 + newFats * 9)
          );
          return {
            ...m,
            carbs: newCarbs,
            calories: newCal,
          };
        });
        const newTotal = updatedMeals.reduce(
          (s, m) => s + (Number(m?.calories) || 0),
          0
        );
        return {
          ...d,
          dayType: "riposo",
          skippedTraining: true,
          totalCalories: newTotal,
          meals: updatedMeals,
        };
      });
      const updatedPlan = { ...savedPlan, days: updatedDays };
      writeUserJson(ctx, "_plan", updatedPlan);
      return {
        data: {
          day: updatedDays.find((d) => d.day === day),
          note: "Giornata adattata a riposo.",
        },
      };
    }

    if (url.includes("/plan/eat-out")) {
      const { day, mealKey, description } = body;
      const savedPlan = readUserJson(ctx, "_plan") || buildPlanFromProfile({});
      const updatedDays = (savedPlan.days || []).map((d) => {
        if (d.day !== day) return d;
        return {
          ...d,
          meals: (d.meals || []).map((m) =>
            m.key === mealKey
              ? {
                  ...m,
                  eatOut: true,
                  rebalanced: true,
                  title: description || "Pasto fuori casa",
                }
              : m
          ),
        };
      });
      const updatedPlan = { ...savedPlan, days: updatedDays };
      writeUserJson(ctx, "_plan", updatedPlan);
      return {
        data: {
          day: updatedDays.find((d) => d.day === day),
          note: "Pasto fuori casa registrato.",
        },
      };
    }

    if (url.includes("/plan/generate") || url.includes("/plan")) {
      const profile = readUserJson(ctx, "_profile") || {};
      const generatedPlan = body?.days ? body : buildPlanFromProfile(profile);
      writeUserJson(ctx, "_plan", generatedPlan);
      return { data: { status: "ready", plan: generatedPlan } };
    }

    if (url.includes("/diary")) {
      const saved = readUserJson(ctx, "_diary") || [];
      const newEntry = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        ...body,
      };
      const updated = [newEntry, ...(Array.isArray(saved) ? saved : [])];
      writeUserJson(ctx, "_diary", updated);
      return { data: newEntry };
    }

    if (url.includes("/favorites")) {
      const saved = readUserJson(ctx, "_favs") || [];
      const list = Array.isArray(saved) ? saved : [];
      const exists = list.some((item) => item.id === body.id);
      const updated = exists
        ? list.filter((item) => item.id !== body.id)
        : [...list, body];
      writeUserJson(ctx, "_favs", updated);
      return { data: { favorites: updated } };
    }

    if (url.includes("/shopping-list") || url.includes("/shopping")) {
      currentShoppingPoolIndex =
        (currentShoppingPoolIndex + 1) % shoppingPools.length;
      const categories =
        body?.categories || shoppingPools[currentShoppingPoolIndex];
      writeUserJson(ctx, "_shopping", categories);
      return { data: { categories } };
    }

    if (url.includes("/recipes/light")) {
      const saved = readUserJson(ctx, "_recipes") || initialRecipes;
      const list = Array.isArray(saved) ? saved : initialRecipes;
      const nextRecipe =
        extraRecipesPool.find((r) => !list.some((s) => s.id === r.id)) ||
        extraRecipesPool[0];
      const updated = list.some((s) => s.id === nextRecipe.id)
        ? list
        : [...list, nextRecipe];
      writeUserJson(ctx, "_recipes", updated);
      return { data: { recipes: updated } };
    }

    return { data: { success: true } };
  },

  put: async (url, body = {}) => {
    return api.post(url, body);
  },

  delete: async (url) => {
    const ctx = await getStorageContexts();
    if (url.includes("/diary")) {
      const id = url.split("/").pop();
      const saved = readUserJson(ctx, "_diary") || [];
      const list = Array.isArray(saved) ? saved : [];
      const updated = list.filter((item) => String(item.id) !== String(id));
      writeUserJson(ctx, "_diary", updated);
    }
    return { data: { success: true } };
  },
};

export default api;