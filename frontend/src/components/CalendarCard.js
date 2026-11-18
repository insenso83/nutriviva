import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Repeat, Flame, Play, Square, CalendarClock } from "lucide-react";
import { it } from "date-fns/locale";
import { api, apiError } from "@/lib/api";
import { DIETS, DAYS, MEALS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s) => { const [y, m, d] = String(s || "").slice(0, 10).split("-").map(Number); return new Date(y || 2026, (m || 1) - 1, d || 1); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const weekdayName = (d) => DAYS[(d.getDay() + 6) % 7];

export default function CalendarCard({ profile, onChanged }) {
  const [newDiet, setNewDiet] = useState(profile?.dietType || "");
  const [duration, setDuration] = useState(profile?.dietDurationWeeks || 8);
  const [startPick, setStartPick] = useState("");
  const [saving, setSaving] = useState(false);

  const active = !!profile?.dietActive;
  const todayS = ymd(new Date());
  const dietStart = profile?.dietStartDate || todayS;
  const startS = active ? String(dietStart).slice(0, 10) : null;
  const endS = active ? (profile?.dietEndDate || addDays(startS, (profile?.dietDurationWeeks || 8) * 7 - 1)) : null;
  const status = !active ? "inactive" : todayS < startS ? "scheduled" : todayS > endS ? "ended" : "running";
  const totalDays = active ? Math.round((parse(endS) - parse(startS)) / 86400000) + 1 : 0;
  const elapsed = active ? Math.max(0, Math.min(totalDays, Math.round((parse(todayS) - parse(startS)) / 86400000) + (status === "scheduled" ? 0 : 1))) : 0;
  const pct = totalDays ? Math.round((elapsed / totalDays) * 100) : 0;
  const isKeto = profile?.dietType === "Chetogenica";
  const freeDays = (profile?.freeMeals || []).map((f) => f.day);

  const inRange = (d) => active && ymd(d) >= startS && ymd(d) <= endS;
  const modifiers = {
    dietOn: (d) => inRange(d),
    free: (d) => inRange(d) && freeDays.includes(weekdayName(d)),
    refeed: (d) => isKeto && inRange(d) && ymd(d) !== startS && Math.round((d - parse(startS)) / 86400000) % 21 === 0,
  };

  const save = async (patch, msg) => {
    setSaving(true);
    try { const { data } = await api.put("/profile", patch); onChanged(data.profile); toast.success(msg); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const startOn = (s) => save({ dietActive: true, dietStartDate: s, dietEndDate: addDays(s, (profile?.dietDurationWeeks || 8) * 7 - 1) },
    s === todayS ? "Dieta attivata da oggi! 💚" : `Dieta programmata dal ${parse(s).toLocaleDateString("it-IT")}`);
  
  // MODIFICATO QUI: Ora imposta esplicitamente dietActive a false quando interrompi
  const stop = () => save({ dietActive: false, dietEndDate: todayS }, "Dieta interrotta oggi.");

  const changeDiet = () => {
    const s = startPick || todayS;
    save({ dietType: newDiet, dietDurationWeeks: Number(duration), dietActive: true, dietStartDate: s, dietEndDate: addDays(s, Number(duration) * 7 - 1) },
      "Nuova fase impostata! Rigenera il piano per applicarla.");
  };

  const freeLabel = (profile?.freeMeals || []).map((f) => `${f.day} ${f.meal.toLowerCase()}`).join(", ");

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="rounded-2xl border border-border bg-card p-6" data-testid="calendar-duration-card">
        <div className="flex items-center gap-2 text-primary"><CalendarDays className="w-5 h-5" /><h2 className="font-heading text-xl font-bold">La tua dieta</h2></div>
        <div className="mt-3 text-sm" data-testid="diet-status">
          {status === "inactive" && <span className="text-muted-foreground">La dieta <strong>{profile?.dietType}</strong> non è ancora attiva. Scegli quando iniziare.</span>}
          {status === "scheduled" && <span className="text-primary">⏳ Inizia il <strong>{parse(startS).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</strong>
            <span className="block text-xs text-muted-foreground mt-0.5" data-testid="start-reminder-note">🔔 La sera prima alle 20:00 riceverai una notifica con il menù del primo giorno (se hai attivato i promemoria).</span></span>}
          {status === "running" && <span className="text-[#1b6b3e] font-semibold">💚 Dieta attiva · giorno {elapsed} di {totalDays}</span>}
          {status === "ended" && <span className="text-muted-foreground">Dieta terminata il {parse(endS).toLocaleDateString("it-IT")}.</span>}
        </div>

        {active && (
          <>
            <div className="mt-3 h-3 rounded-full bg-muted overflow-hidden"><div className="h-full bg-[#2f8a55] transition-all" style={{ width: `${pct}%` }} /></div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
              <span>Inizio: {parse(startS).toLocaleDateString("it-IT")}</span><span>Fine: {parse(endS).toLocaleDateString("it-IT")}</span>
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-2 mt-4">
          {status !== "running" && (
            <Button data-testid="btn-activate-today" onClick={() => startOn(todayS)} disabled={saving} className="rounded-full bg-[#1b6b3e] hover:bg-[#15573a]">
              <Play className="w-4 h-4 mr-1.5" />Attiva dieta da oggi
            </Button>
          )}
          {status === "running" && (
            <Button data-testid="btn-stop-diet" variant="outline" onClick={stop} disabled={saving} className="rounded-full border-destructive/50 text-destructive">
              <Square className="w-4 h-4 mr-1.5" />Interrompi oggi
            </Button>
          )}
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-muted-foreground" />
            <Input type="date" data-testid="input-start-date" value={startPick} min={todayS} onChange={(e) => setStartPick(e.target.value)} className="h-9 w-40" />
            <Button data-testid="btn-schedule-start" variant="outline" onClick={() => startOn(startPick)} disabled={!startPick || saving} className="rounded-full">Inizia in questa data</Button>
          </div>
        </div>
        {active && (
          <div className="flex items-center gap-2 mt-3 text-sm">
            <Label className="text-xs">Data di fine</Label>
            <Input type="date" data-testid="input-end-date" value={endS} min={startS} onChange={(e) => e.target.value && save({ dietEndDate: e.target.value }, "Data di fine aggiornata")} className="h-8 w-40" />
          </div>
        )}

        <div className="mt-4 flex justify-center">
          <Calendar locale={it} weekStartsOn={1} mode="single" month={active && status === "scheduled" ? parse(startS) : undefined} data-testid="diet-calendar"
            modifiers={modifiers}
            modifiersClassNames={{ dietOn: "nv-diet-on", free: "nv-diet-free", refeed: "nv-diet-refeed" }} />
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground justify-center">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#bfe5cc]" />Giorno di dieta</span>
          {freeDays.length > 0 && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#f6d48a]" />Pasto libero ({freeLabel})</span>}
          {isKeto && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#f2b8a2]" />Ricarica carbo</span>}
        </div>

        {isKeto && active && (
          <div className="mt-4 flex items-start gap-2 bg-accent/15 rounded-xl p-3 text-sm text-accent-foreground" data-testid="refeed-reminder">
            <Flame className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Nella chetogenica si ricaricano i carboidrati ogni ~21 giorni: i giorni di ricarica sono evidenziati nel calendario.</span>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 h-fit" data-testid="change-diet-card">
        <div className="flex items-center gap-2 text-primary"><Repeat className="w-5 h-5" /><h2 className="font-heading text-xl font-bold">Cambia fase / dieta</h2></div>
        <p className="text-sm text-muted-foreground mt-1 mb-4">Passa a un nuovo regime (es. da Chetogenica a Low Carb, poi a Clean Bulking).</p>
        <Label>Nuova dieta</Label>
        <select data-testid="select-new-diet" value={newDiet} onChange={(e) => setNewDiet(e.target.value)}
          className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm mb-4 mt-1">
          {DIETS.map((d) => <option key={d.name}>{d.name}</option>)}
        </select>
        <Label>Durata (settimane)</Label>
        <input type="number" data-testid="input-new-duration" value={duration} onChange={(e) => setDuration(e.target.value)}
          className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm mb-4 mt-1" />
        <p className="text-xs text-muted-foreground mb-3">Inizierà dalla data scelta a sinistra (o da oggi se non ne scegli una).</p>
        <Button data-testid="btn-change-diet" onClick={changeDiet} disabled={saving} className="w-full rounded-full bg-primary">
          {saving ? "Salvo…" : "Applica nuova fase"}
        </Button>
        {MEALS.length === 0 && null}
      </div>
    </div>
  );
}