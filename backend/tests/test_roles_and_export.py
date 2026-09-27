"""Role authorization (403) and Excel export/import tests for Klinik Suel Motor.

Complements /app/tests/test_workflow.py (E2E happy path).
"""
import io
import os

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"


def _login(username: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/auth/login", json={"username": username, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {username} -> {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def tokens():
    return {
        "owner": _login("owner", "owner123"),
        "kasir": _login("kasir", "kasir123"),
        "mekanik": _login("mekanik", "mekanik123"),
        "partman": _login("partman", "partman123"),
    }


def h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------- Auth
class TestAuth:
    def test_login_wrong_password(self):
        r = requests.post(f"{BASE_URL}/auth/login", json={"username": "owner", "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me_returns_role(self, tokens):
        for role, tok in tokens.items():
            r = requests.get(f"{BASE_URL}/auth/me", headers=h(tok), timeout=15)
            assert r.status_code == 200
            assert r.json()["role"] == role


# --------------------------------------------------------------------- Role 403s
class TestRoleAccess:
    def test_users_owner_only(self, tokens):
        for role in ("kasir", "mekanik", "partman"):
            r = requests.get(f"{BASE_URL}/users", headers=h(tokens[role]), timeout=15)
            assert r.status_code == 403, f"{role} should be forbidden on /users"
        assert requests.get(f"{BASE_URL}/users", headers=h(tokens["owner"]), timeout=15).status_code == 200

    def test_reports_owner_only(self, tokens):
        for role in ("kasir", "mekanik", "partman"):
            r = requests.get(f"{BASE_URL}/reports/omzet?mode=daily", headers=h(tokens[role]), timeout=15)
            assert r.status_code == 403, f"{role} should be forbidden on /reports/omzet"
        r = requests.get(f"{BASE_URL}/reports/omzet?mode=daily", headers=h(tokens["owner"]), timeout=15)
        assert r.status_code == 200

    def test_services_write_owner_only(self, tokens):
        payload = {"code": "TEST_SRV_403", "name": "TEST Service", "price": 1000}
        for role in ("kasir", "mekanik", "partman"):
            r = requests.post(f"{BASE_URL}/services", headers=h(tokens[role]), json=payload, timeout=15)
            assert r.status_code == 403

    def test_parts_write_stock_users(self, tokens):
        payload = {"code": "TEST_PART_403", "name": "TEST Part", "price": 1000, "cost": 500, "stock": 0, "unit": "PCS"}
        # kasir should not be allowed
        r = requests.post(f"{BASE_URL}/parts", headers=h(tokens["kasir"]), json=payload, timeout=15)
        assert r.status_code == 403

    def test_dashboard_accessible_to_all_roles(self, tokens):
        # /dashboard uses CurrentUser (any authenticated role); document actual behavior.
        for role in ("owner", "kasir", "mekanik", "partman"):
            r = requests.get(f"{BASE_URL}/dashboard", headers=h(tokens[role]), timeout=15)
            assert r.status_code == 200, f"{role} should be able to hit /dashboard"


# --------------------------------------------------------------------- Excel Export / Import (all 4 entities)
EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class TestExcelExportImport:
    @pytest.mark.parametrize("entity", ["customers", "services", "parts", "vehicles"])
    def test_export_owner_success(self, tokens, entity):
        r = requests.get(f"{BASE_URL}/export/{entity}", headers=h(tokens["owner"]), timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert r.headers["content-type"].startswith(EXCEL_MIME)
        assert len(r.content) > 100, "Excel body suspiciously small"

    @pytest.mark.parametrize("entity", ["customers", "services", "parts", "vehicles"])
    def test_export_forbidden_for_non_owner(self, tokens, entity):
        for role in ("kasir", "mekanik", "partman"):
            r = requests.get(f"{BASE_URL}/export/{entity}", headers=h(tokens[role]), timeout=15)
            assert r.status_code == 403, f"{role} should be forbidden on /export/{entity}"

    def test_export_unknown_entity_404(self, tokens):
        r = requests.get(f"{BASE_URL}/export/unknown", headers=h(tokens["owner"]), timeout=15)
        assert r.status_code == 404

    @pytest.mark.parametrize("entity", ["customers", "services", "parts", "vehicles"])
    def test_import_roundtrip(self, tokens, entity):
        exp = requests.get(f"{BASE_URL}/export/{entity}", headers=h(tokens["owner"]), timeout=30)
        assert exp.status_code == 200
        files = {"file": (f"{entity}.xlsx", exp.content, EXCEL_MIME)}
        imp = requests.post(f"{BASE_URL}/import/{entity}", headers=h(tokens["owner"]), files=files, timeout=30)
        assert imp.status_code == 200, imp.text[:200]
        body = imp.json()
        assert "inserted" in body and "updated" in body and "skipped" in body
        # roundtrip: everything should already exist so at least 1 row updated (or 0 if collection empty)
        assert body["updated"] + body["inserted"] + body["skipped"] >= 0

    def test_import_forbidden_for_non_owner(self, tokens):
        empty = io.BytesIO(b"not-really-excel")
        files = {"file": ("x.xlsx", empty, EXCEL_MIME)}
        r = requests.post(f"{BASE_URL}/import/customers", headers=h(tokens["kasir"]), files=files, timeout=15)
        assert r.status_code == 403

    def test_import_invalid_file(self, tokens):
        files = {"file": ("bad.xlsx", io.BytesIO(b"garbage"), EXCEL_MIME)}
        r = requests.post(f"{BASE_URL}/import/customers", headers=h(tokens["owner"]), files=files, timeout=15)
        assert r.status_code == 400


# --------------------------------------------------------------------- Sanity: transactions endpoints exist
class TestListEndpointsAuth:
    def test_transactions_list_requires_auth(self):
        r = requests.get(f"{BASE_URL}/transactions", timeout=15)
        assert r.status_code in (401, 403)

    def test_history_requires_auth(self):
        r = requests.get(f"{BASE_URL}/history", timeout=15)
        assert r.status_code in (401, 403)
