import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Refrigerator,
  Save,
  AlertTriangle,
  Loader2,
  ChefHat,
  ScanText,
  CheckCircle2,
} from "lucide-react";
import LabelScanner from "@/components/LabelScanner";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import FridgeItemInput, { expiryOf, daysLeft } from "@/components/FridgeItemInput";

// Normalizza qualsiasi elemento del frigo in una stringa sicura per evitare errori .match()
const normalizeFridgeItems = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        return item.label || item.name || item.text || "";
      }
      return item != null ? String(item) : "";
    })
    .filter((str) => str.trim() !== "");
};

export default function FridgePanel({ profile, onSaved }) {
  const [items, setItems] = useState(() => normalizeFridgeItems(profile?.fridgeItems));
  const [fridgeComplete, setFridgeComplete] = useState(() =>
    Boolean(profile?.fridgeComplete) && normalizeFridgeItems(profile?.fridgeItems).length > 0
  );
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [checking, setChecking] = useState(false);
  const [recipe, setRecipe] = useState(null);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);

  useEffect(() => {
    const normalized = normalizeFridgeItems(profile?.fridgeItems);
    setItems(normalized);
    setFridgeComplete(Boolean(profile?.fridgeComplete) && normalized.length > 0);
  }, [profile?.fridgeItems, profile?.fridgeComplete]);

  const handleItemsChange = (next) => {
    const normalized = normalizeFridgeItems(next);
    setItems(normalized);
    setFridgeComplete(false);
  };

  const deplete = async (it) => {
    const itemStr = String(it || "");
    const next = items.filter((x) => x !== itemStr);
    const name = itemStr
      .replace(/ \(scade il .*\)/, "")
      .replace(/ \[.*\]/, "")
      .replace(/^\d+([.,]\d+)?\s*(pz|g|kg|ml|l|conf)\s+/i, "");
    setItems(next);
    setFridgeComplete(false);
    try {
      const { data } = await api.put("/profile", {
        fridgeItems: next,
        fridgeComplete: false,
      });
      if (data?.profile) onSaved?.(data.profile);
      else if (data && !data.error) onSaved?.(data);
      await api.post("/shopping-list/add", { name, reparto: "Da ricomprare" });
      toast.success(`${name}: esaurito, aggiunto alla lista della spesa`);
    } catch (err) {
      toast.error(apiError(err?.response?.data?.detail || err));
    }
  };

  const addScanned = async (label) => {
    const cleanLabel =
      typeof label === "string" ? label : label?.name || label?.label || String(label || "");
    if (!cleanLabel.trim()) return;
    const next = [...items, cleanLabel];
    setItems(next);
    setFridgeComplete(false);
    setLabelOpen(false);
    try {
      const { data } = await api.put("/profile", {
        fridgeItems: next,
        fridgeComplete: false,
      });
      if (data?.profile) onSaved?.(data.profile);
      else if (data && !data.error) onSaved?.(data);
      toast.success("Prodotto aggiunto al frigo!");
    } catch (err) {
      toast.error(apiError(err?.response?.data?.detail || err));
    }
  };

  const markFridgeComplete = async () => {
    if (items.length === 0) {
      toast.error("Aggiungi almeno un ingrediente prima di segnare il frigo completo.");
      return;
    }
    setConfirmingComplete(true);
    try {
      const { data } = await api.post("/fridge/complete", {
        fridgeItems: items,
        fridgeComplete: true,
      });
      setFridgeComplete(true);
      if (data?.profile) onSaved?.(data.profile);
      else if (onSaved) {
        onSaved({ ...(profile || {}), fridgeItems: items, fridgeComplete: true });
      }
      toast.success("Frigo segnato come completo!");
    } catch (err) {
      toast.error(apiError(err?.response?.data?.detail || err));
    } finally {
      setConfirmingComplete(false);
    }
  };

  const quickRecipe = async () => {
    setRecipeLoading(true);
    try {
      await api.put("/profile", {
        ...profile,
        fridgeItems: items,
        fridgeComplete,
      });
      const { data } = await api.post("/fridge/recipe");
      setRecipe(data);
    } catch (err) {
      toast.error(apiError(err?.response?.data?.detail || err) || "Errore ricetta");
    } finally {
      setRecipeLoading(false);
    }
  };

  const check = async () => {
    if (!profile?.conditions) return;
    setChecking(true);
    try {
      const { data } = await api.post("/fridge/check");
      setWarnings(data?.warnings || []);
    } catch {
      /* non bloccante */
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    check();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/profile", {
        ...profile,
        fridgeItems: items,
        fridgeComplete,
      });
      if (data?.profile) onSaved?.(data.profile);
      else if (data && !data.error) onSaved?.(data);
      toast.success("Frigo aggiornato!");
      check();
    } catch (err) {
      toast.error(apiError(err?.response?.data?.detail || err));
    } finally {
      setSaving(false);
    }
  };

  const isFridgeReady = fridgeComplete && items.length > 0;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-primary mb-1">
        <Refrigerator className="w-6 h-6" />
        <h2 className="font-heading text-2xl font-bold">Frigo & Dispensa</h2>
      </div>
      <p className="text-muted-foreground mb-5">
        Gestisci gli ingredienti che hai in casa, segna il frigo come completo o chiedi una ricetta veloce. Il piano alimentare resta stabile finché non lo modifichi tu.
      </p>

      <div className="rounded-2xl border border-border bg-card p-6">
        {(() => {
          const soon = items
            .map((it) => ({ it, d: expiryOf(it) }))
            .filter((x) => x.d && daysLeft(x.d) <= 3)
            .sort((a, b) => a.d.localeCompare(b.d));
          return (
            soon.length > 0 && (
              <div
                className="mb-4 rounded-xl bg-accent/15 border border-accent/40 p-3 text-sm text-accent-foreground"
                data-testid="expiry-alert"
              >
                <strong>⏳ In scadenza:</strong>{" "}
                {soon
                  .map(
                    (x) =>
                      `${x.it.replace(/ \(scade il .*\)/, "")} (${
                        daysLeft(x.d) < 0
                          ? "scaduto"
                          : daysLeft(x.d) === 0
                          ? "oggi"
                          : `tra ${daysLeft(x.d)} gg`
                      })`
                  )
                  .join(", ")}
                .
              </div>
            )
          );
        })()}

        <Button
          variant="outline"
          data-testid="btn-open-label-scanner"
          onClick={() => setLabelOpen(true)}
          className="rounded-full border-accent mb-4"
        >
          <ScanText className="w-4 h-4 mr-1.5" />
          Scansiona etichetta nutrizionale
        </Button>

        {labelOpen && (
          <LabelScanner onClose={() => setLabelOpen(false)} onConfirm={addScanned} />
        )}

        <FridgeItemInput
          items={items}
          onChange={handleItemsChange}
          warnItems={warnings.map((w) => w.item)}
          onDeplete={deplete}
        />

        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">
            {isFridgeReady
              ? "Frigo confermato come completo."
              : "Puoi segnare 'Frigo completo' quando hai finito di inserire gli ingredienti."}
          </span>
          <Button
            type="button"
            variant={isFridgeReady ? "secondary" : "outline"}
            size="sm"
            data-testid="btn-fridge-complete"
            onClick={markFridgeComplete}
            disabled={confirmingComplete || items.length === 0}
            className="rounded-full shrink-0"
          >
            {confirmingComplete ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
            )}
            {isFridgeReady ? "Frigo completo ✓" : "Frigo completo"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 mt-6">
          <Button
            variant="outline"
            data-testid="btn-save-fridge"
            onClick={save}
            disabled={saving}
            className="rounded-full"
          >
            <Save className="w-4 h-4 mr-1.5" />
            Salva frigo
          </Button>

          <Button
            variant="outline"
            data-testid="btn-fridge-recipe"
            onClick={quickRecipe}
            disabled={recipeLoading || items.length === 0}
            className="rounded-full border-accent"
          >
            {recipeLoading ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <ChefHat className="w-4 h-4 mr-1.5" />
            )}
            Ricetta veloce dal frigo
          </Button>
        </div>
      </div>

      {recipe && (
        <div className="mt-5 rounded-2xl border border-accent/50 bg-card p-6" data-testid="fridge-recipe">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-heading text-xl font-bold text-primary">{recipe.title}</h3>
            <span className="text-sm text-muted-foreground">
              ⏱ {recipe.time} · <strong className="text-primary">{recipe.kcal} kcal</strong> · P{recipe.protein} C{recipe.carbs} G{recipe.fats}
            </span>
          </div>
          <div className="grid sm:grid-cols-2 gap-5 mt-4">
            <ul className="list-disc ml-5 text-sm space-y-1">
              {recipe.ingredients?.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
            <ol className="list-decimal ml-5 text-sm space-y-1">
              {recipe.steps?.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {profile?.conditions && (
        <div className="mt-5" data-testid="condition-check">
          {checking ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Controllo compatibilità con: {profile.conditions}…
            </div>
          ) : warnings.length > 0 ? (
            <div className="rounded-2xl p-5 bg-destructive/10 border border-destructive/30" data-testid="condition-warnings">
              <div className="flex items-center gap-2 text-destructive font-semibold mb-2">
                <AlertTriangle className="w-4 h-4" />
                Attenzione: ingredienti non adatti a {profile.conditions}
              </div>
              <ul className="space-y-1 text-sm text-destructive/90">
                {warnings.map((w, i) => (
                  <li key={i}>
                    <strong>{w.item}</strong>: {w.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-[#1b6b3e]" data-testid="condition-ok">
              ✓ Nessun ingrediente controindicato per: {profile.conditions}
            </p>
          )}
        </div>
      )}
    </div>
  );
}