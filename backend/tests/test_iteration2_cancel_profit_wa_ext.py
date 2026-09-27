"""Iteration 2 extended tests: cancellation regression, profit modes with period, expense/profit-trend, export omzet, sales WA."""
import io
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE = os.environ.get("API_BASE", "http://localhost:8001/api")
WIB = timezone(timedelta(hours=7))


def _login(u, p):
    r = requests.post(f"{BASE}/auth/login", json={"username": u, "password": p}, timeout=30)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def owner():
    return _login("owner", "owner123")


# ---------------------------------------------------------------- helpers

def _mk_customer(h):
    tag = uuid.uuid4().hex[:6]
    c = requests.post(f"{BASE}/customers", json={"name": f"TEST_{tag}", "phone": "0819" + tag}, headers=h).json()
    v = requests.post(f"{BASE}/vehicles", json={"customer_id": c["id"], "plate": f"DR{tag.upper()}", "brand": "Honda", "model": "Beat"}, headers=h).json()
    return c, v


def _mk_credit_trx(h):
    """Create a service transaction and pay via KREDIT (creating a debt)."""
    c, v = _mk_customer(h)
    part = next(p for p in requests.get(f"{BASE}/parts", headers=h).json() if p.get("stock", 0) >= 1)
    items = [
        {"kind": "jasa", "name": "Servis WA", "price": 40000, "qty": 1},
        {"kind": "part", "ref_id": part["id"], "name": part["name"], "price": part["price"], "qty": 1},
    ]
    t = requests.post(f"{BASE}/transactions", json={"customer_id": c["id"], "vehicle_id": v["id"], "complaint_main": "kredit", "items": items}, headers=h).json()
    tid = t["id"]
    assert requests.post(f"{BASE}/transactions/{tid}/start", json={}, headers=h).status_code == 200
    assert requests.post(f"{BASE}/transactions/{tid}/finish", json={"work_done": "ok"}, headers=h).status_code == 200
    detail = requests.get(f"{BASE}/transactions/{tid}", headers=h).json()
    total = detail["totals"]["total"]
    due = (datetime.now(WIB) + timedelta(days=7)).strftime("%Y-%m-%d")
    r = requests.post(f"{BASE}/transactions/{tid}/pay", json={"method": "KREDIT", "amount_paid": 0, "due_date": due}, headers=h)
    assert r.status_code == 200, r.text
    return tid, total, part


# ---------------------------------------------------------------- 1) credit trx cancellation removes from debts & dashboard

def test_credit_cancel_removed_from_debts_and_dashboard(owner):
    h = owner
    dash_before = requests.get(f"{BASE}/dashboard", headers=h).json()
    piutang_before = dash_before.get("piutang_total", 0)
    count_before = dash_before.get("piutang_count", 0)

    tid, total, _ = _mk_credit_trx(h)

    dash_mid = requests.get(f"{BASE}/dashboard", headers=h).json()
    assert dash_mid["piutang_total"] == piutang_before + total, "debt not counted after create"
    assert dash_mid["piutang_count"] == count_before + 1
    debts_mid = requests.get(f"{BASE}/debts", headers=h).json()
    assert tid in [d["id"] for d in debts_mid], "credit trx must appear in debts"

    r = requests.post(f"{BASE}/transactions/{tid}/cancel", json={"reason": "test cancel credit"}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "DIBATALKAN"

    dash_after = requests.get(f"{BASE}/dashboard", headers=h).json()
    assert dash_after["piutang_total"] == piutang_before, "piutang_total should revert after cancel"
    assert dash_after["piutang_count"] == count_before, "piutang_count should revert after cancel"
    debts_after = requests.get(f"{BASE}/debts", headers=h).json()
    assert tid not in [d["id"] for d in debts_after], "cancelled credit trx must disappear from /debts"


# ---------------------------------------------------------------- 2) expense summary omzet & profit-trend unaffected

def test_expenses_summary_and_profit_trend_unchanged_after_cancel_paid(owner):
    h = owner
    from datetime import datetime as _dt
    m_before = requests.get(f"{BASE}/expenses/summary", headers=h).json()
    trend_before = requests.get(f"{BASE}/reports/profit-trend", headers=h).json()

    # Make paid trx then cancel it
    c, v = _mk_customer(h)
    part = next(p for p in requests.get(f"{BASE}/parts", headers=h).json() if p.get("stock", 0) >= 1)
    items = [{"kind": "jasa", "name": "Servis Trend", "price": 30000, "qty": 1},
             {"kind": "part", "ref_id": part["id"], "name": part["name"], "price": part["price"], "qty": 1}]
    t = requests.post(f"{BASE}/transactions", json={"customer_id": c["id"], "vehicle_id": v["id"], "complaint_main": "trend", "items": items}, headers=h).json()
    tid = t["id"]
    requests.post(f"{BASE}/transactions/{tid}/start", json={}, headers=h)
    requests.post(f"{BASE}/transactions/{tid}/finish", json={"work_done": "ok"}, headers=h)
    total = requests.get(f"{BASE}/transactions/{tid}", headers=h).json()["totals"]["total"]
    requests.post(f"{BASE}/transactions/{tid}/pay", json={"method": "CASH", "amount_paid": total}, headers=h).raise_for_status()
    requests.post(f"{BASE}/transactions/{tid}/cancel", json={"reason": "cancel paid"}, headers=h).raise_for_status()

    m_after = requests.get(f"{BASE}/expenses/summary", headers=h).json()
    trend_after = requests.get(f"{BASE}/reports/profit-trend", headers=h).json()

    # Both endpoints should give identical top-line "omzet" like values before and after the cancel round-trip
    assert m_before.get("omzet", m_before) == m_after.get("omzet", m_after) or m_before == m_after, (
        f"/api/expenses/summary changed unexpectedly after paid cancel: before={m_before} after={m_after}"
    )
    assert trend_before == trend_after, "/api/reports/profit-trend changed after paid cancel"


# ---------------------------------------------------------------- 3) profit report mode + period param

def test_profit_report_with_period_param(owner):
    h = owner
    today = datetime.now(WIB)
    daily_period = today.strftime("%Y-%m")
    monthly_period = today.strftime("%Y")
    yearly_period = today.strftime("%Y")
    # Daily requires YYYY-MM
    rd = requests.get(f"{BASE}/reports/profit", params={"mode": "daily", "period": daily_period}, headers=h)
    assert rd.status_code == 200, rd.text
    dj = rd.json()
    assert dj["mode"] == "daily"
    # each row period must start with YYYY-MM
    for row in dj["rows"]:
        assert row["period"].startswith(daily_period), row
    # Monthly YYYY
    rm = requests.get(f"{BASE}/reports/profit", params={"mode": "monthly", "period": monthly_period}, headers=h)
    assert rm.status_code == 200
    mj = rm.json()
    assert mj["mode"] == "monthly"
    for row in mj["rows"]:
        assert row["period"].startswith(monthly_period), row
    # Yearly – ignore/accept period
    ry = requests.get(f"{BASE}/reports/profit", params={"mode": "yearly", "period": yearly_period}, headers=h)
    assert ry.status_code == 200
    yj = ry.json()
    assert yj["mode"] == "yearly"
    # totals equal sum of rows
    assert yj["total_profit"] == sum(r["profit"] for r in yj["rows"])
    assert yj["total_modal"] == sum(r["modal"] for r in yj["rows"])
    assert yj["total_jual_part"] == sum(r["jual_part"] for r in yj["rows"])


# ---------------------------------------------------------------- 4) export omzet xlsx OK

def test_export_report_omzet_xlsx_ok(owner):
    h = owner
    r = requests.get(f"{BASE}/export/report/omzet", headers=h)
    assert r.status_code == 200, r.text
    ctype = r.headers.get("content-type", "")
    # openpyxl mime
    assert "spreadsheetml" in ctype or "octet-stream" in ctype, ctype
    assert len(r.content) > 200
    # Should be a valid ZIP (xlsx = zip)
    assert r.content[:2] == b"PK", "response is not a valid xlsx (missing PK header)"


# ---------------------------------------------------------------- 5) Sales WA has line items and TOTAL AKHIR

def test_sales_whatsapp_has_items_and_total_akhir(owner):
    h = owner
    outlets = requests.get(f"{BASE}/outlets", headers=h).json()
    main = next((o for o in outlets if o.get("is_main")), None)
    assert main, "main outlet not found"
    part = next((p for p in requests.get(f"{BASE}/parts", headers=h).json() if p.get("stock", 0) > 0), None)
    assert part, "no part with stock > 0"
    body = {
        "outlet_id": main["id"],
        "customer_name": "TEST_WA_" + uuid.uuid4().hex[:4],
        "customer_phone": "081900001111",
        "items": [{"part_id": part["id"], "qty": 1, "price": part["price"], "cost": part.get("cost", 0), "discount": 0}],
        "discount": 0,
        "method": "CASH",
        "amount_paid": part["price"],
        "note": "test WA sale",
    }
    sale = requests.post(f"{BASE}/sales", json=body, headers=h)
    assert sale.status_code == 200, sale.text
    sid = sale.json()["id"]

    wa = requests.post(f"{BASE}/sales/{sid}/whatsapp", json={}, headers=h)
    assert wa.status_code == 200, wa.text
    j = wa.json()
    assert j["status"] in ("TERKIRIM", "GAGAL")
    msg = j["message"]
    # Item line: 'name qty x price = subtotal'
    assert part["name"] in msg
    assert f"{part['price']:,}".replace(",", ".") in msg
    assert "TOTAL AKHIR" in msg
    assert "1 x" in msg or "1 X" in msg or " 1 x " in msg
    assert "=" in msg  # subtotal formula presence
