import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Droplet, Plus, Minus } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function WaterPanel() {
  const [glasses, setGlasses] = useState(0);
  const [goal, setGoal] = useState(8);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get("/water").then((r) => { setGlasses(r.data.glasses || 0); setGoal(r.data.goal || 8); }).finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <div className="text-muted-foreground">Caricamento…</div>;

  const save = (g, go) => { api.post("/water", { glasses: g, goal: go }).catch(() => {}); };
  const set = (g) => { const v = Math.max(0, g); setGlasses(v); save(v, goal); };
  const setG = (go) => { const v = Math.max(1, go); setGoal(v); save(glasses, v); };

  const pct = Math.min(100, Math.round((glasses / goal) * 100));

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-2 text-primary mb-1"><Droplet className="w-6 h-6" />
        <h2 className="font-heading text-2xl font-bold">Idratazione</h2></div>
      <p className="text-muted-foreground mb-5">Tieni traccia dei bicchieri d'acqua di oggi.</p>

      <div className="rounded-2xl border border-border bg-card p-6" data-testid="water-card">
        <div className="flex items-end justify-between mb-2">
          <div className="flex items-end gap-2">
            <span className="font-heading text-5xl font-extrabold text-primary" data-testid="water-count">{glasses}</span>
            <span className="text-muted-foreground mb-1.5">/ {goal} bicchieri</span>
          </div>
          <span className="text-sm font-mono text-primary">{pct}%</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden mb-5">
          <div className="h-full bg-[#1a5b67] transition-all" style={{ width: `${pct}%` }} />
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          {Array.from({ length: goal }).map((_, i) => (
            <button key={i} data-testid={`glass-${i}`} onClick={() => set(i + 1 === glasses ? i : i + 1)}
              className={`w-9 h-11 rounded-b-lg rounded-t-sm border-2 transition-all ${i < glasses ? "bg-[#a3d5db] border-[#1a5b67]" : "bg-transparent border-border"}`}>
              <Droplet className={`w-4 h-4 mx-auto ${i < glasses ? "text-[#1a5b67]" : "text-muted-foreground"}`} />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button data-testid="btn-water-minus" variant="outline" size="icon" className="rounded-full" onClick={() => set(glasses - 1)}><Minus className="w-4 h-4" /></Button>
          <Button data-testid="btn-water-plus" className="rounded-full bg-[#1a5b67] hover:bg-[#15505a] flex-1" onClick={() => set(glasses + 1)}>
            <Plus className="w-4 h-4 mr-1.5" />Aggiungi bicchiere
          </Button>
        </div>

        <div className="flex items-center gap-2 mt-5 text-sm">
          <span className="text-muted-foreground">Obiettivo giornaliero:</span>
          <Button variant="ghost" size="sm" onClick={() => setG(goal - 1)} data-testid="btn-goal-minus">-</Button>
          <span className="font-semibold text-primary">{goal}</span>
          <Button variant="ghost" size="sm" onClick={() => setG(goal + 1)} data-testid="btn-goal-plus">+</Button>
        </div>
        {glasses >= goal && <p className="text-center text-sm text-[#1b6b3e] font-semibold mt-4" data-testid="water-done">🎉 Obiettivo raggiunto!</p>}
      </div>
    </div>
  );
}
