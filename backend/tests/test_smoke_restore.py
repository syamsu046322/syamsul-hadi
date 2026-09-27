"""Smoke tests for restored KLINIK SUEL MOTOR environment.

Verifies: health, 4-role login, authenticated GET endpoints (no 500),
RBAC spot checks, and response shape validation.
Single class to respect pytest.ini addopts (-n 2 --dist loadscope).
"""
import os

import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"

CREDS = {"owner": "owner123", "kasir": "kasir123", "mekanik": "mekanik123", "partman": "partman123"}


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class TestSmokeRestore:
    tokens: dict = {}

    # ---------------- health & login ----------------
    def test_01_health_root(self):
        r = requests.get(f"{BASE_URL}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_02_login_all_roles(self):
        for role, pw in CREDS.items():
            r = requests.post(f"{BASE_URL}/auth/login", json={"username": role, "password": pw}, timeout=20)
            assert r.status_code == 200, f"login {role} -> {r.status_code}: {r.text[:200]}"
            data = r.json()
            assert data["access_token"], f"no token for {role}"
            assert data["user"]["role"] == role
            self.tokens[role] = data["access_token"]

    def test_03_login_wrong_password_401(self):
        r = requests.post(f"{BASE_URL}/auth/login", json={"username": "owner", "password": "salah"}, timeout=15)
        assert r.status_code == 401

    def test_04_auth_me(self):
        for role, tok in self.tokens.items():
            r = requests.get(f"{BASE_URL}/auth/me", headers=_h(tok), timeout=15)
            assert r.status_code == 200
            assert r.json()["username"] == role

    # ---------------- authenticated GET smoke (no 500) ----------------
    def test_05_owner_get_endpoints_no_500(self):
        tok = self.tokens["owner"]
        endpoints = [
            "/dashboard", "/parts", "/customers", "/vehicles", "/services",
            "/transactions", "/users", "/mechanics", "/stock-movements",
            "/debts", "/notifications", "/shop", "/reports/omzet",
            "/sales", "/outlets", "/expenses", "/history", "/reminders",
            "/tools", "/audit-logs", "/reports/mechanics",
        ]
        failures = []
        for ep in endpoints:
            r = requests.get(f"{BASE_URL}{ep}", headers=_h(tok), timeout=20)
            if r.status_code >= 500:
                failures.append(f"{ep} -> {r.status_code}: {r.text[:150]}")
            assert r.status_code == 200, f"{ep} -> {r.status_code}: {r.text[:200]}"
        assert not failures

    # ---------------- data shape validation ----------------
    def test_06_parts_seeded_with_shape(self):
        r = requests.get(f"{BASE_URL}/parts", headers=_h(self.tokens["partman"]), timeout=15)
        assert r.status_code == 200
        parts = r.json()
        assert len(parts) >= 6
        p = parts[0]
        for key in ("id", "code", "name", "price", "stock"):
            assert key in p, f"part missing {key}"
        assert isinstance(p["stock"], int)

    def test_07_services_seeded(self):
        r = requests.get(f"{BASE_URL}/services", headers=_h(self.tokens["owner"]), timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 6

    def test_08_dashboard_shape(self):
        r = requests.get(f"{BASE_URL}/dashboard", headers=_h(self.tokens["owner"]), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_09_transactions_list_shape(self):
        r = requests.get(f"{BASE_URL}/transactions", headers=_h(self.tokens["kasir"]), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    # ---------------- RBAC spot checks ----------------
    def test_10_rbac_kasir_cannot_list_users(self):
        r = requests.get(f"{BASE_URL}/users", headers=_h(self.tokens["kasir"]), timeout=15)
        assert r.status_code == 403

    def test_11_rbac_mekanik_cannot_stock_check(self):
        # Post-RBAC-change: mekanik is now super-worker, only kasir must be blocked from POST /stock-checks.
        r = requests.post(f"{BASE_URL}/stock-checks", headers=_h(self.tokens["kasir"]), timeout=15)
        assert r.status_code == 403

    def test_12_unauthenticated_401(self):
        r = requests.get(f"{BASE_URL}/parts", timeout=15)
        assert r.status_code == 401

    # ---------------- create->GET persistence smoke ----------------
    def test_13_create_customer_and_verify(self):
        tok = self.tokens["kasir"]
        payload = {"name": "TEST_SMOKE Pelanggan", "phone": "081200001111", "address": "Test", "notes": ""}
        r = requests.post(f"{BASE_URL}/customers", headers=_h(tok), json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text[:200]
        cid = r.json()["id"]
        g = requests.get(f"{BASE_URL}/customers?q=TEST_SMOKE", headers=_h(tok), timeout=15)
        assert g.status_code == 200
        names = [c["name"] for c in g.json()]
        assert "TEST_SMOKE Pelanggan" in names
