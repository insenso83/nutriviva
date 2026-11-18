import { useEffect, useState } from "react";
import { BookImage, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";

const today = () => new Date().toISOString().slice(0, 10);

export default function PhotoDiary({ refreshKey }) {
  const [day, setDay] = useState(today());
  const [data, setData] = useState({ entries: [], totalCalories: 0 });
  const token = localStorage.getItem("nv_token") || "";
  const base = `${import.meta.env.VITE_BACKEND_URL || ""}/api/files/`;

  const load = () => api.get("/diary", { params: { day } }).then((r) => setData(r.data)).catch(() => {});
  useEffect(() => { load(); }, [day, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (id) => { await api.delete(`/diary/${id}`); load(); };

  return (
    <div className="mt-8" data-testid="photo-diary">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 text-primary"><BookImage className="w-5 h-5" />
          <h3 className="font-heading text-xl font-bold">Diario foto</h3></div>
        <Input type="date" data-testid="input-diary-day" value={day} onChange={(e) => setDay(e.target.value)} className="w-44" />
      </div>
      <div className="rounded-2xl bg-primary text-primary-foreground px-5 py-4 flex items-center justify-between mb-4">
        <span>Totale calorie del giorno</span>
        <span className="font-heading text-3xl font-extrabold" data-testid="diary-total">{data.totalCalories} kcal</span>
      </div>
      {data.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8" data-testid="diary-empty">Nessuna foto analizzata in questo giorno.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {data.entries.map((e) => (
            <div key={e.id} className="rounded-2xl border border-border bg-card overflow-hidden" data-testid={`diary-entry-${e.id}`}>
              {e.image_path && <img src={`${base}${e.image_path}?auth=${token}`} alt={e.dish} className="w-full h-40 object-cover"
                onError={(ev) => { ev.currentTarget.style.display = "none"; }} />}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-heading font-semibold text-primary">{e.dish}</h4>
                  <button onClick={() => remove(e.id)} data-testid={`btn-diary-delete-${e.id}`}><Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" /></button>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(e.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · <strong className="text-primary">{e.calories} kcal</strong> · P{e.protein} C{e.carbs} G{e.fats}
                </div>
                <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full ${e.compatible ? "bg-[#eaf5ef] text-[#1b6b3e]" : "bg-destructive/10 text-destructive"}`}>
                  {e.compatible ? "Compatibile" : "Da evitare"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}