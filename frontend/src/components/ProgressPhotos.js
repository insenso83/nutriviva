import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Trash2, Columns2, Loader2 } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";

const fmtDate = (d) => new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });

export default function ProgressPhotos() {
  const fileRef = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [due, setDue] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sel, setSel] = useState([]);
  const token = localStorage.getItem("nv_token") || "";
  const src = (p) => `${process.env.REACT_APP_BACKEND_URL}/api/files/${p.image_path}?auth=${token}`;

  const load = () => api.get("/progress-photos").then((r) => {
    const ph = r.data.photos || [];
    setPhotos(ph); setDue(r.data.due);
    if (ph.length >= 2) setSel([ph[0].id, ph[ph.length - 1].id]);
  }).catch(() => {});
  useEffect(() => { load(); }, []);

  const onPick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setUploading(true);
      try { await api.post("/progress-photos", { image_base64: reader.result }); toast.success("Foto progressi salvata!"); load(); }
      catch (err) { toast.error(apiError(err.response?.data?.detail)); }
      finally { setUploading(false); e.target.value = ""; }
    };
    reader.readAsDataURL(f);
  };

  const toggle = (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s.slice(-1), id]);
  const remove = async (id) => { await api.delete(`/progress-photos/${id}`); setSel((s) => s.filter((x) => x !== id)); load(); };
  const compare = sel.map((id) => photos.find((p) => p.id === id)).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-6" data-testid="progress-photos">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 text-primary"><Camera className="w-5 h-5" /><h2 className="font-heading text-xl font-bold">Foto progressi</h2></div>
        <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" data-testid="input-progress-photo" onChange={onPick} />
        <Button data-testid="btn-add-progress-photo" onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-full bg-primary">
          {uploading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Camera className="w-4 h-4 mr-1.5" />}Aggiungi foto
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        {due ? "📸 È passata una settimana: scatta la nuova foto (stessa posa e luce)." : "Una foto a settimana. Seleziona 2 foto per confrontarle affiancate."}
      </p>

      {compare.length === 2 && (
        <div className="mb-5" data-testid="photo-compare">
          <div className="flex items-center gap-2 text-sm text-primary font-semibold mb-2"><Columns2 className="w-4 h-4" />Confronto</div>
          <div className="grid grid-cols-2 gap-3">
            {compare.map((p) => (
              <div key={p.id} className="rounded-xl overflow-hidden border border-border">
                <img src={src(p)} alt="progresso" className="w-full aspect-[3/4] object-cover bg-muted" />
                <div className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(p.date)}{p.weight && <strong className="text-primary"> · {p.weight} kg</strong>}</div>
              </div>
            ))}
          </div>
          {compare[0].weight && compare[1].weight && (
            <p className="text-sm text-center mt-2 text-primary" data-testid="photo-compare-delta">
              Differenza: <strong>{(compare[1].weight - compare[0].weight > 0 ? "+" : "")}{(compare[1].weight - compare[0].weight).toFixed(1)} kg</strong> in {Math.round((new Date(compare[1].date) - new Date(compare[0].date)) / 86400000)} giorni
            </p>
          )}
        </div>
      )}

      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6" data-testid="progress-empty">Nessuna foto ancora.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {photos.map((p) => (
            <div key={p.id} className={`relative rounded-xl overflow-hidden border-2 cursor-pointer ${sel.includes(p.id) ? "border-accent" : "border-transparent"}`}
              data-testid={`progress-photo-${p.id}`} onClick={() => toggle(p.id)}>
              <img src={src(p)} alt="progresso" className="w-full aspect-[3/4] object-cover bg-muted" />
              <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-1.5 py-0.5">{fmtDate(p.date)}</div>
              <button className="absolute top-1 right-1 bg-white/80 rounded-full p-1" data-testid={`btn-delete-progress-${p.id}`}
                onClick={(e) => { e.stopPropagation(); remove(p.id); }}><Trash2 className="w-3 h-3 text-destructive" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
