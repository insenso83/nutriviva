import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CookingPot, RefreshCw, ChevronDown } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";

const MACROS = [
  { key: "protein", label: "P", color: "text-[#1b6b3e] bg-[#eaf5ef]" },
  { key: "carbs", label: "C", color: "text-[#a26715] bg-[#fef7ea]" },
  { key: "fats", label: "G", color: "text-[#9a431c] bg-[#fbf2eb]" },
];

export default function RecipesPanel() {
  const [recipes, setRecipes] = useState([]);
  const [open, setOpen] = useState(0);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState([]);

  useEffect(() => { api.get("/recipes/light").then((r) => setRecipes(r.data?.recipes || [])); }, []);
  useEffect(() => { api.get("/favorites").then((r) => setFavorites(r.data.favorites || [])).catch(() => {}); }, []);

  const removeFav = async (id) => { await api.delete(`/favorites/${id}`); setFavorites(favorites.filter((f) => f.id !== id)); };

  const generate = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/recipes/light");
      setRecipes(data?.recipes || []);
      toast.success("Nuove ricette generate!");
    } catch (err) { toast.error(apiError(err.response?.data?.detail) || "Errore"); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 text-primary"><CookingPot className="w-6 h-6" />
            <h2 className="font-heading text-2xl font-bold">Ricette Light</h2></div>
          <p className="text-muted-foreground mt-1">Dolci e snack fit gustosi, con macro e preparazione. Es. tiramisù allo yogurt greco.</p>
        </div>
        <Button data-testid="btn-generate-recipes" onClick={generate} disabled={loading} className="rounded-full bg-primary shrink-0">
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />Genera nuove
        </Button>
      </div>

      <div className="mb-6 rounded-2xl border border-[#c85a32]/30 bg-card p-5" data-testid="favorites-list">
        <h3 className="font-heading font-semibold text-primary mb-1">❤️ I tuoi pasti preferiti</h3>
        <p className="text-xs text-muted-foreground mb-3">Salvali con il cuore nei pasti del piano: verranno riproposti nei prossimi piani.</p>
        {favorites.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="favorites-empty">Nessun preferito ancora.</p> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {favorites.map((f) => (
              <div key={f.id} className="rounded-xl border border-border p-3" data-testid={`favorite-${f.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-sm text-primary">{f.title}</span>
                  <button data-testid={`btn-remove-fav-${f.id}`} onClick={() => removeFav(f.id)} className="text-xs text-muted-foreground hover:text-destructive">Rimuovi</button>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{f.calories} kcal · P{f.protein} C{f.carbs} G{f.fats}</div>
                {f.items?.length > 0 && <p className="text-xs text-foreground/70 mt-1">{f.items.join(", ")}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3" data-testid="recipes-list">
        {recipes.map((r, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden" data-testid={`recipe-${i}`}>
            <button onClick={() => setOpen(open === i ? -1 : i)} className="w-full flex items-center justify-between p-5 text-left">
              <div>
                <h3 className="font-heading font-semibold text-primary">{r.title}</h3>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-sm font-mono text-primary">{r.kcal} kcal</span>
                  {MACROS.map((m) => (
                    <span key={m.key} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m.color}`}>{m.label} {r[m.key] ?? 0}g</span>
                  ))}
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${open === i ? "rotate-180" : ""}`} />
            </button>
            {open === i && (
              <div className="px-5 pb-5 grid sm:grid-cols-2 gap-5 border-t border-border pt-4">
                <div>
                  <h4 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Ingredienti</h4>
                  <ul className="list-disc ml-5 text-sm text-foreground/80 space-y-1">
                    {r.ingredients?.map((it, j) => <li key={j}>{it}</li>)}
                  </ul>
                </div>
                <div>
                  <h4 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Preparazione</h4>
                  <ol className="list-decimal ml-5 text-sm text-foreground/80 space-y-1">
                    {r.steps?.map((s, j) => <li key={j}>{s}</li>)}
                  </ol>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
