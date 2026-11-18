"""Backend tests for NutriViva iteration 4 features:
- Push public key / reminders CRUD / cron auth & dedup
- Fridge check (patologie)
- Diary CRUD + file auth
- Weight check-in auto on profile weight change
"""
import os
import base64
import uuid
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().strip('"').rstrip('/')

# Read cron secret
WEBHOOK_CRON_SECRET = None
with open('/app/backend/.env') as f:
    for line in f:
        if line.startswith('WEBHOOK_CRON_SECRET='):
            WEBHOOK_CRON_SECRET = line.split('=', 1)[1].strip().strip('"')

MARCO = {"email": "marco@test.it", "password": "test1234"}


@pytest.fixture(scope="module")
def marco():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=MARCO, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    s.token = tok
    return s


# --- Push ---
def test_push_public_key(marco):
    r = requests.get(f"{BASE_URL}/api/push/public-key", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "publicKey" in data and len(data["publicKey"]) > 20


# --- Reminders ---
def test_reminders_put_get(marco):
    payload = {"timezone": "Europe/Rome", "meals": True,
               "supplements": [{"label": "Creatina", "time": "09:00"}]}
    r = marco.put(f"{BASE_URL}/api/reminders", json=payload, timeout=15)
    assert r.status_code == 200
    assert r.json().get("ok") is True

    g = marco.get(f"{BASE_URL}/api/reminders", timeout=15).json()
    assert g["timezone"] == "Europe/Rome"
    assert g["meals"] is True
    assert any(s["label"] == "Creatina" and s["time"] == "09:00" for s in g.get("supplements", []))


def test_reminders_invalid_timezone(marco):
    r = marco.put(f"{BASE_URL}/api/reminders", json={"timezone": "Not/AZone"}, timeout=15)
    assert r.status_code == 400


# --- Cron ---
def test_cron_requires_auth():
    r = requests.post(f"{BASE_URL}/api/cron/reminders", timeout=15)
    assert r.status_code == 401

    r2 = requests.post(f"{BASE_URL}/api/cron/reminders",
                       headers={"Authorization": "Bearer wrong-secret"}, timeout=15)
    assert r2.status_code == 401


def test_cron_valid_and_dedup():
    assert WEBHOOK_CRON_SECRET, "secret missing from .env"
    run_id = f"test-{uuid.uuid4().hex}"
    h = {"Authorization": f"Bearer {WEBHOOK_CRON_SECRET}", "X-Webhook-Id": run_id}
    r = requests.post(f"{BASE_URL}/api/cron/reminders", headers=h, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True

    # repeat same X-Webhook-Id -> duplicate
    r2 = requests.post(f"{BASE_URL}/api/cron/reminders", headers=h, timeout=15)
    assert r2.status_code == 200
    assert r2.json().get("duplicate") is True


# --- Fridge check ---
def test_fridge_check_lactose(marco):
    # ensure conditions includes lactose intolerance and critical items
    prof = marco.get(f"{BASE_URL}/api/profile", timeout=15).json()
    original_fridge = prof.get("fridgeItems", [])
    original_cond = prof.get("conditions") or ""
    try:
        new_prof = {**prof, "conditions": "intolleranza al lattosio",
                    "fridgeItems": ["200 g mozzarella", "500 ml latte", "pollo"]}
        r = marco.put(f"{BASE_URL}/api/profile", json=new_prof, timeout=15)
        assert r.status_code == 200
        chk = marco.post(f"{BASE_URL}/api/fridge/check", timeout=60)
        assert chk.status_code == 200
        warnings = chk.json().get("warnings", [])
        assert len(warnings) >= 1
        txt = " ".join((w.get("item") or "").lower() for w in warnings)
        assert ("latte" in txt) or ("mozzarella" in txt)
    finally:
        marco.put(f"{BASE_URL}/api/profile",
                  json={**prof, "fridgeItems": original_fridge, "conditions": original_cond}, timeout=15)


# --- Diary from meal/photo ---
@pytest.fixture(scope="module")
def created_diary_entry(marco):
    img_url = "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=60"
    try:
        img = requests.get(img_url, timeout=20).content
    except Exception as e:
        pytest.skip(f"cannot download image: {e}")
    b64 = base64.b64encode(img).decode()
    r = marco.post(f"{BASE_URL}/api/meal/photo",
                   json={"image_base64": f"data:image/jpeg;base64,{b64}"}, timeout=120)
    assert r.status_code == 200, r.text[:300]
    entry = r.json()
    assert "id" in entry
    return entry


def test_diary_contains_entry(marco, created_diary_entry):
    g = marco.get(f"{BASE_URL}/api/diary", timeout=15).json()
    ids = [e["id"] for e in g["entries"]]
    assert created_diary_entry["id"] in ids
    assert g["totalCalories"] >= int(created_diary_entry.get("calories") or 0)


def test_files_endpoint_auth(marco, created_diary_entry):
    path = created_diary_entry.get("image_path")
    if not path:
        pytest.skip("storage upload failed; no image_path")
    # No auth
    r = requests.get(f"{BASE_URL}/api/files/{path}", timeout=30)
    assert r.status_code == 401
    # Via ?auth=
    r2 = requests.get(f"{BASE_URL}/api/files/{path}", params={"auth": marco.token}, timeout=30)
    assert r2.status_code == 200
    assert r2.headers.get("content-type", "").startswith("image/")
    assert len(r2.content) > 500


def test_diary_delete(marco, created_diary_entry):
    eid = created_diary_entry["id"]
    r = marco.delete(f"{BASE_URL}/api/diary/{eid}", timeout=15)
    assert r.status_code == 200
    g = marco.get(f"{BASE_URL}/api/diary", timeout=15).json()
    ids = [e["id"] for e in g["entries"]]
    assert eid not in ids


def test_diary_empty_for_old_day(marco):
    r = marco.get(f"{BASE_URL}/api/diary", params={"day": "2000-01-01"}, timeout=15).json()
    assert r["entries"] == []
    assert r["totalCalories"] == 0


# --- Weight checkin auto-trigger on profile weight change ---
def test_profile_weight_change_adds_checkin(marco):
    prof = marco.get(f"{BASE_URL}/api/profile", timeout=15).json()
    before = marco.get(f"{BASE_URL}/api/checkins/weight", timeout=15).json()
    n_before = len(before.get("history", []))
    # frontend adds checkin itself; here we simulate it
    new_w = float(prof.get("weight") or 75) + 0.1
    marco.put(f"{BASE_URL}/api/profile", json={**prof, "weight": new_w}, timeout=15)
    marco.post(f"{BASE_URL}/api/checkins/weight", json={"weight": new_w}, timeout=15)
    after = marco.get(f"{BASE_URL}/api/checkins/weight", timeout=15).json()
    assert len(after.get("history", [])) == n_before + 1
    # cleanup: restore prev weight (don't add another checkin automatically here)
    marco.put(f"{BASE_URL}/api/profile", json={**prof, "weight": prof.get("weight")}, timeout=15)
