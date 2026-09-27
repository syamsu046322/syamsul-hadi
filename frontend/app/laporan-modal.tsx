import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qs } from "@/src/api";
import { Chips, Empty, Header, Loading, Mono } from "@/src/components/ui";
import { fmtDate, rupiah } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

type Mode = "daily" | "monthly" | "yearly";

function monthKey(offset = 0) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("id-ID", { month: "short", year: "numeric" });
const monthLong = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
const thisYear = new Date().getFullYear();

export default function LaporanModal() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("daily");
  const [month, setMonth] = useState(monthKey(0));
  const [year, setYear] = useState(String(thisYear));

  const period = mode === "daily" ? month : mode === "monthly" ? year : "";
  const rep = useQuery({ queryKey: ["report-profit", mode, period], queryFn: () => api<any>(`/reports/profit${qs({ mode, period })}`) });
  const rows: any[] = rep.data?.rows ?? [];

  const periodLabel = (p: string) => (mode === "daily" ? fmtDate(p) : mode === "monthly" ? monthLong(p) : `Tahun ${p}`);
  const headLabel = mode === "daily" ? monthLong(month) : mode === "monthly" ? `Tahun ${year}` : "Semua Tahun";
  const margin = rep.data?.total_jual_part ? Math.round((rep.data.total_profit_part / rep.data.total_jual_part) * 100) : 0;

  return (
    <View style={styles.root} testID="profit-report-screen">
      <Header title="LAPORAN MODAL & PENJUALAN" subtitle="Harga beli vs harga jual vs profit" back />
      <Chips options={[{ key: "daily", label: "Per Hari" }, { key: "monthly", label: "Per Bulan" }, { key: "yearly", label: "Per Tahun" }]} value={mode} onChange={setMode} testID="profit-mode" />
      {mode === "daily" ? (
        <Chips options={[0, 1, 2, 3, 4, 5].map((o) => ({ key: monthKey(o), label: monthLabel(monthKey(o)) }))} value={month} onChange={setMonth} testID="profit-month" />
      ) : mode === "monthly" ? (
        <Chips options={[0, 1, 2].map((o) => ({ key: String(thisYear - o), label: String(thisYear - o) }))} value={year} onChange={setYear} testID="profit-year" />
      ) : null}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={rep.isRefetching} onRefresh={rep.refetch} tintColor={colors.brandPrimary} />}>
        <View style={styles.totalBox} testID="profit-summary">
          <Text style={styles.totalLabel}>PROFIT PART · {headLabel.toUpperCase()}</Text>
          <Mono style={styles.totalVal}>{rupiah(rep.data?.total_profit_part)}</Mono>
          <Text style={styles.totalSub}>Margin {margin}% · {rep.data?.count_servis ?? 0} nota servis · {rep.data?.count_jual ?? 0} faktur jualan</Text>
          <View style={styles.kpis}>
            <View style={styles.kpi}><Text style={styles.kpiLabel}>MODAL PART (BELI)</Text><Mono style={[styles.kpiVal, { color: colors.warning }]} testID="profit-total-modal">{rupiah(rep.data?.total_modal)}</Mono></View>
            <View style={styles.kpi}><Text style={styles.kpiLabel}>HARGA JUAL PART</Text><Mono style={styles.kpiVal} testID="profit-total-jual">{rupiah(rep.data?.total_jual_part)}</Mono></View>
          </View>
          <View style={styles.kpis}>
            <View style={styles.kpi}><Text style={styles.kpiLabel}>JASA</Text><Mono style={styles.kpiVal}>{rupiah(rep.data?.total_jasa)}</Mono></View>
            <View style={styles.kpi}><Text style={styles.kpiLabel}>LABA KOTOR (PART + JASA{rep.data?.total_diskon ? " − DISKON" : ""})</Text><Mono style={[styles.kpiVal, { color: colors.success }]} testID="profit-total-all">{rupiah(rep.data?.total_profit)}</Mono></View>
          </View>
        </View>
        <Text style={styles.note}>Faktur berstatus DIBATALKAN tidak dihitung. Modal = harga beli part × qty (servis + jualan langsung).</Text>

        {rep.isLoading ? <Loading /> : rows.length === 0 ? <Empty text="Belum ada penjualan pada periode ini." icon="stats-chart-outline" testID="profit-empty" /> : (
          <View style={styles.table}>
            <View style={[styles.tr, styles.th]}>
              <Text style={[styles.thTxt, { flex: 1.4 }]}>Periode</Text>
              <Text style={[styles.thTxt, styles.num]}>Modal</Text>
              <Text style={[styles.thTxt, styles.num]}>Jual</Text>
              <Text style={[styles.thTxt, styles.num]}>Profit</Text>
            </View>
            {rows.map((r) => (
              <View key={r.period} style={styles.rowWrap} testID={`profit-row-${r.period}`}>
                <View style={styles.tr}>
                  <Text style={[styles.td, { flex: 1.4, fontWeight: "600" }]}>{periodLabel(r.period)}</Text>
                  <Mono style={[styles.td, styles.num, { color: colors.warning }]}>{rupiah(r.modal)}</Mono>
                  <Mono style={[styles.td, styles.num]}>{rupiah(r.jual_part)}</Mono>
                  <Mono style={[styles.td, styles.num, { color: r.profit_part >= 0 ? colors.success : colors.error }]}>{rupiah(r.profit_part)}</Mono>
                </View>
                <Text style={styles.meta}>{r.count_servis} servis · {r.count_jual} jualan · Jasa {rupiah(r.jasa)}{r.diskon ? ` · Diskon ${rupiah(r.diskon)}` : ""} · Laba kotor <Mono style={{ color: colors.success, fontSize: 11 }}>{rupiah(r.profit)}</Mono></Text>
              </View>
            ))}
            <View style={[styles.tr, styles.tfoot]}>
              <Text style={[styles.td, { flex: 1.4, fontWeight: "700" }]}>TOTAL</Text>
              <Mono style={[styles.td, styles.num, { fontWeight: "700", color: colors.warning }]}>{rupiah(rep.data?.total_modal)}</Mono>
              <Mono style={[styles.td, styles.num, { fontWeight: "700" }]}>{rupiah(rep.data?.total_jual_part)}</Mono>
              <Mono style={[styles.td, styles.num, { fontWeight: "700", color: colors.success }]}>{rupiah(rep.data?.total_profit_part)}</Mono>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  totalBox: { backgroundColor: c.surfaceInverse, padding: 16, marginBottom: 8, borderLeftWidth: 6, borderLeftColor: c.brandPrimary },
  totalLabel: { color: c.brandPrimary, fontSize: 11, letterSpacing: 1.2 },
  totalVal: { color: c.success, fontSize: 30, marginTop: 4 },
  totalSub: { color: c.onSurfaceInverse, opacity: 0.8, fontSize: 12, marginTop: 2 },
  kpis: { flexDirection: "row", gap: 12, marginTop: 12 },
  kpi: { flex: 1 },
  kpiLabel: { color: c.onSurfaceInverse, opacity: 0.7, fontSize: 10, letterSpacing: 0.8 },
  kpiVal: { color: c.onSurfaceInverse, fontSize: 15, marginTop: 2 },
  note: { color: c.muted, fontSize: 11, marginBottom: 12 },
  table: { borderWidth: 2, borderColor: c.border },
  tr: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  th: { backgroundColor: c.surfaceTertiary, borderBottomWidth: 2, borderBottomColor: c.border },
  thTxt: { fontSize: 10, color: c.muted, letterSpacing: 0.8 },
  num: { flex: 1, textAlign: "right" },
  rowWrap: { borderBottomWidth: 1, borderBottomColor: c.divider, paddingBottom: 6 },
  td: { fontSize: 12, color: c.onSurface },
  meta: { fontSize: 11, color: c.muted, paddingHorizontal: 10 },
  tfoot: { backgroundColor: c.surfaceSecondary, borderTopWidth: 2, borderTopColor: c.border },
}));
