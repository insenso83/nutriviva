import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserCog, Save, AlertTriangle, Check } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { GOALS, SUPPLEMENTS, JOB_TYPES, TRAINING_TYPES, TRAINING_FREQ } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SupplementDetails, TrainingDaysPicker, MealPreferences, NutritionistDiet } from "@/components/ProfileExtras";
import { useAuth } from "@/context/AuthContext";

const Chip = ({ active, onClick, children, testid }) => (
  <button type="button" data-testid={testid} onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-primary border-border hover:border-primary/40"}`}>
    {children}
  </button>
);

const Section = ({ title, children }) => (
  <div className="rounded-2xl border border-border bg-card p-6">
    <h3 className="font-heading font-semibold text-primary mb-4">{title}</h3>{children}
  </div>
);

export default function ProfilePanel({ profile, onSaved }) {
  const [p, setP] = useState({ ...profile });
  const [warnings, setWarnings] = useState([]);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const { logout } = useAuth();

  const deleteAccount = async () => {
    try { await api.delete("/auth/me"); toast.success("Account eliminato."); await logout(); window.location.href = "/login"; }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  useEffect(() => {
    api.post("/compatibility", { goals: p.goals || [], dietType: p.dietType })
      .then((r) => setWarnings(r.data.warnings || [])).catch(() => {});
  }, [p.goals, p.dietType]);

  const toggle = (key, val) => {
    const arr = p[key] || [];
    setP({ ...p, [key]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] });
  };

  const save = async () => {
    setSaving(true);
    try {
      const weightChanged = Number(p.weight) !== Number(profile.weight);
      const { data } = await api.put("/profile", { ...p, age: Number(p.age), weight: Number(p.weight), height: Number(p.height) });
      if (weightChanged) await api.post("/checkins/weight", { weight: Number(p.weight) });
      onSaved(data.profile);
      toast.success("Profilo aggiornato! Rigenera il piano per applicare le modifiche.");
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const num = (k, label) => (
    <div><Label>{label}</Label>
      <Input type="number" data-testid={`profile-${k}`} value={p[k] ?? ""} onChange={(e) => setP({ ...p, [k]: e.target.value })} /></div>
  );
  const chips = (k, opts) => (
    <div className="flex flex-wrap gap-2">{opts.map((o) => <Chip key={o} active={p[k] === o} onClick={() => setP({ ...p, [k]: o })}>{o}</Chip>)}</div>
  );

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-primary"><UserCog className="w-6 h-6" /><h2 className="font-heading text-2xl font-bold">Il mio profilo</h2></div>
        <Button data-testid="btn-save-profile" onClick={save} disabled={saving} className="rounded-full bg-primary">
          <Save className="w-4 h-4 mr-1.5" />{saving ? "Salvo…" : "Salva modifiche"}
        </Button>
      </div>

      <Section title="Dati personali">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">{num("age", "Età")}{num("weight", "Peso (kg)")}{num("height", "Altezza (cm)")}</div>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div><Label className="mb-1.5 block">Lavoro</Label>{chips("jobType", JOB_TYPES)}</div>
          <div><Label className="mb-1.5 block">Frequenza</Label>{chips("trainingFrequency", TRAINING_FREQ)}</div>
        </div>
        <div className="mt-4"><Label className="mb-1.5 block">Allenamenti e sport (anche più di uno)</Label>
          <div className="flex flex-wrap gap-2">
            {TRAINING_TYPES.map((o) => {
              const sel = (p.trainingType || "").split(", ").filter(Boolean);
              const on = sel.includes(o);
              const next = on ? sel.filter((x) => x !== o) : [...sel.filter((x) => x !== "Nessuno"), o];
              return <Chip key={o} testid={`profile-train-${o.toLowerCase().replace(/[^a-z]/g, "-")}`} active={on}
                onClick={() => setP({ ...p, trainingType: o === "Nessuno" ? "Nessuno" : next.join(", ") })}>{o}</Chip>;
            })}
          </div>
        </div>
      </Section>

      <Section title="Patologie, intolleranze e farmaci">
        <Label>Patologie / malattie / intolleranze</Label>
        <Input data-testid="profile-conditions" value={p.conditions || ""} placeholder="es. diabete tipo 2, reflusso, celiachia…"
          onChange={(e) => setP({ ...p, conditions: e.target.value })} />
        <Label className="mt-4 block">Farmaci / terapie</Label>
        <Input data-testid="profile-medications" value={p.medications || ""} placeholder="es. levotiroxina al mattino…"
          onChange={(e) => setP({ ...p, medications: e.target.value })} />
      </Section>

      <Section title="Obiettivi">
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <Chip key={g.id} testid={`profile-goal-${g.id}`} active={(p.goals || []).includes(g.id)} onClick={() => toggle("goals", g.id)}>
              {(p.goals || []).includes(g.id) && <Check className="w-3 h-3 inline mr-1" />}{g.label}
            </Chip>
          ))}
        </div>
        {warnings.length > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive" data-testid="profile-compat-warnings">
            <div className="flex items-center gap-2 font-semibold mb-1"><AlertTriangle className="w-4 h-4" />Compatibilità con {p.dietType}</div>
            <ul className="list-disc ml-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
      </Section>

      <Section title="Integratori">
        <div className="flex flex-wrap gap-2">
          {SUPPLEMENTS.map((s) => (
            <Chip key={s.id} testid={`profile-supp-${s.id}`} active={(p.supplements || []).includes(s.id)} onClick={() => toggle("supplements", s.id)}>{s.label}</Chip>
          ))}
        </div>
        <SupplementDetails selected={p.supplements || []} details={p.supplementDetails || {}} onChange={(v) => setP({ ...p, supplementDetails: v })} />
      </Section>

      <Section title="Giorni di allenamento (più carboidrati) e di riposo">
        <TrainingDaysPicker value={p.trainingDays || []} onChange={(v) => setP({ ...p, trainingDays: v })} />
      </Section>

      <Section title="Preferenze per i pasti">
        <MealPreferences value={p.mealPreferences || {}} likes={p.foodLikes || ""} dislikes={p.foodDislikes || ""}
          onChange={(patch) => setP({ ...p, ...patch })} />
      </Section>

      <Section title="Dieta del nutrizionista">
        <NutritionistDiet has={p.hasNutritionist} diet={p.nutritionistDiet} onChange={(patch) => setP({ ...p, ...patch })} />
      </Section>

      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6" data-testid="delete-account-section">
        <h3 className="font-heading font-semibold text-destructive mb-1">Elimina account</h3>
        <p className="text-sm text-muted-foreground mb-3">Cancella definitivamente account, profilo, piani, foto, diario e tutti i tuoi dati. L'operazione non è reversibile.</p>
        {!confirmDel ? (
          <Button variant="outline" data-testid="btn-delete-account" onClick={() => setConfirmDel(true)} className="rounded-full border-destructive text-destructive">Elimina il mio account</Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button data-testid="btn-confirm-delete-account" onClick={deleteAccount} className="rounded-full bg-destructive hover:bg-destructive/90">Sì, elimina tutto definitivamente</Button>
            <Button variant="ghost" data-testid="btn-cancel-delete-account" onClick={() => setConfirmDel(false)}>Annulla</Button>
          </div>
        )}
      </div>
    </div>
  );
}
