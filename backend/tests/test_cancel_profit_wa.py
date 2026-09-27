"""Smoke: faktur DIBATALKAN dikecualikan dari omset/modal/piutang; laporan profit; WA message rinci."""
import os
import uuid

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


def make_paid_trx(h, part_qty=1):
    tag = uuid.uuid4().hex[:6]
    c = requests.post(f"{BASE}/customers", json={"name": f"Tes {tag}", "phone": "0819000" + tag[:4]}, headers=h).json()
    v = requests.post(f"{BASE}/vehicles", json={"customer_id": c["id"], "plate": f"DR{tag.upper()}", "brand": "Honda", "model": "Beat"}, headers=h).json()
    part = next(p for p in requests.get(f"{BASE}/parts", headers=h).json() if p.get("stock", 0) >= part_qty)
    items = [{"kind": "jasa", "name": "Servis Ringan", "price": 50000, "qty": 1},
             {"kind": "part", "ref_id": part["id"], "name": part["name"], "price": part["price"], "qty": part_qty}]
    t = requests.post(f"{BASE}/transactions", json={"customer_id": c["id"], "vehicle_id": v["id"], "complaint_main": "tes", "items": items}, headers=h).json()
    tid = t["id"]
    requests.post(f"{BASE}/transactions/{tid}/start", json={}, headers=h).raise_for_status()
    requests.post(f"{BASE}/transactions/{tid}/finish", json={"work_done": "ok"}, headers=h).raise_for_status()
    total = requests.get(f"{BASE}/transactions/{tid}", headers=h).json()["totals"]["total"]
    r = requests.post(f"{BASE}/transactions/{tid}/pay", json={"method": "CASH", "amount_paid": total}, headers=h)
    r.raise_for_status()
    return tid, total, part


def test_cancel_excluded_from_all_reports(owner):
    h = owner
    before = requests.get(f"{BASE}/dashboard", headers=h).json()["omzet_hari_ini"]
    tid, total, part = make_paid_trx(h)
    mid = requests.get(f"{BASE}/dashboard", headers=h).json()
    assert mid["omzet_hari_ini"] == before + total
    prof_before = requests.get(f"{BASE}/reports/profit?mode=daily", headers=h).json()

    r = requests.post(f"{BASE}/transactions/{tid}/cancel", json={"reason": "salah input"}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "DIBATALKAN"

    after = requests.get(f"{BASE}/dashboard", headers=h).json()
    assert after["omzet_hari_ini"] == before, "omset harian masih menghitung faktur batal"
    omz = requests.get(f"{BASE}/reports/omzet?mode=daily", headers=h).json()
    from datetime import datetime, timedelta, timezone
    today = datetime.now(timezone(timedelta(hours=7))).strftime("%Y-%m-%d")
    row = next((x for x in omz["rows"] if x["period"] == today), {"total": 0})
    assert row["total"] == before
    prof_after = requests.get(f"{BASE}/reports/profit?mode=daily", headers=h).json()
    assert prof_after["total_modal"] == prof_before["total_modal"] - part["cost"]
    assert prof_after["total_jual_part"] == prof_before["total_jual_part"] - part["price"]
    svc = requests.get(f"{BASE}/reports/service-sales", headers=h).json()
    assert tid not in [x["id"] for x in svc["rows"]]
    mech = requests.get(f"{BASE}/reports/mechanics", headers=h).json()
    assert all(tid != x.get("id") for x in mech["rows"])
    debts = requests.get(f"{BASE}/debts", headers=h).json()
    assert tid not in [d["id"] for d in debts]
    hist = requests.get(f"{BASE}/history", headers=h).json()
    assert tid not in [d["id"] for d in hist]
    canc = requests.get(f"{BASE}/reports/cancellations", headers=h).json()
    assert tid in [d["id"] for d in canc["rows"]]


def test_profit_report_modes(owner):
    for mode in ("daily", "monthly", "yearly"):
        r = requests.get(f"{BASE}/reports/profit?mode={mode}", headers=owner).json()
        assert r["mode"] == mode
        for row in r["rows"]:
            assert row["profit_part"] == row["jual_part"] - row["modal"]
            assert row["profit"] == row["omzet"] - row["modal"]
        assert r["total_profit_part"] == sum(x["profit_part"] for x in r["rows"])


def test_wa_message_has_items_and_total(owner):
    h = owner
    tid, total, part = make_paid_trx(h)
    r = requests.get(f"{BASE}/transactions/{tid}/receipt", headers=h).json()
    msg = r["whatsapp_message"]
    assert "JASA" in msg and "SPAREPART" in msg and part["name"] in msg and "Servis Ringan" in msg
    assert "TOTAL AKHIR" in msg and f"{total:,}".replace(",", ".") in msg
    w = requests.post(f"{BASE}/transactions/{tid}/whatsapp", json={}, headers=h).json()
    assert w["status"] == "TERKIRIM" and "TOTAL AKHIR" in w["message"]
