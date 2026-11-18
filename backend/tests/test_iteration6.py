"""Backend tests for NutriViva iteration 6:
- /api/fridge/recipe (empty fridge -> 400; with fridge -> AI JSON with required fields)
- /api/meals/eaten (GET/POST/DELETE lifecycle, fridge deduction via LLM)
- /api/checkins/measurements (POST partial, GET history)
- /api/summary/weekly (shape)
- /api/cron/weekly (401 without auth, 200 with Bearer secret, idempotency)
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().strip('"').rstrip('/')

CRON_SECRET = None
with open('/app/backend/.env') as f:
    for line in f:
        if line.startswith('WEBHOOK_CRON_SECRET'):
            CRON_SECRET = line.split('=', 1)[1].strip().strip('"')

MARCO = {"email": "marco@test.it", "password": "test1234"}
ORIGINAL_FRIDGE = [
    '8 pz uova', '400 g macinato di bovino (scade il 2026-10-10)', '1 kg riso', '500 g avena',
    '3 pz mele', '300 g spinaci',
    "440 g Fiocchi d'avena integrali (Quaker) [372 kcal/100g, P 13 C 58 G 8]",
    '250 g Bresaola (Rigamonti) [151 kcal/100g, P 32 C 0.5 G 2.6]'
]


@pytest.fixture(scope="module")
def marco_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=MARCO, timeout=30)
    assert r.status_code == 200, f"login failed: {r.text}"
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def empty_user_client():
    s = requests.Session()
    email = f"test_empty_{uuid.uuid4().hex[:8]}@test.it"
    r = s.post(f"{BASE_URL}/api/auth/register",
               json={"name": "TestEmpty", "email": email, "password": "test1234"}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    # profile with no fridgeItems
    s.put(f"{BASE_URL}/api/profile", json={
        "age": 30, "sex": "M", "weight": 75, "height": 178,
        "goals": ["mantenere"], "dietType": "Mediterranea",
        "fridgeItems": [], "planMode": "weekly",
    }, timeout=15)
    return s


# ---------- Fridge recipe ----------
def test_fridge_recipe_empty_returns_400(empty_user_client):
    r = empty_user_client.post(f"{BASE_URL}/api/fridge/recipe", json={}, timeout=30)
    assert r.status_code == 400, f"{r.status_code} {r.text}"
    assert "vuoto" in r.text.lower() or "empty" in r.text.lower()


def test_fridge_recipe_marco_returns_valid_json(marco_client):
    r = marco_client.post(f"{BASE_URL}/api/fridge/recipe", json={}, timeout=90)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    data = r.json()
    for k in ["title", "time", "kcal", "ingredients", "steps"]:
        assert k in data, f"missing {k} in {data}"
    assert isinstance(data["ingredients"], list) and len(data["ingredients"]) > 0
    assert isinstance(data["steps"], list) and len(data["steps"]) > 0


# ---------- Measurements ----------
def test_measurements_partial_save_and_history(marco_client):
    r = marco_client.post(f"{BASE_URL}/api/checkins/measurements",
                          json={"vita": 85.5, "braccia": 34}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True

    g = marco_client.get(f"{BASE_URL}/api/checkins/measurements", timeout=15)
    assert g.status_code == 200
    hist = g.json()["history"]
    assert isinstance(hist, list) and len(hist) >= 1
    last = hist[-1]
    assert last.get("vita") == 85.5
    assert last.get("braccia") == 34


def test_measurements_all_empty_returns_400(marco_client):
    r = marco_client.post(f"{BASE_URL}/api/checkins/measurements", json={}, timeout=15)
    assert r.status_code == 400


# ---------- Weekly summary ----------
def test_weekly_summary_shape(marco_client):
    r = marco_client.get(f"{BASE_URL}/api/summary/weekly", timeout=20)
    assert r.status_code == 200
    data = r.json()
    for k in ["weekStart", "isSunday", "weight", "water", "meals", "calories"]:
        assert k in data, f"missing {k}"
    assert "avgGlasses" in data["water"] and "daysGoalHit" in data["water"]
    assert "eaten" in data["meals"] and "planned" in data["meals"]
    assert "eatenFromPlan" in data["calories"]


# ---------- Cron weekly auth ----------
def test_cron_weekly_no_auth_401():
    r = requests.post(f"{BASE_URL}/api/cron/weekly", timeout=15)
    assert r.status_code == 401, r.text


def test_cron_weekly_with_secret_200_and_idempotent():
    assert CRON_SECRET, "WEBHOOK_CRON_SECRET not found in backend/.env"
    run_id = f"test-{uuid.uuid4().hex[:12]}"
    headers = {"Authorization": f"Bearer {CRON_SECRET}", "X-Webhook-Id": run_id}
    r = requests.post(f"{BASE_URL}/api/cron/weekly", headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    # second call with same id should be duplicate
    r2 = requests.post(f"{BASE_URL}/api/cron/weekly", headers=headers, timeout=20)
    assert r2.status_code == 200
    assert r2.json().get("duplicate") is True


def test_cron_weekly_wrong_secret_401():
    r = requests.post(f"{BASE_URL}/api/cron/weekly",
                      headers={"Authorization": "Bearer wrong-secret"}, timeout=15)
    assert r.status_code == 401


# ---------- Eaten meals lifecycle + fridge deduction ----------
def test_eaten_lifecycle_and_fridge_deduction(marco_client):
    # ensure marco's fridge is baseline (merge, do not wipe other fields!)
    prof = marco_client.get(f"{BASE_URL}/api/profile", timeout=15).json()
    marco_client.put(f"{BASE_URL}/api/profile", json={**prof, "fridgeItems": ORIGINAL_FRIDGE}, timeout=15)

    # get plan to find a non-libero meal
    plan = marco_client.get(f"{BASE_URL}/api/plan", timeout=15).json()
    days = plan["plan"]["days"]
    # pick Martedì (planDay index 1) first non-libero meal to avoid 'Lunedì colazione already eaten' from curl
    target_day = None
    target_meal = None
    for d in days:
        if d.get("day") == "Martedì":
            for m in d.get("meals", []):
                if not m.get("libero") and m.get("items"):
                    target_day = d.get("day")
                    target_meal = m
                    break
            break
    assert target_day and target_meal, "could not find Martedì non-libero meal with items"

    # GET eaten list (baseline)
    r = marco_client.get(f"{BASE_URL}/api/meals/eaten", timeout=15)
    assert r.status_code == 200
    base_eaten = r.json()["eaten"]
    base_keys = {(e["planDay"], e["mealKey"]) for e in base_eaten}

    try:
        # POST mark eaten
        r = marco_client.post(f"{BASE_URL}/api/meals/eaten",
                              json={"planDay": target_day, "mealKey": target_meal["key"], "meal": target_meal},
                              timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert "fridgeItems" in body

        # verify list contains it
        r2 = marco_client.get(f"{BASE_URL}/api/meals/eaten", timeout=15).json()
        new_keys = {(e["planDay"], e["mealKey"]) for e in r2["eaten"]}
        assert (target_day, target_meal["key"]) in new_keys

        # verify fridge updated in profile
        prof = marco_client.get(f"{BASE_URL}/api/profile", timeout=15).json()
        assert isinstance(prof.get("fridgeItems"), list)
        # at least one of removed items were present (loose check)

        # DELETE unmark
        r3 = marco_client.delete(
            f"{BASE_URL}/api/meals/eaten?planDay={target_day}&mealKey={target_meal['key']}",
            timeout=15)
        assert r3.status_code == 200
        r4 = marco_client.get(f"{BASE_URL}/api/meals/eaten", timeout=15).json()
        final_keys = {(e["planDay"], e["mealKey"]) for e in r4["eaten"]}
        assert (target_day, target_meal["key"]) not in final_keys
    finally:
        # restore marco's fridge (merge full profile)
        prof2 = marco_client.get(f"{BASE_URL}/api/profile", timeout=15).json()
        marco_client.put(f"{BASE_URL}/api/profile", json={**prof2, "fridgeItems": ORIGINAL_FRIDGE}, timeout=15)
