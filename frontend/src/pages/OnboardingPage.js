import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Leaf, ArrowRight, Plus, X, AlertTriangle, Check } from "lucide-react";
import { api } from "@/lib/api";
import {
  SEXES, JOB_TYPES, TRAINING_TYPES, TRAINING_FREQ, GOALS, DIETS, SUPPLEMENTS, DAYS, MEALS,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FridgeItemInput from "@/components/FridgeItemInput";
import { SupplementDetails, TrainingDaysPicker, MealPreferences, NutritionistDiet } from "@/components/ProfileExtras";

const emptyProfile = {
  age: "", sex: "", weight: "", height: "",
  measurements: { vita: "", fianchi: "", cosce: "", torace: "", braccia: "" },
  jobType: "", trainingType: "", trainingFrequency: "",
  goals: [], dietType: "", fridgeItems: [], supplements: [], medications: "", conditions: "",
  planMode: "weekly", dietDurationWeeks: 8, freeMeals: [],
};

export default function OnboardingPage() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [p, setP] = useState(emptyProfile);
  const [warnings, setWarnings] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/profile").then((r) => { if (r.data && r.data.age) setP({ ...emptyProfile, ...r.data }); });
  }, []);

  useEffect(() => {
    if (!p.dietType && p.goals.length === 0) return;
    const t = setTimeout(() => {
      api.post("/compatibility", { goals: p.goals, dietType: p.dietType })
        .then((r) => setWarnings(r.data.warnings || [])).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [p.goals, p.dietType]);

  const toggle = (key, val) => {
    const arr = p[key];
    setP({ ...p, [key]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] });
  };

  const addFreeMeal = () => setP({ ...p, freeMeals: [...p.freeMeals, { day: "Sabato", meal: "Cena" }] });

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/profile", {
        ...p,
        age: Number(p.age), weight: Number(p.weight), height: Number(p.height),
        dietDurationWeeks: Number(p.dietDurationWeeks),
      });
      toast.success("Profilo salvato! Genero il tuo piano…");
      nav("/app?generate=1");
    } catch (err) {
      toast.error(err?.response?.data?.detail || err?.message || "Errore nel salvataggio del profilo");
    } finally { setSaving(false); }
  };

  const canNext = () => {
    if (step === 1) return p.age && p.sex && p.weight && p.height;
    if (step === 2) return p.goals.length > 0;
    if (step === 3) return !!p.dietType;
    return true;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 flex items-center px-6 border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-10">
        <Leaf className="w-6 h-6 text-primary" />
        <span className="font-heading text-xl font-bold text-primary ml-2">NutriViva</span>
        <span className="ml-auto text-sm text-muted-foreground">Passo {step} di 4</span>
      </header>

      <div className="h-1 bg-muted">
        <div className="h-full bg-accent transition-all" style={{ width: `${(step / 4) * 100}%` }} />
      </div>

      <div className="max-w-3xl mx-auto p-6 sm:p-10 animate-fade-up" key={step}>
        {step === 1 && (
          <section>
            <h2 className="font-heading text-3xl font-bold text-primary">I tuoi dati</h2>
            <p className="text-muted-foreground mt-1 mb-6">I campi con * sono obbligatori.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Età *"><Input type="number" data-testid="input-age" value={p.age}
                onChange={(e) => setP({ ...p, age: e.target.value })} /></Field>
              <Field label="Sesso biologico *">
                <div className="flex gap-2">{SEXES.map((s) => (
                  <Chip key={s} active={p.sex === s} testid={`chip-sex-${s}`} onClick={() => setP({ ...p, sex: s })}>{s}</Chip>
                ))}</div>
              </Field>
              <Field label="Peso (kg) *"><Input type="number" data-testid="input-weight" value={p.weight}
                onChange={(e) => setP({ ...p, weight: e.target.value })} /></Field>
              <Field label="Altezza (cm) *"><Input type="number" data-testid="input-height" value={p.height}
                onChange={(e) => setP({ ...p, height: e.target.value })} /></Field>
            </div>

            <h3 className="font-heading text-lg font-semibold text-primary mt-8 mb-3">Opzionali</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Tipologia di lavoro">
                <SelectChips options={JOB_TYPES} value={p.jobType} onChange={(v) => setP({ ...p, jobType: v })} prefix="job" />
              </Field>
              <Field label="Frequenza allenamenti">
                <SelectChips options={TRAINING_FREQ} value={p.trainingFrequency} onChange={(v) => setP({ ...p, trainingFrequency: v })} prefix="freq" />
              </Field>
            </div>
            <Field label="Allenamenti e sport praticati (anche più di uno)">
              <SelectChips multi options={TRAINING_TYPES} value={p.trainingType} onChange={(v) => setP({ ...p, trainingType: v })} prefix="train" />
            </Field>
            <h3 className="font-heading text-lg font-semibold text-primary mt-6 mb-3">Circonferenze (cm, opzionale)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {Object.keys(p.measurements).map((m) => (
                <Field key={m} label={m[0].toUpperCase() + m.slice(1)}>
                  <Input type="number" data-testid={`input-cm-${m}`} value={p.measurements[m]}
                    onChange={(e) => setP({ ...p, measurements: { ...p.measurements, [m]: e.target.value } })} />
                </Field>
              ))}
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h2 className="font-heading text-3xl font-bold text-primary">I tuoi obiettivi</h2>
            <p className="text-muted-foreground mt-1 mb-6">Scegli uno o più obiettivi compatibili.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {GOALS.map((g) => {
                const active = p.goals.includes(g.id);
                return (
                  <button key={g.id} data-testid={`btn-goal-${g.id}`} onClick={() => toggle("goals", g.id)}
                    className={`text-left p-4 rounded-xl border transition-all ${active ? "border-primary bg-secondary ring-2 ring-primary/20" : "border-border bg-card hover:border-primary/40"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-primary">{g.label}</span>
                      {active && <Check className="w-4 h-4 text-primary" />}
                    </div>
                    <span className="text-xs text-muted-foreground">{g.tag}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h2 className="font-heading text-3xl font-bold text-primary">Che dieta vuoi fare?</h2>
            <p className="text-muted-foreground mt-1 mb-6">Seleziona il regime alimentare.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {DIETS.map((d) => {
                const active = p.dietType === d.name;
                return (
                  <button key={d.name} data-testid={`btn-diet-${d.name.toLowerCase().replace(/[^a-z]/g, "-")}`}
                    onClick={() => setP({ ...p, dietType: d.name })}
                    className={`text-left p-4 rounded-xl border transition-all ${active ? "border-primary bg-secondary ring-2 ring-primary/20" : "border-border bg-card hover:border-primary/40"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-primary">{d.name}</span>
                      {active && <Check className="w-4 h-4 text-primary" />}
                    </div>
                    <span className="text-xs text-muted-foreground">{d.desc}</span>
                  </button>
                );
              })}
            </div>
            {warnings.length > 0 && (
              <div className="mt-5 p-4 rounded-xl bg-destructive/10 border border-destructive/30" data-testid="compat-warnings">
                <div className="flex items-center gap-2 text-destructive font-semibold mb-1"><AlertTriangle className="w-4 h-4" />Attenzione alla compatibilità</div>
                <ul className="list-disc ml-6 text-sm text-destructive/90">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}
          </section>
        )}

        {step === 4 && (
          <section>
            <h2 className="font-heading text-3xl font-bold text-primary">Frigo, integratori e calendario</h2>
            <p className="text-muted-foreground mt-1 mb-6">Cosa hai a disposizione? Il piano userà questi ingredienti.</p>

            <Field label="Ingredienti nel frigo / dispensa (con quantità)">
              <FridgeItemInput items={p.fridgeItems} onChange={(v) => setP({ ...p, fridgeItems: v })} />
            </Field>

            <Field label="Integratori che assumi">
              <div className="flex flex-wrap gap-2">
                {SUPPLEMENTS.map((s) => (
                  <Chip key={s.id} active={p.supplements.includes(s.id)} testid={`chip-supp-${s.id}`}
                    onClick={() => toggle("supplements", s.id)}>{s.label}</Chip>
                ))}
              </div>
              <SupplementDetails selected={p.supplements} details={p.supplementDetails || {}} onChange={(v) => setP({ ...p, supplementDetails: v })} />
            </Field>

            <Field label="Giorni di allenamento (più carboidrati) — gli altri sono di riposo">
              <TrainingDaysPicker value={p.trainingDays || []} onChange={(v) => setP({ ...p, trainingDays: v })} />
            </Field>

            <Field label="Sei seguito da un nutrizionista?">
              <NutritionistDiet has={p.hasNutritionist} diet={p.nutritionistDiet} onChange={(patch) => setP({ ...p, ...patch })} />
            </Field>

            <Field label="Le tue preferenze per i pasti (facoltative)">
              <MealPreferences value={p.mealPreferences || {}} likes={p.foodLikes || ""} dislikes={p.foodDislikes || ""}
                onChange={(patch) => setP({ ...p, ...patch })} />
            </Field>

            <Field label="Patologie / malattie / intolleranze (importante)">
              <Input data-testid="input-conditions" value={p.conditions}
                onChange={(e) => setP({ ...p, conditions: e.target.value })} placeholder="es. diabete tipo 2, reflusso, intolleranza al lattosio, celiachia…" />
            </Field>

            <Field label="Farmaci / terapie (opzionale)">
              <Input data-testid="input-medications" value={p.medications}
                onChange={(e) => setP({ ...p, medications: e.target.value })} placeholder="es. levotiroxina al mattino…" />
            </Field>

            <Field label="Modalità di spesa">
              <div className="flex gap-2">
                <Chip active={p.planMode === "weekly"} testid="chip-mode-weekly" onClick={() => setP({ ...p, planMode: "weekly" })}>Settimanale (consigliata)</Chip>
                <Chip active={p.planMode === "daily"} testid="chip-mode-daily" onClick={() => setP({ ...p, planMode: "daily" })}>Giornaliera</Chip>
              </div>
            </Field>

            <Field label="Durata della dieta (settimane)">
              <Input type="number" data-testid="input-duration" value={p.dietDurationWeeks}
                onChange={(e) => setP({ ...p, dietDurationWeeks: e.target.value })} className="max-w-[140px]" />
            </Field>

            <Field label="Pasti liberi / sgarro concordati">
              {p.freeMeals.map((fm, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <select data-testid={`select-free-day-${i}`} value={fm.day} className="rounded-xl border border-input bg-card px-3 py-2 text-sm"
                    onChange={(e) => { const c = [...p.freeMeals]; c[i].day = e.target.value; setP({ ...p, freeMeals: c }); }}>
                    {DAYS.map((d) => <option key={d}>{d}</option>)}
                  </select>
                  <select data-testid={`select-free-meal-${i}`} value={fm.meal} className="rounded-xl border border-input bg-card px-3 py-2 text-sm"
                    onChange={(e) => { const c = [...p.freeMeals]; c[i].meal = e.target.value; setP({ ...p, freeMeals: c }); }}>
                    {MEALS.map((m) => <option key={m.key}>{m.name}</option>)}
                  </select>
                  <button onClick={() => setP({ ...p, freeMeals: p.freeMeals.filter((_, j) => j !== i) })}><X className="w-4 h-4 text-muted-foreground" /></button>
                </div>
              ))}
              <Button type="button" variant="outline" data-testid="btn-add-free-meal" onClick={addFreeMeal} className="rounded-full">
                <Plus className="w-4 h-4 mr-1" />Aggiungi pasto libero
              </Button>
            </Field>
          </section>
        )}

        <div className="flex items-center justify-between mt-10">
          <Button variant="ghost" disabled={step === 1} data-testid="btn-prev" onClick={() => setStep(step - 1)}>Indietro</Button>
          {step < 4 ? (
            <Button data-testid="btn-next" disabled={!canNext()} onClick={() => setStep(step + 1)}
              className="rounded-full bg-primary h-11 px-8">Continua <ArrowRight className="w-4 h-4 ml-1" /></Button>
          ) : (
            <Button data-testid="btn-finish-onboarding" disabled={saving} onClick={save}
              className="rounded-full bg-accent text-accent-foreground h-11 px-8 hover:bg-accent/90">
              {saving ? "Salvo…" : "Genera il mio piano"}</Button>
          )}
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div className="mb-4">
    <Label className="mb-1.5 block text-primary/90">{label}</Label>
    {children}
  </div>
);

const Chip = ({ active, children, onClick, testid }) => (
  <button type="button" data-testid={testid} onClick={onClick}
    className={`px-3 py-2 rounded-full text-sm border transition-all ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-primary border-border hover:border-primary/40"}`}>
    {children}
  </button>
);

const SelectChips = ({ options, value, onChange, prefix, multi }) => {
  const sel = multi ? (value || "").split(", ").filter(Boolean) : [value];
  const pick = (o) => {
    if (!multi) return onChange(o);
    const next = sel.includes(o) ? sel.filter((x) => x !== o) : [...sel.filter((x) => x !== "Nessuno"), o];
    onChange(o === "Nessuno" ? "Nessuno" : next.join(", "));
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Chip key={o} active={sel.includes(o)} testid={`chip-${prefix}-${o.toLowerCase().replace(/[^a-z]/g, "-")}`} onClick={() => pick(o)}>{o}</Chip>
      ))}
    </div>
  );
};
