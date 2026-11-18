import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pill, Check, Clock, Bell, BellRing } from "lucide-react";
import { SUPPLEMENTS, VARIANT_TIPS } from "@/lib/constants";
import { api, apiError } from "@/lib/api";
import { enablePush, saveReminders } from "@/lib/push";
import { Button } from "@/components/ui/button";

const LS_KEY = "nv_supp_reminders";
const label = (sid) => SUPPLEMENTS.find((s) => s.id === sid)?.label || "Integratore";

export default function SupplementsPanel({ profile, onProfile }) {
  const active = profile?.supplements || [];
  const [taken, setTaken] = useState({});
  const [times, setTimes] = useState({});
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    setTimes(saved.times || {});
    setEnabled(saved.enabled || false);
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ times, enabled }));
    if (!enabled) return;
    const t = setTimeout(() => {
      const list = Object.entries(times).filter(([sid, v]) => v && active.includes(sid)).map(([sid, v]) => ({ label: label(sid), time: v }));
      saveReminders({ supplements: list }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [times, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // in-app toast while the tab is open (push handles the closed app)
  useEffect(() => {
    if (!enabled) return;
    const fired = {};
    const id = setInterval(() => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      Object.entries(times).forEach(([sid, t]) => {
        if (t === hhmm && fired[sid] !== hhmm) {
          fired[sid] = hhmm;
          toast(`⏰ È ora di assumere: ${label(sid)}`);
        }
      });
    }, 20000);
    return () => clearInterval(id);
  }, [enabled, times]);

  const enableReminders = async () => {
    let push = false;
    try { push = await enablePush(); } catch { push = false; }
    setEnabled(true);
    toast.success(push ? "Promemoria attivati! Arriveranno sul telefono anche ad app chiusa." : "Notifiche non consentite: riceverai gli avvisi solo ad app aperta.");
  };

  const list = SUPPLEMENTS.map((s) => ({ ...s, selected: active.includes(s.id) }));
  const [stock, setStock] = useState([]);
  useEffect(() => { api.get("/supplements/stock").then((r) => setStock(r.data.stock || [])).catch(() => {}); }, [profile]);

  const newPackage = async (sid) => {
    const det = { ...(profile.supplementDetails || {}) };
    det[sid] = { ...(det[sid] || {}), openedAt: new Date().toISOString().slice(0, 10) };
    try { const { data } = await api.put("/profile", { supplementDetails: det }); onProfile?.(data.profile); toast.success("Nuova confezione registrata!"); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-heading text-2xl font-bold text-primary mb-1">Integratori & Farmaci</h2>
          <p className="text-muted-foreground">Quando assumerli e promemoria orari per non dimenticarli.</p>
        </div>
        <Button data-testid="btn-enable-reminders" onClick={enableReminders} disabled={enabled}
          className={`rounded-full ${enabled ? "bg-secondary text-primary" : "bg-primary"}`}>
          {enabled ? <BellRing className="w-4 h-4 mr-1.5" /> : <Bell className="w-4 h-4 mr-1.5" />}
          {enabled ? "Promemoria attivi" : "Attiva promemoria"}
        </Button>
      </div>

      {stock.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-4 mb-5" data-testid="supplement-stock">
          {stock.map((st) => {
            const s = SUPPLEMENTS.find((x) => x.id === st.id);
            const pct = Math.round((st.daysLeft / (st.totalDays || 1)) * 100);
            return (
              <div key={st.id} className={`rounded-2xl border p-4 ${st.low ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`} data-testid={`stock-${st.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-heading font-semibold text-primary">{s?.label}{st.brand && ` · ${st.brand}`}</span>
                  {st.low && <span className="text-xs font-semibold text-destructive" data-testid={`stock-low-${st.id}`}>⚠️ In esaurimento</span>}
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden mt-2"><div className={`h-full ${st.low ? "bg-destructive" : "bg-[#1b6b3e]"}`} style={{ width: `${pct}%` }} /></div>
                <p className="text-xs text-muted-foreground mt-1.5">Restano ~<strong className="text-primary">{st.remainingGrams} g</strong> · {st.daysLeft} giorni · finisce il {new Date(st.runOutDate).toLocaleDateString("it-IT")}</p>
                <button data-testid={`btn-new-package-${st.id}`} onClick={() => newPackage(st.id)} className="mt-2 text-xs underline text-primary">Ho aperto una nuova confezione</button>
                <button data-testid={`btn-supp-to-shop-${st.id}`} onClick={() => api.post(`/supplements/${st.id}/to-shopping`).then(() => toast.success("Aggiunto alla lista della spesa (Integratori)")).catch(() => toast.error("Errore"))}
                  className="mt-2 ml-3 text-xs font-semibold text-accent-foreground bg-accent/20 rounded-full px-2.5 py-1">🛒 Aggiungi alla spesa</button>
                {st.low && <p className="text-[11px] text-muted-foreground mt-1">Quando è in esaurimento viene aggiunto da solo alla spesa ogni mattina.</p>}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {list.map((s) => (
          <div key={s.id} data-testid={`supplement-${s.id}`}
            className={`rounded-2xl border p-5 transition-all ${s.selected ? "border-primary bg-card" : "border-border bg-secondary/30 opacity-70"}`}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary grid place-items-center shrink-0"><Pill className="w-5 h-5 text-primary" /></div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading font-semibold text-primary">{s.label}</h3>
                  {s.selected && <span className="text-xs bg-secondary text-primary px-2 py-0.5 rounded-full">In uso</span>}
                </div>
                <p className="flex items-start gap-1.5 text-sm text-muted-foreground mt-1.5"><Clock className="w-4 h-4 mt-0.5 shrink-0 text-accent" />{s.timing}</p>
                {s.selected && profile?.supplementDetails?.[s.id] && (profile.supplementDetails[s.id].variant || profile.supplementDetails[s.id].brand) && (
                  <p className="text-xs text-primary mt-1" data-testid={`supp-detail-${s.id}`}>
                    {profile.supplementDetails[s.id].variant}{profile.supplementDetails[s.id].brand && ` · ${profile.supplementDetails[s.id].brand}`}
                    {VARIANT_TIPS[profile.supplementDetails[s.id].variant] && <span className="block text-[#1b6b3e]">💡 {VARIANT_TIPS[profile.supplementDetails[s.id].variant]}</span>}
                  </p>
                )}
                {s.selected && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button data-testid={`btn-supplement-toggle-${s.id}`} onClick={() => setTaken({ ...taken, [s.id]: !taken[s.id] })}
                      className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border transition-all ${taken[s.id] ? "bg-primary text-primary-foreground border-primary" : "border-border text-primary"}`}>
                      <Check className="w-3.5 h-3.5" />{taken[s.id] ? "Assunto oggi" : "Segna come assunto"}
                    </button>
                    <label className="inline-flex items-center gap-1.5 text-sm text-primary">
                      <Bell className="w-3.5 h-3.5" />
                      <input type="time" step="900" data-testid={`time-${s.id}`} value={times[s.id] || ""}
                        onChange={(e) => setTimes({ ...times, [s.id]: e.target.value })}
                        className="rounded-lg border border-input bg-card px-2 py-1 text-sm" />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {profile?.medications && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5" data-testid="medications-card">
          <h3 className="font-heading font-semibold text-primary mb-1">Farmaci / terapie personali</h3>
          <p className="text-sm text-muted-foreground">{profile.medications}</p>
        </div>
      )}
    </div>
  );
}
