"""Iteration 7 backend tests for NutriViva.

Covers:
- Target weight persistence
- Progress photos CRUD + file access
- Shopping list PUT + /add in "Da ricomprare"
- Supplements stock calculation (1000g, 30g, 4/w ~= 58 days)
- Meal preferences / foodLikes / foodDislikes persistence
- /foods/label nutrition OCR (generated PIL image)
- /plan/custom-meal
- Calendar fields: dietActive/dietStartDate/dietEndDate persistence
- Marco profile backup + restore
"""
import os
import io
import json
import base64
import uuid
import requests
import pytest
from datetime import date, timedelta
from PIL import Image, ImageDraw, ImageFont

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    with open('/app/frontend/.env') as fh:
        for line in fh:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

MARCO = {"email": "marco@test.it", "password": "test1234"}

MARCO_RESTORE = {
    "dietActive": True,
    "dietStartDate": "2026-10-12T00:00:00+00:00",
    "dietEndDate": "2026-12-06",
}


@pytest.fixture(scope="module")
def marco():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=MARCO, timeout=30)
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def marco_backup(marco):
    r = marco.get(f"{BASE_URL}/api/profile", timeout=15)
    assert r.status_code == 200
    original = r.json()
    yield original
    # restore critical fields
    restore = {
        "dietActive": True,
        "dietStartDate": original.get("dietStartDate") or "2026-10-12T00:00:00+00:00",
        "dietEndDate": original.get("dietEndDate") or "2026-12-06",
        "targetWeight": original.get("targetWeight"),
        "mealPreferences": original.get("mealPreferences") or {},
        "foodLikes": original.get("foodLikes") or "",
        "foodDislikes": original.get("foodDislikes") or "",
    }
    marco.put(f"{BASE_URL}/api/profile", json=restore, timeout=15)


@pytest.fixture(scope="module")
def fresh_user():
    s = requests.Session()
    email = f"test_it7_{uuid.uuid4().hex[:8]}@test.it"
    r = s.post(f"{BASE_URL}/api/auth/register",
               json={"name": "IT7", "email": email, "password": "test1234"}, timeout=30)
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}",
                      "Content-Type": "application/json"})
    return s


# --- Target weight ---
def test_target_weight_persist(marco, marco_backup):
    r = marco.put(f"{BASE_URL}/api/profile", json={"targetWeight": 75.5}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["profile"]["targetWeight"] == 75.5
    g = marco.get(f"{BASE_URL}/api/profile", timeout=15).json()
    assert g["targetWeight"] == 75.5
    # ensure other critical fields not wiped (merge semantics)
    assert g.get("age") is not None, "PUT /profile wiped age field — not merge-safe!"


# --- Progress photos ---
def _tiny_jpeg_b64():
    img = Image.new("RGB", (120, 160), color=(70, 110, 70))
    out = io.BytesIO(); img.save(out, format="JPEG", quality=70)
    return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()


def test_progress_photo_crud(marco):
    before = marco.get(f"{BASE_URL}/api/progress-photos", timeout=15).json().get("photos", [])
    r = marco.post(f"{BASE_URL}/api/progress-photos",
                   json={"image_base64": _tiny_jpeg_b64()}, timeout=60)
    assert r.status_code == 200, r.text
    doc = r.json()
    assert "id" in doc and "image_path" in doc
    pid = doc["id"]
    # List
    g = marco.get(f"{BASE_URL}/api/progress-photos", timeout=15).json()
    assert any(p["id"] == pid for p in g["photos"])
    # File fetch via Authorization header (api/files)
    f = marco.get(f"{BASE_URL}/api/files/{doc['image_path']}", timeout=30)
    assert f.status_code == 200
    assert f.headers.get("content-type", "").startswith("image/")
    # Delete
    d = marco.delete(f"{BASE_URL}/api/progress-photos/{pid}", timeout=15)
    assert d.status_code == 200
    g2 = marco.get(f"{BASE_URL}/api/progress-photos", timeout=15).json()
    assert not any(p["id"] == pid for p in g2["photos"])


# --- Shopping list PUT + /add Da ricomprare ---
def test_shopping_list_edit_and_add(marco):
    # read current
    cur = marco.get(f"{BASE_URL}/api/shopping-list", timeout=15).json() or {}
    cats = cur.get("categories") or []
    # ensure PUT accepts manual categories
    manual = cats + [{"reparto": "ZZTest", "items": [{"name": "TEST_prod", "qty": "1"}]}]
    p = marco.put(f"{BASE_URL}/api/shopping-list",
                  json={"categories": manual}, timeout=15)
    assert p.status_code == 200, p.text
    back = marco.get(f"{BASE_URL}/api/shopping-list", timeout=15).json()
    assert any(c["reparto"] == "ZZTest" for c in back["categories"])

    # /add puts in "Da ricomprare"
    r = marco.post(f"{BASE_URL}/api/shopping-list/add",
                   json={"name": "TEST_depleted_item", "reparto": "Da ricomprare"}, timeout=15)
    assert r.status_code == 200, r.text
    cats2 = r.json()["categories"]
    dare = next((c for c in cats2 if c["reparto"] == "Da ricomprare"), None)
    assert dare, "Missing 'Da ricomprare' category after /add"
    assert any(i["name"] == "TEST_depleted_item" for i in dare["items"])

    # cleanup: remove our test additions
    cleaned = [c for c in cats2 if c["reparto"] != "ZZTest"]
    cleaned = [{"reparto": c["reparto"],
                "items": [i for i in c["items"] if i["name"] != "TEST_depleted_item"]}
               for c in cleaned]
    cleaned = [c for c in cleaned if c["items"]]
    marco.put(f"{BASE_URL}/api/shopping-list", json={"categories": cleaned}, timeout=15)


# --- Supplement stock calculation ---
def test_supplement_stock_estimate(fresh_user):
    opened = (date.today() - timedelta(days=10)).isoformat()
    payload = {
        "age": 25, "sex": "M", "weight": 75, "height": 178,
        "goals": ["massa"], "dietType": "Mediterranea",
        "supplements": ["whey"],
        "supplementDetails": {
            "whey": {"variant": "isolate", "brand": "MyProtein",
                     "packageGrams": "1000", "doseGrams": "30",
                     "timesPerWeek": "4", "openedAt": opened}
        },
    }
    r = fresh_user.put(f"{BASE_URL}/api/profile", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    s = fresh_user.get(f"{BASE_URL}/api/supplements/stock", timeout=15).json()
    assert "stock" in s and len(s["stock"]) == 1
    item = s["stock"][0]
    # 1000 / (30*4/7) = 1000/17.14 ≈ 58 days total, elapsed 10 => ~48 left
    assert 55 <= item["totalDays"] <= 60, item
    assert 45 <= item["daysLeft"] <= 50, item
    assert item["low"] is False


def test_supplement_stock_low_flag(fresh_user):
    # Set a package nearly depleted => low=True
    opened = (date.today() - timedelta(days=50)).isoformat()
    r = fresh_user.put(f"{BASE_URL}/api/profile", json={
        "supplements": ["whey"],
        "supplementDetails": {
            "whey": {"variant": "isolate", "brand": "MyProtein",
                     "packageGrams": "1000", "doseGrams": "30",
                     "timesPerWeek": "4", "openedAt": opened}
        }}, timeout=15)
    assert r.status_code == 200
    s = fresh_user.get(f"{BASE_URL}/api/supplements/stock", timeout=15).json()
    item = s["stock"][0]
    assert item["low"] is True, item
    assert item["daysLeft"] <= 14


# --- Meal preferences / likes / dislikes ---
def test_meal_preferences_persist(marco, marco_backup):
    pref = {"colazione": "yogurt greco e avena", "spuntino_mattina": "banana"}
    r = marco.put(f"{BASE_URL}/api/profile",
                  json={"mealPreferences": pref,
                        "foodLikes": "patate, pesce azzurro",
                        "foodDislikes": "finocchi"}, timeout=15)
    assert r.status_code == 200, r.text
    g = marco.get(f"{BASE_URL}/api/profile", timeout=15).json()
    assert g["mealPreferences"]["colazione"] == "yogurt greco e avena"
    assert g["foodLikes"].startswith("patate")
    assert g["foodDislikes"] == "finocchi"


# --- /foods/label with generated nutrition image ---
def _nutrition_png_b64():
    img = Image.new("RGB", (600, 420), "white")
    d = ImageDraw.Draw(img)
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
        fs = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
    except Exception:
        f = fs = ImageFont.load_default()
    d.text((20, 20), "Valori nutrizionali", font=f, fill="black")
    d.text((20, 60), "per 100 g", font=fs, fill="black")
    rows = [("Energia", "163 kcal / 683 kJ"),
            ("Grassi", "10 g"),
            ("  di cui saturi", "3 g"),
            ("Carboidrati", "1.5 g"),
            ("  di cui zuccheri", "0.5 g"),
            ("Proteine", "17 g"),
            ("Sale", "0.4 g")]
    y = 110
    for k, v in rows:
        d.text((20, y), k, font=fs, fill="black")
        d.text((360, y), v, font=fs, fill="black")
        y += 36
    out = io.BytesIO(); img.save(out, format="PNG")
    return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode()


def test_foods_label_ocr(marco):
    r = marco.post(f"{BASE_URL}/api/foods/label",
                   json={"image_base64": _nutrition_png_b64()}, timeout=90)
    assert r.status_code == 200, r.text
    data = r.json()
    for k in ["kcal", "protein", "carbs", "fats"]:
        assert k in data, data
    # The AI should read ~163 kcal, 17 g protein; allow slight variance
    assert 150 <= float(data["kcal"]) <= 180, data
    assert 14 <= float(data["protein"]) <= 20, data


# --- /plan/custom-meal ---
def test_custom_meal_ai(marco):
    r = marco.post(f"{BASE_URL}/api/plan/custom-meal", json={
        "day": "Mercoledì", "mealKey": "pranzo",
        "ingredients": "mozzarella, pomodori, cetrioli e pane",
        "currentMeal": {"calories": 650, "protein": 40, "carbs": 60, "fats": 20}
    }, timeout=90)
    assert r.status_code == 200, r.text
    meal = r.json()["meal"]
    assert meal["key"] == "pranzo"
    assert meal["custom"] is True
    assert isinstance(meal.get("items"), list) and len(meal["items"]) >= 2
    assert isinstance(meal.get("calories"), (int, float))


# --- Calendar persistence ---
def test_calendar_fields_persist(marco, marco_backup):
    payload = {"dietActive": True,
               "dietStartDate": "2026-10-12T00:00:00+00:00",
               "dietEndDate": "2026-12-06"}
    r = marco.put(f"{BASE_URL}/api/profile", json=payload, timeout=15)
    assert r.status_code == 200
    g = marco.get(f"{BASE_URL}/api/profile", timeout=15).json()
    assert g["dietActive"] is True
    assert g["dietStartDate"].startswith("2026-10-12")
    assert g["dietEndDate"] == "2026-12-06"


def test_fresh_user_diet_inactive(fresh_user):
    g = fresh_user.get(f"{BASE_URL}/api/profile", timeout=15).json()
    # dietActive should be falsy/None for a fresh user that never activated
    assert not g.get("dietActive"), g.get("dietActive")
