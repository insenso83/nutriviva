"""Iteration 8 backend tests for NutriViva:
- POST /api/supplements/{sid}/to-shopping (manual supp -> shopping Integratori)
- GET/POST/DELETE /api/favorites
- POST /api/plan/eat-out rebalance (future day only; UI test uses Giovedì)
- POST /api/cron/reminders Bearer auth & calls send_start_reminders/send_stock_alerts
"""
import os
import time
import uuid
import requests
import pytest


def _read_env(path, key):
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith(f"{key}="):
                v = line.split("=", 1)[1].strip()
                return v.strip('"').strip("'")
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env("/app/frontend/.env", "REACT_APP_BACKEND_URL")).rstrip("/")
WEBHOOK_CRON_SECRET = _read_env("/app/backend/.env", "WEBHOOK_CRON_SECRET")

MARCO = {"email": "marco@test.it", "password": "test1234"}


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def marco():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=MARCO, timeout=30)
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return s


# ---------- supplements to shopping ----------
def test_supp_to_shopping_whey(marco):
    r = marco.post(f"{BASE_URL}/api/supplements/whey/to-shopping", timeout=30)
    assert r.status_code == 200, r.text
    cats = r.json().get("categories") or []
    integ = next((c for c in cats if c.get("reparto") == "Integratori"), None)
    assert integ, f"'Integratori' category missing. Got: {[c.get('reparto') for c in cats]}"
    # Marco has brand=MyProtein variant=Isolate whey (per iter7)
    names = [i.get("name", "") for i in integ["items"]]
    assert any("Proteine" in n for n in names), f"Proteine not in {names}"
    # qty should be package grams if set
    whey_items = [i for i in integ["items"] if "Proteine" in i.get("name", "")]
    assert whey_items and whey_items[0].get("qty"), f"qty missing: {whey_items}"

    # verify GET /api/shopping-list persists it
    g = marco.get(f"{BASE_URL}/api/shopping-list", timeout=15)
    assert g.status_code == 200
    gcats = (g.json().get("data") or {}).get("categories") or g.json().get("categories") or []
    integ2 = next((c for c in gcats if c.get("reparto") == "Integratori"), None)
    assert integ2, f"after GET, Integratori missing: {gcats}"


# ---------- favorites CRUD ----------
def test_favorites_crud(marco):
    unique_title = f"TEST_FavMeal_{uuid.uuid4().hex[:6]}"
    meal = {"key": "pranzo", "title": unique_title, "items": ["riso", "pollo"],
            "recipe": "cuocere e servire", "calories": 450, "protein": 35, "carbs": 50, "fats": 10}
    r = marco.post(f"{BASE_URL}/api/favorites", json={"meal": meal}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True

    g = marco.get(f"{BASE_URL}/api/favorites", timeout=15)
    assert g.status_code == 200
    favs = g.json().get("favorites") or []
    mine = next((f for f in favs if f["title"] == unique_title), None)
    assert mine, f"created favorite not returned: titles={[f['title'] for f in favs]}"
    assert mine["calories"] == 450 and mine["protein"] == 35
    assert mine["items"] == ["riso", "pollo"]
    fid = mine["id"]

    # idempotent upsert (second POST same title)
    r2 = marco.post(f"{BASE_URL}/api/favorites", json={"meal": meal}, timeout=15)
    assert r2.status_code == 200
    g2 = marco.get(f"{BASE_URL}/api/favorites", timeout=15).json().get("favorites") or []
    count = sum(1 for f in g2 if f["title"] == unique_title)
    assert count == 1, f"duplicate created: {count}"

    # delete
    d = marco.delete(f"{BASE_URL}/api/favorites/{fid}", timeout=15)
    assert d.status_code == 200
    g3 = marco.get(f"{BASE_URL}/api/favorites", timeout=15).json().get("favorites") or []
    assert not any(f["title"] == unique_title for f in g3), "fav not deleted"


def test_favorites_requires_title(marco):
    r = marco.post(f"{BASE_URL}/api/favorites", json={"meal": {"calories": 100}}, timeout=15)
    assert r.status_code == 400


# ---------- plan eat-out rebalance ----------
def test_eat_out_rebalance_giovedi(marco):
    # fetch plan, remember Giovedì meals BEFORE
    p = marco.get(f"{BASE_URL}/api/plan", timeout=30).json()
    plan = p.get("plan") or {}
    gio = next((d for d in plan.get("days", []) if d.get("day") == "Giovedì"), None)
    assert gio, "Giovedì day missing in plan"
    order = ["colazione", "spuntino_mattina", "pranzo", "spuntino_pomeriggio", "cena", "pre_nanna"]
    before = {m.get("key"): m.get("title") for m in gio.get("meals", [])}
    pre_idx = order.index("pranzo")
    before_prev = {k: v for k, v in before.items() if k in order and order.index(k) < pre_idx}

    r = marco.post(f"{BASE_URL}/api/plan/eat-out",
                   json={"day": "Giovedì", "mealKey": "pranzo",
                         "description": "pizza margherita e una birra media"},
                   timeout=120)
    assert r.status_code == 200, r.text[:400]
    body = r.json()
    day = body.get("day") or {}
    meals = {m.get("key"): m for m in day.get("meals", [])}

    # pranzo marked as eatOut and title starts with Fuori casa
    assert meals.get("pranzo", {}).get("eatOut") is True
    assert "fuori casa" in (meals["pranzo"].get("title") or "").lower(), meals["pranzo"].get("title")

    # later meals (cena, pre_nanna, spuntino_pomeriggio) must be rebalanced=True (not libero)
    later_keys = [k for k in ["spuntino_pomeriggio", "cena", "pre_nanna"] if k in meals]
    assert later_keys, "no later meals present"
    for k in later_keys:
        if meals[k].get("libero"):
            continue
        assert meals[k].get("rebalanced") is True, f"{k} not rebalanced: {meals[k].get('title')}"

    # previous meals (colazione, spuntino_mattina) must be unchanged
    for k, title in before_prev.items():
        assert meals.get(k, {}).get("title") == title, f"previous meal {k} changed: {title} -> {meals.get(k, {}).get('title')}"
        assert not meals.get(k, {}).get("rebalanced"), f"previous {k} wrongly rebalanced"
        assert not meals.get(k, {}).get("eatOut"), f"previous {k} wrongly eatOut"

    # persistence: re-GET /api/plan and verify Giovedì persists
    p2 = marco.get(f"{BASE_URL}/api/plan", timeout=30).json()
    gio2 = next((d for d in (p2.get("plan") or {}).get("days", []) if d.get("day") == "Giovedì"), None)
    meals2 = {m.get("key"): m for m in gio2.get("meals", [])}
    assert meals2.get("pranzo", {}).get("eatOut") is True
    assert any(meals2.get(k, {}).get("rebalanced") for k in later_keys if not meals2.get(k, {}).get("libero"))


# ---------- cron/reminders ----------
def test_cron_reminders_requires_auth():
    r = requests.post(f"{BASE_URL}/api/cron/reminders", timeout=15)
    assert r.status_code == 401
    r2 = requests.post(f"{BASE_URL}/api/cron/reminders",
                       headers={"Authorization": "Bearer wrong"}, timeout=15)
    assert r2.status_code == 401


def test_cron_reminders_ok_and_no_backend_errors():
    assert WEBHOOK_CRON_SECRET, "WEBHOOK_CRON_SECRET missing from /app/backend/.env"
    # Reset err.log position
    err_path = "/var/log/supervisor/backend.err.log"
    try:
        start_size = os.path.getsize(err_path)
    except FileNotFoundError:
        start_size = 0
    run_id = f"test-it8-{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{BASE_URL}/api/cron/reminders",
                      headers={"Authorization": f"Bearer {WEBHOOK_CRON_SECRET}",
                               "X-Webhook-Id": run_id}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
    # Give background task time to execute
    time.sleep(3)
    # Read any new log lines
    try:
        with open(err_path, "r") as f:
            f.seek(start_size)
            new_log = f.read()
    except FileNotFoundError:
        new_log = ""
    # No exceptions related to stock/start/reminders handlers
    bad_markers = ["stock alerts failed", "start reminders failed", "Traceback"]
    hits = [m for m in bad_markers if m in new_log]
    assert not hits, f"Errors in backend logs after cron: {hits}\n---\n{new_log[-2000:]}"

    # Idempotency with same X-Webhook-Id
    r2 = requests.post(f"{BASE_URL}/api/cron/reminders",
                       headers={"Authorization": f"Bearer {WEBHOOK_CRON_SECRET}",
                                "X-Webhook-Id": run_id}, timeout=15)
    assert r2.status_code == 200
    assert r2.json().get("duplicate") is True
