"""Iteration 5 backend tests for NutriViva:
- Supplement details & training days in profile
- Food search (/api/foods/search) with custom DB + OFF
- Food barcode lookup (/api/foods/barcode/{code}) - custom + OFF
- Custom food insertion (/api/foods/custom) & retrieval
- Fridge expiry chip format preserved
- Plan already has dayType + brandedItems (do not regenerate)
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().strip('"').rstrip('/')

MARCO = {"email": "marco@test.it", "password": "test1234"}


@pytest.fixture(scope="module")
def marco():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=MARCO, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


# ---------- Profile: supplementDetails + trainingDays ----------
def test_profile_has_supplement_details_and_training_days(marco):
    prof = marco.get(f"{BASE_URL}/api/profile", timeout=15).json()
    details = prof.get("supplementDetails") or {}
    tdays = prof.get("trainingDays") or []
    assert isinstance(details, dict), "supplementDetails must be an object"
    assert isinstance(tdays, list) and len(tdays) >= 1, "trainingDays must be a non-empty list for marco"
    # marco seeded with whey + creatine
    joined = " ".join([f"{v.get('variant','')} {v.get('brand','')}".lower() for v in details.values()])
    assert "isolate" in joined or "myprotein" in joined or "whey" in joined, f"expected whey details, got {details}"
    assert "creapure" in joined or "prozis" in joined or "monoidrato" in joined, f"expected creatine details, got {details}"


def test_profile_update_persists_supplement_details(marco):
    prof = marco.get(f"{BASE_URL}/api/profile", timeout=15).json()
    original = prof.get("supplementDetails") or {}
    try:
        new_details = {**original, "TEST_sup": {"variant": "Idrolizzata", "brand": "TEST_BrandX"}}
        payload = {**prof, "supplementDetails": new_details}
        r = marco.put(f"{BASE_URL}/api/profile", json=payload, timeout=15)
        assert r.status_code == 200
        back = marco.get(f"{BASE_URL}/api/profile", timeout=15).json()
        assert back["supplementDetails"].get("TEST_sup", {}).get("brand") == "TEST_BrandX"
    finally:
        marco.put(f"{BASE_URL}/api/profile", json={**prof, "supplementDetails": original}, timeout=15)


# ---------- Plan: dayType + brandedItems ----------
def test_plan_days_have_daytype_and_branded(marco):
    resp = marco.get(f"{BASE_URL}/api/plan", timeout=15).json()
    plan = resp.get("plan") or resp
    assert plan and plan.get("days"), "marco should already have a plan"
    days = plan["days"]
    assert any(d.get("dayType") in ("allenamento", "riposo") for d in days), "no dayType present"
    # at least one branded item somewhere
    branded_count = 0
    for d in days:
        for m in d.get("meals", []):
            for b in (m.get("brandedItems") or []):
                assert "name" in b and "grams" in b and "kcal" in b
                branded_count += 1
    assert branded_count >= 1, "plan should contain at least one brandedItem"


# ---------- Food search ----------
def test_food_search_known_item(marco):
    r = marco.get(f"{BASE_URL}/api/foods/search", params={"q": "yogurt greco"}, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "results" in data
    assert len(data["results"]) >= 1, "expected OFF results for 'yogurt greco'"
    first = data["results"][0]
    for k in ("name", "kcal"):
        assert k in first


def test_food_search_nonexistent(marco):
    r = marco.get(f"{BASE_URL}/api/foods/search", params={"q": "xqzprodottoinesistente123"}, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data.get("results") == [] or len(data["results"]) == 0


# ---------- Barcode lookup ----------
def test_barcode_known_milbona(marco):
    # 20097776 is a Milbona product according to the review brief
    r = marco.get(f"{BASE_URL}/api/foods/barcode/20097776", timeout=30)
    assert r.status_code == 200
    data = r.json()
    if not data.get("found"):
        pytest.skip("OFF offline or product gone; non-deterministic external API")
    p = data["product"]
    assert p and "name" in p and "kcal" in p
    name_brand = f"{p.get('name','')} {p.get('brand','')}".lower()
    assert "milbona" in name_brand or p.get("brand"), f"expected brand info, got {p}"


def test_barcode_unknown_returns_not_found(marco):
    r = marco.get(f"{BASE_URL}/api/foods/barcode/8000000099999", timeout=30)
    assert r.status_code == 200
    data = r.json()
    # should be not found so UI shows the custom-food-form
    assert data.get("found") in (False, None) or data.get("product") is None


# ---------- Custom food creation & persistence ----------
def test_custom_food_insert_and_retrieve(marco):
    unique_code = f"TESTCODE{uuid.uuid4().hex[:8]}"
    payload = {
        "code": unique_code,
        "name": f"TEST_CustomFood_{unique_code}",
        "brand": "TEST_Brand",
        "kcal": 321,
        "protein": 20.5,
        "carbs": 30.1,
        "fats": 10.2,
    }
    r = marco.post(f"{BASE_URL}/api/foods/custom", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is True
    # barcode lookup now returns found
    r2 = marco.get(f"{BASE_URL}/api/foods/barcode/{unique_code}", timeout=15)
    assert r2.status_code == 200
    data2 = r2.json()
    assert data2.get("found") is True
    assert data2["product"]["name"] == payload["name"]
    assert data2["product"]["kcal"] == 321
    # search by name finds it
    r3 = marco.get(f"{BASE_URL}/api/foods/search", params={"q": payload["name"]}, timeout=20)
    assert r3.status_code == 200
    names = [x.get("name") for x in r3.json().get("results", [])]
    assert payload["name"] in names


# ---------- Fridge expiry chip format preserved on save ----------
def test_fridge_expiry_chip_persists(marco):
    prof = marco.get(f"{BASE_URL}/api/profile", timeout=15).json()
    original = prof.get("fridgeItems", [])
    try:
        test_item = "TEST_itemX (scade il 2026-12-31)"
        new_items = original + [test_item]
        r = marco.put(f"{BASE_URL}/api/profile", json={**prof, "fridgeItems": new_items}, timeout=15)
        assert r.status_code == 200
        back = marco.get(f"{BASE_URL}/api/profile", timeout=15).json()
        assert test_item in back["fridgeItems"]
    finally:
        marco.put(f"{BASE_URL}/api/profile", json={**prof, "fridgeItems": original}, timeout=15)
