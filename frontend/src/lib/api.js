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

const STORAGE_SUFFIXES = [
  "_profile",
  "_plan",
  "_diary",
  "_favs",
  "_shopping",
  "_recipes",
];

const isKnownUserStorageKey = (key) =>
  key.startsWith("nv_") &&
  STORAGE_SUFFIXES.some((suffix) => key.endsWith(suffix));

const getActiveSessionUser = async ({ forceRefresh = false } = {}) => {
  if (!forceRefresh) {
    const { data: sessionData, error: sessionErr } =
      await supabase.auth.getSession();
    if (sessionErr) throw new apiError(sessionErr.message, 401, sessionErr);
    if (sessionData?.session?.user) {
      return sessionData.session.user;
    }
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) return null;
  return userData?.user || null;
};

const getStoragePrefix = async () => {
  const user = await getActiveSessionUser();
  return user?.id ? `nv_${user.id}` : "nv_guest";
};

const clearUserStorage = (uid) => {
  if (!uid) return;
  const prefix = `nv_${uid}`;
  STORAGE_SUFFIXES.forEach((suffix) => {
    localStorage.removeItem(`${prefix}${suffix}`);
  });
};

const clearGuestStorage = () => {
  STORAGE_SUFFIXES.forEach((suffix) => {
    localStorage.removeItem(`nv_guest${suffix}`);
  });
};

const clearOtherUsersStorage = (keepUid = null) => {
  const keepPrefix = keepUid ? `nv_${keepUid}` : null;
  const keysToRemove = [];

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !isKnownUserStorageKey(key)) continue;

    if (key.startsWith("nv_guest_")) {
      keysToRemove.push(key);
      continue;
    }

    if (!keepPrefix || !key.startsWith(`${keepPrefix}_`)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
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
