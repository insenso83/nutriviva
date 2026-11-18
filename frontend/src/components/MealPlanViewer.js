import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, UtensilsCrossed, PartyPopper, FlaskConical, Printer, Bell, ArrowRightLeft, Heart, Store } from "lucide-react";
import { api, apiError } from "@/lib/api";
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

  const skipTraining = async (day) => {
    setRestLoading(true);
    try {
      const { data: res } = await api.post("/plan/rest-day", { day });
      const newPlan = { ...data, days: data.days.map((d) => d.day === day ? res.day : d) };
      setData(newPlan); onSavePlan?.(newPlan);
      toast.success(res.note || "Giornata trasformata in riposo: meno carboidrati e calorie.");
    } catch (err) { toast.error(apiError(err.response?.data?.detail) || "Errore"); }
    finally { setRestLoading(false); }
  };
  const [favs, setFavs] = useState({});
  const [eatOutOpen, setEatOutOpen] = useState(false);
  const [eatOut, setEatOut] = useState({ mealKey: "pranzo", description: "" });
  const [eatOutLoading, setEatOutLoading] = useState(false);

  useEffect(() => {
    api.get("/favorites").then((r) => { const m = {}; (r.data.favorites || []).forEach((f) => { m[f.title] = f.id; }); setFavs(m); }).catch(() => {});
  }, []);

  const toggleFav = async (shown) => {
    try {
      if (favs[shown.title]) {
        await api.delete(`/favorites/${favs[shown.title]}`);
        const n = { ...favs }; delete n[shown.title]; setFavs(n);
        toast("Rimosso dai preferiti");
      } else {
        await api.post("/favorites", { meal: shown });
        const r = await api.get("/favorites");
        const m = {}; (r.data.favorites || []).forEach((f) => { m[f.title] = f.id; }); setFavs(m);
        toast.success("Salvato nei preferiti ❤️ Verrà riproposto nei prossimi piani");
      }
    } catch { toast.error("Errore preferiti"); }
  };

  const submitEatOut = async (day) => {
    if (!eatOut.description.trim()) return;
    setEatOutLoading(true);
    try {
      const { data: res } = await api.post("/plan/eat-out", { day, ...eatOut });
      const newPlan = { ...data, days: data.days.map((d) => d.day === day ? res.day : d) };
      setData(newPlan); onSavePlan?.(newPlan);
      setEatOutOpen(false); setEatOut({ mealKey: "pranzo", description: "" });
      toast.success(res.note || "Pasti successivi ribilanciati!");
    } catch (err) { toast.error(apiError(err.response?.data?.detail) || "Errore"); }
    finally { setEatOutLoading(false); }
  };

  const composeMeal = async (day, meal) => {
    if (!customText.trim()) return;
    setCustomLoading(true);
    try {
      const { data: res } = await api.post("/plan/custom-meal", { day, mealKey: meal.key, ingredients: customText, currentMeal: meal, onlyThese });
      const days = data.days.map((d) => d.day !== day ? d : {
        ...d, meals: d.meals.map((m) => m.key === meal.key ? res.meal : m),
        totalCalories: (d.totalCalories || 0) - (meal.calories || 0) + (res.meal.calories || 0),
      });
      const newPlan = { ...data, days };
      setData(newPlan); onSavePlan?.(newPlan);
      setCustomOpen(null); setCustomText("");
      toast.success(res.meal.added?.length ? `Pasto bilanciato! Aggiunto: ${res.meal.added.join(", ")}` : "Pasto bilanciato con i tuoi ingredienti!");
    } catch (err) { toast.error(apiError(err.response?.data?.detail) || "Errore"); }
    finally { setCustomLoading(false); }
  };

  useEffect(() => {
    api.get("/meals/eaten").then((r) => {
      const m = {}; (r.data.eaten || []).forEach((e) => { m[`${e.planDay}-${e.mealKey}`] = true; }); setEaten(m);
    }).catch(() => {});
  }, []);

  const toggleEaten = async (day, meal, shown) => {
    const id = `${day}-${meal.key}`;
    setEatingId(id);
    try {
      if (eaten[id]) {
        await api.delete("/meals/eaten", { params: { planDay: day, mealKey: meal.key } });
        setEaten({ ...eaten, [id]: false });
        toast("Pasto non più segnato (il frigo non viene ripristinato)");
      } else {
        const { data: res } = await api.post("/meals/eaten", { planDay: day, mealKey: meal.key, meal: { ...shown, libero: meal.libero } });
        setEaten({ ...eaten, [id]: true });
        if (res.fridgeItems) onFridgeUpdated?.(res.fridgeItems);
        toast.success(res.removed?.length ? `Pasto segnato! Scalato dal frigo: ${res.removed.join(", ")}` : "Pasto segnato come mangiato!");
      }
    } catch (err) { toast.error(apiError(err.response?.data?.detail) || "Errore"); }
    finally { setEatingId(null); }
  };

  useEffect(() => { setData(plan); }, [plan]);
  useEffect(() => { setRemindersOn(JSON.parse(localStorage.getItem(LS_MEALS) || "false")); }, []);

  useEffect(() => {
    if (!remindersOn) return;
    const fired = {};
    const id = setInterval(() => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      MEALS.forEach((m) => {
        const t = m.time.split(" - ")[0];
        if (t === hhmm && fired[m.key] !== hhmm) {
          fired[m.key] = hhmm;
          toast(`⏰ È ora di: ${m.name}`);
        }
      });
    }, 20000);
    return () => clearInterval(id);
  }, [remindersOn]);

  if (!data || !data.days) {
    return (
      <div className="grid place-items-center py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-secondary grid place-items-center mb-4"><UtensilsCrossed className="w-8 h-8 text-primary" /></div>
        <h3 className="font-heading text-2xl font-bold text-primary">Nessun piano ancora</h3>
        <p className="text-muted-foreground mt-1 mb-5 max-w-md">Genera il tuo piano alimentare personalizzato di 7 giorni basato su frigo, obiettivi e dieta.</p>
        <Button data-testid="btn-generate-empty" onClick={onGenerate} disabled={generating} className="rounded-full bg-primary h-11 px-8">
          <Sparkles className="w-4 h-4 mr-2" />{generating ? "Genero…" : "Genera il mio piano"}
        </Button>
      </div>
    );
  }

  const requestAlt = async (day, meal) => {
    const id = `${day}-${meal.key}`;
    setLoadingAlt(id);
    try {
      const { data: res } = await api.post("/plan/alternative", { day, mealKey: meal.key, currentMeal: meal });
      setAlts({ ...alts, [id]: res.alternative });
      toast.success("Alternativa pronta!");
    } catch (err) { toast.error(apiError(err.response?.data?.detail) || "Errore alternativa"); }
    finally { setLoadingAlt(null); }
  };

  const mealName = (k) => MEALS.find((m) => m.key === k)?.name || k;

  const exportPdf = () => { setView("weekly"); setTimeout(() => window.print(), 300); };

  const swapDay = () => {
    const to = parseInt(swapTo, 10);
    if (isNaN(to) || to === dayIdx) return;
    const days = data.days.map((d) => ({ ...d }));
    const a = days[dayIdx], b = days[to];
    const tmp = { meals: a.meals, totalCalories: a.totalCalories };
    a.meals = b.meals; a.totalCalories = b.totalCalories;
    b.meals = tmp.meals; b.totalCalories = tmp.totalCalories;
    const newPlan = { ...data, days };
    setData(newPlan);
    onSavePlan?.(newPlan);
    toast.success(`Menù di ${data.days[dayIdx].day} scambiato con ${data.days[to].day}`);
    setSwapTo("");
  };

  const enableReminders = async () => {
    let push = false;
    try { push = await enablePush(); } catch { push = false; }
    try { await saveReminders({ meals: true }); } catch {}
    setRemindersOn(true);
    localStorage.setItem(LS_MEALS, "true");
    toast.success(push ? "Promemoria pasti attivati! Arriveranno sul telefono anche ad app chiusa." : "Promemoria attivi solo ad app aperta (notifiche non consentite dal browser).");
  };

  const MealCard = ({ day, meal, dayTotal }) => {
    const id = `${day}-${meal.key}`;
    const alt = alts[id];
    const shown = alt || meal;
    const isEaten = !!eaten[id];
    return (
      <div className={`rounded-xl border bg-card p-4 transition-all ${isEaten ? "border-[#1b6b3e] ring-1 ring-[#1b6b3e]/30" : "border-border"}`} data-testid={`meal-${meal.key}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{mealName(meal.key)}</div>
            <h4 className="font-heading font-semibold text-primary mt-0.5">{meal.libero ? "🎉 Pasto Libero" : shown.title}</h4>
          </div>
          {!meal.libero && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-mono text-primary">{shown.calories} kcal</span>
              <button data-testid={`btn-fav-${meal.key}`} onClick={() => toggleFav(shown)} title="Salva nei preferiti" className="no-print">
                <Heart className={`w-4 h-4 ${favs[shown.title] ? "fill-[#c85a32] text-[#c85a32]" : "text-muted-foreground"}`} />
              </button>
            </div>
          )}
        </div>
        {(shown.eatOut || shown.rebalanced) && (
          <span className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full bg-secondary text-primary" data-testid={`tag-${shown.eatOut ? "eatout" : "rebalanced"}-${meal.key}`}>
            {shown.eatOut ? "🍽️ Mangiato fuori casa" : "⚖️ Ribilanciato"}
          </span>
        )}
        <div className="hidden">
        </div>
        <button data-testid={`btn-meal-eaten-${meal.key}`} onClick={() => toggleEaten(day, meal, shown)} disabled={eatingId === id}
          className={`no-print mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all ${isEaten ? "bg-[#1b6b3e] text-white border-[#1b6b3e]" : "border-border text-primary hover:border-primary/40"}`}>
          {eatingId === id ? "…" : isEaten ? "✓ Mangiato" : "Segna come mangiato"}
        </button>
        {meal.libero ? (
          <div className="mt-2 flex items-center gap-2 text-sm text-accent-foreground bg-accent/15 rounded-lg px-3 py-2">
            <PartyPopper className="w-4 h-4" />{meal.recipe || "Oggi sei libero di mangiare ciò che vuoi!"}
          </div>
        ) : (
          <>
            {shown.items?.length > 0 && (
              <ul className="mt-2 text-sm text-foreground/80 list-disc ml-5 space-y-0.5">
                {shown.items.map((it, i) => <li key={i}>{it}</li>)}
              </ul>
            )}
            {shown.recipe && <p className="text-sm text-muted-foreground mt-2 italic">{shown.recipe}</p>}
            {shown.brandedItems?.length > 0 && (
              <div className="mt-2 rounded-lg border border-border p-2" data-testid={`branded-${meal.key}`}>
                <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Prodotti di marca</div>
                {shown.brandedItems.map((b, i) => {
                  const dayTot = dayTotal || 1;
                  return (
                    <div key={i} className="flex items-center justify-between text-xs gap-2">
                      <span className="text-foreground/80 truncate">{b.name} · {b.grams} g</span>
                      <span className="font-mono text-primary shrink-0">{b.kcal} kcal · {Math.round((b.kcal / dayTot) * 100)}% del giorno</span>
                    </div>
                  );
                })}
              </div>
            )}
            {shown.supplementNote && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-primary bg-secondary rounded-lg px-2.5 py-1.5">
                <FlaskConical className="w-3.5 h-3.5" />{shown.supplementNote}
              </div>
            )}
            <div className="flex items-center gap-3 mt-3">
              {MACROS.map((m) => (
                <span key={m.key} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m.color}`}>{m.label} {shown[m.key] ?? 0}g</span>
              ))}
              <Button variant="ghost" size="sm" data-testid={`btn-meal-alternative-${meal.key}`}
                onClick={() => requestAlt(day, meal)} disabled={loadingAlt === id}
                className="ml-auto text-primary h-7 text-xs no-print">
                {loadingAlt === id ? "…" : alt ? "↺ Altra" : "Alternativa"}
              </Button>
            </div>
            {shown.custom && (shown.note || shown.added?.length > 0) && (
              <p className="text-xs text-accent-foreground bg-accent/15 rounded-lg px-2.5 py-1.5 mt-2" data-testid={`custom-note-${meal.key}`}>
                ✨ Con i tuoi ingredienti{shown.added?.length ? ` · aggiunto: ${shown.added.join(", ")}` : ""}{shown.note ? ` · ${shown.note}` : ""}
              </p>
            )}
            {shown.custom && (shown.gaps?.length > 0 || shown.nextMealTip || shown.optional?.length > 0) && (
              <div className="text-xs rounded-lg border border-accent/50 px-2.5 py-1.5 mt-2 space-y-0.5" data-testid={`custom-gaps-${meal.key}`}>
                {shown.gaps?.length > 0 && <div className="text-destructive">⚠️ {shown.gaps.join(" · ")}</div>}
                {shown.nextMealTip && <div className="text-primary">➡️ Pasto successivo: {shown.nextMealTip}</div>}
                {shown.optional?.length > 0 && <div className="text-muted-foreground">Facoltativi: {shown.optional.join(", ")}</div>}
              </div>
            )}
          </>
        )}
        <div className="no-print mt-2">
          {customOpen === id ? (
            <div className="space-y-2" data-testid={`custom-meal-form-${meal.key}`}>
              <textarea data-testid={`input-custom-ingredients-${meal.key}`} rows={2} value={customText} autoFocus
                onChange={(e) => setCustomText(e.target.value)} placeholder="es. mozzarella, pomodori, cetrioli e pane"
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" />
              <label className="flex items-center gap-2 text-xs text-primary cursor-pointer">
                <input type="checkbox" data-testid={`chk-only-these-${meal.key}`} checked={onlyThese} onChange={(e) => setOnlyThese(e.target.checked)} className="accent-[#19442b]" />
                Ho solo questi ingredienti, non aggiungere altro
              </label>
              <div className="flex gap-2">
                <Button size="sm" data-testid={`btn-compose-meal-${meal.key}`} onClick={() => composeMeal(day, meal)} disabled={customLoading || !customText.trim()} className="rounded-full bg-primary h-7 text-xs">
                  {customLoading ? "Bilancio…" : "Bilancia il pasto"}
                </Button>
                <Button size="sm" variant="ghost" data-testid={`btn-cancel-custom-${meal.key}`} onClick={() => setCustomOpen(null)} className="h-7 text-xs">Annulla</Button>
              </div>
            </div>
          ) : (
            <button data-testid={`btn-custom-meal-${meal.key}`} onClick={() => { setCustomOpen(id); setCustomText(""); setOnlyThese(false); }}
              className="text-xs text-primary underline underline-offset-2">🥗 Scegli tu gli ingredienti</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-heading text-2xl font-bold text-primary">Piano di {profile?.dietType}</h2>
          {data.notes && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{data.notes}</p>}
          {data.dailyCalories && <p className="text-sm text-primary font-medium mt-1">≈ {data.dailyCalories} kcal / giorno</p>}
        </div>
        <div className="flex items-center gap-2 no-print">
          <Button variant="outline" size="sm" data-testid="btn-meal-reminders" onClick={enableReminders} disabled={remindersOn} className="rounded-full">
            <Bell className="w-4 h-4 mr-1.5" />{remindersOn ? "Promemoria attivi" : "Promemoria pasti"}
          </Button>
          <Button variant="outline" size="sm" data-testid="btn-export-pdf" onClick={exportPdf} className="rounded-full">
            <Printer className="w-4 h-4 mr-1.5" />Esporta PDF
          </Button>
          <div className="flex gap-1 bg-muted rounded-full p-1">
            <TabBtn active={view === "daily"} onClick={() => setView("daily")} testid="tab-daily-view">Giornaliera</TabBtn>
            <TabBtn active={view === "weekly"} onClick={() => setView("weekly")} testid="tab-weekly-view">Settimanale</TabBtn>
          </div>
        </div>
      </div>

      {view === "daily" ? (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
            {data.days.map((d, i) => (
              <button key={i} data-testid={`day-pill-${i}`} onClick={() => setDayIdx(i)}
                className={`px-4 py-2 rounded-full text-sm whitespace-nowrap border transition-all ${dayIdx === i ? "bg-primary text-primary-foreground border-primary" : "bg-card text-primary border-border"}`}>
                {d.day}{d.dayType && <span className="ml-1.5 text-xs">{d.dayType === "allenamento" ? "🏋️" : "😴"}</span>}
              </button>
            ))}
          </div>
          {(() => {
            const d = data.days[dayIdx];
            const branded = (d.meals || []).flatMap((m) => m.brandedItems || []);
            const bk = branded.reduce((s, b) => s + (b.kcal || 0), 0);
            return (
              <div className="flex flex-wrap items-center gap-2 mb-3 text-sm" data-testid="day-summary">
                {d.dayType && (
                  <span className={`px-3 py-1 rounded-full font-semibold ${d.dayType === "allenamento" ? "bg-accent/20 text-accent-foreground" : "bg-secondary text-primary"}`} data-testid="day-type-badge">
                    {d.dayType === "allenamento" ? "🏋️ Giorno di allenamento · più carboidrati" : "😴 Giorno di riposo · carboidrati ridotti"}
                  </span>
                )}
                <span className="text-muted-foreground">Totale: <strong className="text-primary">{d.totalCalories} kcal</strong></span>
                {bk > 0 && <span className="text-muted-foreground">· da prodotti di marca: <strong className="text-primary">{bk} kcal ({Math.round((bk / (d.totalCalories || 1)) * 100)}%)</strong></span>}
              </div>
            );
          })()}
          <div className="mb-3 no-print flex flex-wrap gap-2">
            {data.days[dayIdx].dayType === "allenamento" && (
              <Button size="sm" variant="outline" data-testid="btn-skip-training" onClick={() => skipTraining(data.days[dayIdx].day)} disabled={restLoading} className="rounded-full border-accent">
                {restLoading ? "Adatto i pasti…" : "🛋️ Oggi niente allenamento"}
              </Button>
            )}
            {data.days[dayIdx].skippedTraining && <span className="text-xs px-3 py-1.5 rounded-full bg-secondary text-primary" data-testid="tag-skipped-training">Allenamento saltato · pasti da giorno di riposo</span>}
            {!eatOutOpen ? (
              <Button size="sm" variant="outline" data-testid="btn-eat-out" onClick={() => setEatOutOpen(true)} className="rounded-full">
                <Store className="w-4 h-4 mr-1.5" />Ho mangiato fuori casa
              </Button>
            ) : (
              <div className="rounded-xl border border-accent/50 bg-card p-3 space-y-2 max-w-2xl" data-testid="eat-out-form">
                <div className="text-sm font-semibold text-primary">🍽️ Cosa hai mangiato fuori? Ribilancio i pasti successivi di {data.days[dayIdx].day}</div>
                <select data-testid="select-eat-out-meal" value={eatOut.mealKey} onChange={(e) => setEatOut({ ...eatOut, mealKey: e.target.value })}
                  className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm">
                  {MEALS.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
                </select>
                <textarea data-testid="input-eat-out" rows={2} value={eatOut.description} onChange={(e) => setEatOut({ ...eatOut, description: e.target.value })}
                  placeholder="es. pizza margherita e una birra media al ristorante" className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" />
                <div className="flex gap-2">
                  <Button size="sm" data-testid="btn-submit-eat-out" onClick={() => submitEatOut(data.days[dayIdx].day)} disabled={eatOutLoading || !eatOut.description.trim()} className="rounded-full bg-primary">
                    {eatOutLoading ? "Ribilancio…" : "Ribilancia la giornata"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEatOutOpen(false)}>Annulla</Button>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mb-4 no-print">
            <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Scambia il menù di <strong className="text-primary">{data.days[dayIdx].day}</strong> con:</span>
            <select data-testid="select-swap-day" value={swapTo} onChange={(e) => setSwapTo(e.target.value)}
              className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm">
              <option value="">Scegli giorno…</option>
              {data.days.map((d, i) => i !== dayIdx && <option key={i} value={i}>{d.day}</option>)}
            </select>
            <Button size="sm" data-testid="btn-swap-day" onClick={swapDay} disabled={swapTo === ""} className="rounded-full bg-primary">Scambia</Button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.days[dayIdx]?.meals?.map((meal, i) => <div key={i}>{MealCard({ day: data.days[dayIdx].day, meal, dayTotal: data.days[dayIdx].totalCalories })}</div>)}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {data.days.map((d, i) => (
            <div key={i} className="rounded-xl border border-border bg-secondary/40 p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-heading font-bold text-primary">{d.day} {d.dayType && <span className="text-xs">{d.dayType === "allenamento" ? "🏋️" : "😴"}</span>}</h3>
                <span className="text-xs font-mono text-muted-foreground">{d.totalCalories} kcal</span>
              </div>
              <div className="space-y-2">
                {d.meals?.map((meal, j) => (
                  <div key={j} className="bg-card rounded-lg p-2.5 border border-border">
                    <div className="text-[11px] font-mono uppercase text-muted-foreground">{mealName(meal.key)}</div>
                    <div className="text-sm font-medium text-primary">{meal.libero ? "🎉 Libero" : meal.title}</div>
                    {!meal.libero && <div className="text-xs text-muted-foreground">{meal.calories} kcal · P{meal.protein} C{meal.carbs} G{meal.fats}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TabBtn = ({ active, children, onClick, testid }) => (
  <button data-testid={testid} onClick={onClick}
    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${active ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>
    {children}
  </button>
);
