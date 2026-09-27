"""Penggajian karyawan: CRUD gaji pokok, hak akses per jabatan, pengaturan gaji, laporan & slip (owner-only)."""
import os

import pytest
import requests

BASE = os.environ.get("API_BASE", "http://localhost:8001/api")


def login(u, p):
    r = requests.post(f"{BASE}/auth/login", json={"username": u, "password": p})
    r.raise_for_status()
    return r.json()


def headers(u, p):
    return {"Authorization": f"Bearer {login(u, p)['access_token']}"}


@pytest.fixture(scope="module")
def owner():
    return headers("owner", "owner123")


def test_login_returns_permissions_per_role():
    for u, pw in [("kasir", "kasir123"), ("mekanik", "mekanik123"), ("partman", "partman123")]:
        data = login(u, pw)
        perms = data["user"]["permissions"]
        assert isinstance(perms, list)
    # owner gets all features
    owner_perms = login("owner", "owner123")["user"]["permissions"]
    assert "antrian" in owner_perms and len(owner_perms) >= 14


def test_permissions_owner_only(owner):
    assert requests.get(f"{BASE}/permissions", headers=headers("kasir", "kasir123")).status_code == 403
    r = requests.get(f"{BASE}/permissions", headers=owner)
    assert r.status_code == 200
    body = r.json()
    assert {f["key"] for f in body["features"]}
    assert set(body["roles"]) == {"kasir", "mekanik", "partman"}


def test_permissions_update_reflects_in_me(owner):
    # remove 'belanja' from kasir, then confirm kasir /auth/me no longer has it
    cur = requests.get(f"{BASE}/permissions", headers=owner).json()["roles"]
    kasir = [k for k in cur["kasir"] if k != "belanja"]
    requests.put(f"{BASE}/permissions", json={"roles": {"kasir": kasir}}, headers=owner).raise_for_status()
    me = requests.get(f"{BASE}/auth/me", headers=headers("kasir", "kasir123")).json()
    assert "belanja" not in me["permissions"]
    # restore
    requests.put(f"{BASE}/permissions", json={"roles": {"kasir": cur["kasir"]}}, headers=owner).raise_for_status()
    me2 = requests.get(f"{BASE}/auth/me", headers=headers("kasir", "kasir123")).json()
    assert "belanja" in me2["permissions"]


def test_permissions_reject_unknown_role(owner):
    r = requests.put(f"{BASE}/permissions", json={"roles": {"owner": ["antrian"]}}, headers=owner)
    assert r.status_code == 422


def test_user_base_salary_crud(owner):
    users = requests.get(f"{BASE}/users", headers=owner).json()
    kasir = next(u for u in users if u["username"] == "kasir")
    requests.put(f"{BASE}/users/{kasir['id']}", json={"base_salary": 1500000}, headers=owner).raise_for_status()
    after = next(u for u in requests.get(f"{BASE}/users", headers=owner).json() if u["username"] == "kasir")
    assert after["base_salary"] == 1500000


def test_payroll_settings_owner_only(owner):
    assert requests.get(f"{BASE}/payroll/settings", headers=headers("mekanik", "mekanik123")).status_code == 403
    requests.put(f"{BASE}/payroll/settings", json={"bonus_per_unit": 10000, "owner_draw": 5000000}, headers=owner).raise_for_status()
    s = requests.get(f"{BASE}/payroll/settings", headers=owner).json()
    assert s["bonus_per_unit"] == 10000 and s["owner_draw"] == 5000000


def test_payroll_report_structure(owner):
    r = requests.get(f"{BASE}/payroll/report", headers=owner)
    assert r.status_code == 200
    body = r.json()
    assert "rows" in body and body["rows"]
    owner_row = next(x for x in body["rows"] if x["role"] == "owner")
    assert owner_row["base_salary"] == 5000000 and owner_row["bonus_total"] == 0
    kasir_row = next(x for x in body["rows"] if x["role"] == "kasir")
    assert kasir_row["base_salary"] == 1500000 and kasir_row["bonus_total"] == 0
    mek_row = next(x for x in body["rows"] if x["role"] == "mekanik")
    # bonus_total = unit_count * bonus_per_unit
    assert mek_row["bonus_total"] == mek_row["unit_count"] * mek_row["bonus_per_unit"]
    assert body["grand_total"] == sum(x["total"] for x in body["rows"])


def test_payroll_report_forbidden_for_non_owner():
    assert requests.get(f"{BASE}/payroll/report", headers=headers("partman", "partman123")).status_code == 403


def test_payroll_slip(owner):
    mek = next(u for u in requests.get(f"{BASE}/users", headers=owner).json() if u["username"] == "mekanik")
    r = requests.get(f"{BASE}/payroll/slip/{mek['id']}", headers=owner)
    assert r.status_code == 200
    s = r.json()
    assert s["user"]["role"] == "mekanik"
    assert s["total"] == s["base_salary"] + s["bonus_total"]
    assert isinstance(s["units"], list)
    assert requests.get(f"{BASE}/payroll/slip/{mek['id']}", headers=headers("kasir", "kasir123")).status_code == 403
