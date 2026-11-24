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

const isKnownUserStorageKey = (key) =>
  key.startsWith("nv_") &&
  STORAGE_SUFFIXES.some((suffix) => key.endsWith(suffix));

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

const getStoragePrefix = async () => {
  const user = await getActiveSessionUser();
  return user?.id ? `nv_${user.id}` : "nv_guest";
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
