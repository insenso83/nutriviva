import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ruler } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELDS = [
  { key: "vita", label: "Vita", color: "#19442b" },
  { key: "fianchi", label: "Fianchi", color: "#c85a32" },
  { key: "braccia", label: "Braccia", color: "#e9a834" },
  { key: "cosce", label: "Cosce", color: "#1a5b67" },
  { key: "torace", label: "Torace", color: "#809c48" },
];

export default function MeasurementsCard() {
  const [hist, setHist] = useState([]);
  const [vals, setVals] = useState({});
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/checkins/measurements").then((r) => setHist(r.data.history || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(vals).filter(([, v]) => v).map(([k, v]) => [k, Number(v)]));
      await api.post("/checkins/measurements", body);
      toast.success("Misure registrate!");
      setVals({}); load();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const data = hist.map((h) => ({ ...h, date: new Date(h.date).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) }));
  const used = FIELDS.filter((f) => hist.some((h) => h[f.key]));

  return (
    <div className="grid lg:grid-cols-3 gap-6 mt-6">
      <div className="rounded-2xl border border-border bg-card p-6" data-testid="measurements-card">
        <div className="flex items-center gap-2 text-primary"><Ruler className="w-5 h-5" /><h2 className="font-heading text-xl font-bold">Centimetri</h2></div>
        <p className="text-sm text-muted-foreground mt-1 mb-4">Facoltativo: inserisci solo le misure che hai.</p>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key}><Label className="text-xs">{f.label} (cm)</Label>
              <Input type="number" data-testid={`input-measure-${f.key}`} value={vals[f.key] || ""} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} /></div>
          ))}
        </div>
        <Button data-testid="btn-save-measures" onClick={save} disabled={saving || !Object.values(vals).some(Boolean)} className="w-full mt-4 rounded-full bg-primary">
          {saving ? "Salvo…" : "Registra misure"}
        </Button>
      </div>
      <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6">
        <h3 className="font-heading font-bold text-primary mb-4">Andamento centimetri</h3>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3ede6" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 12 }} />
              <Tooltip /><Legend />
              {used.map((f) => <Line key={f.key} type="monotone" dataKey={f.key} name={f.label} stroke={f.color} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        ) : <p className="text-muted-foreground text-sm py-12 text-center" data-testid="measures-empty">Registra le misure per vedere il grafico.</p>}
      </div>
    </div>
  );
}
