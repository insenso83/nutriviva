import { SUPPLEMENTS, VARIANT_TIPS, DAYS, MEALS } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const MOMENTS = [
  { id: "auto", label: "Decide l'app" }, { id: "colazione", label: "Colazione" }, { id: "pranzo", label: "Pranzo" },
  { id: "cena", label: "Cena" }, { id: "pre-allenamento", label: "Pre-allenamento" }, { id: "post-allenamento", label: "Post-allenamento" }, { id: "pre-nanna", label: "Pre-nanna" },
];

export function NutritionistDiet({ has, diet, onChange }) {
  return (
    <div data-testid="nutritionist-section">
      <div className="flex gap-2">
        <button type="button" data-testid="nutri-yes" onClick={() => onChange({ hasNutritionist: true })}
          className={`px-3 py-1.5 rounded-full text-sm border ${has ? "bg-primary text-primary-foreground border-primary" : "bg-card text-primary border-border"}`}>Sì, sono seguito da un nutrizionista</button>
        <button type="button" data-testid="nutri-no" onClick={() => onChange({ hasNutritionist: false })}
          className={`px-3 py-1.5 rounded-full text-sm border ${has === false ? "bg-primary text-primary-foreground border-primary" : "bg-card text-primary border-border"}`}>No</button>
      </div>
      {has && (
        <>
          <Textarea data-testid="input-nutritionist-diet" rows={8} value={diet || ""} onChange={(e) => onChange({ nutritionistDiet: e.target.value })} className="mt-3 text-sm"
            placeholder={"Copia qui la dieta del nutrizionista, pasto per pasto, con le grammature. Es.\nColazione: 200 g yogurt greco 0%, 40 g fiocchi d'avena, 1 frutto\nPranzo: 80 g pasta integrale oppure 80 g riso basmati; 150 g petto di pollo oppure 200 g merluzzo; verdure a piacere; 10 g olio EVO\n..."} />
          <p className="text-xs text-[#1b6b3e] mt-1">L'app userà solo gli alimenti e le grammature del tuo nutrizionista, variando le combinazioni nella settimana.</p>
        </>
      )}
    </div>
  );
}

// Variant + brand for each selected supplement
export function SupplementDetails({ selected = [], details = {}, onChange }) {
  const set = (id, k, v) => onChange({ ...details, [id]: { ...(details[id] || {}), [k]: v } });
  const list = SUPPLEMENTS.filter((s) => selected.includes(s.id));
  if (!list.length) return null;
  return (
    <div className="space-y-3 mt-3" data-testid="supplement-details">
      {list.map((s) => {
        const d = details[s.id] || {};
        return (
          <div key={s.id} className="rounded-xl border border-border bg-secondary/40 p-3">
            <div className="text-sm font-semibold text-primary mb-2">{s.label}</div>
            <div className="grid sm:grid-cols-2 gap-2">
              <select data-testid={`select-variant-${s.id}`} value={d.variant || ""} onChange={(e) => set(s.id, "variant", e.target.value)}
                className="rounded-md border border-input bg-card px-2 text-sm h-9">
                <option value="">Tipologia…</option>
                {s.variants.map((v) => <option key={v}>{v}</option>)}
              </select>
              <Input data-testid={`input-brand-${s.id}`} value={d.brand || ""} placeholder="Marca (es. MyProtein, Prozis, Yamamoto…)"
                onChange={(e) => set(s.id, "brand", e.target.value)} />
            </div>
            {VARIANT_TIPS[d.variant] && <p className="text-xs text-[#1b6b3e] mt-1.5">💡 {VARIANT_TIPS[d.variant]}</p>}
            <div className="mt-2">
              <div className="text-[11px] text-muted-foreground mb-1">Quando vuoi assumerlo?</div>
              <div className="flex flex-wrap gap-1.5">
                {MOMENTS.map((m) => {
                  const cur = d.moments || ["auto"];
                  const on = cur.includes(m.id);
                  const next = m.id === "auto" ? ["auto"] : on ? cur.filter((x) => x !== m.id) : [...cur.filter((x) => x !== "auto"), m.id];
                  return (
                    <button key={m.id} type="button" data-testid={`moment-${s.id}-${m.id}`} onClick={() => set(s.id, "moments", next.length ? next : ["auto"])}
                      className={`px-2.5 py-1 rounded-full text-xs border ${on ? "bg-primary text-primary-foreground border-primary" : "bg-card text-primary border-border"}`}>{m.label}</button>
                  );
                })}
              </div>
            </div>
            {s.id === "creatina" && (
              <div className="mt-2 text-xs" data-testid="creatine-loading">
                <span className="text-muted-foreground">Hai già fatto la fase di carico (3 scoop/die ≈ 18 g per 2 settimane)?</span>
                <div className="flex gap-1.5 mt-1">
                  <button type="button" data-testid="loading-done-yes" onClick={() => set(s.id, "loadingDone", true)}
                    className={`px-2.5 py-1 rounded-full border ${d.loadingDone === true ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>Sì, già fatto</button>
                  <button type="button" data-testid="loading-done-no" onClick={() => onChange({ ...details, creatina: { ...d, loadingDone: false, loadingStart: d.loadingStart || new Date().toISOString().slice(0, 10) } })}
                    className={`px-2.5 py-1 rounded-full border ${d.loadingDone === false ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>No, inizio ora</button>
                </div>
                {d.loadingDone === false && <p className="text-[#1b6b3e] mt-1">💡 Carico dal {d.loadingStart}: 3 scoop al giorno per 2 settimane, poi 1 scoop a colazione + 1 dopo l'allenamento.</p>}
              </div>
            )}
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid={`stock-fields-${s.id}`}>
              <label className="text-[11px] text-muted-foreground">Confezione (g)
                <Input type="number" data-testid={`input-pkg-${s.id}`} value={d.packageGrams || ""} placeholder="1000" onChange={(e) => set(s.id, "packageGrams", e.target.value)} className="h-8" /></label>
              <label className="text-[11px] text-muted-foreground">Dose (g)
                <Input type="number" data-testid={`input-dose-${s.id}`} value={d.doseGrams || ""} placeholder="30" onChange={(e) => set(s.id, "doseGrams", e.target.value)} className="h-8" /></label>
              <label className="text-[11px] text-muted-foreground">Volte/settimana
                <Input type="number" data-testid={`input-tpw-${s.id}`} value={d.timesPerWeek || ""} placeholder="4" onChange={(e) => set(s.id, "timesPerWeek", e.target.value)} className="h-8" /></label>
              <label className="text-[11px] text-muted-foreground">Aperta il
                <Input type="date" data-testid={`input-opened-${s.id}`} value={d.openedAt || ""} onChange={(e) => set(s.id, "openedAt", e.target.value)} className="h-8" /></label>
            </div>
            {d.packageGrams && d.doseGrams && d.timesPerWeek && (
              <p className="text-xs text-primary mt-1.5" data-testid={`stock-estimate-${s.id}`}>
                ⏳ Una confezione dura circa <strong>{Math.round(d.packageGrams / (d.doseGrams * d.timesPerWeek / 7))} giorni</strong> (≈ {(d.packageGrams / (d.doseGrams * d.timesPerWeek / 7) / 30).toFixed(1)} mesi). Avviso 14 giorni prima.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MealPreferences({ value = {}, likes = "", dislikes = "", onChange }) {
  return (
    <div className="space-y-3" data-testid="meal-preferences">
      <div className="grid sm:grid-cols-2 gap-3">
        {MEALS.map((m) => (
          <label key={m.key} className="text-xs text-muted-foreground">{m.name}
            <Textarea data-testid={`pref-${m.key}`} rows={2} value={value[m.key] || ""}
              placeholder={m.key === "spuntino_mattina" ? "es. 200 g yogurt greco, 4 Gran Cereale, caffè e cacao amaro" : "Cosa ti piace mangiare in questo pasto (facoltativo)"}
              onChange={(e) => onChange({ mealPreferences: { ...value, [m.key]: e.target.value } })} className="mt-1 text-sm" />
          </label>
        ))}
      </div>
      <label className="block text-xs text-muted-foreground">Cibi / fonti che preferisci
        <Input data-testid="input-food-likes" value={likes} placeholder="es. come carboidrati preferisco patate e gnocchi; pesce azzurro; frutti di bosco"
          onChange={(e) => onChange({ foodLikes: e.target.value })} className="mt-1" />
      </label>
      <label className="block text-xs text-muted-foreground">Cibi che non ti piacciono (non verranno usati)
        <Input data-testid="input-food-dislikes" value={dislikes} placeholder="es. finocchi, fegato, cavolfiore"
          onChange={(e) => onChange({ foodDislikes: e.target.value })} className="mt-1" />
      </label>
    </div>
  );
}

export function TrainingDaysPicker({ value = [], onChange }) {
  const toggle = (d) => onChange(value.includes(d) ? value.filter((x) => x !== d) : DAYS.filter((x) => value.includes(x) || x === d));
  return (
    <div className="flex flex-wrap gap-2" data-testid="training-days">
      {DAYS.map((d) => (
        <button key={d} type="button" data-testid={`chip-tday-${d}`} onClick={() => toggle(d)}
          className={`px-3 py-1.5 rounded-full text-sm border transition-all ${value.includes(d) ? "bg-accent text-accent-foreground border-accent" : "bg-card text-primary border-border"}`}>
          {d.slice(0, 3)}
        </button>
      ))}
    </div>
  );
}
