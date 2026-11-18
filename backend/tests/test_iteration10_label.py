# Iteration 10: nutrition label scan (POST /api/foods/label)
import base64
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
IMG = "/tmp/label.png"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "marco@test.it", "password": "test1234"})
    if r.status_code != 200:
        pytest.skip("login failed")
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def _b64():
    with open(IMG, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode()


# Label reading: values extracted from Fage test image
def test_label_read_values(client):
    r = client.post(f"{BASE_URL}/api/foods/label", json={"image_base64": _b64()}, timeout=120)
    assert r.status_code == 200, r.text
    d = r.json()
    print(d)
    for k in ["name", "brand", "kcal", "protein", "carbs", "fats", "unitGrams", "estimated"]:
        assert k in d
    assert "yogurt" in d["name"].lower()
    assert "fage" in (d["brand"] or "").lower()
    assert float(d["kcal"]) == 54
    assert float(d["protein"]) == 10
    assert float(d["carbs"]) == 3
    assert float(d["fats"]) == 0
    assert float(d["unitGrams"]) == 170
    assert isinstance(d["estimated"], list)


# Invalid image -> 400
def test_label_invalid_image(client):
    r = client.post(f"{BASE_URL}/api/foods/label", json={"image_base64": "data:image/png;base64,bm90YW5pbWFnZQ=="}, timeout=60)
    assert r.status_code == 400


# Auth required
def test_label_requires_auth():
    r = requests.post(f"{BASE_URL}/api/foods/label", json={"image_base64": "abc"}, timeout=30)
    assert r.status_code in (401, 403)


# Not saved to custom foods DB
def test_label_not_saved_to_custom_foods(client):
    r = client.get(f"{BASE_URL}/api/foods/custom", timeout=30)
    if r.status_code != 200:
        pytest.skip(f"custom foods endpoint status {r.status_code}")
    assert "fage" not in r.text.lower()
