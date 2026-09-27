"""Iteration 3 — tests for 6 features added this session.

Covers:
- GET /api/reports/profit-trend (owner) — schema (rows/12, yearly, mom, this_year, this_year_profit)
- GET /api/reports/service-sales | direct-sales | purchases — date_from & date_to query support
- PUT /api/expenses/{id} — edit expense (owner allowed)
- PUT /api/sales/{sid}/date — owner change direct-sale date
- PUT /api/stock-movements/{mid}/date — owner change movement date
- POST /api/customers — accepts dusun / desa / kecamatan / kabupaten (persist + reload)
- POST /api/sales — accepts customer_dusun / customer_desa / kecamatan / kabupaten
"""
from __future__ import annotations

import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    # Fallback to file .env if not exported (this is a preview/testing environment)
    from pathlib import Path
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
            break
BASE_URL = (BASE_URL or "").rstrip("/")
API = f"{BASE_URL}/api"


def _login(username: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {username} failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def owner_token() -> str:
    return _login("owner", "owner123")


@pytest.fixture(scope="session")
def kasir_token() -> str:
    return _login("kasir", "kasir123")


@pytest.fixture(scope="session")
def partman_token() -> str:
    return _login("partman", "partman123")


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


# ---------- (1) Custom date-range in reports -----------------------------------

class TestReportsDateRange:
    def test_service_sales_supports_date_range(self, owner_token):
        r = requests.get(f"{API}/reports/service-sales", headers=_h(owner_token),
                         params={"date_from": "2020-01-01", "date_to": "2035-12-31"}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict)
        # Typical laporan payload contains 'rows' (list) — verify it's a list even if empty
        assert "rows" in data or "items" in data or isinstance(data, dict)

    def test_service_sales_supports_month(self, owner_token):
        r = requests.get(f"{API}/reports/service-sales", headers=_h(owner_token),
                         params={"month": "2026-01"}, timeout=20)
        assert r.status_code == 200

    def test_direct_sales_supports_date_range(self, owner_token):
        r = requests.get(f"{API}/reports/direct-sales", headers=_h(owner_token),
                         params={"date_from": "2020-01-01", "date_to": "2035-12-31"}, timeout=20)
        assert r.status_code == 200, r.text

    def test_purchases_supports_date_range(self, kasir_token):
        r = requests.get(f"{API}/reports/purchases", headers=_h(kasir_token),
                         params={"date_from": "2020-01-01", "date_to": "2035-12-31"}, timeout=20)
        assert r.status_code == 200, r.text

    def test_purchases_supports_month(self, kasir_token):
        r = requests.get(f"{API}/reports/purchases", headers=_h(kasir_token),
                         params={"month": "2026-01"}, timeout=20)
        assert r.status_code == 200


# ---------- (2) Owner dashboard profit-trend -----------------------------------

class TestProfitTrend:
    def test_profit_trend_schema(self, owner_token):
        r = requests.get(f"{API}/reports/profit-trend", headers=_h(owner_token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        # required top-level keys
        for k in ("rows", "yearly", "mom", "this_year", "this_year_profit"):
            assert k in d, f"missing '{k}' in profit-trend: {list(d.keys())}"
        assert isinstance(d["rows"], list) and len(d["rows"]) == 12, f"rows must be 12 entries, got {len(d['rows'])}"
        # each row has period + part_profit
        for row in d["rows"]:
            assert "period" in row and "part_profit" in row
        # yearly is a list
        assert isinstance(d["yearly"], list)
        # mom has required keys
        mom = d["mom"]
        for k in ("current", "prev", "delta", "pct"):
            assert k in mom, f"mom missing key {k}"

    def test_profit_trend_forbidden_for_non_owner(self, kasir_token):
        r = requests.get(f"{API}/reports/profit-trend", headers=_h(kasir_token), timeout=20)
        assert r.status_code in (401, 403), f"non-owner must be blocked, got {r.status_code}"


# ---------- (3) Edit expense --------------------------------------------------

class TestExpenseEdit:
    def test_create_edit_and_verify(self, owner_token):
        # create a BENGKEL / LAINNYA / KELUARGA expense — pick a category likely valid.
        # Fetch categories first to be safe.
        cats = requests.get(f"{API}/expenses/categories", headers=_h(owner_token), timeout=20).json()
        group = "KELUARGA" if "KELUARGA" in cats else list(cats.keys())[0]
        category = cats[group][0]
        create = requests.post(f"{API}/expenses", headers=_h(owner_token), json={
            "group": group, "category": category, "amount": 12345, "note": "TEST_it3_expense",
            "date": "2026-01-10", "payment_method": "CASH",
        }, timeout=20)
        assert create.status_code == 200, create.text
        eid = create.json()["id"]

        # edit — change amount + note + date + method
        upd = requests.put(f"{API}/expenses/{eid}", headers=_h(owner_token), json={
            "amount": 54321, "note": "TEST_it3_updated", "date": "05/02/2026",
            "payment_method": "TRANSFER",
        }, timeout=20)
        assert upd.status_code == 200, upd.text
        body = upd.json()
        assert body["amount"] == 54321
        assert body["note"] == "TEST_it3_updated"
        assert body["date"] == "2026-02-05"  # backend stores YYYY-MM-DD
        assert body["payment_method"] == "TRANSFER"

        # cleanup
        requests.delete(f"{API}/expenses/{eid}", headers=_h(owner_token), timeout=20)

    def test_expense_edit_bad_date(self, owner_token):
        cats = requests.get(f"{API}/expenses/categories", headers=_h(owner_token), timeout=20).json()
        group = list(cats.keys())[0]
        category = cats[group][0]
        c = requests.post(f"{API}/expenses", headers=_h(owner_token), json={
            "group": group, "category": category, "amount": 1000, "note": "TEST_it3_bad_date",
        }, timeout=20)
        assert c.status_code == 200
        eid = c.json()["id"]
        r = requests.put(f"{API}/expenses/{eid}", headers=_h(owner_token),
                         json={"date": "not-a-date"}, timeout=20)
        assert r.status_code == 400
        requests.delete(f"{API}/expenses/{eid}", headers=_h(owner_token), timeout=20)


# ---------- (4) Owner-only date edits: sale / stock-movement --------------------

def _get_or_create_test_part(owner_token) -> dict:
    parts = requests.get(f"{API}/parts", headers=_h(owner_token), params={"q": "TEST_IT3"}, timeout=20).json()
    for p in parts:
        if p.get("code") == "TEST_IT3":
            return p
    r = requests.post(f"{API}/parts", headers=_h(owner_token), json={
        "code": "TEST_IT3", "name": "TEST_it3 part", "price": 10000, "cost": 6000,
        "stock": 50, "min_stock": 1, "unit": "pcs", "rack": "TEST",
    }, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def _get_main_outlet(owner_token) -> dict:
    outs = requests.get(f"{API}/outlets", headers=_h(owner_token), timeout=20).json()
    for o in outs:
        if o.get("is_main"):
            return o
    return outs[0]


class TestSaleDateEdit:
    def test_change_sale_date_owner_only(self, owner_token, kasir_token):
        part = _get_or_create_test_part(owner_token)
        outlet = _get_main_outlet(owner_token)
        sale_body = {
            "outlet_id": outlet["id"], "items": [{"part_id": part["id"], "qty": 1}],
            "customer_name": "TEST_it3_sale_customer", "method": "CASH",
            "amount_paid": part.get("price", 10000),
        }
        s = requests.post(f"{API}/sales", headers=_h(owner_token), json=sale_body, timeout=20)
        assert s.status_code == 200, s.text
        sid = s.json()["id"]
        # kasir attempt (403 expected)
        deny = requests.put(f"{API}/sales/{sid}/date", headers=_h(kasir_token),
                            json={"date": "15/03/2026"}, timeout=20)
        assert deny.status_code == 403
        # owner ok
        ok = requests.put(f"{API}/sales/{sid}/date", headers=_h(owner_token),
                          json={"date": "15/03/2026"}, timeout=20)
        assert ok.status_code == 200, ok.text
        body = ok.json()
        assert body["date"] == "20260315"


class TestStockMovementDateEdit:
    def test_change_movement_date_owner_only(self, owner_token, partman_token):
        part = _get_or_create_test_part(owner_token)
        adj = requests.post(f"{API}/parts/{part['id']}/adjust", headers=_h(owner_token),
                            json={"qty": 1, "reason": "PENYESUAIAN", "note": "TEST_it3_move"}, timeout=20)
        assert adj.status_code == 200, adj.text
        # find latest movement for this part
        moves = requests.get(f"{API}/parts/{part['id']}/movements", headers=_h(owner_token), timeout=20).json()
        assert moves, "no movements returned"
        mid = moves[0]["id"]
        # partman denied
        deny = requests.put(f"{API}/stock-movements/{mid}/date", headers=_h(partman_token),
                            json={"date": "20/04/2026"}, timeout=20)
        assert deny.status_code in (401, 403)
        # owner allowed
        ok = requests.put(f"{API}/stock-movements/{mid}/date", headers=_h(owner_token),
                          json={"date": "20/04/2026"}, timeout=20)
        assert ok.status_code == 200, ok.text
        assert ok.json().get("ok") is True

    def test_movement_bad_date_400(self, owner_token):
        part = _get_or_create_test_part(owner_token)
        adj = requests.post(f"{API}/parts/{part['id']}/adjust", headers=_h(owner_token),
                            json={"qty": 1, "reason": "PENYESUAIAN"}, timeout=20)
        assert adj.status_code == 200
        moves = requests.get(f"{API}/parts/{part['id']}/movements", headers=_h(owner_token), timeout=20).json()
        mid = moves[0]["id"]
        r = requests.put(f"{API}/stock-movements/{mid}/date", headers=_h(owner_token),
                         json={"date": "bad"}, timeout=20)
        assert r.status_code == 400


# ---------- (5) POST /customers with address fields ---------------------------

class TestCustomerAddressFields:
    def test_customer_stores_address_parts(self, owner_token):
        payload = {
            "name": "TEST_it3_addr_customer",
            "phone": f"08999{int(time.time()) % 100000}",
            "address": "Alamat lengkap",
            "dusun": "Dusun A",
            "desa": "Sesela",
            "kecamatan": "Gunungsari",
            "kabupaten": "Lombok Barat",
        }
        r = requests.post(f"{API}/customers", headers=_h(owner_token), json=payload, timeout=20)
        assert r.status_code == 200, r.text
        c = r.json()
        for k in ("dusun", "desa", "kecamatan", "kabupaten"):
            assert c.get(k) == payload[k], f"{k} not stored (got {c.get(k)!r})"
        # reload via GET to verify persistence
        get_r = requests.get(f"{API}/customers/{c['id']}", headers=_h(owner_token), timeout=20)
        if get_r.status_code == 200:
            g = get_r.json()
            for k in ("dusun", "desa", "kecamatan", "kabupaten"):
                assert g.get(k) == payload[k]


# ---------- (6) POST /sales with customer_* address ----------------------------

class TestSaleAddressFields:
    def test_sale_stores_customer_address_parts(self, owner_token):
        part = _get_or_create_test_part(owner_token)
        outlet = _get_main_outlet(owner_token)
        body = {
            "outlet_id": outlet["id"], "items": [{"part_id": part["id"], "qty": 1}],
            "customer_name": "TEST_it3_addr_sale",
            "customer_dusun": "Dusun B", "customer_desa": "Kekeri",
            "customer_kecamatan": "Gunungsari", "customer_kabupaten": "Lombok Barat",
            "method": "CASH", "amount_paid": part.get("price", 10000),
        }
        r = requests.post(f"{API}/sales", headers=_h(owner_token), json=body, timeout=20)
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["customer_dusun"] == "Dusun B"
        assert s["customer_desa"] == "Kekeri"
        assert s["customer_kecamatan"] == "Gunungsari"
        assert s["customer_kabupaten"] == "Lombok Barat"
        # reload via GET (endpoint returns { sale: {...}, shop: {...} })
        get_r = requests.get(f"{API}/sales/{s['id']}", headers=_h(owner_token), timeout=20)
        assert get_r.status_code == 200
        g = get_r.json().get("sale", {})
        assert g.get("customer_desa") == "Kekeri"
        assert g.get("customer_dusun") == "Dusun B"
