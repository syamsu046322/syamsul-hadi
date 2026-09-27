"""Cek fisik: urutan rak ascending; Hapus Data Percobaan (owner) menjaga master."""
import os

import pytest
import requests

BASE = os.environ.get("API_BASE", "http://localhost:8001/api")


def login(u, p):
    r = requests.post(f"{BASE}/auth/login", json={"username": u, "password": p})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def owner():
    return login("owner", "owner123")


def test_rack_sort_key_order():
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from server import rack_sort_key
    xs = ["B1", "A10", "A2", "A1.01", "A1.2", "", "1", "10", "2", "R2-3", "R2-10", None]
    assert sorted(xs, key=rack_sort_key) == ["1", "2", "10", "A1.01", "A1.2", "A2", "A10", "B1", "R2-3", "R2-10", "", None]


def test_stock_check_items_sorted_by_rack(owner):
    h = owner
    parts = requests.get(f"{BASE}/parts", headers=h).json()
    racks = ["B2", "A10", "A2", "", "1", "A1"]
    for p, rk in zip(parts, racks):
        body = {k: p.get(k, "") for k in ("code", "name", "barcode", "price", "cost", "stock", "min_stock", "unit", "active")}
        body["rack"] = rk
        requests.put(f"{BASE}/parts/{p['id']}", json=body, headers=h).raise_for_status()
    chk = requests.post(f"{BASE}/stock-checks", json={}, headers=h).json()
    det = requests.get(f"{BASE}/stock-checks/{chk['id']}", headers=h).json()
    seen = [i["rack"] for i in det["items"] if i["part_id"] in {p["id"] for p in parts[: len(racks)]}]
    assert seen == ["1", "A1", "A2", "A10", "B2", ""]
    requests.post(f"{BASE}/stock-checks/{chk['id']}/finish", json={}, headers=h)


def test_reset_trial_data_requires_owner_password(owner):
    r = requests.post(f"{BASE}/admin/reset-trial-data", json={"owner_password": "salah"}, headers=owner)
    assert r.status_code == 400
    r = requests.post(f"{BASE}/admin/reset-trial-data", json={"owner_password": "owner123"}, headers=login("kasir", "kasir123"))
    assert r.status_code == 403


def test_reset_trial_data_keeps_master(owner):
    h = owner
    parts_before = requests.get(f"{BASE}/parts", headers=h).json()
    services_before = requests.get(f"{BASE}/services", headers=h).json()
    users_before = requests.get(f"{BASE}/users", headers=h).json()
    r = requests.post(f"{BASE}/admin/reset-trial-data", json={"owner_password": "owner123"}, headers=h)
    assert r.status_code == 200 and r.json()["ok"]
    assert requests.get(f"{BASE}/transactions", headers=h).json() == []
    assert requests.get(f"{BASE}/sales", headers=h).json() == []
    assert requests.get(f"{BASE}/stock-movements", headers=h).json() == []
    assert requests.get(f"{BASE}/customers", headers=h).json() == []
    assert requests.get(f"{BASE}/vehicles", headers=h).json() == []
    assert requests.get(f"{BASE}/expenses", headers=h).json() == []
    assert requests.get(f"{BASE}/stock-checks", headers=h).json() == []
    parts_after = requests.get(f"{BASE}/parts", headers=h).json()
    assert len(parts_after) == len(parts_before) and all(p["stock"] == 0 for p in parts_after)
    assert len(requests.get(f"{BASE}/services", headers=h).json()) == len(services_before)
    assert len(requests.get(f"{BASE}/users", headers=h).json()) == len(users_before)
    assert requests.get(f"{BASE}/dashboard", headers=h).json()["omzet_hari_ini"] == 0
