import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { X, Camera, Loader2, Upload, ScanText, Sparkles } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELDS = [["kcal", "Kcal"], ["protein", "Proteine g"], ["carbs", "Carboidrati g"], ["fats", "Grassi g"]];
const r1 = (n) => Math.round(n * 10) / 10;

export const labelGrams = (qty, unit, unitGrams) => unit === "g" ? qty : unit === "kg" ? qty * 1000 : qty * (unitGrams || 0);

export const buildFridgeLabel = (p, qty, unit) => {
  const per = `${p.kcal} kcal/100g, P ${p.protein} C ${p.carbs} G ${p.fats}${unit === "pz" && p.unitGrams ? `, ${p.unitGrams} g/pz` : ""}`;
  return `${qty} ${unit} ${p.name}${p.brand ? ` (${p.brand})` : ""} [${per}]`;
};

function Totals({ p, grams }) {
  const t = (v) => r1((Number(v) || 0) * grams / 100);
  return (
    <div className="rounded-xl bg-secondary p-3 text-sm" data-testid="label-totals">
      <div className="text-xs text-muted-foreground mb-1">Totale per {Math.round(grams)} g acquistati</div>
      <div className="font-mono text-primary"><strong data-testid="label-total-kcal">{Math.round(t(p.kcal))} kcal</strong> · P <span data-testid="label-total-protein">{t(p.protein)}</span> · C <span data-testid="label-total-carbs">{t(p.carbs)}</span> · G <span data-testid="label-total-fats">{t(p.fats)}</span></div>
    </div>
  );
}

export default function LabelScanner({ onClose, onConfirm, confirmText = "Aggiungi al frigo" }) {
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const [img, setImg] = useState(null);
  const [reading, setReading] = useState(false);
  const [form, setForm] = useState(null);
  const [est, setEst] = useState([]);
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("g");

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setImg(reader.result); setReading(true);
      try {
        const { data } = await api.post("/foods/label", { image_base64: reader.result });
        setForm({ name: data.name || "", brand: data.brand || "", kcal: data.kcal ?? "", protein: data.protein ?? "", carbs: data.carbs ?? "", fats: data.fats ?? "", unitGrams: data.unitGrams || "" });
        setEst(data.estimated || []);
        if (data.unitGrams) { setUnit("pz"); setQty("1"); }
        toast.success(data.estimated?.length ? "Alcuni valori sono stimati: controllali" : "Etichetta letta! Controlla i valori.");
      } catch (err) { toast.error(apiError(err.response?.data?.detail) || "Errore lettura etichetta"); }
      finally { setReading(false); e.target.value = ""; }
    };
    reader.readAsDataURL(file);
  };

  const p = form && { ...form, kcal: Math.round(Number(form.kcal) || 0), protein: r1(Number(form.protein) || 0), carbs: r1(Number(form.carbs) || 0), fats: r1(Number(form.fats) || 0), unitGrams: Number(form.unitGrams) || 0 };
  const grams = p ? labelGrams(Number(qty) || 0, unit, p.unitGrams) : 0;
  const valid = p && p.name.trim() && Number(qty) > 0 && (unit !== "pz" || p.unitGrams > 0);

  const field = (k, label, type = "number") => (
    <div><Label className="text-xs flex items-center gap-1">{label}{est.includes(k) && <span className="text-[10px] px-1.5 rounded-full bg-accent/30 text-accent-foreground" data-testid={`label-est-${k}`}>stimato</span>}</Label>
      <Input type={type} data-testid={`label-field-${k}`} value={form[k]} onChange={(e) => { setForm({ ...form, [k]: e.target.value }); setEst(est.filter((x) => x !== k)); }}
        className={est.includes(k) ? "border-accent" : ""} /></div>
  );

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" data-testid="label-scanner-modal">
      <div className="w-full max-w-lg max-h-[92vh] overflow-auto rounded-2xl bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-primary font-heading font-bold"><ScanText className="w-5 h-5" />Scansiona etichetta nutrizionale</div>
          <button onClick={onClose} data-testid="btn-close-label-scanner"><X className="w-5 h-5" /></button>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" data-testid="input-label-camera" onChange={onFile} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" data-testid="input-label-upload" onChange={onFile} />
        {!form && !reading && <p className="text-sm text-muted-foreground mb-3">Fotografa la tabella nutrizionale del prodotto: l'AI leggerà nome, calorie e macro per 100 g.</p>}
        <div className="flex gap-2">
          <Button data-testid="btn-label-take-photo" onClick={() => camRef.current?.click()} disabled={reading} className="flex-1 rounded-full bg-primary"><Camera className="w-4 h-4 mr-1.5" />Scatta foto</Button>
          <Button variant="outline" data-testid="btn-label-upload-photo" onClick={() => fileRef.current?.click()} disabled={reading} className="flex-1 rounded-full"><Upload className="w-4 h-4 mr-1.5" />Carica foto</Button>
        </div>
        {img && <img src={img} alt="Etichetta" data-testid="label-preview-image" className="mt-3 w-full max-h-48 object-contain rounded-xl bg-secondary" />}
        {reading && <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3" data-testid="label-reading"><Loader2 className="w-4 h-4 animate-spin" />Leggo l'etichetta…</div>}
        {form && !reading && (
          <div className="space-y-3 mt-4" data-testid="label-preview-form">
            {est.length > 0 && <p className="text-xs flex items-center gap-1 text-accent-foreground bg-accent/15 rounded-lg p-2" data-testid="label-estimated-note"><Sparkles className="w-3.5 h-3.5" />I campi "stimato" non erano leggibili: l'AI li ha stimati, verificali.</p>}
            <div className="grid grid-cols-2 gap-2">{field("name", "Nome prodotto", "text")}{field("brand", "Marca", "text")}</div>
            <div className="text-xs font-semibold text-muted-foreground">Valori per 100 g</div>
            <div className="grid grid-cols-4 gap-2">{FIELDS.map(([k, l]) => <div key={k}>{field(k, l)}</div>)}</div>
            <div className="text-xs font-semibold text-muted-foreground pt-1">Quantità acquistata</div>
            <div className="flex gap-2">
              <Input type="number" min="0" data-testid="label-qty" value={qty} placeholder="Q.tà" onChange={(e) => setQty(e.target.value)} className="w-28" />
              <select data-testid="label-unit" value={unit} onChange={(e) => setUnit(e.target.value)} className="rounded-md border border-input bg-card px-2 text-sm h-9">
                <option value="g">g</option><option value="kg">kg</option><option value="pz">pz (unità)</option>
              </select>
              {unit === "pz" && <Input type="number" min="0" data-testid="label-unit-grams" value={form.unitGrams} placeholder="g per unità" onChange={(e) => setForm({ ...form, unitGrams: e.target.value })} className="flex-1" />}
            </div>
            {grams > 0 && <Totals p={p} grams={grams} />}
            <Button data-testid="btn-label-confirm" disabled={!valid} onClick={() => onConfirm(buildFridgeLabel(p, Number(qty), unit), p)} className="w-full rounded-full bg-primary">{confirmText}</Button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
