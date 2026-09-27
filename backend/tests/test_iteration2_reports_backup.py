"""Tests for iteration 2: backup restore + service/direct/purchase reports + edit-date + export xlsx.

Covers all backend items in the review-request. Single class to work with pytest-xdist loadscope.
"""
import os
from datetime import datetime, timezone, timedelta

import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"
CREDS = {"owner": "owner123", "kasir": "kasir123"}
BACKUP_PATH = "/tmp/backup.xlsx"


def _login(role: str) -> str:
    r = requests.post(f"{BASE_URL}/auth/login", json={"username": role, "password": CREDS[role]}, timeout=20)
    assert r.status_code == 200, r.text[:200]
    return r.json()["access_token"]


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


def _current_month() -> str:
    wib = timezone(timedelta(hours=7))
    return datetime.now(wib).strftime("%Y-%m")


class TestIteration2:
    tokens: dict = {}
    state: dict = {}

    # ---------------- login ----------------
    def test_01_login(self):
        self.tokens["owner"] = _login("owner")
        self.tokens["kasir"] = _login("kasir")
        assert self.tokens["owner"] and self.tokens["kasir"]

    # ---------------- backup import: initial + idempotent ----------------
    def test_02_backup_import_initial(self):
        assert os.path.exists(BACKUP_PATH), f"Missing {BACKUP_PATH}"
        # baseline parts count
        r0 = requests.get(f"{BASE_URL}/parts", headers=_h(self.tokens["owner"]), timeout=30)
        assert r0.status_code == 200
        self.state["parts_before"] = len(r0.json())
        with open(BACKUP_PATH, "rb") as fh:
            files = {"file": ("backup.xlsx", fh, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            r = requests.post(f"{BASE_URL}/backup/import", headers=_h(self.tokens["owner"]), files=files, timeout=120)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        # stats dict with keys
        for k in ("parts", "transactions", "payments"):
            assert k in data, f"stats missing {k}: {data}"
        r1 = requests.get(f"{BASE_URL}/parts", headers=_h(self.tokens["owner"]), timeout=30)
        self.state["parts_after_first"] = len(r1.json())
        assert self.state["parts_after_first"] >= 100, f"expected many parts after import, got {self.state['parts_after_first']}"

    def test_03_backup_import_idempotent(self):
        with open(BACKUP_PATH, "rb") as fh:
            files = {"file": ("backup.xlsx", fh, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            r = requests.post(f"{BASE_URL}/backup/import", headers=_h(self.tokens["owner"]), files=files, timeout=120)
        assert r.status_code == 200, r.text[:300]
        r2 = requests.get(f"{BASE_URL}/parts", headers=_h(self.tokens["owner"]), timeout=30)
        after_second = len(r2.json())
        # idempotent: count should be stable (allow small variance due to manual inserts, but not doubled)
        assert after_second <= self.state["parts_after_first"] + 5, (
            f"parts count grew from {self.state['parts_after_first']} to {after_second} - not idempotent"
        )

    # ---------------- service-sales report ----------------
    def test_04_service_sales_report_sep2026(self):
        r = requests.get(f"{BASE_URL}/reports/service-sales?month=2026-09", headers=_h(self.tokens["owner"]), timeout=30)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        for k in ("rows", "grand_total", "total_jasa", "total_part_profit", "count"):
            assert k in data, f"missing {k} in service-sales response"
        assert data["grand_total"] > 0, f"grand_total should be > 0, got {data['grand_total']}"
        # shape of rows
        assert len(data["rows"]) > 0
        row = data["rows"][0]
        for k in ("jasa_items", "part_items", "total_jasa", "total_part_profit", "next_recommendation"):
            assert k in row, f"row missing {k}"
        # part_items should have price/cost/profit
        for r0 in data["rows"]:
            for p in r0["part_items"]:
                assert "price" in p and "cost" in p and "profit" in p
                break
            else:
                continue
            break

    # ---------------- direct-sales report (may be empty) ----------------
    def test_05_direct_sales_report_sep2026(self):
        r = requests.get(f"{BASE_URL}/reports/direct-sales?month=2026-09", headers=_h(self.tokens["owner"]), timeout=30)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        for k in ("rows", "grand_total", "total_profit"):
            assert k in data
        assert isinstance(data["rows"], list)

    # ---------------- purchases report shape ----------------
    def test_06_purchases_report_current_month(self):
        month = _current_month()
        r = requests.get(f"{BASE_URL}/reports/purchases?month={month}", headers=_h(self.tokens["kasir"]), timeout=30)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        for k in ("parts", "kasbon_mekanik", "kasbon_owner", "operasional", "by_method", "grand_total"):
            assert k in data, f"missing {k}"
        for m in ("CASH", "HUTANG", "TRANSFER"):
            assert m in data["by_method"], f"by_method missing {m}"

    # ---------------- create expense with new fields, appears in purchases ----------------
    def test_07_expense_with_new_fields_appears_in_report(self):
        month = _current_month()
        payload = {
            "group": "BENGKEL",
            "category": "Kasbon Mekanik",
            "amount": 12345,
            "note": "TEST_ITER2 kasbon test",
            "supplier": "TEST_SUP",
            "unit_price": 5000,
            "het": 5500,
            "ongkir": 1000,
            "discount": 100,
            "payment_method": "TRANSFER",
        }
        r = requests.post(f"{BASE_URL}/expenses", headers=_h(self.tokens["kasir"]), json=payload, timeout=20)
        assert r.status_code in (200, 201), r.text[:300]
        created = r.json()
        self.state["expense_id"] = created.get("id")
        r2 = requests.get(f"{BASE_URL}/reports/purchases?month={month}", headers=_h(self.tokens["kasir"]), timeout=30)
        assert r2.status_code == 200
        data = r2.json()
        # search across kasbon_mekanik for our note
        found = any(x.get("note") == "TEST_ITER2 kasbon test" for x in data["kasbon_mekanik"])
        assert found, "created expense not found in purchases report kasbon_mekanik"
        # by_method should reflect TRANSFER
        assert data["by_method"]["TRANSFER"] >= 12345

    # ---------------- edit transaction date ----------------
    def test_08_edit_transaction_date_owner(self):
        r = requests.get(f"{BASE_URL}/transactions", headers=_h(self.tokens["owner"]), timeout=30)
        assert r.status_code == 200
        trxs = r.json()
        if not trxs:
            import pytest
            pytest.skip("No transactions to test edit-date")
        tid = trxs[0]["id"]
        orig_date = trxs[0].get("date", "")
        new_date_str = "05/03/2025"  # DD/MM/YYYY -> 20250305
        r2 = requests.put(f"{BASE_URL}/transactions/{tid}/date", headers=_h(self.tokens["owner"]),
                          json={"date": new_date_str}, timeout=20)
        assert r2.status_code == 200, r2.text[:300]
        # verify moved to march 2025 in service-sales
        r3 = requests.get(f"{BASE_URL}/reports/service-sales?month=2025-03", headers=_h(self.tokens["owner"]), timeout=30)
        assert r3.status_code == 200
        ids_march = {row["id"] for row in r3.json()["rows"]}
        assert tid in ids_march, f"transaction {tid} not found in 2025-03 report after date edit"
        self.state["restored_tid"] = tid
        self.state["orig_date"] = orig_date

    def test_09_restore_transaction_date(self):
        # restore original date to avoid contaminating other tests
        tid = self.state.get("restored_tid")
        orig = self.state.get("orig_date")
        if not tid or not orig or len(orig) != 8:
            return
        # orig is YYYYMMDD -> DD/MM/YYYY
        dd = f"{orig[6:8]}/{orig[4:6]}/{orig[0:4]}"
        r = requests.put(f"{BASE_URL}/transactions/{tid}/date", headers=_h(self.tokens["owner"]),
                        json={"date": dd}, timeout=20)
        assert r.status_code == 200

    # ---------------- xlsx exports ----------------
    def test_10_export_service_sales_xlsx(self):
        r = requests.get(f"{BASE_URL}/export/report/service-sales?month=2026-09", headers=_h(self.tokens["owner"]), timeout=60)
        assert r.status_code == 200
        assert "spreadsheet" in r.headers.get("content-type", ""), r.headers.get("content-type")
        assert len(r.content) > 100

    def test_11_export_direct_sales_xlsx(self):
        r = requests.get(f"{BASE_URL}/export/report/direct-sales?month=2026-09", headers=_h(self.tokens["owner"]), timeout=60)
        assert r.status_code == 200
        assert "spreadsheet" in r.headers.get("content-type", "")

    def test_12_export_purchases_xlsx(self):
        month = _current_month()
        r = requests.get(f"{BASE_URL}/export/report/purchases?month={month}", headers=_h(self.tokens["kasir"]), timeout=60)
        assert r.status_code == 200
        assert "spreadsheet" in r.headers.get("content-type", "")

    # ---------------- RBAC ----------------
    def test_13_rbac_kasir_service_sales_403(self):
        r = requests.get(f"{BASE_URL}/reports/service-sales?month=2026-09", headers=_h(self.tokens["kasir"]), timeout=15)
        assert r.status_code == 403, f"kasir should be 403 on owner-only endpoint, got {r.status_code}"

    def test_14_rbac_kasir_purchases_200(self):
        month = _current_month()
        r = requests.get(f"{BASE_URL}/reports/purchases?month={month}", headers=_h(self.tokens["kasir"]), timeout=20)
        assert r.status_code == 200
