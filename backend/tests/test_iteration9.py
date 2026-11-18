"""Iteration 9 backend tests for NutriViva:
- POST /api/plan/custom-meal: meal-allowed foods (no meat at colazione) and onlyThese mode (gaps/nextMealTip/optional)
- POST /api/plan/alternative colazione: no meat/fish
- POST /api/plan/rest-day: training day -> riposo, fewer kcal, persisted
- PUT/GET /api/profile: supplementDetails.moments/loadingDone/loadingStart, hasNutritionist/nutritionistDiet (TEST user)
- DELETE /api/auth/me: account + data deleted, login -> 401 (TEST user only)
- POST /api/meals/eaten: fridge deduction regression (marco; fridge restored afterwards)
"""
import os
import re
import json
import uuid
import requests
import pytest


def _read_env(path, key):
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env("/app/frontend/.env", "REACT_APP_BACKEND_URL")).rstrip("/")
MARCO = {"email": "marco@test.it", "password": "test1234"}
MEAT_FISH = ["pollo", "tacchino", "manzo", "vitello", "maiale", "coniglio", "bresaola", "prosciutto", "salmone",
             "tonno", "merluzzo", "pesce", "sgombro", "orata", "spigola", "sogliola", "macinato", "carne", "bovino", "affettato"]


def _login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def marco():
    return _login(MARCO)


@pytest.fixture(scope="module")
def marco_plan(marco):
    r = marco.get(f"{BASE_URL}/api/plan", timeout=30)
    assert r.status_code == 200
    plan = r.json()["plan"]
    yield plan
    # restore the original plan
    marco.put(f"{BASE_URL}/api/plan", json={"plan": plan}, timeout=30)


def _meal(plan, day, key):
    d = next(d for d in plan["days"] if d["day"] == day)
    return next(m for m in d["meals"] if m["key"] == key)


def _has_meat(texts):
    low = " ".join(texts).lower()
    return [w for w in MEAT_FISH if w in low]


# ---------- custom meal ----------
def test_custom_meal_colazione_no_meat(marco, marco_plan):
    cur = _meal(marco_plan, "Martedì", "colazione")
    r = marco.post(f"{BASE_URL}/api/plan/custom-meal", json={
        "day": "Martedì", "mealKey": "colazione", "ingredients": "fiocchi di avena e una mela",
        "currentMeal": cur, "onlyThese": False}, timeout=150)
    assert r.status_code == 200, r.text
    meal = r.json()["meal"]
    print("COLAZIONE:", json.dumps(meal, ensure_ascii=False)[:800])
    assert meal["key"] == "colazione" and meal["custom"] is True
    items = meal.get("items") or []
    assert any("avena" in i.lower() for i in items)
    assert any("mel" in i.lower() for i in items)
    bad = _has_meat(items + (meal.get("added") or []))
    assert not bad, f"meat/fish found in colazione: {bad} -> {items}"


def test_custom_meal_only_these_cena(marco, marco_plan):
    cur = _meal(marco_plan, "Martedì", "cena")
    r = marco.post(f"{BASE_URL}/api/plan/custom-meal", json={
        "day": "Martedì", "mealKey": "cena", "ingredients": "pomodori, cetrioli e pane",
        "currentMeal": cur, "onlyThese": True}, timeout=200)
    assert r.status_code == 200, r.text
    meal = r.json()["meal"]
    print("CENA onlyThese:", json.dumps(meal, ensure_ascii=False)[:1000])
    items = meal.get("items") or []
    assert items, "no items"
    for i in items:
        low = i.lower()
        assert any(k in low for k in ["pomod", "cetri", "pane"]), f"extra ingredient: {i}"
    assert meal.get("added") == []
    assert meal.get("gaps") or meal.get("nextMealTip") or meal.get("optional")


def test_alternative_colazione_no_meat(marco, marco_plan):
    cur = _meal(marco_plan, "Martedì", "colazione")
    r = marco.post(f"{BASE_URL}/api/plan/alternative", json={"day": "Martedì", "mealKey": "colazione", "currentMeal": cur}, timeout=150)
    assert r.status_code == 200, r.text
    alt = r.json()["alternative"]
    print("ALT colazione:", alt.get("items"))
    assert not _has_meat(alt.get("items") or []), alt.get("items")


# ---------- rest day ----------
def test_rest_day_invalid_day(marco):
    r = marco.post(f"{BASE_URL}/api/plan/rest-day", json={"day": "Nonday"}, timeout=30)
    assert r.status_code == 400


def test_rest_day_venerdi(marco, marco_plan):
    before = next(d for d in marco_plan["days"] if d["day"] == "Venerdì")
    assert before["dayType"] == "allenamento"
    r = marco.post(f"{BASE_URL}/api/plan/rest-day", json={"day": "Venerdì"}, timeout=200)
    assert r.status_code == 200, r.text
    day = r.json()["day"]
    print("REST day kcal", before["totalCalories"], "->", day["totalCalories"], "note:", r.json().get("note"))
    assert day["dayType"] == "riposo" and day["skippedTraining"] is True
    assert day["totalCalories"] < before["totalCalories"]
    carbs_b = sum(int(m.get("carbs") or 0) for m in before["meals"])
    carbs_a = sum(int(m.get("carbs") or 0) for m in day["meals"])
    print("carbs", carbs_b, "->", carbs_a)
    assert carbs_a < carbs_b
    assert len(day["meals"]) == 6
    # colazione must remain meat-free after rest day transformation
    colaz = next(m for m in day["meals"] if m["key"] == "colazione")
    assert not _has_meat(colaz.get("items") or []), colaz.get("items")
    g = marco.get(f"{BASE_URL}/api/plan", timeout=30).json()["plan"]
    gd = next(d for d in g["days"] if d["day"] == "Venerdì")
    assert gd["dayType"] == "riposo" and gd.get("skippedTraining") is True
    assert gd["totalCalories"] == day["totalCalories"]


# ---------- profile fields + delete account (TEST user) ----------
@pytest.fixture(scope="module")
def test_user():
    email = f"test_del_{uuid.uuid4().hex[:8]}@example.com"
    creds = {"email": email, "password": "test1234"}
    r = requests.post(f"{BASE_URL}/api/auth/register", json={**creds, "name": "TEST_Del"}, timeout=30)
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    yield creds, s
    s.delete(f"{BASE_URL}/api/auth/me", timeout=30)


def test_profile_supplement_moments_and_nutritionist(test_user):
    creds, s = test_user
    payload = {"age": 30, "sex": "M", "weight": 75, "height": 178, "dietType": "Mediterranea", "goals": ["massa"],
               "supplements": ["creatina", "omega3"],
               "supplementDetails": {"creatina": {"moments": ["colazione", "post-allenamento"], "loadingDone": False, "loadingStart": "2026-01-10"},
                                     "omega3": {"moments": ["auto"]}},
               "hasNutritionist": True, "nutritionistDiet": "Colazione: 200 g yogurt greco, 40 g avena"}
    r = s.put(f"{BASE_URL}/api/profile", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    p = s.get(f"{BASE_URL}/api/profile", timeout=30).json()
    assert p["supplementDetails"]["creatina"]["moments"] == ["colazione", "post-allenamento"]
    assert p["supplementDetails"]["creatina"]["loadingDone"] is False
    assert p["supplementDetails"]["creatina"]["loadingStart"] == "2026-01-10"
    assert p["supplementDetails"]["omega3"]["moments"] == ["auto"]
    assert p["hasNutritionist"] is True
    assert "yogurt greco" in p["nutritionistDiet"]


def test_delete_account(test_user):
    creds, s = test_user
    s.post(f"{BASE_URL}/api/water", json={"glasses": 2}, timeout=30)
    r = s.delete(f"{BASE_URL}/api/auth/me", timeout=30)
    assert r.status_code == 200 and r.json().get("ok") is True
    r2 = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r2.status_code == 401
    r3 = s.get(f"{BASE_URL}/api/profile", timeout=30)
    print("old token /profile ->", r3.status_code, r3.text[:100])
    assert r3.status_code == 401


def test_delete_account_requires_auth():
    r = requests.delete(f"{BASE_URL}/api/auth/me", timeout=30)
    assert r.status_code == 401


# ---------- fridge deduction regression ----------
def test_meal_eaten_deducts_fridge(marco, marco_plan):
    prof = marco.get(f"{BASE_URL}/api/profile", timeout=30).json()
    fridge_before = list(prof.get("fridgeItems") or [])
    meal = {"title": "TEST_Avena e mela", "items": ["80 g fiocchi d'avena", "1 mela", "2 uova"], "calories": 400}
    try:
        r = marco.post(f"{BASE_URL}/api/meals/eaten", json={"planDay": "Domenica", "mealKey": "spuntino_pomeriggio", "meal": meal}, timeout=150)
        assert r.status_code == 200, r.text
        res = r.json()
        print("removed:", res.get("removed"), "\nfridge:", res.get("fridgeItems"))
        assert res.get("removed"), "nothing removed"
        after = marco.get(f"{BASE_URL}/api/profile", timeout=30).json().get("fridgeItems")
        assert after != fridge_before
    finally:
        marco.delete(f"{BASE_URL}/api/meals/eaten", params={"planDay": "Domenica", "mealKey": "spuntino_pomeriggio"}, timeout=30)
        marco.put(f"{BASE_URL}/api/profile", json={"fridgeItems": fridge_before}, timeout=30)
