import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Upload, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import PhotoDiary from "@/components/PhotoDiary";

const MACROS = [
  { key: "protein", label: "Proteine" },
  { key: "carbs", label: "Carboidrati" },
  { key: "fats", label: "Grassi" },
];

export default function PhotoPanel() {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const onPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) { toast.error("Immagine troppo grande (max 6MB)."); return; }
    const reader = new FileReader();
    reader.onload = () => { setPreview(reader.result); setResult(null); analyze(reader.result); };
    reader.readAsDataURL(file);
  };

  const analyze = async (dataUrl) => {
    setLoading(true);
    try {
      const { data } = await api.post("/meal/photo", { image_base64: dataUrl });
      setResult(data);
      setRefreshKey((k) => k + 1);
      toast.success("Pasto salvato nel diario!");
    } catch (err) { toast.error(apiError(err.response?.data?.detail) || "Errore analisi"); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 text-primary mb-1"><Camera className="w-6 h-6" />
        <h2 className="font-heading text-2xl font-bold">Analizza il tuo pasto</h2></div>
      <p className="text-muted-foreground mb-5">Carica la foto di un piatto: l'AI stima calorie e macro e ti dice se è compatibile con la tua dieta.</p>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" data-testid="input-photo" onChange={onPick} />

      <div className="rounded-2xl border border-dashed border-border bg-card p-6">
        {preview ? (
          <img src={preview} alt="pasto" className="w-full max-h-72 object-cover rounded-xl" />
        ) : (
          <button onClick={() => fileRef.current?.click()} data-testid="btn-pick-photo"
            className="w-full py-12 grid place-items-center text-muted-foreground hover:text-primary transition-colors">
            <Upload className="w-10 h-10 mb-2" /><span>Tocca per caricare o scattare una foto</span>
          </button>
        )}
        {preview && (
          <Button variant="outline" className="rounded-full mt-4 w-full" data-testid="btn-change-photo" onClick={() => fileRef.current?.click()}>
            <Camera className="w-4 h-4 mr-1.5" />Cambia foto
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-primary mt-5" data-testid="photo-loading">
          <Loader2 className="w-5 h-5 animate-spin" />Sto analizzando il piatto…
        </div>
      )}

      {result && !loading && (
        <div className="rounded-2xl border border-border bg-card p-6 mt-5" data-testid="photo-result">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-xl font-bold text-primary">{result.dish}</h3>
            <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full ${result.compatible ? "bg-[#eaf5ef] text-[#1b6b3e]" : "bg-destructive/10 text-destructive"}`}>
              {result.compatible ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {result.compatible ? "Compatibile" : "Da evitare"}
            </span>
          </div>
          <p className="text-sm text-foreground/80 mt-2">{result.verdict}</p>
          <div className="flex flex-wrap gap-3 mt-4">
            <span className="text-sm font-mono text-primary bg-secondary px-3 py-1 rounded-full">{result.calories} kcal</span>
            {MACROS.map((m) => (
              <span key={m.key} className="text-sm text-muted-foreground">{m.label}: <strong className="text-primary">{result[m.key]}g</strong></span>
            ))}
          </div>
          {result.advice && <div className="mt-4 bg-accent/15 rounded-xl p-3 text-sm text-accent-foreground">💡 {result.advice}</div>}
        </div>
      )}
      <PhotoDiary refreshKey={refreshKey} />
    </div>
  );
}
