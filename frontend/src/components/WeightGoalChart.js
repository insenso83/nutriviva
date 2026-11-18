import { useState } from "react";
import { toast } from "sonner";
import { TrendingUp, Target } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Linear regression slope (kg/day) on weight history
const slope = (hist) => {
  if (hist.length < 2) return null;
  const t0 = new Date(hist[0].date).getTime();
  const pts = hist.map((h) => [(new Date(h.date).getTime() - t0) / 86400000, h.weight]);
  const n = pts.length, sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0);
  const sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
  const den = n * sxx - sx * sx;
  return den === 0 ? null : (n * sxy - sx * sy) / den;
};

export default function WeightGoalChart({ history, profile, onProfile }) {
  const [target, setTarget] = useState(profile?.targetWeight || "");
  const [saving, setSaving] = useState(false);
  const goal = Number(profile?.targetWeight) || null;
  const current = history.length ? history[history.length - 1].weight : Number(profile?.weight) || null;
  const start = history.length ? history[0].weight : current;

  const data = history.map((h) => ({ date: new Date(h.date).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }), peso: h.weight }));

  let eta = null, pct = null, rateTxt = null;
  if (goal && current) {
    const diff = goal - current;
    const total = goal - start;
    pct = total === 0 ? 100 : Math.max(0, Math.min(100, Math.round(((current - start) / total) * 100)));
    let s = slope(history);
    const spanDays = history.length >= 2 ? (new Date(history[history.length - 1].date) - new Date(history[0].date)) / 86400000 : 0;
    const estimated = spanDays < 7 || !s || Math.sign(s) !== Math.sign(diff) || Math.abs(s) < 0.005 || Math.abs(s * 7) > 1.5;
    if (estimated) s = diff < 0 ? -0.5 / 7 : 0.25 / 7; // standard: -0.5 kg/settimana in deficit, +0.25 kg/settimana in massa
    if (Math.abs(diff) < 0.1) eta = "Obiettivo raggiunto! 🎉";
    else {
      const days = Math.ceil(diff / s);
      const d = new Date(); d.setDate(d.getDate() + days);
      eta = d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
      rateTxt = `${estimated ? "stima standard" : "al tuo ritmo attuale"}: ${(s * 7 > 0 ? "+" : "")}${(s * 7).toFixed(2)} kg/settimana`;
    }
  }

  const save = async () => {
    setSaving(true);
    try {
      const { data: res } = await api.put("/profile", { targetWeight: Number(target) });
      onProfile?.(res.profile);
      toast.success("Peso obiettivo salvato!");
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  return (
    <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 text-primary"><TrendingUp className="w-5 h-5" /><h3 className="font-heading font-bold">Andamento del peso</h3></div>
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-accent" />
          <Input type="number" data-testid="input-target-weight" value={target} placeholder="Obiettivo kg" onChange={(e) => setTarget(e.target.value)} className="w-28 h-8" />
          <Button size="sm" data-testid="btn-save-target" onClick={save} disabled={saving || !target} className="rounded-full bg-primary h-8">Salva</Button>
        </div>
      </div>

      {goal && current && (
        <div className="mb-4" data-testid="weight-goal-progress">
          <div className="flex flex-wrap justify-between text-sm mb-1.5">
            <span className="text-muted-foreground">{start} kg → <strong className="text-primary">{goal} kg</strong> · attuale {current} kg (mancano {Math.abs(goal - current).toFixed(1)} kg)</span>
            <span className="font-mono text-primary">{pct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
          <p className="text-sm mt-2" data-testid="weight-goal-eta">📅 Data prevista: <strong className="text-primary">{eta}</strong>{rateTxt && <span className="text-xs text-muted-foreground"> ({rateTxt})</span>}</p>
        </div>
      )}

      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3ede6" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis domain={[(min) => Math.floor(Math.min(min, goal || min) - 1), (max) => Math.ceil(Math.max(max, goal || max) + 1)]} tick={{ fontSize: 12 }} />
            <Tooltip />
            {goal && <ReferenceLine y={goal} stroke="#e9a834" strokeDasharray="6 4" label={{ value: `Obiettivo ${goal} kg`, fill: "#a26715", fontSize: 12, position: "insideTopRight" }} />}
            <Line type="monotone" dataKey="peso" stroke="#19442b" strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      ) : <p className="text-muted-foreground text-sm py-12 text-center">Registra il peso per vedere il grafico.</p>}
    </div>
  );
}
