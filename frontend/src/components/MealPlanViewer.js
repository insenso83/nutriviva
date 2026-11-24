import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, UtensilsCrossed, PartyPopper, FlaskConical, Printer, Bell, ArrowRightLeft, Heart, Store } from "lucide-react";
import { api } from "@/lib/api";
import { MEALS } from "@/lib/constants";
import { enablePush, saveReminders } from "@/lib/push";
import { Button } from "@/components/ui/button";

const MACROS = [
  { key: "protein", label: "P", color: "text-[#1b6b3e] bg-[#eaf5ef]" },
  { key: "carbs", label: "C", color: "text-[#a26715] bg-[#fef7ea]" },
  { key: "fats", label: "G", color: "text-[#9a431c] bg-[#fbf2eb]" },
];
const LS_MEALS = "nv_meal_reminders";

export default function MealPlanViewer({ plan, profile, generating, onGenerate, onSavePlan, onFridgeUpdated }) {
  const [view, setView] = useState("daily");
  const [dayIdx, setDayIdx] = useState(0);
  const [alts, setAlts] = useState({});
  const [loadingAlt, setLoadingAlt] = useState(null);
  const [data, setData] = useState(plan);
  const [swapTo, setSwapTo] = useState("");
  const [remindersOn, setRemindersOn] = useState(false);
  const [eaten, setEaten] = useState({});
  const [eatingId, setEatingId] = useState(null);
  const [customOpen, setCustomOpen] = useState(null);
  const [customText, setCustomText] = useState("");
  const [customLoading, setCustomLoading] = useState(false);
  const [onlyThese, setOnlyThese] = useState(false);
  const [restLoading, setRestLoading] = useState(false);
  const [favs, setFavs] = useState({});
  const [eatOutOpen, setEatOutOpen] = useState(false);
  const [eatOut, setEatOut] = useState({ mealKey: "pranzo", description: "" });
  const [eatOutLoading, setEatOutLoading] = useState(false);

  useEffect(() => {
    setData(plan);
  }, [plan]);

  const skipTraining = async (day) => {
    setRestLoading(true);
    try {
      const { data: res } = await api.post("/plan/rest-day", { day });
      const newPlan = { ...data, days: data.days.map((d) => d.day === day ? res.day : d) };
      setData(newPlan);
      onSavePlan?.(newPlan);
      toast.success(res.note || "Giornata trasformata in riposo: meno carboidrati e calorie.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || err?.message || "Errore");
    } finally {
      setRestLoading(false);
    }
  };

  useEffect(() => {
    api.get("/favorites").then((r) => {
      const m = {};
      (r.data.favorites || []).forEach((f) => { m[f.title] = f.id; });
      setFavs(m);
    }).catch(() => {});
  }, []);

  const toggleFav = async (shown) => {
    try {
      if (favs[shown.title]) {
        await api.delete(`/favorites/${favs[shown.title]}`);
        const n = { ...favs };
        delete n[shown.title];
        setFavs(n);
        toast("Rimosso dai preferiti");
      } else {
        await api.post("/favorites", { meal: shown });
        const r = await api.get("/favorites");
        const m = {};
        (r.data.favorites || []).forEach((f) => { m[f.title] = f.id; });
        setFavs(m);
        toast.success("Salvato nei preferiti ❤️ Verrà riproposto nei prossimi piani");
      }
    } catch {
      toast.error("Errore preferiti");
    }
  };

  const submitEatOut = async (day) => {
    if (!eatOut.description.trim()) return;
    setEatOutLoading(true);
    try {
      const { data: res } = await api.post("/plan/eat-out", { day, ...eatOut });
      const newPlan = { ...data, days: data.days.map((d) => d.day === day ? res.day : d) };
      setData(newPlan);
      onSavePlan?.(newPlan);
      setEatOutOpen(false);
      setEatOut({ mealKey: "pranzo", description: "" });
      toast.success(res.note || "Pasti successivi ribilanciati!");
    } catch (err) {
      toast.error(err?.response?.data?.detail || err?.message || "Errore");
    } finally {
      setEatOutLoading(false);
    }
  };

  const composeMeal = async (day, meal) => {
    if (!customText.trim()) return;
    setCustomLoading(true);
    try {
      const { data: res } = await api.post("/plan/custom-meal", {
        day,
        mealKey: meal.key,
        ingredients: customText,
        currentMeal: meal,
        onlyThese,
      });
      const days = data.days.map((d) => d.day !== day ? d : {
        ...d,
        meals: d.meals.map((m) => m.key === meal.key ? res.meal : m),
        totalCalories: (d.totalCalories || 0) - (meal.calories || 0) + (res.meal.calories || 0),
      });
      const newPlan = { ...data, days };
      setData(newPlan);
      onSavePlan?.(newPlan);
      setCustomOpen(null);
      setCustomText("");
      toast.success(res.meal.added?.length ? `Pasto bilanciato! Aggiunto: ${res.meal.added.join(", ")}` : "Pasto personalizzato");
    } catch (err) {
      toast.error(err?.response?.data?.detail || err?.message || "Errore");
    } finally {
      setCustomLoading(false);
    }
  };

  if (!data?.days?.length) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center">
        <UtensilsCrossed className="w-10 h-10 text-primary mx-auto mb-3" />
        <h3 className="font-heading text-xl font-bold text-primary">Nessun piano attivo</h3>
        <p className="text-muted-foreground mt-1 mb-5">Genera il tuo piano settimanale personalizzato in base a profilo e frigo.</p>
        <Button onClick={onGenerate} disabled={generating} className="rounded-full bg-accent text-accent-foreground px-6">
          <Sparkles className="w-4 h-4 mr-2" />{generating ? "Generazione in corso…" : "Genera piano"}
        </Button>
      </div>
    );
  }

  const currentDay = data.days[dayIdx] || data.days[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {data.days.map((d, idx) => (
            <button
              key={d.day}
              type="button"
              onClick={() => setDayIdx(idx)}
              className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-all ${
                idx === dayIdx
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-primary border-border hover:border-primary/40"
              }`}
            >
              {d.day}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 no-print">
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setView(view === "daily" ? "weekly" : "daily")}>
            {view === "daily" ? "Vista settimanale" : "Vista giornaliera"}
          </Button>
          <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={restLoading} onClick={() => skipTraining(currentDay.day)}>
            <ArrowRightLeft className="w-4 h-4 mr-1" />Giorno di riposo
          </Button>
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setEatOutOpen((v) => !v)}>
            <Store className="w-4 h-4 mr-1" />Pasto fuori
          </Button>
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1" />Stampa
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={async () => {
              const next = !remindersOn;
              setRemindersOn(next);
              try {
                if (next) await enablePush?.();
                saveReminders?.(LS_MEALS, next);
                toast.success(next ? "Promemoria pasti attivi" : "Promemoria disattivati");
              } catch {}
            }}
          >
            <Bell className="w-4 h-4 mr-1" />{remindersOn ? "Promemoria ON" : "Promemoria"}
          </Button>
        </div>
      </div>

      {eatOutOpen && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3 no-print">
          <div className="font-semibold text-primary">Registra un pasto fuori casa ({currentDay.day})</div>
          <div className="flex flex-wrap gap-2">
            <select
              value={eatOut.mealKey}
              onChange={(e) => setEatOut({ ...eatOut, mealKey: e.target.value })}
              className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              {MEALS.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
            </select>
            <input
              type="text"
              value={eatOut.description}
              onChange={(e) => setEatOut({ ...eatOut, description: e.target.value })}
              placeholder="Es. pizza margherita, sushi, hamburger..."
              className="flex-1 min-w-[200px] rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
            <Button type="button" disabled={eatOutLoading} onClick={() => submitEatOut(currentDay.day)} className="rounded-full bg-primary">
              {eatOutLoading ? "Salvo…" : "Applica"}
            </Button>
          </div>
        </div>
      )}

      {data.notes && (
        <div className="rounded-2xl border border-border bg-card px-5 py-3.5 text-sm text-muted-foreground">
          {data.notes}
        </div>
      )}

      {(view === "daily" ? [currentDay] : data.days).map((dayObj) => (
        <section key={dayObj.day} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-2xl font-bold text-primary">
              {dayObj.day}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({dayObj.dayType === "allenamento" ? "Giorno di allenamento" : "Giorno di riposo"} · {dayObj.totalCalories || data.dailyCalories || 2350} kcal)
              </span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(dayObj.meals || []).map((meal) => {
              const mealId = `${dayObj.day}_${meal.key}`;
              const altList = alts[mealId] || [];
              const shown = swapTo === mealId && altList.length > 0 ? altList[0] : meal;
              const isCustom = customOpen === mealId;

              return (
                <div key={meal.key} className="rounded-2xl border border-border bg-card p-5 flex flex-col justify-between gap-4">
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">{meal.key.replace("_", " ")}</span>
                        <h3 className="font-heading text-lg font-bold text-primary leading-snug">{shown.title}</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleFav(shown)}
                        className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-destructive"
                        title="Preferiti"
                      >
                        <Heart className={`w-4 h-4 ${favs[shown.title] ? "fill-destructive text-destructive" : ""}`} />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                      <span className="px-2 py-0.5 rounded-md bg-muted text-primary font-semibold">{shown.calories || 0} kcal</span>
                      {MACROS.map((m) => (
                        <span key={m.key} className={`px-2 py-0.5 rounded-md ${m.color}`}>
                          {m.label}: {shown[m.key] ?? 0}g
                        </span>
                      ))}
                    </div>

                    {Array.isArray(shown.items) && shown.items.length > 0 && (
                      <ul className="text-sm text-foreground/90 space-y-1 pt-1">
                        {shown.items.map((item, i) => <li key={i}>• {item}</li>)}
                      </ul>
                    )}

                    {shown.recipe && (
                      <p className="text-xs text-muted-foreground border-t border-border pt-2">{shown.recipe}</p>
                    )}

                    {isCustom && (
                      <div className="pt-2 space-y-2 border-t border-border">
                        <input
                          type="text"
                          value={customText}
                          onChange={(e) => setCustomText(e.target.value)}
                          placeholder="Ingredienti da usare..."
                          className="w-full rounded-xl border border-input bg-background px-3 py-1.5 text-sm"
                        />
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <input type="checkbox" checked={onlyThese} onChange={(e) => setOnlyThese(e.target.checked)} />
                          Usa solo questi ingredienti
                        </label>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" disabled={customLoading} onClick={() => composeMeal(dayObj.day, meal)} className="rounded-full bg-primary">
                            {customLoading ? "Calcolo…" : "Componi"}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setCustomOpen(null)}>Annulla</Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border no-print">
                    <Button
                      type="button"
                      size="sm"
                      variant={eaten[mealId] ? "secondary" : "outline"}
                      className="rounded-full text-xs"
                      disabled={eatingId === mealId}
                      onClick={async () => {
                        setEatingId(mealId);
                        try {
                          await api.post("/meals/eaten", { day: dayObj.day, mealKey: meal.key, meal: shown });
                          setEaten((prev) => ({ ...prev, [mealId]: !prev[mealId] }));
                          toast.success("Pasto registrato");
                        } catch {
                          toast.error("Errore registrazione pasto");
                        } finally {
                          setEatingId(null);
                        }
                      }}
                    >
                      {eaten[mealId] ? "Mangiato ✓" : "Segna mangiato"}
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="rounded-full text-xs"
                      disabled={loadingAlt === mealId}
                      onClick={async () => {
                        setLoadingAlt(mealId);
                        try {
                          const { data: res } = await api.post("/plan/alternatives", { day: dayObj.day, mealKey: meal.key, meal: shown, profile });
                          if (Array.isArray(res?.alternatives) && res.alternatives.length > 0) {
                            setAlts((prev) => ({ ...prev, [mealId]: res.alternatives }));
                            setSwapTo((prev) => (prev === mealId ? "" : mealId));
                          }
                        } catch {
                          toast.error("Nessuna alternativa disponibile");
                        } finally {
                          setLoadingAlt(null);
                        }
                      }}
                    >
                      <FlaskConical className="w-3.5 h-3.5 mr-1" />{loadingAlt === mealId ? "Cerco…" : "Alternativa"}
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="rounded-full text-xs"
                      onClick={() => {
                        setCustomOpen(isCustom ? null : mealId);
                        setCustomText("");
                        setOnlyThese(false);
                        onFridgeUpdated?.(profile?.fridgeItems || []);
                      }}
                    >
                      <PartyPopper className="w-3.5 h-3.5 mr-1" />Componi
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
