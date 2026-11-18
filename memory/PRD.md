# NutriViva — App Dieta Intelligente

## Problem Statement (original, IT)
App dieta: profilo utente (età/sesso/peso/altezza obbligatori; centimetri, lavoro, allenamento, frequenza opzionali), obiettivi multipli compatibili, scelta dieta (15 tipi), ingredienti nel frigo, integratori + farmaci, modalità spesa settimanale/giornaliera, durata, pasti liberi. AI genera piano 7 giorni × 6 pasti bilanciato sul frigo. Alternative pasti, calendario durata + cambio dieta, refeed carbo keto ~21 giorni, check peso obbligatorio ogni 4 giorni, check umore ogni 5 giorni con tip anti-fame, timing integratori.

## Architecture
- **Backend**: FastAPI + MongoDB (motor). JWT auth (bcrypt, cookie + Bearer). LLM via emergentintegrations, model `gpt-6-luna` (Emergent LLM key).
- **Plan generation is ASYNC**: POST /api/plan/generate avvia un task in background e ritorna subito `{status:generating}`; il frontend fa polling su GET /api/plan finché `status=ready` (evita timeout proxy per chiamate AI ~50s).
- **Frontend**: React 19 + Tailwind v4 + shadcn. Pagine: AuthPage, OnboardingPage (4 step), Dashboard (tab: Piano, Peso, Umore, Integratori, Calendario). Fonts: Outfit + Plus Jakarta Sans. Tema verde/naturale.

## Endpoints
- auth: /api/auth/register|login|logout|me
- /api/profile (GET/PUT), /api/compatibility
- /api/plan/generate (async), /api/plan (status+plan), /api/plan/alternative
- /api/checkins/weight (GET/POST), /api/checkins/mood (GET/POST)

## User Persona
Persona fitness/salute italiana che vuole una dieta su misura basata sul cibo che ha già in casa.

## Implemented (2026-10-08)
- Auth JWT email/password + seed admin
- Onboarding 4 step con validazione e warning di compatibilità (es. Chetogenica+massa)
- Generazione piano AI 7×6 (async con polling), vista giornaliera/settimanale, alternative pasti AI
- Check-in peso (grafico Recharts, badge obbligo 4gg), umore (slider, tip anti-fame se fame alta)
- Pannello integratori con timing, farmaci; calendario durata + cambio dieta, reminder refeed keto
- Testato end-to-end (iteration_1): backend 100%, frontend 90% → fix async + compatibility applicati e verificati

## Implemented iteration 2 (2026-10-08)
- Tab Frigo rapido (salva + rigenera piano), Lista Spesa AI per reparto (esclude frigo), Export PDF (window.print), Ricette Light (AI + fallback statiche), Promemoria integratori (orari, notifiche browser/toast)

## Implemented iteration 3 (2026-10-08)
- Campo Patologie/malattie/intolleranze (profile.conditions) usato nel prompt AI
- Scambio giorni nel piano (PUT /api/plan persiste), Promemoria 6 pasti, Tracker acqua (/api/water), Foto Pasto con valutazione AI vision (/api/meal/photo)
- Test iteration_3: backend 100%, frontend 100%

## Implemented iteration 4 (2026-10-08)
- Tab Profilo (modifica dati, patologie, farmaci, obiettivi, integratori, allenamenti multipli)
- Web Push (VAPID + /sw.js + manifest PWA) + cron piattaforma ogni 15 min (/api/cron/reminders) per pasti e integratori ad app chiusa
- Avvisi patologie sul frigo (parole chiave fisse + AI)
- Diario foto (Emergent Object Storage) con totale calorie giornaliero
- Frigo con quantità/unità; AI divide in porzioni
- Allenamenti estesi (Powerlifting, Streetlifting, Hyrox, Ibrido, sport vari)
- Test iteration_4: backend 11/11, frontend 100%

## Implemented iteration 5 (2026-10-08)
- Ricerca prodotti di marca nel frigo via Open Food Facts (GET /api/foods/search, filtro Italia): kcal e macro reali per 100g salvati nell'item; l'AI li usa per calcolare calorie precise (deficit / clean bulk). Frutta/verdura/carne/pesce fresco = valori standard; pesce surgelato con marca.

## Implemented iteration 6 (2026-10-08)
- Integratori con tipologia (whey concentrate/isolate/idrolizzate/caseine/beef/uovo/vegetali; creatina monoidrato/Creapure/HCL/idrolizzata…) + marca, consigli e timing nel prompt
- Giorni di allenamento vs riposo (dayType, più carbo nei giorni di allenamento)
- brandedItems per pasto con grammi/kcal/% del giorno
- Scadenze nel frigo (avviso ≤3 giorni, AI usa prima i prodotti in scadenza)
- Scanner codice a barre (html5-qrcode) solo se il prodotto non viene trovato; prodotti sconosciuti memorizzati in db.custom_foods
- Test iteration_5: backend 9/9, frontend 100%

## Implemented iteration 7 (2026-10-08)
- Ricetta veloce dal frigo (/api/fridge/recipe), pasto "mangiato" con scarico automatico del frigo via AI (/api/meals/eaten)
- Misure in cm facoltative con grafico (/api/checkins/measurements)
- Riepilogo settimanale (/api/summary/weekly) + banner domenica + cron push domenica 19:00 (/api/cron/weekly)
- PUT /api/profile ora fa merge parziale (non cancella campi non inviati)
- Test iteration_6: backend 9/9, frontend 100%

## Implemented iteration 8 (2026-10-09)
- Peso obiettivo con progresso e data prevista (regressione se ≥7 gg di storico, altrimenti stima standard)
- Foto progressi (object storage) con confronto affiancato
- Pulsante "Esaurito" nel frigo → lista spesa "Da ricomprare"; lista spesa modificabile + "Metti nel frigo"
- Scorte integratori (confezione/dose/frequenza/apertura) con avviso 14 gg (banner + push ore 9)
- Preferenze per pasto + cibi preferiti/da evitare nel prompt
- Lettura AI della tabella nutrizionale (/api/foods/label) nello scanner
- Pasto con ingredienti scelti dall'utente bilanciato dall'AI (/api/plan/custom-meal)
- Calendario: attiva da oggi / data futura / interrompi / data fine, giorni verdi, pasti liberi gialli, ricarica keto
- Test iteration_7: backend 10/10, frontend 100%

## Implemented iteration 9 (2026-10-09)
- Spesa integratori (manuale + automatica quando in esaurimento), pasto fuori casa con ribilanciamento, pasti preferiti (riproposti nei piani), push la sera prima dell'inizio dieta
- MEAL_FOODS: alimenti consentiti per pasto applicati a piano, alternative, pasto personalizzato, fuori casa, giorno di riposo
- Pasto "solo questi ingredienti" (onlyThese) con controllo server + gaps/nextMealTip/optional
- Integratori: momenti di assunzione o "decide l'app", carico creatina, schema automatico
- "Oggi niente allenamento" (/api/plan/rest-day, una sola volta per giorno)
- Dieta del nutrizionista (priorità assoluta nei prompt), eliminazione account (DELETE /api/auth/me)
- Scarico frigo: correzione deterministica per articoli "N pz"
- Test iteration_8 e iteration_9: 100%

## Backlog (P1/P2)
- Promemoria arrotondati al quarto d'ora (cron 15 min); su iPhone serve aggiungere l'app alla Home
- Promemoria funzionano solo con app aperta (no push server-side)
- Modifica patologie/dati profilo anche dalla dashboard (ora solo via onboarding)
- P1: Export PDF del piano; notifiche/promemoria orari integratori
- P2: Lista della spesa auto-generata dal piano; storico piani/fasi; multi-lingua

## Next tasks
- Export PDF, lista spesa, notifiche

## 2026-06 — Scansione etichetta nutrizionale (Vision AI)
- Nuovo componente LabelScanner (Frigo + Spesa): scatta/carica foto → POST /api/foods/label (gpt-6-luna vision) → anteprima modificabile (nome, marca, kcal/P/C/G per 100g), valori illeggibili stimati e marcati "stimato".
- Quantità in g/kg/pz (g per unità auto-letti) → totali proporzionati → aggiunta al frigo nel formato "300 g Nome (Marca) [kcal/100g, P C G]"; i chip del frigo mostrano i totali.
- Dalla Spesa: rimuove l'articolo corrispondente come acquistato. Prodotto NON salvato in custom_foods.
- Testato: iteration_10 (100%).
## Backlog
- P1: rate limiting login. P2: refactor server.py in router.
