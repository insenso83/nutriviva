import { useState } from "react";
import { toast } from "sonner";
import { Scale, Smile, Info } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import MeasurementsCard from "@/components/MeasurementsCard";
import WeightGoalChart from "@/components/WeightGoalChart";
import ProgressPhotos from "@/components/ProgressPhotos";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MOOD_FIELDS = [
  { key: "energy", label: "Energia vitale" },
  { key: "digestion", label: "Qualità digestione" },
  { key: "serenity", label: "Serenità / umore" },
  { key: "hunger", label: "Livello di fame" },
];

export default function CheckinsPanel({ type, status, onDone, profile, onProfile }) {
  const [weight, setWeight] = useState("");
  const [mood, setMood] = useState({ energy: 3, digestion: 3, serenity: 3, hunger: 3 });
  const [saving, setSaving] = useState(false);
  const [tip, setTip] = useState(status?.tip || null);

  const saveWeight = async () => {
    if (!weight) return;
    setSaving(true);
    try {
      await api.post("/checkins/weight", { weight: Number(weight) });
      toast.success("Peso registrato!");
      setWeight("");
      onDone();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const saveMood = async () => {
    setSaving(true);
    try {
      const { data } = await api.post("/checkins/mood", mood);
      toast.success("Check umore registrato!");
      if (data.tip) setTip(data.tip);
      onDone();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  if (type === "weight") {
    return (
      <>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 rounded-2xl border border-border bg-card p-6" data-testid="weight-checkin-card">
          <div className="flex items-center gap-2 text-primary"><Scale className="w-5 h-5" /><h2 className="font-heading text-xl font-bold">Aggiorna il peso</h2></div>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            {status?.due ? "È ora di aggiornare il peso! Obbligatorio ogni 4 giorni." : `Prossimo aggiornamento tra ${status?.nextInDays ?? "-"} giorni.`}
          </p>
          <Label htmlFor="w">Peso attuale (kg)</Label>
          <Input id="w" type="number" data-testid="input-weight-checkin" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="es. 78.5" />
          <Button data-testid="btn-save-weight" onClick={saveWeight} disabled={saving || !weight} className="w-full mt-4 rounded-full bg-primary">
            {saving ? "Salvo…" : "Registra peso"}
          </Button>
        </div>
        <WeightGoalChart history={status?.history || []} profile={profile} onProfile={onProfile} />
      </div>
      <MeasurementsCard />
      <ProgressPhotos />
      </>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="rounded-2xl border border-border bg-card p-6" data-testid="mood-checkin-card">
        <div className="flex items-center gap-2 text-primary"><Smile className="w-5 h-5" /><h2 className="font-heading text-xl font-bold">Come ti senti?</h2></div>
        <p className="text-sm text-muted-foreground mt-1 mb-5">
          {status?.due ? "Check consigliato ogni 5 giorni." : `Prossimo check tra ${status?.nextInDays ?? "-"} giorni.`}
        </p>
        <div className="space-y-5">
          {MOOD_FIELDS.map((f) => (
            <div key={f.key}>
              <div className="flex justify-between mb-1"><Label>{f.label}</Label><span className="text-sm font-mono text-primary">{mood[f.key]}/5</span></div>
              <input type="range" min="1" max="5" data-testid={`range-${f.key}`} value={mood[f.key]}
                onChange={(e) => setMood({ ...mood, [f.key]: Number(e.target.value) })}
                className="w-full accent-primary" />
            </div>
          ))}
        </div>
        <Button data-testid="btn-save-mood" onClick={saveMood} disabled={saving} className="w-full mt-6 rounded-full bg-primary">
          {saving ? "Salvo…" : "Registra come mi sento"}
        </Button>
        {tip && (
          <div className="mt-4 flex gap-2 items-start bg-accent/15 rounded-xl p-3 text-sm text-accent-foreground" data-testid="mood-tip">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />{tip}
          </div>
        )}
      </div>
    </div>
  );
}
