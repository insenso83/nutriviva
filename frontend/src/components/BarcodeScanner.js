import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";
import { X, ScanBarcode, Loader2, Camera } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Camera barcode scan -> lookup (own DB + Open Food Facts) -> manual form if unknown, then saved for everyone
export default function BarcodeScanner({ initialName = "", onClose, onProduct }) {
  const [code, setCode] = useState("");
  const [looking, setLooking] = useState(false);
  const [form, setForm] = useState(null);
  const scannerRef = useRef(null);
  const labelRef = useRef(null);
  const [reading, setReading] = useState(false);

  const readLabel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setReading(true);
      try {
        const { data } = await api.post("/foods/label", { image_base64: reader.result });
        setForm((f) => ({ ...f, name: data.name || f.name, brand: data.brand || f.brand, kcal: data.kcal ?? "", protein: data.protein ?? "", carbs: data.carbs ?? "", fats: data.fats ?? "" }));
        toast.success(data.readable === false ? "Etichetta poco leggibile: controlla i valori" : "Valori letti! Controllali e memorizza.");
      } catch (err) { toast.error(apiError(err.response?.data?.detail) || "Errore lettura"); }
      finally { setReading(false); e.target.value = ""; }
    };
    reader.readAsDataURL(file);
  };

  const stop = async () => { try { await scannerRef.current?.stop(); } catch { /* already stopped */ } };

  const lookup = async (c) => {
    setCode(c); setLooking(true);
    try {
      const { data } = await api.get(`/foods/barcode/${encodeURIComponent(c)}`);
      if (data.found) { toast.success(`Trovato: ${data.product.name}`); onProduct(data.product); }
      else setForm({ name: initialName, brand: "", kcal: "", protein: "", carbs: "", fats: "" });
    } catch { setForm({ name: initialName, brand: "", kcal: "", protein: "", carbs: "", fats: "" }); }
    finally { setLooking(false); }
  };

  useEffect(() => {
    const s = new Html5Qrcode("nv-scanner");
    scannerRef.current = s;
    s.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 260, height: 140 } },
      (text) => { stop(); lookup(text); }, () => {})
      .catch(() => toast.error("Fotocamera non disponibile: inserisci il codice a mano."));
    return () => { stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    try {
      const body = { code: code || null, name: form.name, brand: form.brand, kcal: Number(form.kcal),
        protein: Number(form.protein || 0), carbs: Number(form.carbs || 0), fats: Number(form.fats || 0) };
      const { data } = await api.post("/foods/custom", body);
      toast.success("Prodotto memorizzato!");
      onProduct(data.product);
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const f = (k, label, type = "number") => (
    <div><Label className="text-xs">{label}</Label>
      <Input type={type} data-testid={`custom-food-${k}`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" data-testid="barcode-modal">
      <div className="w-full max-w-md rounded-2xl bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-primary font-heading font-bold"><ScanBarcode className="w-5 h-5" />Scansiona codice a barre</div>
          <button onClick={() => { stop(); onClose(); }} data-testid="btn-close-scanner"><X className="w-5 h-5" /></button>
        </div>
        {!form && (
          <>
            <div id="nv-scanner" className="w-full rounded-xl overflow-hidden bg-black/80 min-h-[200px]" />
            <div className="flex gap-2 mt-3">
              <Input data-testid="input-barcode" value={code} placeholder="…oppure digita il codice (EAN)" onChange={(e) => setCode(e.target.value)} />
              <Button data-testid="btn-lookup-barcode" onClick={() => { stop(); lookup(code); }} disabled={!code || looking} className="bg-primary">
                {looking ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cerca"}
              </Button>
            </div>
            <Button variant="outline" data-testid="btn-label-only" onClick={() => { stop(); setForm({ name: initialName, brand: "", kcal: "", protein: "", carbs: "", fats: "" }); }}
              className="w-full rounded-full mt-2 text-xs">Nessun codice? Inserisci o fotografa l'etichetta</Button>
          </>
        )}
        {form && (
          <div className="space-y-3" data-testid="custom-food-form">
            <p className="text-sm text-muted-foreground">Prodotto {code && <span className="font-mono">{code}</span>} non presente. Fotografa la tabella nutrizionale oppure inserisci i valori (per 100 g): verrà memorizzato.</p>
            <input ref={labelRef} type="file" accept="image/*" capture="environment" className="hidden" data-testid="input-label-photo" onChange={readLabel} />
            <Button type="button" variant="outline" data-testid="btn-scan-label" onClick={() => labelRef.current?.click()} disabled={reading} className="w-full rounded-full border-accent">
              {reading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Camera className="w-4 h-4 mr-1.5" />}
              {reading ? "Leggo l'etichetta…" : "Fotografa i valori nutrizionali"}
            </Button>
            <div className="grid grid-cols-2 gap-2">{f("name", "Nome prodotto", "text")}{f("brand", "Marca", "text")}</div>
            <div className="grid grid-cols-4 gap-2">{f("kcal", "Kcal")}{f("protein", "Prot. g")}{f("carbs", "Carbo g")}{f("fats", "Grassi g")}</div>
            <Button data-testid="btn-save-custom-food" onClick={save} disabled={!form.name || !form.kcal} className="w-full rounded-full bg-primary">Memorizza e aggiungi</Button>
          </div>
        )}
      </div>
    </div>
  );
}
