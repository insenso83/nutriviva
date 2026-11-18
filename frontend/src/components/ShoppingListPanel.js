import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShoppingCart, RefreshCw, Check, Plus, X, Refrigerator, ScanText } from "lucide-react";
import LabelScanner from "@/components/LabelScanner";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ShoppingListPanel({ profile, onProfile }) {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState({});
  const [newItem, setNewItem] = useState({ name: "", qty: "", reparto: "" });
  const [labelOpen, setLabelOpen] = useState(false);

  useEffect(() => { api.get("/shopping-list").then((r) => setCats(r.data?.categories || [])).catch(() => {}); }, []);

  const persist = (c) => { setCats(c); api.put("/shopping-list", { categories: c }).catch(() => {}); };

  const generate = async () => {
    setLoading(true);
    try {
      const keep = cats.find((c) => c.reparto === "Da ricomprare");
      const { data } = await api.post("/shopping-list");
      const next = keep ? [keep, ...(data.categories || []).filter((c) => c.reparto !== "Da ricomprare")] : data.categories || [];
      persist(next); setChecked({});
      toast.success("Lista suggerita pronta! Puoi modificarla.");
    } catch (err) { toast.error(apiError(err.response?.data?.detail) || "Errore"); }
    finally { setLoading(false); }
  };

  const removeItem = (i, j) => persist(cats.map((c, ci) => ci !== i ? c : { ...c, items: c.items.filter((_, jj) => jj !== j) }).filter((c) => c.items.length));
  const editQty = (i, j, qty) => persist(cats.map((c, ci) => ci !== i ? c : { ...c, items: c.items.map((it, jj) => jj === j ? { ...it, qty } : it) }));

  const addItem = () => {
    if (!newItem.name.trim()) return;
    const rep = newItem.reparto.trim() || "Altro";
    const c = cats.some((x) => x.reparto === rep) ? cats : [...cats, { reparto: rep, items: [] }];
    persist(c.map((x) => x.reparto === rep ? { ...x, items: [...x.items, { name: newItem.name.trim(), qty: newItem.qty }] } : x));
    setNewItem({ name: "", qty: "", reparto: "" });
  };

  const boughtToFridge = async () => {
    const bought = [];
    cats.forEach((c, i) => c.items.forEach((it, j) => { if (checked[`${i}-${j}`]) bought.push({ i, j, label: [it.qty, it.name].filter(Boolean).join(" ") }); }));
    if (!bought.length) return;
    try {
      const fridge = [...(profile?.fridgeItems || []), ...bought.map((b) => b.label)];
      const { data } = await api.put("/profile", { fridgeItems: fridge });
      onProfile?.(data.profile);
      persist(cats.map((c, i) => ({ ...c, items: c.items.filter((_, j) => !checked[`${i}-${j}`]) })).filter((c) => c.items.length));
      setChecked({});
      toast.success(`${bought.length} prodotti aggiunti al frigo!`);
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const addScanned = async (label, p) => {
    setLabelOpen(false);
    try {
      const { data } = await api.put("/profile", { fridgeItems: [...(profile?.fridgeItems || []), label] });
      onProfile?.(data.profile);
      const STOP = ["con", "del", "della", "dei", "alla", "allo", "agli", "per", "senza", "gusto", "light", "bio", "zero"];
      const key = p.name.toLowerCase().split(/[\s,.%()-]+/).find((w) => w.length > 3 && !STOP.includes(w));
      let matched = null;
      const next = cats.map((c) => ({ ...c, items: c.items.filter((it) => {
        const hit = !!key && !matched && it.name.toLowerCase().includes(key);
        if (hit) matched = it.name;
        return !hit;
      }) })).filter((c) => c.items.length);
      if (matched) { persist(next); setChecked({}); }
      toast.success(matched ? `${p.name} aggiunto al frigo · "${matched}" segnato come acquistato` : `${p.name} aggiunto al frigo!`);
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const nChecked = Object.values(checked).filter(Boolean).length;

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 text-primary"><ShoppingCart className="w-6 h-6" />
            <h2 className="font-heading text-2xl font-bold">Lista della Spesa</h2></div>
          <p className="text-muted-foreground mt-1">Suggerita dai pasti del piano (esclude ciò che hai nel frigo). Modificala come vuoi: spunta ciò che compri e mettilo nel frigo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button data-testid="btn-shop-scan-label" onClick={() => setLabelOpen(true)} variant="outline" className="rounded-full border-accent">
            <ScanText className="w-4 h-4 mr-1.5" />Scansiona etichetta
          </Button>
          {nChecked > 0 && (
            <Button data-testid="btn-bought-to-fridge" onClick={boughtToFridge} variant="outline" className="rounded-full border-accent">
              <Refrigerator className="w-4 h-4 mr-1.5" />Metti nel frigo ({nChecked})
            </Button>
          )}
          <Button data-testid="btn-generate-shopping" onClick={generate} disabled={loading} className="rounded-full bg-primary shrink-0">
  <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />{cats.length ? "Rigenera lista" : "Suggerisci lista"}
</Button>
        </div>
      </div>

      {labelOpen && <LabelScanner onClose={() => setLabelOpen(false)} onConfirm={addScanned} confirmText="Acquistato: aggiungi al frigo" />}
      <div className="flex flex-wrap gap-2 mb-5 rounded-2xl border border-border bg-card p-4">
        <Input data-testid="input-shop-name" value={newItem.name} placeholder="Aggiungi prodotto" onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") addItem(); }} className="flex-1 min-w-[160px]" />
        <Input data-testid="input-shop-qty" value={newItem.qty} placeholder="Q.tà (es. 500 g)" onChange={(e) => setNewItem({ ...newItem, qty: e.target.value })} className="w-36" />
        <Input data-testid="input-shop-reparto" list="reparti" value={newItem.reparto} placeholder="Reparto" onChange={(e) => setNewItem({ ...newItem, reparto: e.target.value })} className="w-40" />
        <datalist id="reparti">{["Frutta e Verdura", "Carne e Pesce", "Latticini e Uova", "Dispensa e Cereali", "Surgelati", "Integratori", "Altro"].map((r) => <option key={r} value={r} />)}</datalist>
        <Button data-testid="btn-shop-add" onClick={addItem} className="bg-primary"><Plus className="w-4 h-4" /></Button>
      </div>

      {cats.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground" data-testid="shopping-empty">
          {loading ? "Sto preparando la lista…" : "Nessuna lista ancora. Premi \"Suggerisci lista\" per crearla dai pasti della settimana."}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4" data-testid="shopping-list">
          {cats.map((c, i) => (
            <div key={c.reparto + i} className={`rounded-2xl border bg-card p-5 ${c.reparto === "Da ricomprare" ? "border-destructive/40" : "border-border"}`} data-testid={`shop-cat-${i}`}>
              <h3 className="font-heading font-semibold text-primary mb-3">{c.reparto === "Da ricomprare" ? "🔁 Da ricomprare (esauriti)" : c.reparto}</h3>
              <ul className="space-y-2">
                {c.items?.map((it, j) => {
                  const key = `${i}-${j}`;
                  return (
                    <li key={j} className="flex items-center gap-2.5">
                      <button data-testid={`shop-item-${i}-${j}`} onClick={() => setChecked({ ...checked, [key]: !checked[key] })}
                        className={`w-5 h-5 rounded-md border grid place-items-center shrink-0 ${checked[key] ? "bg-primary border-primary" : "border-border"}`}>
                        {checked[key] && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                      </button>
                      <span className={`text-sm flex-1 ${checked[key] ? "line-through text-muted-foreground" : "text-foreground"}`}>{it.name}</span>
                      <input data-testid={`shop-qty-${i}-${j}`} value={it.qty || ""} onChange={(e) => editQty(i, j, e.target.value)}
                        className="w-20 text-xs text-muted-foreground bg-transparent border-b border-border focus:outline-none focus:border-primary" />
                      <button data-testid={`shop-remove-${i}-${j}`} onClick={() => removeItem(i, j)}><X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" /></button>
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
