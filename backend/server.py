from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import json
import asyncio
import base64
import hmac
import uuid
import logging
from zoneinfo import ZoneInfo
import requests
from pywebpush import webpush, WebPushException
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated, Any

import bcrypt
import jwt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, Query, BackgroundTasks
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, BeforeValidator, EmailStr, ConfigDict

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

# ---------- DB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nutriviva")

app = FastAPI()
api = APIRouter(prefix="/api")

# ---------- Object storage ----------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "nutriviva"
_storage_key = None

def init_storage(force: bool = False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    r.raise_for_status()
    _storage_key = r.json()["storage_key"]
    return _storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage(), "Content-Type": content_type},
                     data=data, timeout=120)
    r.raise_for_status()
    return r.json()

def get_object(path: str):
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage()}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

# ---------- Helpers ----------
PyObjectId = Annotated[str, BeforeValidator(str)]

def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def create_token(uid: str, email: str) -> str:
    payload = {"sub": uid, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def now_iso():
    return datetime.now(timezone.utc).isoformat()

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.query_params.get("auth")
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(401, "User not found")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

# ---------- Models ----------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class ProfileIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    age: Optional[int] = None
    sex: Optional[str] = None
    weight: Optional[float] = None
    height: Optional[float] = None
    measurements: Optional[dict] = None
    jobType: Optional[str] = None
    trainingType: Optional[str] = None
    trainingFrequency: Optional[str] = None
    goals: List[str] = []
    dietType: Optional[str] = None
    fridgeItems: List[str] = []
    supplements: List[str] = []
    supplementDetails: Optional[dict] = None
    trainingDays: List[str] = []
    medications: Optional[str] = None
    targetWeight: Optional[float] = None
    dietActive: Optional[bool] = None
    hasNutritionist: Optional[bool] = None
    nutritionistDiet: Optional[str] = None
    dietEndDate: Optional[str] = None
    mealPreferences: Optional[dict] = None
    foodLikes: Optional[str] = None
    foodDislikes: Optional[str] = None
    conditions: Optional[str] = None
    planMode: Optional[str] = "weekly"
    dietDurationWeeks: Optional[int] = 8
    dietStartDate: Optional[str] = None
    freeMeals: List[dict] = []

class WeightIn(BaseModel):
    weight: float
    note: Optional[str] = None

class MoodIn(BaseModel):
    energy: int
    digestion: int
    serenity: int
    hunger: int
    note: Optional[str] = None

class AlternativeIn(BaseModel):
    day: str
    mealKey: str
    currentMeal: Optional[dict] = None

class WaterIn(BaseModel):
    glasses: int
    goal: Optional[int] = 8

class PhotoIn(BaseModel):
    image_base64: str

# ---------- Compatibility rules ----------
INCOMPATIBLE = {
    "Chetogenica": {
        "goals": ["massa"],
        "diets_note": "La chetogenica è a bassissimi carboidrati: non ideale per massimizzare l'ipertrofia.",
    },
}
# goal<->goal conflicts
GOAL_CONFLICTS = [
    ({"massa", "perdere_peso"}, "Mettere massa e perdere peso richiedono bilanci calorici opposti."),
    ({"massa", "asciugarsi"}, "Mettere massa e asciugarsi sono fasi opposte: scegline una principale."),
]
KETO_INCOMPAT_DIETS_GOALS = {
    "Chetogenica": ["massa"],
    "Dukan": [],
}

def check_compatibility(goals: List[str], diet: Optional[str]):
    warnings = []
    goals = set(goals or [])
    d = (diet or "").strip().lower()
    for conflict, msg in GOAL_CONFLICTS:
        if conflict.issubset(goals):
            warnings.append(msg)
    if d == "chetogenica" and "massa" in goals:
        warnings.append("Chetogenica + aumento massa non sono compatibili: la keto è a bassissimi carboidrati. Valuta Low Carb o Clean Bulking.")
    if d in ["bulking tradizionale", "ipercalorica", "clean bulking"] and ("perdere_peso" in goals or "asciugarsi" in goals):
        warnings.append(f"La dieta {diet} è ipercalorica: non compatibile con l'obiettivo di perdere peso o asciugarsi.")
    if d == "dukan" and ("longevita" in goals or "prevenzione" in goals):
        warnings.append("La Dukan è molto iperproteica: valuta un approccio più bilanciato per longevità e prevenzione.")
    return warnings

# ---------- Auth routes ----------
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email già registrata")
    doc = {"email": email, "name": body.name, "password_hash": hash_password(body.password),
           "role": "user", "created_at": now_iso()}
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    token = create_token(uid, email)
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    return {"id": uid, "email": email, "name": body.name, "token": token}

@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Email o password non validi")
    uid = str(user["_id"])
    token = create_token(uid, email)
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    return {"id": uid, "email": email, "name": user.get("name"), "token": token}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.delete("/auth/me")
async def delete_account(response: Response, user: dict = Depends(get_current_user)):
    uid = user["id"]
    for coll in ["profiles", "plans", "weights", "moods", "water", "diary", "shopping", "recipes", "reminders", "push_subs",
                 "eaten", "measures", "progress_photos", "favorites"]:
        await db[coll].delete_many({"user_id": uid})
    await db.users.delete_one({"_id": ObjectId(uid)})
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

class RestDayIn(BaseModel):
    day: str

@api.post("/plan/rest-day")
async def rest_day(body: RestDayIn, user: dict = Depends(get_current_user)):
    plandoc = await db.plans.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    plan = plandoc.get("plan") or {}
    day = next((d for d in plan.get("days", []) if d.get("day") == body.day), None)
    if not day:
        raise HTTPException(400, "Giorno non trovato nel piano")
    if day.get("dayType") == "riposo" or day.get("skippedTraining"):
        raise HTTPException(400, "Questo giorno è già un giorno di riposo")
    prof = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    prompt = f"""Oggi ({body.day}) l'utente NON si allena (era previsto allenamento). Trasforma la giornata in GIORNO DI RIPOSO:
riduci i carboidrati (circa -25/35%) e le calorie totali (circa -10/15%), mantieni le proteine, aumenta verdure e grassi buoni se serve. Togli gli integratori post-allenamento (la creatina resta a colazione). Non toccare i pasti liberi o già mangiati fuori casa.
Dieta: {prof.get('dietType')}; patologie: {prof.get('conditions') or 'nessuna'}; frigo: {prof.get('fridgeItems', [])}.
Usa SOLO gli alimenti consentiti per ciascun pasto:
{meal_foods_txt()}{nutritionist_txt(prof)}
Giornata attuale: {json.dumps(day.get('meals'), ensure_ascii=False)}
Rispondi SOLO JSON: {{"meals":[{{"key":"..","title":"..","items":[".."],"recipe":"..","calories":0,"protein":0,"carbs":0,"fats":0,"libero":false,"supplementNote":"","brandedItems":[]}}],"note":"breve spiegazione"}}"""
    try:
        data = extract_json(await call_llm(prompt, "Sei un nutrizionista sportivo. Rispondi solo JSON valido."))
    except Exception as e:
        raise HTTPException(502, f"Errore: {str(e)[:150]}")
    new = {m.get("key"): m for m in data.get("meals", [])}
    day["meals"] = [m if (m.get("libero") or m.get("eatOut") or m.get("key") not in new) else {**new[m["key"]], "key": m["key"]} for m in day.get("meals", [])]
    day["dayType"] = "riposo"
    day["skippedTraining"] = True
    day["totalCalories"] = sum(int(m.get("calories") or 0) for m in day["meals"])
    await db.plans.update_one({"user_id": user["id"]}, {"$set": {"plan": plan}})
    return {"day": day, "note": data.get("note")}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ---------- Profile ----------
@api.get("/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    prof = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    return prof or {}

@api.put("/profile")
async def save_profile(body: ProfileIn, user: dict = Depends(get_current_user)):
    data = body.model_dump(exclude_unset=True)
    data["user_id"] = user["id"]
    data["updated_at"] = now_iso()
    existing = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    if not data.get("dietStartDate") and not existing.get("dietStartDate"):
        data["dietStartDate"] = now_iso()
    await db.profiles.update_one({"user_id": user["id"]}, {"$set": data}, upsert=True)
    full = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    warnings = check_compatibility(full.get("goals", []), full.get("dietType"))
    return {"ok": True, "warnings": warnings, "profile": full}

@api.post("/compatibility")
async def compatibility(body: ProfileIn, user: dict = Depends(get_current_user)):
    return {"warnings": check_compatibility(body.goals, body.dietType)}

# ---------- LLM plan generation ----------
GOAL_LABELS = {
    "massa": "Mettere massa muscolare", "perdere_peso": "Perdere peso", "asciugarsi": "Asciugarsi/definizione",
    "mantenere": "Mantenere peso", "perdere_cm": "Perdere centimetri", "patologie": "Gestire patologie",
    "intolleranze": "Gestione intolleranze", "digestione": "Migliorare digestione", "longevita": "Longevità",
    "prevenzione": "Prevenzione", "energia": "Aumentare energia", "recupero": "Migliorare recupero",
    "etica": "Scelta etica", "sostenibilita": "Sostenibilità", "religione": "Norme religiose",
    "sonno_umore": "Ottimizzare sonno e umore",
}

def build_prompt(prof: dict) -> str:
    goals = ", ".join(GOAL_LABELS.get(g, g) for g in prof.get("goals", [])) or "Benessere generale"
    conditions = prof.get("conditions") or "nessuna segnalata"
    meds = prof.get("medications") or "nessuno"
    fridge = ", ".join(prof.get("fridgeItems", [])) or "ingredienti comuni di base"
    tdays = prof.get("trainingDays") or []
    tdays_txt = ", ".join(tdays) if tdays else "non specificati (distribuisci in base alla frequenza)"
    today = datetime.now(ZoneInfo("Europe/Rome")).strftime("%Y-%m-%d")
    mp = {k: v for k, v in (prof.get("mealPreferences") or {}).items() if v and str(v).strip()}
    mp_txt = "; ".join(f"{k}: {v}" for k, v in mp.items()) or "nessuna"
    favs = ", ".join(prof.get("_favorites") or []) or "nessuno"
    free = prof.get("freeMeals", [])
    free_txt = "; ".join(f"{f.get('day')} - {f.get('meal')}" for f in free) or "nessuno"
    mode = prof.get("planMode", "weekly")
    return f"""Sei un nutrizionista esperto italiano. Crea un piano alimentare bilanciato di 7 GIORNI.

PROFILO UTENTE:
- Età: {prof.get('age')} | Sesso: {prof.get('sex')} | Peso: {prof.get('weight')} kg | Altezza: {prof.get('height')} cm
- Lavoro: {prof.get('jobType')} | Allenamenti/sport praticati: {prof.get('trainingType')} ({prof.get('trainingFrequency')}) — adatta calorie, carboidrati e proteine al tipo di sport (forza: powerlifting/streetlifting; endurance: corsa/nuoto/ciclismo; ibrido: hyrox/crossfit)
- Obiettivi: {goals}
- PATOLOGIE / MALATTIE / INTOLLERANZE dichiarate: {conditions}
- Farmaci / terapie: {meds}
- Tipo di dieta richiesta: {prof.get('dietType')}
- Modalità spesa: {'settimanale' if mode=='weekly' else 'giornaliera'}
- INGREDIENTI DISPONIBILI (frigo/dispensa, usa principalmente questi): {fridge}
- Integratori assunti (tipologia, marca, momenti): {supp_txt(prof)}
- GIORNI DI ALLENAMENTO: {tdays_txt} (gli altri sono giorni di RIPOSO)
- Data di oggi: {today}
- PREFERENZE DELL'UTENTE PER PASTO: {mp_txt}
- PASTI PREFERITI salvati (riproponine alcuni nella settimana, adattando le quantità): {favs}
- Cibi preferiti / fonti preferite: {prof.get('foodLikes') or 'nessuna indicazione'}
- Cibi da EVITARE perché non piacciono: {prof.get('foodDislikes') or 'nessuno'}
- Pasti liberi/sgarro concordati (in quei pasti l'utente mangia libero): {free_txt}

REGOLE:
1. Rispetta rigorosamente il tipo di dieta ({prof.get('dietType')}) e gli obiettivi.
2. FONDAMENTALE: adatta il piano alle PATOLOGIE/INTOLLERANZE dichiarate, evitando alimenti controindicati e privilegiando quelli benefici (es. per diabete controlla i carboidrati, per reflusso evita cibi acidi/piccanti, per celiachia solo senza glutine, per intolleranza al lattosio niente latticini freschi).
2b. Usa principalmente gli ingredienti disponibili; se un prodotto confezionato riporta marca e valori nutrizionali reali (es. "[165 kcal/100g, P 18 C 1.5 G 8.5]") usa QUELLI per calcolare calorie e macro con precisione e citane la marca nel pasto. Frutta, verdura, carne e pesce fresco senza marca: usa valori standard. Rispetta le quantità in porzioni realistiche (es. "4 pz mele" = massimo 4 mele; "400 g macinato di bovino" = 2 pasti da 200 g; "1 kg riso" = porzioni da 70-100 g). Nei pasti indica sempre la grammatura usata; aggiungi solo pochi ingredienti base se necessario.
3. Ogni giorno ha 6 pasti: colazione, spuntino_mattina, pranzo, spuntino_pomeriggio, cena, pre_nanna.
4. Per i pasti liberi indicati, imposta "libero": true e un messaggio di promemoria.
5. {SUPP_SCHEDULE}
5a. ALIMENTI CONSENTITI PER PASTO (categorizzazione rigida, MAI alimenti fuori lista per quel pasto, es. NO pollo a colazione):
{meal_foods_txt()}{nutritionist_txt(prof)}
5b. GIORNI DI ALLENAMENTO: più carboidrati (soprattutto pre e post allenamento) e calorie leggermente superiori; GIORNI DI RIPOSO: carboidrati ridotti, più grassi buoni e verdure, proteine invariate. Imposta "dayType":"allenamento" o "riposo".
5c. SCADENZE: se un ingrediente riporta "(scade il AAAA-MM-GG)" usalo PRIMA, nei giorni precedenti la scadenza, e mai dopo.
5d. PREFERENZE: rispetta le preferenze per pasto (se l'utente indica cosa gli piace in un pasto, proponilo così com'è o con piccole variazioni nella maggior parte dei giorni, adattando solo le quantità ai suoi obiettivi) e privilegia le fonti preferite (es. patate e gnocchi come carboidrati). Non usare mai i cibi da evitare. Se una preferenza contrasta con dieta o patologie, usa l'alternativa compatibile più simile (es. yogurt greco senza lattosio) e spiegalo nella nota del piano.
6. Includi almeno 1 ricetta light gustosa nella settimana (es. tiramisù con yogurt greco).
7. Stima calorie e macro (proteine, carboidrati, grassi in grammi) per ogni pasto.
8. OBBLIGATORIO: in ogni pasto che usa un prodotto DI MARCA dal frigo (quelli con valori reali tra parentesi quadre) compila "brandedItems" con nome (marca), grammi e kcal = grammi × kcal/100g ÷ 100; usa i prodotti di marca disponibili almeno 2-3 volte nella settimana se compatibili con dieta e patologie. Lista vuota se nessuno.

Rispondi SOLO con JSON valido in questo schema esatto:
{{
 "dailyCalories": <int totale medio giornaliero>,
 "notes": "<breve nota sul piano in italiano>",
 "days": [
   {{"day":"Lunedì","dayType":"allenamento","totalCalories":<int>,
     "meals":[
        {{"key":"colazione","title":"<nome pasto>","items":["<ingrediente/quantità>"],"recipe":"<preparazione breve>","calories":<int>,"protein":<int>,"carbs":<int>,"fats":<int>,"libero":false,"supplementNote":"<se presente>","brandedItems":[{{"name":"<prodotto (marca)>","grams":<int>,"kcal":<int>}}]}}
     ]}}
 ]
}}
Includi tutti e 7 i giorni (Lunedì..Domenica) e tutti e 6 i pasti per giorno."""

async def call_llm(prompt: str, system: str) -> str:
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"nv-{datetime.now().timestamp()}",
                   system_message=system).with_model("openai", "gpt-6-luna")
    resp = await chat.send_message(UserMessage(text=prompt))
    return resp

def extract_json(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip().rstrip("`").strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end >= 0:
        text = text[start:end+1]
    return json.loads(text)

async def _generate_plan_task(user_id: str):
    prof = await db.profiles.find_one({"user_id": user_id}, {"_id": 0})
    try:
        favs = await db.favorites.find({"user_id": user_id}, {"_id": 0, "title": 1}).to_list(15)
        prof["_favorites"] = [f["title"] for f in favs]
        raw = await call_llm(build_prompt(prof), "Sei un nutrizionista. Rispondi solo con JSON valido, senza testo extra.")
        plan = extract_json(raw)
        if not await db.users.find_one({"_id": ObjectId(user_id)}):
            return
        await db.plans.update_one({"user_id": user_id}, {"$set": {
            "plan": plan, "dietType": prof.get("dietType"), "status": "ready",
            "error": None, "created_at": now_iso()}}, upsert=True)
    except Exception as e:
        logger.exception("LLM plan error")
        await db.plans.update_one({"user_id": user_id}, {"$set": {"status": "error", "error": str(e)[:200]}}, upsert=True)

@api.post("/plan/generate")
async def generate_plan(user: dict = Depends(get_current_user)):
    prof = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    if not prof:
        raise HTTPException(400, "Completa prima il profilo")
    await db.plans.update_one({"user_id": user["id"]}, {"$set": {"status": "generating", "error": None}}, upsert=True)
    asyncio.create_task(_generate_plan_task(user["id"]))
    return {"status": "generating"}

@api.get("/plan")
async def get_plan(user: dict = Depends(get_current_user)):
    doc = await db.plans.find_one({"user_id": user["id"]}, {"_id": 0})
    return doc or {}

@api.put("/plan")
async def save_plan(body: dict, user: dict = Depends(get_current_user)):
    plan = body.get("plan")
    if not plan:
        raise HTTPException(400, "Piano mancante")
    await db.plans.update_one({"user_id": user["id"]}, {"$set": {"plan": plan, "status": "ready"}}, upsert=True)
    return {"ok": True}

MEAL_FOODS = {
    "colazione": "proteine whey, albume, yogurt greco, frutta secca, cioccolato fondente, latte, fiocchi d'avena, frutta fresca, marmellata light, fette biscottate integrali, pane, cornflakes integrali, crema spalmabile light, sciroppo d'acero, sciroppi light",
    "spuntino_mattina": "yogurt greco, frutta secca, cioccolato fondente, biscotti, affettato, pane, frutta fresca, yogurt proteici (quark/skyr), uova, tonno al naturale, tonno sott'olio",
    "pranzo": "pasta, pasta integrale, riso basmati, riso venere, riso integrale, farro, orzo perlato, quinoa, pane integrale/bianco/segale, patate, pollo (petto/coscia/fuso senza pelle), coniglio, tacchino petto, pesce (spada, sgombro, tonno fresco, merluzzo/nasello, orata, salmone, sogliola, spigola), legumi secchi o in scatola, manzo/vitello, bovino adulto, arista di maiale, salmone affumicato o in salamoia, tonno sott'olio sgocciolato o al naturale, sgombro sott'olio, Philadelphia Active, mozzarella, uova, olio EVO, verdure di tutti i tipi",
    "spuntino_pomeriggio": "pane, crackers integrali, gallette di riso/mais/farro, bresaola, fesa di tacchino, prosciutto cotto magro, uova sode, frutta fresca, tonno al naturale, tonno sott'olio, barretta proteica",
    "cena": "pane integrale/bianco/segale, patate, pasta, pasta integrale, riso basmati/venere/integrale, farro, orzo perlato, quinoa, pesce (spada, merluzzo/nasello, orata, sogliola, spigola), legumi, coniglio, pollo (petto/coscia/fuso), tacchino petto, manzo/vitello, bovino magro, salmone affumicato o in salamoia, tonno sott'olio sgocciolato o al naturale, sgombro sott'olio, prosciutto cotto magro, bresaola, uova, fesa di tacchino (150 g), olio EVO (10 g), verdure (250 g)",
    "pre_nanna": "yogurt greco, yogurt proteici (quark/skyr), caseine, frutta secca, latte, albume, cioccolato fondente, frutta fresca",
}

def meal_foods_txt() -> str:
    return "\n".join(f"  - {k}: {v}" for k, v in MEAL_FOODS.items())

SUPP_SCHEDULE = """SCHEMA INTEGRATORI (se l'utente ha scelto "decide l'app" o non ha indicato i momenti):
  - Creatina: 1 scoop (3-5 g) a COLAZIONE ogni giorno + 1 scoop POST-ALLENAMENTO nei giorni di allenamento. Se NON ha fatto il carico: fase di carico 3 scoop/die (totale ~18 g) per le prime 2 settimane suddivisi tra colazione, pranzo e post-allenamento/cena, poi mantenimento.
  - Proteine whey/isolate/idrolizzate: POST-ALLENAMENTO (nei giorni di riposo a colazione o spuntino se servono proteine). Caseine: pre-nanna.
  - Mass gainer: POST-ALLENAMENTO insieme a whey e creatina.
  - Omega 3: 1 capsula a colazione. Vitamina D3: colazione. Multivitaminico: colazione. Magnesio: pre-nanna.
  - BCAA/EAA: intra-allenamento. Pre-workout: 20-30 minuti prima dell'allenamento.
Se l'utente ha indicato momenti specifici, rispetta QUELLI. Indica ogni integratore in "supplementNote" del pasto corretto con dose."""

def supp_txt(prof: dict) -> str:
    det = prof.get("supplementDetails") or {}
    out = []
    for s in prof.get("supplements", []):
        d = det.get(s, {})
        bits = [d.get("variant"), d.get("brand")]
        moments = d.get("moments") or []
        when = "momenti: " + ", ".join(moments) if moments and "auto" not in moments else "momenti: decide l'app"
        extra = ""
        if s == "creatina":
            extra = "; carico già fatto" if d.get("loadingDone") else (f"; carico NON ancora fatto (iniziato il {d.get('loadingStart')})" if d.get("loadingStart") else "; carico NON fatto")
        out.append(f"{s} ({', '.join(b for b in bits if b) or 'tipo non indicato'}; {when}{extra})")
    return "; ".join(out) or "nessuno"

def nutritionist_txt(prof: dict) -> str:
    nd = (prof.get("nutritionistDiet") or "").strip()
    if not prof.get("hasNutritionist") or not nd:
        return ""
    return f"""
DIETA DEL NUTRIZIONISTA (PRIORITÀ ASSOLUTA): l'utente è seguito da un nutrizionista. Usa SOLO gli alimenti e le GRAMMATURE indicati qui sotto per ciascun pasto; varia i pasti nella settimana solo combinando le alternative previste dal medico, senza cambiare le quantità:
{nd[:6000]}
"""

class CustomMealIn(BaseModel):
    day: str
    mealKey: str
    ingredients: str
    currentMeal: Optional[dict] = None
    onlyThese: bool = False

@api.post("/plan/custom-meal")
async def custom_meal(body: CustomMealIn, user: dict = Depends(get_current_user)):
    prof = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    cur = body.currentMeal or {}
    allowed = MEAL_FOODS.get(body.mealKey, "")
    order = list(MEAL_FOODS.keys())
    nxt = order[order.index(body.mealKey) + 1] if body.mealKey in order and order.index(body.mealKey) < len(order) - 1 else None
    if body.onlyThese:
        rule = f"""Usa ESCLUSIVAMENTE gli ingredienti indicati dall'utente (NON aggiungerne altri), regolando solo le grammature per avvicinarti al target. Se il target di calorie/proteine/carboidrati/grassi non è raggiungibile, NON aggiungere nulla: compila "gaps" (es. "mancano ~15 g di proteine") e "nextMealTip" con un consiglio CONCRETO per il PASTO SUCCESSIVO ({nxt or 'il primo pasto di domani'}), usando alimenti adatti a quel pasto ({MEAL_FOODS.get(nxt, '') if nxt else ''}), es. "a cena aumenta il petto di pollo di 60 g"; in "optional" suggerisci 1-3 alimenti FACOLTATIVI per questo pasto presi da: {allowed}."""
    else:
        rule = f"""Usa gli ingredienti richiesti con grammature precise. Se serve per bilanciare, aggiungi 1-2 ingredienti scelti SOLO tra quelli adatti a questo pasto: {allowed} (mai alimenti fuori lista, es. niente pollo a colazione), preferibilmente presenti nel frigo; indicali in "added"."""
    prompt = f"""L'utente per il pasto '{body.mealKey}' di {body.day} VUOLE mangiare: {body.ingredients}.
Dieta: {prof.get('dietType')}. Obiettivi: {prof.get('goals')}. Patologie/intolleranze: {prof.get('conditions') or 'nessuna'}. Cibi da evitare: {prof.get('foodDislikes') or 'nessuno'}.
Frigo disponibile: {prof.get('fridgeItems', [])}.{nutritionist_txt(prof)}
Target del pasto (dal piano): ~{cur.get('calories', '?')} kcal, P {cur.get('protein', '?')} g, C {cur.get('carbs', '?')} g, G {cur.get('fats', '?')} g.
{rule}
Se un ingrediente richiesto è incompatibile con dieta o patologie sostituiscilo con l'alternativa più simile e spiegalo in "note". Per prodotti di marca con valori tra [ ] usa quei valori e compila brandedItems.
Rispondi SOLO JSON: {{"key":"{body.mealKey}","title":"..","items":["grammi ingrediente"],"recipe":"..","calories":0,"protein":0,"carbs":0,"fats":0,"libero":false,"added":[],"optional":[],"gaps":[],"nextMealTip":"","note":"","brandedItems":[]}}"""
    try:
        meal = extract_json(await call_llm(prompt, "Sei un nutrizionista. Rispondi solo JSON valido."))
        if body.onlyThese:
            import re as _re
            keys = [w[:5] for w in _re.findall(r"[a-zàèéìòù]{4,}", body.ingredients.lower()) if w not in {"anche", "della", "delle", "degli", "senza", "solo", "fresco", "fresca"}]
            extra = lambda m: [i for i in m.get("items", []) if not any(k in i.lower() for k in keys)]
            bad = extra(meal)
            if bad:
                retry = prompt + f"\n\nERRORE: hai aggiunto ingredienti NON richiesti ({bad}). È VIETATO. Usa SOLO: {body.ingredients}. Metti eventuali altri alimenti solo in \"optional\" e calcola calorie e macro solo sugli ingredienti dell'utente."
                meal = extract_json(await call_llm(retry, "Sei un nutrizionista. Rispondi solo JSON valido."))
                bad = extra(meal)
                if bad:
                    meal["items"] = [i for i in meal.get("items", []) if i not in bad]
                    meal["optional"] = list(dict.fromkeys((meal.get("optional") or []) + bad))
                    meal["note"] = ((meal.get("note") or "") + " Valori approssimativi: rimossi gli ingredienti non disponibili.").strip()
            meal["added"] = []
    except Exception as e:
        raise HTTPException(502, f"Errore pasto: {str(e)[:150]}")
    meal["key"] = body.mealKey
    meal["custom"] = True
    return {"meal": meal}

def to_jpeg_b64(b64: str) -> str:
    from PIL import Image
    import io
    img = Image.open(io.BytesIO(base64.b64decode(b64)))
    img = img.convert("RGB")
    img.thumbnail((1600, 1600))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=85)
    return base64.b64encode(out.getvalue()).decode()

@api.post("/foods/label")
async def read_label(body: PhotoIn, user: dict = Depends(get_current_user)):
    if len(body.image_base64) > 15_000_000:
        raise HTTPException(413, "Immagine troppo grande (max ~10 MB)")
    try:
        b64 = to_jpeg_b64(body.image_base64.split(",")[-1])
    except Exception:
        raise HTTPException(400, "Immagine non valida")
    prompt = """Leggi la TABELLA NUTRIZIONALE (e se visibile nome e marca) di questa confezione.
Riporta i valori PER 100 g (o 100 ml); se sono indicati solo per porzione, convertili a 100 g.
Se un valore non è leggibile o manca, STIMALO in modo realistico per quel tipo di prodotto e inserisci il nome del campo in "estimated" (campi possibili: name, kcal, protein, carbs, fats). Non lasciare mai valori nulli.
Se è visibile il peso netto di una singola unità/confezione indicalo in "unitGrams" (altrimenti 0).
Rispondi SOLO JSON: {"name":"","brand":"","kcal":0,"protein":0,"carbs":0,"fats":0,"unitGrams":0,"estimated":[],"readable":true}"""
    try:
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"nv-label-{datetime.now().timestamp()}",
                       system_message="Sei un lettore preciso di etichette alimentari. Rispondi solo JSON valido.").with_model("openai", "gpt-6-luna")
        data = extract_json(await chat.send_message(UserMessage(text=prompt, file_contents=[ImageContent(image_base64=b64)])))
    except Exception as e:
        raise HTTPException(502, f"Errore lettura etichetta: {str(e)[:150]}")
    def num(v):
        try:
            return max(0.0, round(float(str(v).replace(",", ".")), 1))
        except (TypeError, ValueError):
            return 0.0
    return {"name": str(data.get("name") or ""), "brand": str(data.get("brand") or ""),
            **{k: num(data.get(k)) for k in ["kcal", "protein", "carbs", "fats", "unitGrams"]},
            "estimated": [str(x) for x in (data.get("estimated") or []) if isinstance(x, str)],
            "readable": data.get("readable") is not False}

@api.post("/plan/alternative")
async def meal_alternative(body: AlternativeIn, user: dict = Depends(get_current_user)):
    prof = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    if not prof:
        raise HTTPException(400, "Profilo mancante")
    fridge = ", ".join(prof.get("fridgeItems", [])) or "ingredienti comuni"
    cur = body.currentMeal or {}
    prompt = f"""Dieta: {prof.get('dietType')}. Ingredienti disponibili: {fridge}.
Proponi UN'alternativa gustosa e caloricamente equivalente al pasto '{body.mealKey}' (attuale: {cur.get('title','')}, ~{cur.get('calories','?')} kcal), usando SOLO alimenti adatti a questo pasto: {MEAL_FOODS.get(body.mealKey, '')}.{nutritionist_txt(prof)}
Rispondi SOLO con JSON: {{"title":"..","items":[".."],"recipe":"..","calories":<int>,"protein":<int>,"carbs":<int>,"fats":<int>}}"""
    try:
        raw = await call_llm(prompt, "Sei un nutrizionista. Rispondi solo JSON valido.")
        alt = extract_json(raw)
    except Exception as e:
        raise HTTPException(502, f"Errore alternativa: {str(e)[:150]}")
    return {"alternative": alt}

# ---------- Check-ins ----------
def days_since(iso: Optional[str]) -> Optional[int]:
    if not iso:
        return None
    try:
        d = datetime.fromisoformat(iso)
        return (datetime.now(timezone.utc) - d).days
    except Exception:
        return None

@api.get("/checkins/weight")
async def weight_history(user: dict = Depends(get_current_user)):
    items = await db.weights.find({"user_id": user["id"]}, {"_id": 0}).sort("date", 1).to_list(500)
    last = items[-1]["date"] if items else None
    ds = days_since(last)
    return {"history": items, "lastDate": last, "daysSince": ds,
            "due": ds is None or ds >= 4, "nextInDays": None if ds is None else max(0, 4 - ds)}

@api.post("/checkins/weight")
async def add_weight(body: WeightIn, user: dict = Depends(get_current_user)):
    doc = {"user_id": user["id"], "weight": body.weight, "note": body.note, "date": now_iso()}
    await db.weights.insert_one(doc)
    await db.profiles.update_one({"user_id": user["id"]}, {"$set": {"weight": body.weight}})
    return {"ok": True}

@api.get("/checkins/mood")
async def mood_history(user: dict = Depends(get_current_user)):
    items = await db.moods.find({"user_id": user["id"]}, {"_id": 0}).sort("date", 1).to_list(500)
    last = items[-1]["date"] if items else None
    ds = days_since(last)
    tip = None
    if items and items[-1].get("hunger", 0) >= 4:
        tip = "Spesso hai fame: porta con te uno spuntino povero di carboidrati (es. un cetriolo, gambi di sedano, un uovo sodo o del tacchino) per sentirti sazio senza sgarrare."
    return {"history": items, "lastDate": last, "daysSince": ds,
            "due": ds is None or ds >= 5, "nextInDays": None if ds is None else max(0, 5 - ds), "tip": tip}

@api.post("/checkins/mood")
async def add_mood(body: MoodIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc.update({"user_id": user["id"], "date": now_iso()})
    await db.moods.insert_one(doc)
    tip = None
    if body.hunger >= 4:
        tip = "Hai segnalato molta fame. Tieni a portata snack poveri di carboidrati: cetriolo, sedano, uovo sodo, fettine di tacchino o una manciata di mandorle."
    return {"ok": True, "tip": tip}

# ---------- Shopping list, Recipes ----------
STATIC_RECIPES = [
    {"title": "Tiramisù Fit allo Yogurt Greco", "kcal": 230, "protein": 18, "carbs": 22, "fats": 7,
     "ingredients": ["200g yogurt greco 0%", "2 cucchiai di cacao amaro", "4 savoiardi integrali",
                     "1 tazzina di caffè amaro", "Dolcificante q.b."],
     "steps": ["Monta lo yogurt con il dolcificante.", "Inzuppa velocemente i savoiardi nel caffè.",
               "Alterna strati di savoiardi e crema di yogurt.", "Spolvera con cacao amaro e lascia in frigo 2 ore."]},
    {"title": "Pancake Proteici d'Avena", "kcal": 310, "protein": 28, "carbs": 34, "fats": 7,
     "ingredients": ["40g farina d'avena", "3 albumi", "1 misurino whey", "1/2 banana", "Cannella"],
     "steps": ["Frulla tutti gli ingredienti.", "Cuoci in padella antiaderente piccole porzioni.",
               "Servi con yogurt o frutti di bosco."]},
    {"title": "Mug Cake al Cioccolato", "kcal": 200, "protein": 20, "carbs": 16, "fats": 6,
     "ingredients": ["1 misurino whey al cioccolato", "1 uovo", "1 cucchiaio cacao", "1/2 cucchiaino lievito"],
     "steps": ["Mescola tutto in una tazza.", "Microonde 60-80 secondi.", "Lascia intiepidire e gusta."]},
]

@api.post("/shopping-list")
async def gen_shopping_list(user: dict = Depends(get_current_user)):
    plandoc = await db.plans.find_one({"user_id": user["id"]}, {"_id": 0})
    if not plandoc or not plandoc.get("plan"):
        raise HTTPException(400, "Genera prima un piano alimentare")
    items = []
    for d in plandoc["plan"].get("days", []):
        for m in d.get("meals", []):
            if m.get("libero"):
                continue
            items += m.get("items", [])
    prof = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    fridge = ", ".join(prof.get("fridgeItems", []))
    prompt = f"""Ingredienti usati nel piano settimanale: {items[:120]}.
L'utente ha GIÀ nel frigo/dispensa: {fridge or 'niente di specifico'}.
Crea la LISTA DELLA SPESA settimanale includendo SOLO ciò che manca (escludi ciò che ha già), aggrega le quantità e raggruppa per reparto del supermercato (Frutta e Verdura, Carne e Pesce, Latticini e Uova, Dispensa e Cereali, Altro).
Rispondi SOLO JSON: {{"categories":[{{"reparto":"Frutta e Verdura","items":[{{"name":"Spinaci","qty":"500g"}}]}}]}}"""
    try:
        raw = await call_llm(prompt, "Sei un assistente per la spesa. Rispondi solo JSON valido.")
        data = extract_json(raw)
    except Exception as e:
        raise HTTPException(502, f"Errore lista spesa: {str(e)[:150]}")
    await db.shopping.update_one({"user_id": user["id"]}, {"$set": {"data": data, "created_at": now_iso()}}, upsert=True)
    return data

@api.get("/shopping-list")
async def get_shopping_list(user: dict = Depends(get_current_user)):
    doc = await db.shopping.find_one({"user_id": user["id"]}, {"_id": 0})
    return doc.get("data") if doc else {}

@api.post("/recipes/light")
async def gen_recipes(user: dict = Depends(get_current_user)):
    prof = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    prompt = f"""Crea 5 ricette di dolci/snack LIGHT e fit, gustosi ma proteici (es. tiramisù con yogurt greco, pancake proteici, mug cake, cheesecake light, gelato proteico).
Compatibili con la dieta: {prof.get('dietType', 'equilibrata')}.
Rispondi SOLO JSON: {{"recipes":[{{"title":"..","kcal":220,"protein":18,"carbs":20,"fats":6,"ingredients":["..."],"steps":[".."]}}]}}"""
    try:
        raw = await call_llm(prompt, "Sei uno chef nutrizionista. Rispondi solo JSON valido.")
        data = extract_json(raw)
    except Exception as e:
        raise HTTPException(502, f"Errore ricette: {str(e)[:150]}")
    await db.recipes.update_one({"user_id": user["id"]}, {"$set": {"data": data, "created_at": now_iso()}}, upsert=True)
    return data

@api.get("/recipes/light")
async def get_recipes(user: dict = Depends(get_current_user)):
    doc = await db.recipes.find_one({"user_id": user["id"]}, {"_id": 0})
    return doc.get("data") if doc else {"recipes": STATIC_RECIPES}

# ---------- Water tracker ----------
def today_str():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

@api.get("/water")
async def get_water(user: dict = Depends(get_current_user)):
    doc = await db.water.find_one({"user_id": user["id"], "day": today_str()}, {"_id": 0})
    return doc or {"day": today_str(), "glasses": 0, "goal": 8}

@api.post("/water")
async def set_water(body: WaterIn, user: dict = Depends(get_current_user)):
    await db.water.update_one({"user_id": user["id"], "day": today_str()},
                              {"$set": {"glasses": max(0, body.glasses), "goal": body.goal or 8}}, upsert=True)
    return {"ok": True}

# ---------- Meal photo evaluation (vision) ----------
@api.post("/meal/photo")
async def eval_photo(body: PhotoIn, user: dict = Depends(get_current_user)):
    prof = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    goals = ", ".join(GOAL_LABELS.get(g, g) for g in prof.get("goals", [])) or "benessere"
    try:
        b64 = to_jpeg_b64(body.image_base64.split(",")[-1])
    except Exception:
        raise HTTPException(400, "Immagine non valida")
    prompt = f"""Analizza la foto di questo pasto per un utente con dieta '{prof.get('dietType','equilibrata')}', obiettivi: {goals}, patologie/intolleranze: {prof.get('conditions') or 'nessuna'}.
Identifica il piatto, stima calorie e macro, e dì se è COMPATIBILE con la sua dieta e obiettivi. Dai un consiglio pratico in italiano.
Rispondi SOLO JSON: {{"dish":"..","compatible":true,"verdict":"breve giudizio","calories":0,"protein":0,"carbs":0,"fats":0,"advice":".."}}"""
    try:
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"nv-photo-{datetime.now().timestamp()}",
                       system_message="Sei un nutrizionista che analizza foto di pasti. Rispondi solo JSON valido.").with_model("openai", "gpt-6-luna")
        resp = await chat.send_message(UserMessage(text=prompt, file_contents=[ImageContent(image_base64=b64)]))
        data = extract_json(resp)
    except Exception as e:
        logger.exception("photo eval error")
        raise HTTPException(502, f"Errore analisi foto: {str(e)[:150]}")
    raw = base64.b64decode(b64)
    mime = ImageContent.get_mime_type(b64)
    ext = mime.split("/")[-1]
    path = None
    try:
        res = await asyncio.to_thread(put_object, f"{APP_NAME}/meals/{user['id']}/{uuid.uuid4()}.{ext}", raw, mime)
        path = res["path"]
    except Exception:
        logger.exception("storage upload failed")
    entry = {"id": str(uuid.uuid4()), "user_id": user["id"], "day": today_str(), "created_at": now_iso(),
             "image_path": path, "content_type": mime, "is_deleted": False,
             **{k: data.get(k) for k in ["dish", "compatible", "verdict", "calories", "protein", "carbs", "fats", "advice"]}}
    await db.diary.insert_one(entry)
    entry.pop("_id", None)
    return entry

# ---------- Photo diary ----------
@api.get("/diary")
async def get_diary(day: Optional[str] = None, user: dict = Depends(get_current_user)):
    d = day or today_str()
    items = await db.diary.find({"user_id": user["id"], "day": d, "is_deleted": False}, {"_id": 0}).sort("created_at", 1).to_list(200)
    total = sum(int(i.get("calories") or 0) for i in items)
    return {"day": d, "entries": items, "totalCalories": total}

@api.delete("/diary/{entry_id}")
async def delete_diary(entry_id: str, user: dict = Depends(get_current_user)):
    await db.diary.update_one({"id": entry_id, "user_id": user["id"]}, {"$set": {"is_deleted": True}})
    return {"ok": True}

@api.get("/files/{path:path}")
async def get_file(path: str, user: dict = Depends(get_current_user)):
    rec = await db.diary.find_one({"image_path": path, "user_id": user["id"], "is_deleted": False}) or \
        await db.progress_photos.find_one({"image_path": path, "user_id": user["id"], "is_deleted": False})
    if not rec:
        raise HTTPException(404, "File non trovato")
    content, ctype = await asyncio.to_thread(get_object, path)
    return Response(content=content, media_type=rec.get("content_type") or ctype)

# ---------- Progress photos ----------
class ProgressPhotoIn(BaseModel):
    image_base64: str
    note: Optional[str] = None

@api.post("/progress-photos")
async def add_progress_photo(body: ProgressPhotoIn, user: dict = Depends(get_current_user)):
    b64 = body.image_base64.split(",")[-1]
    raw = base64.b64decode(b64)
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(400, "Immagine troppo grande (max 8MB)")
    mime = ImageContent.get_mime_type(b64)
    try:
        res = await asyncio.to_thread(put_object, f"{APP_NAME}/progress/{user['id']}/{uuid.uuid4()}.{mime.split('/')[-1]}", raw, mime)
    except Exception as e:
        raise HTTPException(502, f"Errore caricamento: {str(e)[:120]}")
    prof = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], "image_path": res["path"], "content_type": mime,
           "note": body.note, "weight": prof.get("weight"), "date": now_iso(), "is_deleted": False}
    await db.progress_photos.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/progress-photos")
async def list_progress_photos(user: dict = Depends(get_current_user)):
    items = await db.progress_photos.find({"user_id": user["id"], "is_deleted": False}, {"_id": 0}).sort("date", 1).to_list(500)
    last = items[-1]["date"] if items else None
    ds = days_since(last)
    return {"photos": items, "due": ds is None or ds >= 7}

@api.delete("/progress-photos/{pid}")
async def delete_progress_photo(pid: str, user: dict = Depends(get_current_user)):
    await db.progress_photos.update_one({"id": pid, "user_id": user["id"]}, {"$set": {"is_deleted": True}})
    return {"ok": True}

# ---------- Shopping list editing ----------
@api.put("/shopping-list")
async def save_shopping_list(body: dict, user: dict = Depends(get_current_user)):
    cats = body.get("categories")
    if not isinstance(cats, list):
        raise HTTPException(400, "Lista non valida")
    await db.shopping.update_one({"user_id": user["id"]}, {"$set": {"data": {"categories": cats}, "created_at": now_iso()}}, upsert=True)
    return {"ok": True}

class ShopAddIn(BaseModel):
    name: str
    qty: Optional[str] = ""
    reparto: Optional[str] = "Da ricomprare"

@api.post("/shopping-list/add")
async def shopping_add(body: ShopAddIn, user: dict = Depends(get_current_user)):
    return {"categories": await add_to_shopping(user["id"], body.name, body.qty, body.reparto)}

async def add_to_shopping(user_id: str, name: str, qty: str = "", reparto: str = "Da ricomprare"):
    doc = await db.shopping.find_one({"user_id": user_id}) or {}
    cats = (doc.get("data") or {}).get("categories", [])
    cat = next((c for c in cats if c.get("reparto") == reparto), None)
    if not cat:
        cat = {"reparto": reparto, "items": []}
        cats.insert(0, cat)
    if not any(i.get("name", "").lower() == name.lower() for i in cat["items"]):
        cat["items"].append({"name": name, "qty": qty or ""})
    await db.shopping.update_one({"user_id": user_id}, {"$set": {"data": {"categories": cats}}}, upsert=True)
    return cats

def supp_shop_name(prof: dict, s: dict) -> str:
    from_label = {"whey": "Proteine", "creatina": "Creatina", "bcaa": "Aminoacidi", "gainer": "Mass gainer",
                  "preworkout": "Pre-workout", "omega3": "Omega 3", "vitd": "Vitamina D3", "magnesio": "Magnesio", "multivit": "Multivitaminico"}
    d = (prof.get("supplementDetails") or {}).get(s["id"], {})
    parts = [from_label.get(s["id"], s["id"]), d.get("variant"), d.get("brand")]
    return " ".join(p for p in parts if p)

@api.post("/supplements/{sid}/to-shopping")
async def supp_to_shopping(sid: str, user: dict = Depends(get_current_user)):
    prof = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    s = next((x for x in supplement_stock(prof) if x["id"] == sid), {"id": sid})
    d = (prof.get("supplementDetails") or {}).get(sid, {})
    cats = await add_to_shopping(user["id"], supp_shop_name(prof, s), f"{d['packageGrams']} g" if d.get("packageGrams") else "1 conf", "Integratori")
    return {"categories": cats}

# ---------- Favorites ----------
@api.get("/favorites")
async def list_favorites(user: dict = Depends(get_current_user)):
    return {"favorites": await db.favorites.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(200)}

@api.post("/favorites")
async def add_favorite(body: dict, user: dict = Depends(get_current_user)):
    meal = body.get("meal") or {}
    if not meal.get("title"):
        raise HTTPException(400, "Pasto non valido")
    fav = {k: meal.get(k) for k in ["key", "title", "items", "recipe", "calories", "protein", "carbs", "fats"]}
    await db.favorites.update_one({"user_id": user["id"], "title": fav["title"]},
                                  {"$set": {**fav, "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, user["id"] + fav["title"])), "created_at": now_iso()}}, upsert=True)
    return {"ok": True}

@api.delete("/favorites/{fid}")
async def delete_favorite(fid: str, user: dict = Depends(get_current_user)):
    await db.favorites.delete_one({"user_id": user["id"], "id": fid})
    return {"ok": True}

# ---------- Eat out rebalance ----------
class EatOutIn(BaseModel):
    day: str
    mealKey: str
    description: str

@api.post("/plan/eat-out")
async def eat_out(body: EatOutIn, user: dict = Depends(get_current_user)):
    plandoc = await db.plans.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    plan = plandoc.get("plan") or {}
    day = next((d for d in plan.get("days", []) if d.get("day") == body.day), None)
    if not day:
        raise HTTPException(400, "Giorno non trovato nel piano")
    prof = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    order = ["colazione", "spuntino_mattina", "pranzo", "spuntino_pomeriggio", "cena", "pre_nanna"]
    later = order[order.index(body.mealKey) + 1:] if body.mealKey in order else []
    prompt = f"""Piano del giorno {body.day} (target ~{day.get('totalCalories')} kcal): {json.dumps(day.get('meals'), ensure_ascii=False)}
Al pasto '{body.mealKey}' l'utente ha mangiato FUORI CASA: "{body.description}".
1) Stima kcal e macro di ciò che ha mangiato. 2) Ribilancia SOLO i pasti successivi {later} (non toccare quelli precedenti né i pasti liberi) per rientrare il più possibile nel target calorico e proteico del giorno, restando nella dieta {prof.get('dietType')}, rispettando patologie ({prof.get('conditions') or 'nessuna'}) e usando il frigo: {prof.get('fridgeItems', [])}. Se ha già superato il target, alleggerisci i pasti successivi senza saltarli e privilegia proteine magre e verdure.
Per ogni pasto ribilanciato usa SOLO gli alimenti consentiti per quel pasto:
{meal_foods_txt()}{nutritionist_txt(prof)}
Rispondi SOLO JSON: {{"eatenMeal":{{"key":"{body.mealKey}","title":"Fuori casa: ..","items":[".."],"recipe":"","calories":0,"protein":0,"carbs":0,"fats":0,"libero":false,"eatOut":true}},"updatedMeals":[{{"key":"..","title":"..","items":[".."],"recipe":"..","calories":0,"protein":0,"carbs":0,"fats":0,"libero":false,"brandedItems":[]}}],"note":"breve spiegazione"}}"""
    try:
        data = extract_json(await call_llm(prompt, "Sei un nutrizionista. Rispondi solo JSON valido."))
    except Exception as e:
        raise HTTPException(502, f"Errore ribilanciamento: {str(e)[:150]}")
    upd = {m.get("key"): m for m in data.get("updatedMeals", []) if m.get("key") in later}
    eaten = data.get("eatenMeal") or {}
    eaten["key"] = body.mealKey
    eaten["eatOut"] = True
    new_meals = []
    for m in day.get("meals", []):
        if m.get("key") == body.mealKey:
            new_meals.append(eaten)
        elif m.get("key") in upd and not m.get("libero"):
            new_meals.append({**upd[m["key"]], "rebalanced": True})
        else:
            new_meals.append(m)
    day["meals"] = new_meals
    day["totalCalories"] = sum(int(m.get("calories") or 0) for m in new_meals)
    await db.plans.update_one({"user_id": user["id"]}, {"$set": {"plan": plan}})
    return {"day": day, "note": data.get("note")}

async def send_start_reminders():
    local = rome_now()
    if not (local.hour == 20 and local.minute < 15):
        return
    tomorrow = (local + timedelta(days=1)).strftime("%Y-%m-%d")
    async for prof in db.profiles.find({"dietActive": True, "dietStartDate": {"$regex": f"^{tomorrow}"}}, {"_id": 0}):
        key = f"{prof['user_id']}:start:{tomorrow}"
        if await db.push_deliveries.find_one({"_id": key}):
            continue
        await db.push_deliveries.insert_one({"_id": key, "created_at": datetime.now(timezone.utc)})
        plandoc = await db.plans.find_one({"user_id": prof["user_id"]}, {"_id": 0}) or {}
        days_it = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"]
        wd = days_it[(local + timedelta(days=1)).weekday()]
        day = next((d for d in (plandoc.get("plan") or {}).get("days", []) if d.get("day") == wd), None)
        menu = " · ".join(m.get("title", "") for m in (day or {}).get("meals", [])[:3]) if day else ""
        await push_to_user(prof["user_id"], {"title": "NutriViva · Domani si comincia! 💚",
                                             "body": f"La tua dieta {prof.get('dietType')} inizia domani. {('Menù: ' + menu) if menu else ''}"[:220],
                                             "tag": key, "url": "/app"})

# ---------- Supplement stock ----------
def supplement_stock(prof: dict) -> list:
    out = []
    today = rome_now().date()
    for sid, d in (prof.get("supplementDetails") or {}).items():
        if sid not in (prof.get("supplements") or []):
            continue
        try:
            pkg, dose, tpw = float(d.get("packageGrams") or 0), float(d.get("doseGrams") or 0), float(d.get("timesPerWeek") or 0)
            opened = datetime.strptime(d.get("openedAt"), "%Y-%m-%d").date()
        except Exception:
            continue
        if pkg <= 0 or dose <= 0 or tpw <= 0:
            continue
        daily = dose * tpw / 7
        total_days = pkg / daily
        elapsed = max(0, (today - opened).days)
        left_days = max(0, round(total_days - elapsed))
        out.append({"id": sid, "brand": d.get("brand"), "variant": d.get("variant"),
                    "remainingGrams": max(0, round(pkg - daily * elapsed)), "daysLeft": left_days,
                    "totalDays": round(total_days), "runOutDate": (opened + timedelta(days=round(total_days))).isoformat(),
                    "low": left_days <= 14})
    return out

@api.get("/supplements/stock")
async def get_supp_stock(user: dict = Depends(get_current_user)):
    prof = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    return {"stock": supplement_stock(prof)}

async def send_stock_alerts():
    local = rome_now()
    if not (local.hour == 9 and local.minute < 15):
        return
    async for prof in db.profiles.find({"supplementDetails": {"$exists": True}}, {"_id": 0}):
        for s in supplement_stock(prof):
            if not s["low"]:
                continue
            key = f"{prof['user_id']}:{local.date()}:stock:{s['id']}"
            if await db.push_deliveries.find_one({"_id": key}):
                continue
            d = (prof.get("supplementDetails") or {}).get(s["id"], {})
            await add_to_shopping(prof["user_id"], supp_shop_name(prof, s), f"{d['packageGrams']} g" if d.get("packageGrams") else "1 conf", "Integratori")
            await db.push_deliveries.insert_one({"_id": key, "created_at": datetime.now(timezone.utc)})
            name = " ".join(x for x in [s.get("variant"), s.get("brand")] if x) or s["id"]
            await push_to_user(prof["user_id"], {"title": "NutriViva · Integratori",
                                                 "body": f"{name} in esaurimento: restano circa {s['daysLeft']} giorni ({s['remainingGrams']} g)",
                                                 "tag": key, "url": "/app"})

# ---------- Fridge vs conditions ----------
OFF_URL = "https://search.openfoodfacts.org/search"

def _off_search(q: str):
    r = requests.get(OFF_URL, params={"q": q, "page_size": 12, "countries_tags": "en:italy",
                                      "fields": "code,product_name,brands,quantity,nutriments"},
                     headers={"User-Agent": "NutriViva/1.0 (admin@nutriviva.it)"}, timeout=15)
    r.raise_for_status()
    out = []
    for h in r.json().get("hits", []):
        n = h.get("nutriments") or {}
        kcal = n.get("energy-kcal_100g")
        if not h.get("product_name") or kcal is None:
            continue
        brands = h.get("brands")
        brand = (brands[0] if isinstance(brands, list) and brands else brands) or ""
        out.append({"code": h.get("code"), "name": h["product_name"], "brand": brand, "quantity": h.get("quantity"),
                    "kcal": round(kcal), "protein": round(n.get("proteins_100g") or 0, 1),
                    "carbs": round(n.get("carbohydrates_100g") or 0, 1), "fats": round(n.get("fat_100g") or 0, 1)})
    return out

@api.get("/foods/search")
async def foods_search(q: str = Query(..., min_length=2), user: dict = Depends(get_current_user)):
    import re
    custom = await db.custom_foods.find({"$or": [{"name": {"$regex": re.escape(q), "$options": "i"}},
                                                 {"brand": {"$regex": re.escape(q), "$options": "i"}}]},
                                        {"_id": 0, "created_by": 0, "created_at": 0}).to_list(8)
    try:
        off = await asyncio.to_thread(_off_search, q)
    except Exception:
        logger.exception("openfoodfacts error")
        off = []
    codes = {c.get("code") for c in custom if c.get("code")}
    return {"results": custom + [o for o in off if o.get("code") not in codes]}

def _off_barcode(code: str):
    r = requests.get(f"https://world.openfoodfacts.org/api/v2/product/{code}.json",
                     params={"fields": "code,product_name,brands,quantity,nutriments"},
                     headers={"User-Agent": "NutriViva/1.0 (admin@nutriviva.it)"}, timeout=15)
    if r.status_code != 200 or r.json().get("status") != 1:
        return None
    p = r.json()["product"]
    n = p.get("nutriments") or {}
    if not p.get("product_name") or n.get("energy-kcal_100g") is None:
        return None
    return {"code": code, "name": p["product_name"], "brand": (p.get("brands") or "").split(",")[0].strip(),
            "quantity": p.get("quantity"), "kcal": round(n["energy-kcal_100g"]),
            "protein": round(n.get("proteins_100g") or 0, 1), "carbs": round(n.get("carbohydrates_100g") or 0, 1),
            "fats": round(n.get("fat_100g") or 0, 1)}

@api.get("/foods/barcode/{code}")
async def food_by_barcode(code: str, user: dict = Depends(get_current_user)):
    doc = await db.custom_foods.find_one({"code": code}, {"_id": 0, "created_by": 0, "created_at": 0})
    if doc:
        return {"found": True, "product": doc}
    try:
        p = await asyncio.to_thread(_off_barcode, code)
    except Exception:
        p = None
    return {"found": bool(p), "product": p}

class CustomFoodIn(BaseModel):
    code: Optional[str] = None
    name: str
    brand: Optional[str] = ""
    kcal: float
    protein: float = 0
    carbs: float = 0
    fats: float = 0

@api.post("/foods/custom")
async def add_custom_food(body: CustomFoodIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["kcal"] = round(doc["kcal"])
    key = {"code": body.code} if body.code else {"name": body.name, "brand": body.brand}
    await db.custom_foods.update_one(key, {"$set": {**doc, "created_by": user["id"], "created_at": now_iso()}}, upsert=True)
    return {"ok": True, "product": doc}

CONDITION_KEYWORDS = {
    "lattosio": (["latte", "mozzarella", "yogurt", "formaggio", "ricotta", "panna", "burro", "stracchino", "mascarpone", "gelato", "parmigiano", "grana"], "contiene lattosio"),
    "celiachia": (["pane", "pasta", "farina", "orzo", "farro", "segale", "cous", "biscott", "crackers", "pizza", "seitan"], "contiene glutine"),
    "glutine": (["pane", "pasta", "farina", "orzo", "farro", "segale", "cous", "biscott", "crackers", "pizza", "seitan"], "contiene glutine"),
    "diabet": (["zucchero", "miele", "marmellata", "biscott", "succo", "dolci", "nutella", "merendin"], "zuccheri semplici da limitare"),
    "reflusso": (["pomodor", "agrumi", "arancia", "limone", "caffè", "cioccolat", "peperoncino", "menta", "alcol"], "può peggiorare il reflusso"),
    "ipertens": (["salame", "prosciutto", "affettat", "insaccat", "dado", "patatine", "acciughe", "olive"], "ricco di sodio"),
    "nichel": (["pomodor", "cioccolat", "cacao", "legumi", "fagioli", "lenticchie", "spinaci", "frutta secca", "avena"], "ricco di nichel"),
}

def keyword_warnings(cond: str, items: List[str]):
    out = []
    c = cond.lower()
    for key, (words, reason) in CONDITION_KEYWORDS.items():
        if key in c:
            for it in items:
                if any(w in it.lower() for w in words) and not any(o["item"] == it for o in out):
                    out.append({"item": it, "reason": reason})
    return out

@api.post("/fridge/check")
async def fridge_check(user: dict = Depends(get_current_user)):
    prof = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    cond = (prof.get("conditions") or "").strip()
    items = prof.get("fridgeItems", [])
    if not cond or not items:
        return {"warnings": []}
    warnings = keyword_warnings(cond, items)
    prompt = f"""Patologie/intolleranze dell'utente: {cond}.
Ingredienti nel frigo: {items}.
Indica SOLO gli ingredienti NON adatti o da limitare per queste patologie, con motivo breve in italiano.
Rispondi SOLO JSON: {{"warnings":[{{"item":"..","reason":".."}}]}}"""
    try:
        data = extract_json(await call_llm(prompt, "Sei un nutrizionista clinico. Rispondi solo JSON valido."))
        for w in data.get("warnings", []):
            if w.get("item") and not any(w["item"].lower() in o["item"].lower() or o["item"].lower() in w["item"].lower() for o in warnings):
                warnings.append(w)
    except Exception:
        logger.exception("fridge check llm error")
    return {"warnings": warnings}

# ---------- Web Push reminders ----------
VAPID_PRIVATE_KEY = os.environ["VAPID_PRIVATE_KEY"]
VAPID_PUBLIC_KEY = os.environ["VAPID_PUBLIC_KEY"]
VAPID_SUBJECT = os.environ["VAPID_SUBJECT"]
WEBHOOK_CRON_SECRET = os.environ["WEBHOOK_CRON_SECRET"]

MEAL_REMINDERS = [("Colazione", "07:30"), ("Spuntino mattina", "10:30"), ("Pranzo", "13:00"),
                  ("Spuntino pomeriggio", "16:30"), ("Cena", "20:00"), ("Spuntino pre-nanna", "22:30")]

class PushSubIn(BaseModel):
    endpoint: str
    keys: dict

class RemindersIn(BaseModel):
    timezone: str
    meals: Optional[bool] = None
    supplements: Optional[List[dict]] = None

@api.get("/push/public-key")
async def push_public_key():
    return {"publicKey": VAPID_PUBLIC_KEY}

@api.post("/push/subscribe")
async def push_subscribe(body: PushSubIn, user: dict = Depends(get_current_user)):
    await db.push_subs.update_one({"endpoint": body.endpoint},
                                  {"$set": {"user_id": user["id"], "endpoint": body.endpoint, "keys": body.keys,
                                            "updated_at": now_iso()}}, upsert=True)
    return {"ok": True}

@api.get("/reminders")
async def get_reminders(user: dict = Depends(get_current_user)):
    doc = await db.reminders.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    subs = await db.push_subs.count_documents({"user_id": user["id"]})
    return {**doc, "pushSubscriptions": subs}

@api.put("/reminders")
async def save_reminders(body: RemindersIn, user: dict = Depends(get_current_user)):
    try:
        ZoneInfo(body.timezone)
    except Exception:
        raise HTTPException(400, "Fuso orario non valido")
    upd = {"timezone": body.timezone}
    if body.meals is not None:
        upd["meals"] = body.meals
    if body.supplements is not None:
        upd["supplements"] = [{"label": s.get("label"), "time": s.get("time")} for s in body.supplements if s.get("time")]
    await db.reminders.update_one({"user_id": user["id"]}, {"$set": upd}, upsert=True)
    return {"ok": True}

def _send_push(sub: dict, payload: dict):
    webpush(subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]}, data=json.dumps(payload),
            vapid_private_key=VAPID_PRIVATE_KEY, vapid_claims={"sub": VAPID_SUBJECT}, ttl=900)

async def push_to_user(user_id: str, payload: dict) -> int:
    sent = 0
    async for sub in db.push_subs.find({"user_id": user_id}):
        try:
            await asyncio.to_thread(_send_push, sub, payload)
            sent += 1
        except WebPushException as exc:
            if getattr(exc.response, "status_code", None) in (404, 410):
                await db.push_subs.delete_one({"_id": sub["_id"]})
            logger.warning(f"push failed: {exc}")
        except Exception as exc:
            logger.warning(f"push error: {exc}")
    return sent

async def send_due_reminders():
    try:
        await send_stock_alerts()
    except Exception:
        logger.exception("stock alerts failed")
    try:
        await send_start_reminders()
    except Exception:
        logger.exception("start reminders failed")
    now = datetime.now(timezone.utc)
    async for r in db.reminders.find({}):
        try:
            local = now.astimezone(ZoneInfo(r.get("timezone") or "Europe/Rome"))
        except Exception:
            continue
        items = [("meal", l, t) for l, t in MEAL_REMINDERS] if r.get("meals") else []
        items += [("supp", s["label"], s["time"]) for s in r.get("supplements", []) if s.get("time")]
        for kind, label, t in items:
            h, m = map(int, t.split(":"))
            target = local.replace(hour=h, minute=m, second=0, microsecond=0)
            diff = (local - target).total_seconds()
            if not (0 <= diff < 900):
                continue
            key = f"{r['user_id']}:{local.date()}:{kind}:{t}:{label}"
            if await db.push_deliveries.find_one({"_id": key}):
                continue
            await db.push_deliveries.insert_one({"_id": key, "created_at": now})
            body = f"È ora di: {label}" if kind == "meal" else f"Ricordati di assumere: {label}"
            await push_to_user(r["user_id"], {"title": "NutriViva", "body": body, "tag": key, "url": "/app"})

@api.post("/cron/reminders")
async def cron_reminders(request: Request, bg: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not token or not hmac.compare_digest(token, WEBHOOK_CRON_SECRET):
        raise HTTPException(401, "Unauthorized")
    run_id = request.headers.get("X-Webhook-Id") or str(uuid.uuid4())
    if await db.cron_runs.find_one({"_id": run_id}):
        return {"ok": True, "duplicate": True}
    await db.cron_runs.insert_one({"_id": run_id, "created_at": now_iso()})
    bg.add_task(send_due_reminders)
    return {"ok": True}

@api.post("/push/test")
async def push_test(user: dict = Depends(get_current_user)):
    sent = await push_to_user(user["id"], {"title": "NutriViva", "body": "Le notifiche funzionano! 🎉", "tag": "test", "url": "/app"})
    return {"sent": sent}

# ---------- Fridge recipe, eaten meals, measurements, weekly summary ----------
@api.post("/fridge/recipe")
async def fridge_recipe(user: dict = Depends(get_current_user)):
    prof = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    items = prof.get("fridgeItems", [])
    if not items:
        raise HTTPException(400, "Il frigo è vuoto: aggiungi qualche ingrediente")
    prompt = f"""Ingredienti DISPONIBILI ORA nel frigo: {items}.
Dieta: {prof.get('dietType')}. Patologie/intolleranze: {prof.get('conditions') or 'nessuna'}.
Proponi UNA ricetta VELOCE (max 20 minuti) usando SOLO questi ingredienti (ammessi solo sale, pepe, spezie, olio, acqua). Rispetta dieta e patologie. Se un prodotto ha valori reali tra [ ] usali per le calorie.
Rispondi SOLO JSON: {{"title":"..","time":"15 min","kcal":0,"protein":0,"carbs":0,"fats":0,"ingredients":["quantità ingrediente"],"steps":[".."]}}"""
    try:
        return extract_json(await call_llm(prompt, "Sei uno chef nutrizionista. Rispondi solo JSON valido."))
    except Exception as e:
        raise HTTPException(502, f"Errore ricetta: {str(e)[:150]}")

def week_start(d: datetime) -> str:
    return (d - timedelta(days=d.weekday())).strftime("%Y-%m-%d")

def rome_now() -> datetime:
    return datetime.now(ZoneInfo("Europe/Rome"))

def fix_piece_counts(before: List[str], after: List[str], removed: list) -> List[str]:
    """Apply 'N pz' deductions the LLM listed in `removed` but forgot to write."""
    import re
    out = list(after)
    for r in removed or []:
        m = re.match(r"\s*(\d+)\s*(?:pz|pezzi)?\s+([a-zàèéìòù]+)", str(r).lower())
        if not m:
            continue
        n, word = int(m.group(1)), m.group(2)[:4]
        for i, it in enumerate(out):
            mm = re.match(r"(\d+)\s*pz\s+(.*)", it)
            if mm and word in mm.group(2).lower() and it in before:
                left = int(mm.group(1)) - n
                out[i] = f"{left} pz {mm.group(2)}" if left > 0 else None
                break
    return [x for x in out if x]

class EatenIn(BaseModel):
    planDay: str
    mealKey: str
    meal: dict

@api.get("/meals/eaten")
async def eaten_list(user: dict = Depends(get_current_user)):
    ws = week_start(rome_now())
    items = await db.eaten.find({"user_id": user["id"], "week": ws}, {"_id": 0}).to_list(100)
    return {"week": ws, "eaten": items}

@api.post("/meals/eaten")
async def mark_eaten(body: EatenIn, user: dict = Depends(get_current_user)):
    now = rome_now()
    ws = week_start(now)
    key = {"user_id": user["id"], "week": ws, "planDay": body.planDay, "mealKey": body.mealKey}
    if await db.eaten.find_one(key):
        return {"ok": True, "already": True, "removed": []}
    m = body.meal
    await db.eaten.insert_one({**key, "date": now.strftime("%Y-%m-%d"), "title": m.get("title"),
                               "calories": int(m.get("calories") or 0), "libero": bool(m.get("libero"))})
    prof = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    fridge = prof.get("fridgeItems", [])
    removed, updated = [], fridge
    if fridge and not m.get("libero") and m.get("items"):
        prompt = f"""Frigo attuale (lista di stringhe): {json.dumps(fridge, ensure_ascii=False)}
L'utente ha mangiato: {json.dumps(m.get('items'), ensure_ascii=False)}.
Sottrai dal frigo le quantità consumate. Mantieni ESATTAMENTE il formato di ogni stringa (marca, valori tra [ ], "(scade il ...)"), aggiornando solo il numero iniziale. Rimuovi gli elementi esauriti. Non toccare quelli non usati.
Rispondi SOLO JSON: {{"fridgeItems":["..."],"removed":["descrizione breve di cosa è stato scalato"]}}"""
        try:
            data = extract_json(await call_llm(prompt, "Sei un assistente di dispensa preciso. Rispondi solo JSON valido."))
            if isinstance(data.get("fridgeItems"), list):
                updated = fix_piece_counts(fridge, [str(x) for x in data["fridgeItems"]], data.get("removed", []))
                removed = data.get("removed", [])
                await db.profiles.update_one({"user_id": user["id"]}, {"$set": {"fridgeItems": updated}})
        except Exception:
            logger.exception("fridge deduction error")
    return {"ok": True, "removed": removed, "fridgeItems": updated}

@api.delete("/meals/eaten")
async def unmark_eaten(planDay: str, mealKey: str, user: dict = Depends(get_current_user)):
    await db.eaten.delete_one({"user_id": user["id"], "week": week_start(rome_now()), "planDay": planDay, "mealKey": mealKey})
    return {"ok": True}

class MeasureIn(BaseModel):
    vita: Optional[float] = None
    fianchi: Optional[float] = None
    braccia: Optional[float] = None
    cosce: Optional[float] = None
    torace: Optional[float] = None

@api.get("/checkins/measurements")
async def measures_history(user: dict = Depends(get_current_user)):
    items = await db.measures.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("date", 1).to_list(500)
    return {"history": items}

@api.post("/checkins/measurements")
async def add_measures(body: MeasureIn, user: dict = Depends(get_current_user)):
    vals = {k: v for k, v in body.model_dump().items() if v is not None}
    if not vals:
        raise HTTPException(400, "Inserisci almeno una misura")
    await db.measures.insert_one({"user_id": user["id"], "date": now_iso(), **vals})
    return {"ok": True}

@api.get("/summary/weekly")
async def weekly_summary(user: dict = Depends(get_current_user)):
    now = rome_now()
    ws = week_start(now)
    start_dt = datetime.strptime(ws, "%Y-%m-%d").replace(tzinfo=ZoneInfo("Europe/Rome"))
    start_iso = start_dt.astimezone(timezone.utc).isoformat()
    days = [(start_dt + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
    weights = await db.weights.find({"user_id": user["id"]}, {"_id": 0}).sort("date", 1).to_list(1000)
    before = [w for w in weights if w["date"] < start_iso]
    inweek = [w for w in weights if w["date"] >= start_iso]
    w_start = (before[-1] if before else (inweek[0] if inweek else None))
    w_end = inweek[-1] if inweek else None
    water = await db.water.find({"user_id": user["id"], "day": {"$in": days}}, {"_id": 0}).to_list(7)
    water_days_ok = sum(1 for w in water if w.get("glasses", 0) >= w.get("goal", 8))
    water_avg = round(sum(w.get("glasses", 0) for w in water) / 7, 1)
    eaten = await db.eaten.find({"user_id": user["id"], "week": ws}, {"_id": 0}).to_list(100)
    plandoc = await db.plans.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    pdays = (plandoc.get("plan") or {}).get("days", [])
    planned = sum(1 for d in pdays for m in d.get("meals", []) if not m.get("libero"))
    planned_kcal = sum(int(d.get("totalCalories") or 0) for d in pdays)
    diary = await db.diary.find({"user_id": user["id"], "day": {"$in": days}, "is_deleted": False}, {"_id": 0}).to_list(200)
    eaten_kcal = sum(e.get("calories", 0) for e in eaten if not e.get("libero"))
    photo_kcal = sum(int(d.get("calories") or 0) for d in diary)
    moods = await db.moods.find({"user_id": user["id"], "date": {"$gte": start_iso}}, {"_id": 0}).to_list(10)
    return {
        "weekStart": ws, "isSunday": now.weekday() == 6,
        "weight": {"start": w_start and w_start["weight"], "end": w_end and w_end["weight"],
                   "delta": round(w_end["weight"] - w_start["weight"], 1) if w_start and w_end else None},
        "water": {"avgGlasses": water_avg, "daysGoalHit": water_days_ok},
        "meals": {"eaten": len([e for e in eaten if not e.get("libero")]), "planned": planned,
                  "free": len([e for e in eaten if e.get("libero")])},
        "calories": {"eatenFromPlan": eaten_kcal, "fromPhotos": photo_kcal, "plannedWeek": planned_kcal},
        "mood": {k: round(sum(m.get(k, 0) for m in moods) / len(moods), 1) for k in ["energy", "hunger", "serenity"]} if moods else None,
    }

@api.post("/cron/weekly")
async def cron_weekly(request: Request, bg: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not token or not hmac.compare_digest(token, WEBHOOK_CRON_SECRET):
        raise HTTPException(401, "Unauthorized")
    run_id = request.headers.get("X-Webhook-Id") or str(uuid.uuid4())
    if await db.cron_runs.find_one({"_id": run_id}):
        return {"ok": True, "duplicate": True}
    await db.cron_runs.insert_one({"_id": run_id, "created_at": now_iso()})

    async def notify_all():
        for uid in await db.push_subs.distinct("user_id"):
            await push_to_user(uid, {"title": "NutriViva", "body": "📊 Il tuo riepilogo settimanale è pronto!", "tag": "weekly", "url": "/app"})
    bg.add_task(notify_all)
    return {"ok": True}

# ---------- startup ----------
@api.get("/")
async def root():
    return {"message": "NutriViva API"}

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    admin_email = os.environ.get("ADMIN_EMAIL")
    admin_pw = os.environ.get("ADMIN_PASSWORD")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({"email": admin_email, "name": "Admin",
                                   "password_hash": hash_password(admin_pw), "role": "admin",
                                   "created_at": now_iso()})

@app.on_event("shutdown")
async def shutdown():
    client.close()
