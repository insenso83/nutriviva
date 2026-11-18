const STORAGE_KEY_PROFILE = "nv_mock_profile";
const STORAGE_KEY_PLAN = "nv_mock_plan";
const STORAGE_KEY_SHOPPING = "nv_mock_shopping";
const STORAGE_KEY_FAVOURITES = "nv_mock_favs";
const STORAGE_KEY_DIARY = "nv_mock_diary";
const STORAGE_KEY_RECIPES = "nv_mock_recipes";

const defaultProfile = {
  id: "mock-id-123",
  email: "frank.insenso@gmail.com",
  age: 30,
  weight: 75,
  height: 175,
  sex: "Uomo",
  jobType: "Sedentario",
  trainingFrequency: "3-4 volte/sett",
  trainingType: "Sala pesi / Bodybuilding",
  measurements: { vita: "82", fianchi: "98", cosce: "55", torace: "102", braccia: "34" },
  goals: ["Massa muscolare", "Definizione"],
  dietType: "Mediterranea bilanciata",
  fridgeItems: [{ name: "Petto di pollo", qty: "500g" }, { name: "Riso basmati", qty: "1kg" }, { name: "Uova", qty: "6 pezzi" }],
  supplements: ["Creatina", "Whey protein"],
  dietActive: false,
  dietStartDate: "2026-11-17",
  dietEndDate: "2027-01-11",
  dietDurationWeeks: 8,
  completed: true,
  onboarding_completed: true
};

const createDayMeals = () => [
  { key: "colazione", title: "Porridge proteico con uovo", calories: 585, protein: 48.6, carbs: 71.3, fats: 10.6, items: ["300 g latte scremato", "25 g whey isolate", "80 g fiocchi d'avena", "50 g uovo intero", "60 g confettura light"], recipe: "Cuoci i fiocchi d'avena nel latte, mescolando fino a ottenere un porridge cremoso." },
  { key: "spuntino_mattina", title: "Yogurt greco, cereali e mela", calories: 300, protein: 24, carbs: 45, fats: 4, items: ["200 g yogurt greco 0%", "30 g cereali", "150 g mela"], recipe: "Servi lo yogurt con cereali e mela a pezzi." },
  { key: "pranzo", title: "Gnocchi con hamburger e carciofi", calories: 1181, protein: 53.5, carbs: 126.7, fats: 41.1, items: ["250 g gnocchi", "200 g hamburger bovino", "100 g carciofi", "10 g olio EVO"], recipe: "Cuoci gli gnocchi in acqua e l'hamburger in padella." },
  { key: "spuntino_pomeriggio", title: "Post-allenamento: whey e banana", calories: 300, protein: 29, carbs: 43, fats: 3, items: ["30 g whey isolate", "120 g banana", "25 g fette biscottate"], recipe: "Assumi le whey con acqua e accompagna con banana." },
  { key: "cena", title: "Bowl di salmone, tonno e riso", calories: 534, protein: 47.3, carbs: 55.6, fats: 10.5, items: ["65 g filetto di salmone", "60 g tonno", "85 g fagioli", "25 g riso basmati"], recipe: "Salmone alla piastra con riso e legumi." },
  { key: "spuntino_prenanna", title: "Quark e cioccolato fondente", calories: 150, protein: 20, carbs: 9, fats: 5, items: ["150 g quark", "10 g cioccolato 85%"], recipe: "Quark magro con cioccolato fondente." }
];

const defaultPlan = {
  notes: "Piano settimanale bilanciato per la massa e definizione muscolare.",
  dailyCalories: 2350,
  days: ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"].map((dayName, idx) => ({
    day: dayName,
    dayType: idx % 2 === 0 ? "allenamento" : "riposo",
    totalCalories: 2350,
    meals: createDayMeals()
  }))
};

const shoppingPools = [
  [
    { reparto: "Carne e Pesce", items: [{ name: "Petto di pollo", qty: "600 g" }, { name: "Filetto di salmone", qty: "300 g" }] },
    { reparto: "Latticini e Uova", items: [{ name: "Yogurt greco 0%", qty: "4 confezioni" }, { name: "Uova fresche", qty: "1 confezione" }] },
    { reparto: "Dispensa e Cereali", items: [{ name: "Riso basmati", qty: "1 kg" }] }
  ],
  [
    { reparto: "Frutta e Verdura", items: [{ name: "Zucchine fresche", qty: "500 g" }, { name: "Spinaci", qty: "400 g" }] },
    { reparto: "Carne e Pesce", items: [{ name: "Fesa di tacchino", qty: "500 g" }, { name: "Orata sfilettata", qty: "2 filetti" }] },
    { reparto: "Dispensa e Cereali", items: [{ name: "Fiocchi d'avena", qty: "500 g" }] }
  ],
  [
    { reparto: "Latticini e Uova", items: [{ name: "Fiocchi di latte", qty: "2 confezioni" }, { name: "Parmigiano Reggiano", qty: "200 g" }] },
    { reparto: "Dispensa e Cereali", items: [{ name: "Pasta integrale", qty: "500 g" }, { name: "Gallette di riso", qty: "1 confezione" }] },
    { reparto: "Frutta e Verdura", items: [{ name: "Mele Golden", qty: "1 kg" }] }
  ]
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
    ingredients: ["150g yogurt greco 0%", "4 fette biscottate integrali", "Caffè amaro", "Cacao amaro in polvere"],
    steps: ["Inzuppa le fette biscottate nel caffè.", "Alterna strati di fette e yogurt greco.", "Spolvera con cacao amaro in superficie."]
  },
  {
    id: "r2",
    title: "Pancake Proteico alla Banana",
    kcal: 350,
    protein: 30,
    carbs: 40,
    fats: 5,
    ingredients: ["1 banana matura", "30g whey protein gusto vaniglia", "50g albume d'uovo", "30g fiocchi d'avena triturati"],
    steps: ["Frulla la banana con l'avena, le whey e l'albume.", "Cuoci il composto in una padella antiaderente ben calda.", "Gira a metà cottura e servi."]
  }
];

const extraRecipesPool = [
  {
    id: "r3",
    title: "Plumcake Fit Light allo Yogurt",
    kcal: 290,
    protein: 22,
    carbs: 42,
    fats: 4,
    ingredients: ["180g yogurt bianco 0%", "120g farina d'avena", "2 albumi", "1 bustina di lievito per dolci"],
    steps: ["Mescola lo yogurt con gli albumi e la farina.", "Aggiungi il lievito e versa in uno stampo.", "Cuoci in forno statico a 180°C per 25 minuti."]
  },
  {
    id: "r4",
    title: "Porridge Freddo Overnight",
    kcal: 310,
    protein: 25,
    carbs: 45,
    fats: 5,
    ingredients: ["60g fiocchi d'avena", "150ml latte di mandorla", "15g burro d'arachidi", "Frutti di bosco q.b."],
    steps: ["Unisci l'avena e il latte in un barattolo.", "Lascia riposare in frigo tutta la notte.", "Guarnisci con burro d'arachidi e frutti di bosco."]
  }
];

export const supabase = {
  auth: {
    getUser: async () => ({ data: { user: { id: "mock-id-123", email: "frank.insenso@gmail.com" } }, error: null }),
    signUp: async () => ({ data: { user: { id: "mock-id-123" }, session: { access_token: "mock-token" } }, error: null }),
    signInWithPassword: async () => ({ data: { user: { id: "mock-id-123" }, session: { access_token: "mock-token" } }, error: null }),
    signOut: async () => ({ error: null })
  },
  from: () => ({
    insert: (p) => ({ select: async () => ({ data: [{ id: "mock-id-123", ...p[0] }], error: null }) }),
    upsert: (p) => ({ select: async () => ({ data: [{ id: "mock-id-123", ...p[0] }], error: null }) }),
    select: () => ({
      eq: () => ({
        single: async () => ({ data: JSON.parse(localStorage.getItem(STORAGE_KEY_PROFILE) || JSON.stringify(defaultProfile)), error: null }),
        maybeSingle: async () => ({ data: JSON.parse(localStorage.getItem(STORAGE_KEY_PROFILE) || JSON.stringify(defaultProfile)), error: null })
      })
    })
  })
};

export const api = {
  supabase,
  get: async (url) => {
    if (url.includes("/profile")) {
      const saved = localStorage.getItem(STORAGE_KEY_PROFILE);
      return { data: saved ? JSON.parse(saved) : defaultProfile };
    }
    if (url.includes("/plan")) {
      const savedPlan = localStorage.getItem(STORAGE_KEY_PLAN);
      return { data: { status: "ready", plan: savedPlan ? JSON.parse(savedPlan) : defaultPlan } };
    }
    if (url.includes("/summary")) {
      const profile = JSON.parse(localStorage.getItem(STORAGE_KEY_PROFILE) || "{}");
      const currentWeight = profile.weight || 75;
      const savedDiary = JSON.parse(localStorage.getItem(STORAGE_KEY_DIARY) || "[]");
      const totalPhotoCalories = savedDiary.reduce((acc, curr) => acc + (curr.calories || 0), 0);
      return { 
        data: { 
          meals: { planned: 42, eaten: 12 }, 
          calories: { eatenFromPlan: 4300, fromPhotos: totalPhotoCalories, target: 2350 }, 
          weight: { current: currentWeight, start: 76, goal: 72 }, 
          water: { today: 1500, target: 2500 } 
        } 
      };
    }
    if (url.includes("/diary")) {
      const saved = localStorage.getItem(STORAGE_KEY_DIARY);
      const entries = saved ? JSON.parse(saved) : [];
      const totalCalories = entries.reduce((acc, curr) => acc + (curr.calories || 0), 0);
      return { data: { entries, totalCalories } };
    }
    if (url.includes("/favorites")) {
      const saved = localStorage.getItem(STORAGE_KEY_FAVOURITES);
      return { data: { favorites: saved ? JSON.parse(saved) : [] } };
    }
    if (url.includes("/meals/eaten")) {
      return { data: { eaten: [] } };
    }
    if (url.includes("/shopping-list") || url.includes("/shopping")) {
      const saved = localStorage.getItem(STORAGE_KEY_SHOPPING);
      const categories = saved ? JSON.parse(saved) : shoppingPools[0];
      return { data: { categories } };
    }
    if (url.includes("/recipes/light")) {
      const saved = localStorage.getItem(STORAGE_KEY_RECIPES);
      const recipes = saved ? JSON.parse(saved) : initialRecipes;
      return { data: { recipes } };
    }
    return { data: { due: false, stock: [], items: [] } };
  },
  post: async (url, body) => {
    if (url.includes("/plan/generate")) {
      localStorage.setItem(STORAGE_KEY_PLAN, JSON.stringify(defaultPlan));
      return { data: { status: "success", success: true } };
    }
    if (url.includes("/plan/alternative")) {
      return {
        data: {
          alternative: {
            title: "Bowl di riso, pollo e verdure grigliate",
            calories: 550,
            protein: 45,
            carbs: 60,
            fats: 12,
            items: ["200 g petto di pollo", "70 g riso basmati", "150 g zucchine grigliate", "10 g olio EVO"],
            recipe: "Griglia il petto di pollo e le zucchine, serviti con riso bollito."
          }
        }
      };
    }
    if (url.includes("/plan/custom-meal")) {
      const rawIngredients = String(body?.ingredients || "").split(",").map(i => i.trim()).filter(Boolean);
      const balancedItems = rawIngredients.map((ing) => {
        const lower = ing.toLowerCase();
        let qty = "100 g";
        if (lower.includes("proteine") || lower.includes("whey")) qty = "30 g";
        else if (lower.includes("riso") || lower.includes("pasta") || lower.includes("avena") || lower.includes("cereale")) qty = "80 g";
        else if (lower.includes("pollo") || lower.includes("carne") || lower.includes("pesce")) qty = "200 g";
        else if (lower.includes("mela") || lower.includes("frutta") || lower.includes("banana")) qty = "150 g";
        else if (lower.includes("olio")) qty = "10 g";
        else if (lower.includes("yogurt") || lower.includes("latte")) qty = "200 g";
        return `${qty} di ${ing}`;
      });

      return {
        data: {
          meal: {
            title: `Pasto bilanciato: ${rawIngredients.join(", ")}`,
            calories: 490,
            protein: 35,
            carbs: 50,
            fats: 12,
            items: balancedItems.length > 0 ? balancedItems : ["150 g ingrediente principale", "50 g fonte di carboidrati", "10 g condimento"],
            recipe: "Mescola e cuoci gli ingredienti bilanciati secondo le quantità indicate.",
            custom: true,
            added: ["Olio EVO 10g", "Spezie a piacere"]
          }
        }
      };
    }
    if (url.includes("/recipes/light") || url.includes("/recipes/generate")) {
      const saved = localStorage.getItem(STORAGE_KEY_RECIPES);
      let currentRecipes = saved ? JSON.parse(saved) : initialRecipes;
      const availableNew = extraRecipesPool.filter(r => !currentRecipes.some(existing => existing.id === r.id));
      
      if (availableNew.length > 0) {
        currentRecipes.push(availableNew[0]);
      } else {
        const newDynamic = {
          id: `r-gen-${Date.now()}`,
          title: `Snack Fit Creativo ${currentRecipes.length + 1}`,
          kcal: 280,
          protein: 20,
          carbs: 30,
          fats: 7,
          ingredients: ["100g fiocchi di latte", "1 fetta di pane fit tostato", "Miele q.b."],
          steps: ["Tosta la fetta di pane fit.", "Spalma i fiocchi di latte sopra.", "Aggiungi un filo di miele e servi."]
        };
        currentRecipes.push(newDynamic);
      }

      localStorage.setItem(STORAGE_KEY_RECIPES, JSON.stringify(currentRecipes));
      return { data: { recipes: currentRecipes } };
    }
    if (url.includes("/meal/photo") || url.includes("/photo") || url.includes("/diary")) {
      const analysisResult = { 
        id: Date.now(),
        dish: "Petto di pollo alla griglia con verdure", 
        compatible: true, 
        verdict: "Ottima scelta proteica, perfettamente in linea con il tuo piano di massa e definizione.",
        calories: 340, 
        protein: 42, 
        carbs: 6, 
        fats: 5, 
        date: new Date().toISOString(),
        advice: "Ottimo apporto di proteine nobili con pochissimi grassi saturi."
      };

      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_DIARY) || "[]");
      saved.push(analysisResult);
      localStorage.setItem(STORAGE_KEY_DIARY, JSON.stringify(saved));
      return { data: analysisResult };
    }
    if (url.includes("/shopping-list") || url.includes("/shopping")) {
      currentShoppingPoolIndex = (currentShoppingPoolIndex + 1) % shoppingPools.length;
      const nextCategories = shoppingPools[currentShoppingPoolIndex];
      localStorage.setItem(STORAGE_KEY_SHOPPING, JSON.stringify(nextCategories));
      return { data: { categories: nextCategories } };
    }
    if (url.includes("/meals/eaten")) {
      return { data: { success: true, removed: [] } };
    }
    if (url.includes("/favorites")) {
      return { data: { success: true, id: "fav-1" } };
    }
    return { data: { id: "mock-id-123", success: true, ...body } };
  },
  put: async (url, body) => {
    if (url.includes("/profile")) {
      const current = JSON.parse(localStorage.getItem(STORAGE_KEY_PROFILE) || JSON.stringify(defaultProfile));
      const updated = { ...current, ...body, completed: true, onboarding_completed: true };
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(updated));
      return { data: { profile: updated } };
    }
    if (url.includes("/plan") && body?.plan) {
      localStorage.setItem(STORAGE_KEY_PLAN, JSON.stringify(body.plan));
      return { data: body.plan };
    }
    if (url.includes("/shopping-list")) {
      if (body?.categories) {
        localStorage.setItem(STORAGE_KEY_SHOPPING, JSON.stringify(body.categories));
      }
      return { data: body };
    }
    return { data: { id: "mock-id-123", success: true, ...body } };
  },
  delete: async (url) => {
    if (url.includes("/meals/eaten") || url.includes("/favorites") || url.includes("/shopping") || url.includes("/diary") || url.includes("/photo")) {
      return { data: { success: true } };
    }
    return { data: null };
  }
};

export function apiError(err) {
  if (typeof err === "string") return err;
  if (err?.message) return err.message;
  return "Errore imprevisto";
}

export default api;