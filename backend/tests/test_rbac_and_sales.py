"""RBAC + Direct Sales (jualan langsung) + Sale-debt tests.
Verifies mekanik super-worker access to kasir & partman endpoints,
CASH & KREDIT sales flow, sale debts in /api/debts and /sales/{id}/pay-debt.
"""
import os
import pytest
import requests
from pathlib import Path


def _base_url() -> str:
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
    if not url:
        env = Path("/app/frontend/.env").read_text()
        for line in env.splitlines():
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                url = line.split("=", 1)[1].strip().strip('"')
                break
    assert url, "EXPO_PUBLIC_BACKEND_URL missing"
    return url.rstrip("/")


BASE_URL = _base_url()
API = f"{BASE_URL}/api"


def _login(username: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {username} → {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tokens():
    return {r: _login(r, f"{r}123") for r in ("owner", "kasir", "mekanik", "partman")}


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


# --- Cleanup helpers ---
_CREATED_SALES: list[str] = []


@pytest.fixture(scope="module", autouse=True)
def _cleanup(tokens):
    yield
    # remove test sales directly from mongo via test-scope requests would need admin; skip if not possible.
    # We use a marker in customer_name "TEST_JUAL" and soft-delete via mongo shell fallback:
    try:
        import pymongo
        c = pymongo.MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        dbn = os.environ.get("DB_NAME", "test_database")
        db = c[dbn]
        db.sales.delete_many({"customer_name": {"$regex": "^TEST_JUAL"}})
        db.payments.delete_many({"sale": True, "transaction_id": {"$in": _CREATED_SALES}})
        db.stock_movements.delete_many({"transaction_id": {"$in": _CREATED_SALES}})
        db.debt_payments.delete_many({"transaction_id": {"$in": _CREATED_SALES}})
        db.notifications.delete_many({"payload.sale_id": {"$in": _CREATED_SALES}})
    except Exception as e:  # noqa: BLE001
        print(f"cleanup warning: {e}")


# =====================================================================
# Section 1 — RBAC positive: mekanik has KASIR access
# =====================================================================
class TestMekanikHasKasirAccess:
    def test_debts_list(self, tokens):
        r = requests.get(f"{API}/debts", headers=_h(tokens["mekanik"]), timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_expenses_list(self, tokens):
        r = requests.get(f"{API}/expenses", headers=_h(tokens["mekanik"]), timeout=30)
        assert r.status_code == 200, r.text


# =====================================================================
# Section 2 — RBAC positive: mekanik has PARTMAN access
# =====================================================================
class TestMekanikHasPartmanAccess:
    def test_parts_list(self, tokens):
        r = requests.get(f"{API}/parts", headers=_h(tokens["mekanik"]), timeout=30)
        assert r.status_code == 200, r.text

    def test_stock_checks_list(self, tokens):
        r = requests.get(f"{API}/stock-checks", headers=_h(tokens["mekanik"]), timeout=30)
        assert r.status_code == 200, r.text

    def test_outlets_list(self, tokens):
        r = requests.get(f"{API}/outlets", headers=_h(tokens["mekanik"]), timeout=30)
        assert r.status_code == 200, r.text
        outlets = r.json()
        assert len(outlets) >= 1


# =====================================================================
# Section 3 — RBAC negative: guardrails intact
# =====================================================================
class TestRBACNegative:
    def test_kasir_cannot_access_stock_checks(self, tokens):
        r = requests.get(f"{API}/stock-checks", headers=_h(tokens["kasir"]), timeout=30)
        assert r.status_code == 403, f"kasir /stock-checks expected 403 got {r.status_code}"

    def test_partman_cannot_pay_debt(self, tokens):
        # trigger auth even without valid tid — must fail at role dep first
        r = requests.post(f"{API}/transactions/FAKE-ID/pay-debt", headers=_h(tokens["partman"]),
                          json={"amount": 1000, "method": "CASH"}, timeout=30)
        assert r.status_code == 403, f"partman pay-debt expected 403 got {r.status_code}"

    def test_kasir_cannot_start_service(self, tokens):
        r = requests.post(f"{API}/transactions/FAKE-ID/start", headers=_h(tokens["kasir"]),
                          json={"mechanic_id": "x"}, timeout=30)
        assert r.status_code == 403, f"kasir start expected 403 got {r.status_code}"

    def test_partman_cannot_finish_service(self, tokens):
        r = requests.post(f"{API}/transactions/FAKE-ID/finish", headers=_h(tokens["partman"]),
                          json={}, timeout=30)
        assert r.status_code == 403, f"partman finish expected 403 got {r.status_code}"

    def test_kasir_cannot_start_service_also(self, tokens):
        # sanity: mekanik-only endpoints still reject non-mekanik
        r = requests.post(f"{API}/transactions/FAKE-ID/start", headers=_h(tokens["partman"]),
                          json={"mechanic_id": "x"}, timeout=30)
        assert r.status_code == 403


# =====================================================================
# Section 4 — Helpers for sale flow (get outlet + a stocked part)
# =====================================================================
@pytest.fixture(scope="module")
def outlet(tokens):
    r = requests.get(f"{API}/outlets", headers=_h(tokens["owner"]), timeout=30)
    assert r.status_code == 200
    outlets = r.json()
    main = next((o for o in outlets if o.get("is_main")), outlets[0])
    return main


@pytest.fixture(scope="module")
def stocked_part(tokens):
    r = requests.get(f"{API}/parts", headers=_h(tokens["owner"]), timeout=30)
    assert r.status_code == 200
    parts = r.json()
    p = parts[0]
    # Always top-up by 50 so parallel workers cannot deplete
    adj = requests.post(f"{API}/parts/{p['id']}/adjust", headers=_h(tokens["owner"]),
                        json={"qty": 50, "reason": "TEST_TOPUP"}, timeout=30)
    assert adj.status_code == 200, adj.text
    fresh = requests.get(f"{API}/parts", headers=_h(tokens["owner"]), timeout=30).json()
    return next(x for x in fresh if x["id"] == p["id"])


# =====================================================================
# Section 5 — Direct sale CASH
# =====================================================================
class TestDirectSaleCash:
    def test_create_cash_sale_and_verify(self, tokens, outlet, stocked_part):
        price = 20000
        cost = 12000
        qty = 2
        disc = 5000
        expected_subtotal = price * qty - disc  # 35000
        expected_profit = expected_subtotal - cost * qty  # 11000
        payload = {
            "outlet_id": outlet["id"],
            "items": [{"part_id": stocked_part["id"], "qty": qty, "price": price, "cost": cost, "discount": disc}],
            "customer_name": "TEST_JUAL Cash",
            "customer_address": "Jl Testing 1",
            "customer_phone": "081234567890",
            "method": "CASH",
            "amount_paid": 40000,
        }
        stock_before = int(next(x for x in requests.get(f"{API}/parts", headers=_h(tokens["owner"]), timeout=30).json() if x["id"] == stocked_part["id"])["stock"])
        r = requests.post(f"{API}/sales", headers=_h(tokens["kasir"]), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        _CREATED_SALES.append(data["id"])
        assert data["sale_no"].startswith("PJ-"), data["sale_no"]
        assert data["total"] == expected_subtotal
        assert data["total_profit"] == expected_profit
        assert data["change"] == 40000 - expected_subtotal  # 5000
        assert data["debt_amount"] == 0
        assert data["customer_address"] == "Jl Testing 1"
        # Verify persistence via GET (small retry to avoid transient index/consistency delays)
        det = None
        for _ in range(5):
            det = requests.get(f"{API}/sales/{data['id']}", headers=_h(tokens["kasir"]), timeout=30)
            if det.status_code == 200:
                break
            import time as _t
            _t.sleep(0.3)
        assert det.status_code == 200, f"GET /sales/{data['id']} → {det.status_code} {det.text}"
        sale = det.json()["sale"]
        assert sale["total_profit"] == expected_profit
        # Verify stock decremented
        parts = requests.get(f"{API}/parts", headers=_h(tokens["owner"]), timeout=30).json()
        p = next(x for x in parts if x["id"] == stocked_part["id"])
        assert int(p["stock"]) == stock_before - qty, f"stock {stock_before}->{p['stock']} (qty {qty})"


# =====================================================================
# Section 6 — Direct sale KREDIT + pay-debt
# =====================================================================
class TestDirectSaleKredit:
    def test_kredit_sale_creates_debt(self, tokens, outlet, stocked_part):
        price = 25000
        cost = 15000
        qty = 2
        expected_total = price * qty  # 50000
        expected_profit = expected_total - cost * qty  # 20000
        payload = {
            "outlet_id": outlet["id"],
            "items": [{"part_id": stocked_part["id"], "qty": qty, "price": price, "cost": cost, "discount": 0}],
            "customer_name": "TEST_JUAL Kredit",
            "customer_address": "Jl Testing 2",
            "customer_phone": "081234509876",
            "method": "KREDIT",
            "amount_paid": 10000,  # partial DP
            "due_date": "20260315",
        }
        r = requests.post(f"{API}/sales", headers=_h(tokens["mekanik"]), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        _CREATED_SALES.append(data["id"])
        assert data["total"] == expected_total
        assert data["total_profit"] == expected_profit
        assert data["debt_amount"] == expected_total - 10000  # 40000
        assert data["debt_status"] == "BELUM LUNAS"
        # 6.1 debt appears in /api/debts as sale=True
        debts = requests.get(f"{API}/debts", headers=_h(tokens["kasir"]), timeout=30).json()
        matching = [d for d in debts if d.get("sale") and d.get("invoice_no") == data["sale_no"]]
        assert matching, f"sale {data['sale_no']} not in /debts"
        assert matching[0]["plate"] == "PENJUALAN PART"
        # 6.2 partial pay-debt
        pay1 = requests.post(f"{API}/sales/{data['id']}/pay-debt", headers=_h(tokens["kasir"]),
                             json={"amount": 15000, "method": "CASH"}, timeout=30)
        assert pay1.status_code == 200, pay1.text
        after1 = pay1.json()
        assert after1["debt_amount"] == 40000 - 15000  # 25000
        assert after1["debt_status"] == "BELUM LUNAS"
        # 6.3 full pay-debt (send 30000, capped to 25000)
        pay2 = requests.post(f"{API}/sales/{data['id']}/pay-debt", headers=_h(tokens["kasir"]),
                             json={"amount": 30000, "method": "CASH"}, timeout=30)
        assert pay2.status_code == 200, pay2.text
        after2 = pay2.json()
        assert after2["debt_amount"] == 0
        assert after2["debt_status"] == "LUNAS"


# =====================================================================
# Section 7 — /sales accessible to owner, kasir, partman, mekanik
# =====================================================================
class TestSalesAccessAllRoles:
    @pytest.mark.parametrize("role", ["owner", "kasir", "partman", "mekanik"])
    def test_role_can_create_sale(self, role, tokens, outlet, stocked_part):
        payload = {
            "outlet_id": outlet["id"],
            "items": [{"part_id": stocked_part["id"], "qty": 1, "price": 10000, "cost": 6000, "discount": 0}],
            "customer_name": f"TEST_JUAL role-{role}",
            "customer_address": "-",
            "customer_phone": "",
            "method": "CASH",
            "amount_paid": 10000,
        }
        r = requests.post(f"{API}/sales", headers=_h(tokens[role]), json=payload, timeout=30)
        assert r.status_code == 200, f"{role} POST /sales → {r.status_code} {r.text}"
        _CREATED_SALES.append(r.json()["id"])
