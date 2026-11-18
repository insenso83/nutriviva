import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Refrigerator, RefreshCw, Save, AlertTriangle, Loader2, ChefHat, ScanText } from "lucide-react";
import LabelScanner from "@/components/LabelScanner";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import FridgeItemInput, { expiryOf, daysLeft } from "@/components/FridgeItemInput";

export default function FridgePanel({ profile, onSaved, onGenerate, generating }) {
  const [items, setItems] = useState(profile?.fridgeItems || []);
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [checking, setChecking] = useState(false);
  const [recipe, setRecipe] = useState(null);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);

  useEffect(() => { setItems(profile?.fridgeItems || []); }, [profile?.fridgeItems]);

  const deplete = async (it) => {
    const next = items.filter((x) => x !== it);
    const name = it.replace(/ \(scade il .*\)/, "").replace(/ \[.*\]/, "").replace(/^\d+([.,]\d+)?\s*(pz|g|kg|ml|l|conf)\s+/i, "");
    setItems(next);
    try {
      const { data } = await api.put("/profile", { fridgeItems: next });
      onSaved(data.profile);
      await api.post("/shopping-list/add", { name, reparto: "Da ricomprare" });
      toast.success(`${name}: esaurito, aggiunto alla lista della spesa`);
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const addScanned = async (label) => {
    const next = [...items, label];
    setItems(next); setLabelOpen(false);
    try {
      const { data } = await api.put("/profile", { fridgeItems: next });
      onSaved(data.profile);
      toast.success("Prodotto aggiunto al frigo!");
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  const quickRecipe = async () => {
    setRecipeLoading(true);
    try {
      await api.put("/profile", { ...profile, fridgeItems: items });
      const { data } = await api.post("/fridge/recipe");
      setRecipe(data);
    } catch (err) { toast.error(apiError(err.response?.data?.detail) || "Errore ricetta"); }
    finally { setRecipeLoading(false); }
  };

  const check = async () => {
    if (!profile?.conditions) return;
    setChecking(true);
    try { const { data } = await api.post("/fridge/check"); setWarnings(data.warnings || []); }
    catch { /* non bloccante */ }
    finally { setChecking(false); }
  };

  useEffect(() => { check(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (regen) => {
    setSaving(true);
    try {
      const { data } = await api.put("/profile", { ...profile, fridgeItems: items });
      onSaved(data.profile);
      toast.success("Frigo aggiornato!");
      if (regen) onGenerate(); else check();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-primary mb-1"><Refrigerator className="w-6 h-6" />
        <h2 className="font-heading text-2xl font-bold">Frigo & Dispensa</h2></div>
      <p className="text-muted-foreground mb-5">Indica cosa hai in casa e in che quantità: rigenera il piano per adattare i pasti agli ingredienti disponibili.</p>

      <div className="rounded-2xl border border-border bg-card p-6">
        {(() => {
          const soon = items.map((it) => ({ it, d: expiryOf(it) })).filter((x) => x.d && daysLeft(x.d) <= 3)
            .sort((a, b) => a.d.localeCompare(b.d));
          return soon.length > 0 && (
            <div className="mb-4 rounded-xl bg-accent/15 border border-accent/40 p-3 text-sm text-accent-foreground" data-testid="expiry-alert">
              <strong>⏳ In scadenza:</strong> {soon.map((x) => `${x.it.replace(/ \(scade il .*\)/, "")} (${daysLeft(x.d) < 0 ? "scaduto" : daysLeft(x.d) === 0 ? "oggi" : `tra ${daysLeft(x.d)} gg`})`).join(", ")}.
              Rigenera il piano: verranno usati per primi.
            </div>
          );
        })()}
        <Button variant="outline" data-testid="btn-open-label-scanner" onClick={() => setLabelOpen(true)} className="rounded-full border-accent mb-4">
          <ScanText className="w-4 h-4 mr-1.5" />Scansiona etichetta nutrizionale
        </Button>
        {labelOpen && <LabelScanner onClose={() => setLabelOpen(false)} onConfirm={addScanned} />}
        <FridgeItemInput items={items} onChange={setItems} warnItems={warnings.map((w) => w.item)} onDeplete={deplete} />
        <div className="flex flex-wrap gap-3 mt-6">
          <Button variant="outline" data-testid="btn-save-fridge" onClick={() => save(false)} disabled={saving} className="rounded-full">
            <Save className="w-4 h-4 mr-1.5" />Salva frigo
          </Button>
          <Button data-testid="btn-save-regen-fridge" onClick={() => save(true)} disabled={saving || generating} className="rounded-full bg-primary">
            <RefreshCw className={`w-4 h-4 mr-1.5 ${generating ? "animate-spin" : ""}`} />Salva e rigenera piano
          </Button>
          <Button variant="outline" data-testid="btn-fridge-recipe" onClick={quickRecipe} disabled={recipeLoading || items.length === 0} className="rounded-full border-accent">
            {recipeLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ChefHat className="w-4 h-4 mr-1.5" />}Ricetta veloce dal frigo
          </Button>
        </div>
      </div>

      {recipe && (
        <div className="mt-5 rounded-2xl border border-accent/50 bg-card p-6" data-testid="fridge-recipe">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-heading text-xl font-bold text-primary">{recipe.title}</h3>
            <span className="text-sm text-muted-foreground">⏱ {recipe.time} · <strong className="text-primary">{recipe.kcal} kcal</strong> · P{recipe.protein} C{recipe.carbs} G{recipe.fats}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-5 mt-4">
            <ul className="list-disc ml-5 text-sm space-y-1">{recipe.ingredients?.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <ol className="list-decimal ml-5 text-sm space-y-1">{recipe.steps?.map((x, i) => <li key={i}>{x}</li>)}</ol>
          </div>
        </div>
      )}

      {profile?.conditions && (
        <div className="mt-5" data-testid="condition-check">
          {checking ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Controllo compatibilità con: {profile.conditions}…</div>
          ) : warnings.length > 0 ? (
            <div className="rounded-2xl p-5 bg-destructive/10 border border-destructive/30" data-testid="condition-warnings">
              <div className="flex items-center gap-2 text-destructive font-semibold mb-2"><AlertTriangle className="w-4 h-4" />Attenzione: ingredienti non adatti a {profile.conditions}</div>
              <ul className="space-y-1 text-sm text-destructive/90">
                {warnings.map((w, i) => <li key={i}><strong>{w.item}</strong>: {w.reason}</li>)}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-[#1b6b3e]" data-testid="condition-ok">✓ Nessun ingrediente controindicato per: {profile.conditions}</p>
          )}
        </div>
      )}
    </div>
  );
}
