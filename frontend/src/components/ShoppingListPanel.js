import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShoppingCart, RefreshCw, Check, Plus, X } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const REPARTI_SUGGERITI = [
  "Frutta e Verdura",
  "Carne e Pesce",
  "Latticini e Uova",
  "Dispensa e Cereali",
  "Grassi buoni e Frutta secca",
  "Altro",
];

function buildDietShoppingList(profile) {
  const rawDiet = `${profile?.diet || ""} ${profile?.dietType || ""} ${profile?.goal || ""}`.toLowerCase();
  const restrictions = String(profile?.conditions || profile?.intolerances || "").toLowerCase();

  const isKeto = /keto|chetogenic/.test(rawDiet);
  const isVegetarian = /vegetar/.test(rawDiet);
  const isHighProtein = /iperproteic|high.?protein|proteic/.test(rawDiet);
  const isCleanBulk = /clean.?bulk|bulk|massa/.test(rawDiet) || (!isKeto && !isVegetarian && !isHighProtein);

  let categories = [];

  if (isKeto) {
    categories = [
      {
        reparto: "Frutta e Verdura",
        items: [
          { name: "Spinaci freschi", qty: "500 g" },
          { name: "Zucchine", qty: "600 g" },
          { name: "Broccoli", qty: "500 g" },
          { name: "Avocado", qty: "3 pz" },
          { name: "Rucola o insalata mista", qty: "250 g" },
        ],
      },
      {
        reparto: "Carne e Pesce",
        items: [
          { name: "Salmone fresco o filetti", qty: "400 g" },
          { name: "Sgombro o merluzzo", qty: "400 g" },
          { name: "Coscia o petto di pollo", qty: "500 g" },
        ],
      },
      {
        reparto: "Latticini e Uova",
        items: [
          { name: "Uova intere", qty: "12 pz" },
          { name: "Formaggi stagionati (grana / parmigiano)", qty: "200 g" },
          { name: "Mascarpone o ricotta", qty: "250 g" },
        ],
      },
      {
        reparto: "Grassi buoni e Dispensa",
        items: [
          { name: "Olio extravergine d'oliva", qty: "1 L" },
          { name: "Noci o mandorle", qty: "200 g" },
          { name: "Semi di lino o di zucca", qty: "150 g" },
        ],
      },
    ];
  } else if (isVegetarian) {
    categories = [
      {
        reparto: "Frutta e Verdura",
        items: [
          { name: "Verdure di stagione (zucchine, spinaci, peperoni)", qty: "1 kg" },
          { name: "Frutta fresca (banane, mele, frutti di bosco)", qty: "800 g" },
        ],
      },
      {
        reparto: "Latticini e Uova",
        items: [
          { name: "Uova intere", qty: "10 pz" },
          { name: "Yogurt greco bianco", qty: "500 g" },
          { name: "Fiocchi di latte o ricotta", qty: "300 g" },
        ],
      },
      {
        reparto: "Dispensa e Cereali",
        items: [
          { name: "Riso basmati o integrale", qty: "1 kg" },
          { name: "Fiocchi d'avena", qty: "500 g" },
          { name: "Legumi (lenticchie, ceci, fagioli)", qty: "3 conf" },
          { name: "Tofu o tempeh", qty: "400 g" },
        ],
      },
      {
        reparto: "Grassi buoni e Frutta secca",
        items: [
          { name: "Olio extravergine d'oliva", qty: "1 L" },
          { name: "Mandorle, noci o burro d'arachidi 100%", qty: "250 g" },
        ],
      },
    ];
  } else if (isHighProtein) {
    categories = [
      {
        reparto: "Carne e Pesce",
        items: [
          { name: "Petto di pollo o tacchino", qty: "600 g" },
          { name: "Merluzzo, nasello o tonno al naturale", qty: "500 g" },
          { name: "Salmone", qty: "300 g" },
        ],
      },
      {
        reparto: "Latticini e Uova",
        items: [
          { name: "Albume d'uovo o uova", qty: "500 ml / 10 pz" },
          { name: "Yogurt greco magro", qty: "500 g" },
          { name: "Fiocchi di latte", qty: "400 g" },
        ],
      },
      {
        reparto: "Frutta e Verdura",
        items: [
          { name: "Broccoli, fagiolini o zucchine", qty: "800 g" },
          { name: "Frutta fresca", qty: "600 g" },
        ],
      },
      {
        reparto: "Dispensa e Cereali",
        items: [
          { name: "Riso, avena o patate", qty: "800 g" },
          { name: "Olio extravergine d'oliva", qty: "1 L" },
        ],
      },
    ];
  } else if (isCleanBulk) {
    categories = [
      {
        reparto: "Carne e Pesce",
        items: [
          { name: "Petto di pollo o tacchino", qty: "600 g" },
          { name: "Salmone o pesce azzurro", qty: "400 g" },
          { name: "Macinato magro o tonno", qty: "400 g" },
        ],
      },
      {
        reparto: "Latticini e Uova",
        items: [
          { name: "Uova e/o albume", qty: "10 pz / 500 ml" },
          { name: "Yogurt greco (2% o 5%)", qty: "500 g" },
          { name: "Ricotta o fiocchi di latte", qty: "300 g" },
        ],
      },
      {
        reparto: "Dispensa e Cereali",
        items: [
          { name: "Fiocchi d'avena", qty: "750 g" },
          { name: "Riso o pasta (anche integrale)", qty: "1 kg" },
          { name: "Patate o patate dolci", qty: "1 kg" },
          { name: "Legumi (ceci, lenticchie, fagioli)", qty: "3 conf" },
        ],
      },
      {
        reparto: "Frutta e Verdura",
        items: [
          { name: "Banane, mele o frutti di bosco", qty: "1 kg" },
          { name: "Verdure varie (spinaci, zucchine, broccoli)", qty: "1 kg" },
        ],
      },
      {
        reparto: "Grassi buoni e Frutta secca",
        items: [
          { name: "Olio extravergine d'oliva", qty: "1 L" },
          { name: "Frutta secca o crema di frutta secca 100%", qty: "250 g" },
        ],
      },
    ];
  }

  if (restrictions.includes("lattos")) {
    categories = categories.map((c) => ({
      ...c,
      items: c.items.filter((it) => !/yogurt|formagg|mascarpone|ricotta|fiocchi di latte|latticin/i.test(it.name)),
    }));
  }
  if (restrictions.includes("glutin") || restrictions.includes("celiac")) {
    categories = categories.map((c) => ({
      ...c,
      items: c.items.filter((it) => !/pasta|avena|pane|farro|orzo/i.test(it.name)),
    }));
  }

  return categories.filter((c) => c.items.length > 0);
}

export default function ShoppingListPanel({ profile }) {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState({});
  const [newItem, setNewItem] = useState({ name: "", qty: "", reparto: "" });

  useEffect(() => {
    api
      .get("/shopping-list")
      .then((r) => setCats(r.data?.categories || []))
      .catch(() => {});
  }, []);

  const persist = (c) => {
    setCats(c);
    api.put("/shopping-list", { categories: c }).catch(() => {});
  };

  const generate = async () => {
    setLoading(true);
    try {
      const keep = cats.find((c) => c.reparto === "Da ricomprare");
      let suggested = [];
      try {
        const { data } = await api.post("/shopping-list");
        suggested = data?.categories || [];
      } catch {
        suggested = [];
      }
      if (!suggested.length) {
        suggested = buildDietShoppingList(profile);
      }
      const next = keep
        ? [keep, ...suggested.filter((c) => c.reparto !== "Da ricomprare")]
        : suggested;
      persist(next);
      setChecked({});
      toast.success("Lista suggerita in base alla tua dieta!");
    } catch (err) {
      toast.error(apiError(err?.response?.data?.detail) || "Errore");
    } finally {
      setLoading(false);
    }
  };

  const removeItem = (i, j) =>
    persist(
      cats
        .map((c, ci) => (ci !== i ? c : { ...c, items: c.items.filter((_, jj) => jj !== j) }))
        .filter((c) => c.items.length)
    );

  const editQty = (i, j, qty) =>
    persist(
      cats.map((c, ci) =>
        ci !== i
          ? c
          : { ...c, items: c.items.map((it, jj) => (jj === j ? { ...it, qty } : it)) }
      )
    );

  const addItem = () => {
    if (!newItem.name.trim()) return;
    const rep = newItem.reparto.trim() || "Altro";
    const base = cats.some((x) => x.reparto === rep) ? cats : [...cats, { reparto: rep, items: [] }];
    persist(
      base.map((x) =>
        x.reparto === rep
          ? { ...x, items: [...x.items, { name: newItem.name.trim(), qty: newItem.qty }] }
          : x
      )
    );
    setNewItem({ name: "", qty: "", reparto: "" });
  };

  const dietLabel = profile?.diet || profile?.goal || "Clean Bulk / Bilanciata";

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <ShoppingCart className="w-6 h-6" />
            <h2 className="font-heading text-2xl font-bold">Lista della Spesa</h2>
          </div>
          <p className="text-muted-foreground mt-1">
            Schema per reparti guidato dalla tua dieta (<strong className="text-foreground">{dietLabel}</strong>): spunta ciò che compri e personalizzalo liberamente.
          </p>
        </div>
        <Button
          data-testid="btn-generate-shopping"
          onClick={generate}
          disabled={loading}
          className="rounded-full bg-primary shrink-0"
        >
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          {cats.length ? "Rigenera lista" : "Suggerisci lista"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-5 rounded-2xl border border-border bg-card p-4">
        <Input
          data-testid="input-shop-name"
          value={newItem.name}
          placeholder="Aggiungi prodotto"
          onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") addItem();
          }}
          className="flex-1 min-w-[160px]"
        />
        <Input
          data-testid="input-shop-qty"
          value={newItem.qty}
          placeholder="Q.tà (es. 500 g)"
          onChange={(e) => setNewItem({ ...newItem, qty: e.target.value })}
          className="w-36"
        />
        <Input
          data-testid="input-shop-reparto"
          list="reparti"
          value={newItem.reparto}
          placeholder="Reparto"
          onChange={(e) => setNewItem({ ...newItem, reparto: e.target.value })}
          className="w-40"
        />
        <datalist id="reparti">
          {REPARTI_SUGGERITI.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <Button data-testid="btn-shop-add" onClick={addItem} className="bg-primary">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {cats.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground"
          data-testid="shopping-empty"
        >
          {loading
            ? "Sto preparando la lista…"
            : 'Nessuna lista ancora. Premi "Suggerisci lista" per creare uno schema in base alla tua dieta.'}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4" data-testid="shopping-list">
          {cats.map((c, i) => (
            <div
              key={c.reparto + i}
              className={`rounded-2xl border bg-card p-5 ${
                c.reparto === "Da ricomprare" ? "border-destructive/40" : "border-border"
              }`}
              data-testid={`shop-cat-${i}`}
            >
              <h3 className="font-heading font-semibold text-primary mb-3">
                {c.reparto === "Da ricomprare" ? "🔁 Da ricomprare" : c.reparto}
              </h3>
              <ul className="space-y-2">
                {c.items?.map((it, j) => {
                  const key = `${i}-${j}`;
                  return (
                    <li key={j} className="flex items-center gap-2.5">
                      <button
                        data-testid={`shop-item-${i}-${j}`}
                        onClick={() => setChecked({ ...checked, [key]: !checked[key] })}
                        className={`w-5 h-5 rounded-md border grid place-items-center shrink-0 ${
                          checked[key] ? "bg-primary border-primary" : "border-border"
                        }`}
                      >
                        {checked[key] && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                      </button>
                      <span
                        className={`text-sm flex-1 ${
                          checked[key] ? "line-through text-muted-foreground" : "text-foreground"
                        }`}
                      >
                        {it.name}
                      </span>
                      <input
                        data-testid={`shop-qty-${i}-${j}`}
                        value={it.qty || ""}
                        onChange={(e) => editQty(i, j, e.target.value)}
                        className="w-24 text-xs text-muted-foreground bg-transparent border-b border-border focus:outline-none focus:border-primary"
                      />
                      <button data-testid={`shop-remove-${i}-${j}`} onClick={() => removeItem(i, j)}>
                        <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}