import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Leaf, LogOut, UtensilsCrossed, Scale, Smile, Pill, RefreshCw, CalendarDays, Refrigerator, ShoppingCart, CookingPot, Droplet, Camera, UserCog, BarChart3 } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import MealPlanViewer from "@/components/MealPlanViewer";
import CheckinsPanel from "@/components/CheckinsPanel";
import SupplementsPanel from "@/components/SupplementsPanel";
import CalendarCard from "@/components/CalendarCard";
import FridgePanel from "@/components/FridgePanel";
import ShoppingListPanel from "@/components/ShoppingListPanel";
import RecipesPanel from "@/components/RecipesPanel";
import WaterPanel from "@/components/WaterPanel";
import PhotoPanel from "@/components/PhotoPanel";
import ProfilePanel from "@/components/ProfilePanel";
import SummaryPanel from "@/components/SummaryPanel";

const TABS = [
  { id: "plan", label: "Piano Pasti", icon: UtensilsCrossed },
  { id: "summary", label: "Riepilogo", icon: BarChart3 },
  { id: "profile", label: "Profilo", icon: UserCog },
  { id: "fridge", label: "Frigo", icon: Refrigerator },
  { id: "shopping", label: "Spesa", icon: ShoppingCart },
  { id: "recipes", label: "Ricette", icon: CookingPot },
  { id: "photo", label: "Foto Pasto", icon: Camera },
  { id: "water", label: "Acqua", icon: Droplet },
  { id: "weight", label: "Peso", icon: Scale },
  { id: "mood", label: "Umore", icon: Smile },
  { id: "supplements", label: "Integratori", icon: Pill },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [profile, setProfile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [tab, setTab] = useState("plan");
  const [generating, setGenerating] = useState(false);
  const [weightStatus, setWeightStatus] = useState(null);
  const [moodStatus, setMoodStatus] = useState(null);
  const [lowStock, setLowStock] = useState([]);

  useEffect(() => {
    api.get("/supplements/stock").then((r) => setLowStock((r.data.stock || []).filter((s) => s.low))).catch(() => {});
  }, [profile?.supplementDetails]);

  const loadStatuses = useCallback(() => {
    api.get("/checkins/weight").then((r) => setWeightStatus(r.data)).catch(() => {});
    api.get("/checkins/mood").then((r) => setMoodStatus(r.data)).catch(() => {});
  }, []);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      await api.post("/plan/generate");
      // poll for completion (AI generation is async to avoid proxy timeouts)
      const started = Date.now();
      const poll = async () => {
        const { data } = await api.get("/plan");
        if (data?.status === "ready" && data.plan) {
          setPlan(data.plan);
          setGenerating(false);
          toast.success("Piano generato!");
          return;
        }
        if (data?.status === "error") {
          setGenerating(false);
          toast.error("Errore nella generazione del piano. Riprova.");
          return;
        }
        if (Date.now() - started > 180000) {
          setGenerating(false);
          toast.error("La generazione richiede troppo tempo. Riprova.");
          return;
        }
        setTimeout(poll, 4000);
      };
      setTimeout(poll, 4000);
    } catch (err) {
      setGenerating(false);
      toast.error(apiError(err.response?.data?.detail) || "Errore nella generazione");
    }
  }, []);

  const savePlan = useCallback(async (newPlan) => {
    setPlan(newPlan);
    try { await api.put("/plan", { plan: newPlan }); } catch {}
  }, []);

  useEffect(() => {
    api.get("/profile").then((r) => {
      if (!r.data || !r.data.age) { nav("/onboarding"); return; }
      setProfile(r.data);
    });
    api.get("/plan").then((r) => { if (r.data?.plan) setPlan(r.data.plan); });
    loadStatuses();
  }, [nav, loadStatuses]);

  useEffect(() => {
    if (sp.get("generate") === "1") { setSp({}, { replace: true }); generate(); }
  }, [sp, setSp, generate]);

  const weightDue = weightStatus?.due;
  const moodDue = moodStatus?.due;

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 flex items-center gap-4 px-4 sm:px-6 border-b border-border bg-card/85 backdrop-blur-xl sticky top-0 z-20 no-print">
        <Leaf className="w-6 h-6 text-primary" />
        <span className="font-heading text-xl font-bold text-primary hidden sm:block">NutriViva</span>
        <div className="ml-auto flex items-center gap-2">
          <Button data-testid="btn-generate-plan" onClick={generate} disabled={generating}
            className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90">
            <RefreshCw className={`w-4 h-4 mr-1.5 ${generating ? "animate-spin" : ""}`} />
            {generating ? "Genero…" : "Nuovo Piano"}
          </Button>
          <span className="text-sm text-muted-foreground hidden md:block">{user?.name || user?.email}</span>
          <Button variant="ghost" size="icon" data-testid="btn-logout" onClick={() => { logout(); nav("/login"); }}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {profile && !profile.dietActive && (
        <div className="bg-[#eaf5ef] border-b border-[#1b6b3e]/30 px-4 sm:px-6 py-2.5 text-sm text-[#1b6b3e] no-print" data-testid="banner-diet-inactive">
          <button className="font-semibold underline" onClick={() => setTab("calendar")}>▶️ La dieta non è ancora attiva: scegli quando iniziare (oggi o una data futura)</button>
        </div>
      )}
      {(weightDue || moodDue || lowStock.length > 0 || new Date().getDay() === 0) && (
        <div className="bg-destructive/10 border-b border-destructive/30 px-4 sm:px-6 py-2.5 text-sm text-destructive flex flex-wrap gap-x-6 gap-y-1 no-print"
          data-testid="checkin-banner">
          {lowStock.length > 0 && <button data-testid="banner-low-stock" className="font-semibold underline" onClick={() => setTab("supplements")}>💊 In esaurimento: {lowStock.map((s) => `${s.brand || s.id} (${s.daysLeft} gg)`).join(", ")}</button>}
          {new Date().getDay() === 0 && <button data-testid="banner-weekly-summary" className="font-semibold underline text-primary" onClick={() => setTab("summary")}>📊 È domenica: guarda il tuo riepilogo settimanale</button>}
          {weightDue && <button className="font-semibold underline" onClick={() => setTab("weight")}>⚖️ Aggiornamento peso richiesto (ogni 4 giorni)</button>}
          {moodDue && <button className="font-semibold underline" onClick={() => setTab("mood")}>🙂 Check umore richiesto (ogni 5 giorni)</button>}
        </div>
      )}

      <nav className="flex gap-1 px-2 sm:px-6 border-b border-border bg-card overflow-x-auto no-print">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          const badge = (t.id === "weight" && weightDue) || (t.id === "mood" && moodDue);
          return (
            <button key={t.id} data-testid={`tab-${t.id}`} onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-primary"}`}>
              <Icon className="w-4 h-4" />{t.label}
              {badge && <span className="w-2 h-2 rounded-full bg-destructive" />}
            </button>
          );
        })}
      </nav>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 animate-fade-up" key={tab}>
        {tab === "plan" && <MealPlanViewer plan={plan} profile={profile} generating={generating} onGenerate={generate} onSavePlan={savePlan}
          onFridgeUpdated={(fi) => setProfile((pr) => ({ ...pr, fridgeItems: fi }))} />}
        {tab === "summary" && <SummaryPanel />}
        {tab === "fridge" && <FridgePanel profile={profile} generating={generating} onSaved={(pr) => setProfile(pr)} onGenerate={() => { setTab("plan"); generate(); }} />}
        {tab === "shopping" && <ShoppingListPanel profile={profile} onProfile={setProfile} />}
        {tab === "recipes" && <RecipesPanel />}
        {tab === "profile" && profile && <ProfilePanel profile={profile} onSaved={(pr) => { setProfile(pr); loadStatuses(); }} />}
        {tab === "photo" && <PhotoPanel />}
        {tab === "water" && <WaterPanel />}
        {tab === "weight" && <CheckinsPanel type="weight" status={weightStatus} onDone={loadStatuses} profile={profile} onProfile={setProfile} />}
        {tab === "mood" && <CheckinsPanel type="mood" status={moodStatus} onDone={loadStatuses} />}
        {tab === "supplements" && <SupplementsPanel profile={profile} onProfile={setProfile} />}
        {tab === "calendar" && <CalendarCard profile={profile} onChanged={(pr) => setProfile(pr)} />}
      </main>
    </div>
  );
}
