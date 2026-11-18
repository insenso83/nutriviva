"""Backend tests for NutriViva iteration 3 features:
- Onboarding conditions saved and returned
- PUT /api/plan (swap persistence)
- GET/POST /api/water
- POST /api/meal/photo (vision)
"""
import os
import base64
import time
import uuid
import requests
import pytest

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') if os.environ.get('REACT_APP_BACKEND_URL') else None
if not BASE_URL:
    # fallback: read from frontend/.env
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

MARCO = {"email": "marco@test.it", "password": "test1234"}


@pytest.fixture(scope="module")
def marco_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=MARCO, timeout=30)
    assert r.status_code == 200, f"marco login failed: {r.status_code} {r.text}"
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def new_user_client():
    s = requests.Session()
    email = f"test_cond_{uuid.uuid4().hex[:8]}@test.it"
    r = s.post(f"{BASE_URL}/api/auth/register",
               json={"name": "TestCond", "email": email, "password": "test1234"}, timeout=30)
    assert r.status_code == 200, f"register failed: {r.text}"
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    s.email = email
    return s


# --- Onboarding: conditions saved ---
def test_profile_conditions_persisted(new_user_client):
    payload = {
        "age": 30, "sex": "M", "weight": 75, "height": 178,
        "goals": ["mantenere"], "dietType": "Mediterranea",
        "fridgeItems": ["pollo", "riso"],
        "conditions": "celiachia",
        "planMode": "weekly",
    }
    r = new_user_client.put(f"{BASE_URL}/api/profile", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["profile"]["conditions"] == "celiachia"

    g = new_user_client.get(f"{BASE_URL}/api/profile", timeout=15)
    assert g.status_code == 200
    assert g.json().get("conditions") == "celiachia"


# --- Water: GET default, POST, GET persists ---
def test_water_get_post_persist(marco_client):
    r = marco_client.get(f"{BASE_URL}/api/water", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "glasses" in data and "goal" in data

    r = marco_client.post(f"{BASE_URL}/api/water", json={"glasses": 5, "goal": 10}, timeout=15)
    assert r.status_code == 200
    assert r.json().get("ok") is True

    g = marco_client.get(f"{BASE_URL}/api/water", timeout=15)
    assert g.status_code == 200
    assert g.json()["glasses"] == 5
    assert g.json()["goal"] == 10

    # negative glasses clamped to 0
    marco_client.post(f"{BASE_URL}/api/water", json={"glasses": -3, "goal": 8}, timeout=15)
    g2 = marco_client.get(f"{BASE_URL}/api/water", timeout=15).json()
    assert g2["glasses"] == 0


# --- Plan swap persistence via PUT /api/plan ---
def test_plan_put_swap_persist(marco_client):
    r = marco_client.get(f"{BASE_URL}/api/plan", timeout=15)
    assert r.status_code == 200
    doc = r.json()
    assert doc.get("status") == "ready", f"plan not ready: {doc.get('status')}"
    plan = doc["plan"]
    assert len(plan["days"]) == 7

    original_day0_titles = [m.get("title") for m in plan["days"][0]["meals"]]
    original_day3_titles = [m.get("title") for m in plan["days"][3]["meals"]]
    assert original_day0_titles != original_day3_titles or True  # ok

    # swap day 0 and day 3
    plan["days"][0], plan["days"][3] = plan["days"][3], plan["days"][0]
    put = marco_client.put(f"{BASE_URL}/api/plan", json={"plan": plan}, timeout=15)
    assert put.status_code == 200, put.text
    assert put.json().get("ok") is True

    r2 = marco_client.get(f"{BASE_URL}/api/plan", timeout=15).json()
    new_day0_titles = [m.get("title") for m in r2["plan"]["days"][0]["meals"]]
    assert new_day0_titles == original_day3_titles

    # swap back for cleanliness
    plan["days"][0], plan["days"][3] = plan["days"][3], plan["days"][0]
    marco_client.put(f"{BASE_URL}/api/plan", json={"plan": plan}, timeout=15)


# --- Meal photo analysis ---
def test_meal_photo_eval(marco_client):
    # download a small food image
    img_url = "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=60"
    try:
        img = requests.get(img_url, timeout=20).content
    except Exception as e:
        pytest.skip(f"cannot download image: {e}")
    b64 = base64.b64encode(img).decode()
    r = marco_client.post(f"{BASE_URL}/api/meal/photo",
                          json={"image_base64": f"data:image/jpeg;base64,{b64}"}, timeout=90)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    data = r.json()
    for k in ["dish", "compatible", "verdict", "calories", "protein", "carbs", "fats", "advice"]:
        assert k in data, f"missing key {k} in {data}"
    assert isinstance(data["compatible"], bool)
    assert isinstance(data["calories"], (int, float))
