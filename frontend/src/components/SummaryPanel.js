import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Scale, Utensils, Droplets } from "lucide-react";

export default function SummaryPanel() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api.get("/summary").then((r) => {
      if (r.data) setSummary(r.data);
    }).catch(() => {});
  }, []);

  const mealsPlanned = summary?.meals?.planned || 0;
  const mealsEaten = summary?.meals?.eaten || 0;
  const pct = mealsPlanned > 0 ? Math.round((mealsEaten / mealsPlanned) * 100) : 0;
  const currentWeight = summary?.weight?.current || "-";
  const startWeight = summary?.weight?.start || "-";
  const waterToday = summary?.water?.today || 0;
  const waterTarget = summary?.water?.target || 2000;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-3xl font-bold text-primary">Riepilogo Settimanale</h2>
        <p className="text-muted-foreground mt-1">Panoramica dei tuoi progressi e del rispetto della dieta.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pasti Consumati</CardTitle>
            <Utensils className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{mealsEaten} / {mealsPlanned}</div>
            <p className="text-xs text-muted-foreground mt-1">{pct}% completato questa settimana</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Peso Attuale</CardTitle>
            <Scale className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{currentWeight} kg</div>
            <p className="text-xs text-muted-foreground mt-1">Peso iniziale: {startWeight} kg</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Idratazione Oggi</CardTitle>
            <Droplets className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{waterToday} ml</div>
            <p className="text-xs text-muted-foreground mt-1">Obiettivo: {waterTarget} ml</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Stato Generale</CardTitle>
            <BarChart3 className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#1b6b3e]">Ottimale</div>
            <p className="text-xs text-muted-foreground mt-1">Continua così!</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}