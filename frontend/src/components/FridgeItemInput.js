import { useEffect, useState } from "react";
import { Plus, X, Search, Loader2, ScanBarcode, CalendarClock } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BarcodeScanner from "@/components/BarcodeScanner";

const UNITS = ["pz", "g", "kg", "ml", "l", "conf"];

const fmt = (p) => `${p.name}${p.brand ? ` (${p.brand})` : ""} [${p.kcal} kcal/100g, P ${p.protein} C ${p.carbs} G ${p.fats}]`;

export const expiryOf = (it) => { const m = it.match(/scade il (\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; };
const itemTotals = (it) => {
  const q = it.match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|pz)\s/i);
  const v = it.match(/\[(\d+(?:\.\d+)?) kcal\/100g, P ([\d.]+) C ([\d.]+) G ([\d.]+)(?:, ([\d.]+) g\/pz)?\]/);
  if (!q || !v) return null;
  const n = parseFloat(q[1].replace(",", ".")), u = q[2].toLowerCase();
  const g = u === "g" ? n : u === "kg" ? n * 1000 : n * (parseFloat(v[5]) || 0);
  if (!g) return null;
  const t = (x) => Math.round(parseFloat(x) * g) / 100;
  return `${Math.round(t(v[1]))} kcal · P ${Math.round(t(v[2]))} C ${Math.round(t(v[3]))} G ${Math.round(t(v[4]))}`;
};

export const daysLeft = (d) => Math.ceil((new Date(d) - new Date(new Date().toISOString().slice(0, 10))) / 86400000);

export default function FridgeItemInput({ items, onChange, warnItems = [], onDeplete }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("pz");
  const [expiry, setExpiry] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [picked, setPicked] = useState(null);
  const [scan, setScan] = useState(false);

  useEffect(() => {
    setSearched(false);
    if (picked || name.trim().length < 3) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try { const { data } = await api.get("/foods/search", { params: { q: name.trim() } }); setResults(data.results || []); }
      catch { setResults([]); }
      finally { setSearching(false); setSearched(true); }
    }, 500);
    return () => clearTimeout(t);
  }, [name, picked]);

  const add = () => {
    const n = picked ? fmt(picked) : name.trim();
    if (!n) return;
    let label = qty ? `${qty} ${unit} ${n}` : n;
    if (expiry) label += ` (scade il ${expiry})`;
    if (!items.includes(label)) onChange([...items, label]);
    setName(""); setQty(""); setExpiry(""); setPicked(null); setResults([]); setSearched(false);
  };

  const pick = (p) => { setPicked(p); setName(`${p.name}${p.brand ? ` (${p.brand})` : ""}`); setResults([]); setScan(false); if (unit === "pz") setUnit("g"); };
  const notFound = searched && !searching && results.length === 0 && !picked && name.trim().length >= 3;

  return (
    <div>
      <div className="flex flex-wrap sm:flex-nowrap gap-2">
        <Input type="number" min="0" data-testid="input-fridge-qty" value={qty} placeholder="Q.tà"
          onChange={(e) => setQty(e.target.value)} className="w-24 shrink-0" />
        <select data-testid="select-fridge-unit" value={unit} onChange={(e) => setUnit(e.target.value)}
          className="rounded-md border border-input bg-card px-2 text-sm h-9 shrink-0">
          {UNITS.map((u) => <option key={u}>{u}</option>)}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Input data-testid="input-fridge-item" value={name} placeholder="Ingrediente o prodotto di marca (es. mozzarella milbona)"
            onChange={(e) => { setName(e.target.value); setPicked(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} className="pr-8" />
          <span className="absolute right-2.5 top-2.5 text-muted-foreground">
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </span>
          {results.length > 0 && (
            <div className="absolute z-30 mt-1 w-full max-h-72 overflow-auto rounded-xl border border-border bg-card shadow-lg" data-testid="food-results">
              {results.map((p, i) => (
                <button key={p.code || i} type="button" data-testid={`food-result-${i}`} onClick={() => pick(p)}
                  className="w-full text-left px-3 py-2 hover:bg-secondary border-b border-border last:border-0">
                  <div className="text-sm font-medium text-primary">{p.name} {p.brand && <span className="text-muted-foreground font-normal">· {p.brand}</span>} {p.quantity && <span className="text-xs text-muted-foreground">({p.quantity})</span>}</div>
                  <div className="text-xs text-muted-foreground font-mono">{p.kcal} kcal/100g · P {p.protein} · C {p.carbs} · G {p.fats}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button type="button" data-testid="btn-add-fridge" onClick={add} className="bg-primary shrink-0"><Plus className="w-4 h-4" /></Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="w-3.5 h-3.5" />Scadenza (facoltativa)
          <Input type="date" data-testid="input-fridge-expiry" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="h-8 w-40 text-xs" />
        </label>
        {notFound && (
          <Button type="button" size="sm" variant="outline" data-testid="btn-open-scanner" onClick={() => setScan(true)} className="rounded-full h-8 text-xs border-accent">
            <ScanBarcode className="w-3.5 h-3.5 mr-1" />Non trovato: scansiona il codice a barre
          </Button>
        )}
      </div>
      {scan && <BarcodeScanner initialName={name} onClose={() => setScan(false)} onProduct={pick} />}
      {picked && <p className="text-xs text-[#1b6b3e] mt-1.5" data-testid="food-picked">✓ {picked.brand || picked.name}: {picked.kcal} kcal/100g · P {picked.protein} C {picked.carbs} G {picked.fats}</p>}
      <p className="text-xs text-muted-foreground mt-1.5">Cerca i prodotti confezionati per marca (Lidl, Eurospin, Todis, Esselunga, Granarolo…) per avere le calorie reali. Frutta, verdura, carne e pesce fresco: scrivi solo il nome (valori standard). Pesce surgelato: cerca la marca.</p>
      <div className="flex flex-wrap gap-2 mt-3">
        {items.map((it) => {
          const warn = warnItems.some((w) => it.toLowerCase().includes((w || "").toLowerCase()));
          const exp = expiryOf(it);
          const dl = exp ? daysLeft(exp) : null;
          const expCls = dl === null ? "" : dl < 0 ? "ring-2 ring-destructive" : dl <= 3 ? "ring-2 ring-accent" : "";
          return (
            <span key={it} data-testid="fridge-chip" title={dl !== null ? (dl < 0 ? "Scaduto" : `Scade tra ${dl} giorni`) : ""}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm ${expCls} ${warn ? "bg-destructive/10 text-destructive border border-destructive/30" : "bg-secondary text-primary"}`}>
              {dl !== null && dl <= 3 && <span className="text-xs font-semibold">{dl < 0 ? "⛔" : "⏳"}</span>}
              {it}
              {itemTotals(it) && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-primary/10" data-testid="fridge-chip-totals">tot {itemTotals(it)}</span>}
              {onDeplete && <button data-testid="btn-deplete" title="Esaurito: togli dal frigo e aggiungi alla spesa" onClick={() => onDeplete(it)}
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-card border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40">Esaurito</button>}
              <button onClick={() => onChange(items.filter((x) => x !== it))}><X className="w-3.5 h-3.5" /></button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
