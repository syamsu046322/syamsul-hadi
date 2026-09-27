import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qs } from "@/src/api";
import { dmyToYmd } from "@/src/components/date-edit";
import { Button, Chips, Empty, Header, Input, Loading, Mono, useToast } from "@/src/components/ui";
import { exportReportXlsx } from "@/src/excel";
import { rupiah, ymdToDisplay } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

function monthKey(offset = 0) {
  const d = new Date(); d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const monthLabel = (m: string) => new Date(`${m}-01`).toLocaleDateString("id-ID", { month: "short", year: "numeric" });

export default function LaporanPenjualan() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<"servis" | "jual">(params.tab === "jual" ? "jual" : "servis");
  const [month, setMonth] = useState(monthKey(0));
  const [range, setRange] = useState<"bulan" | "rentang">("bulan");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  const dfrom = range === "rentang" ? dmyToYmd(from) : "";
  const dto = range === "rentang" ? dmyToYmd(to) : "";
  const kind = tab === "servis" ? "service-sales" : "direct-sales";
  const rep = useQuery({ queryKey: ["report-sales", kind, month, range, dfrom, dto], queryFn: () => api<any>(`/reports/${kind}${qs({ month: range === "bulan" ? month : "", date_from: dfrom, date_to: dto })}`) });
  const rows: any[] = rep.data?.rows ?? [];
  const periodLabel = range === "bulan" ? monthLabel(month) : `${from || "awal"} – ${to || "akhir"}`;

  const doExport = async () => {
    setBusy(true);
    try { toast.show(await exportReportXlsx(kind as any, range === "rentang" ? { dateFrom: dfrom, dateTo: dto } : { month }), "success"); }
    catch (e: any) { toast.show(e.message ?? "Export gagal", "error"); }
    finally { setBusy(false); }
  };

  return (
    <View style={styles.root} testID="sales-report-screen">
      <Header title="LAPORAN PENJUALAN" subtitle="Servis & jualan langsung + laba" back />
      <Chips options={[{ key: "servis", label: "Penjualan Servis" }, { key: "jual", label: "Jualan Langsung" }]} value={tab} onChange={(v) => setTab(v as any)} testID="sales-tab" />
      <Chips options={[{ key: "bulan", label: "Per Bulan" }, { key: "rentang", label: "Rentang Tanggal" }]} value={range} onChange={(v) => setRange(v as any)} testID="sales-filtermode" />
      {range === "bulan" ? (
        <Chips options={[0, 1, 2, 3, 4, 5].map((o) => ({ key: monthKey(o), label: monthLabel(monthKey(o)) }))} value={month} onChange={setMonth} testID="sales-month" />
      ) : (
        <View style={styles.rangeRow}>
          <View style={{ flex: 1 }}><Input label="Dari (HH/BB/TTTT)" value={from} onChangeText={setFrom} placeholder="01/09/2026" keyboardType="numbers-and-punctuation" testID="sales-from-input" /></View>
          <View style={{ flex: 1 }}><Input label="Sampai (HH/BB/TTTT)" value={to} onChangeText={setTo} placeholder="30/09/2026" keyboardType="numbers-and-punctuation" testID="sales-to-input" /></View>
        </View>
      )}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={rep.isRefetching} onRefresh={rep.refetch} tintColor={colors.brandPrimary} />}>
        <View style={styles.totalBox} testID="sales-total">
          <Text style={styles.totalLabel}>TOTAL {tab === "servis" ? "PENJUALAN SERVIS" : "JUALAN LANGSUNG"} · {periodLabel}</Text>
          <Mono style={styles.totalVal}>{rupiah(rep.data?.grand_total)}</Mono>
          <Text style={styles.profitLabel}>Laba: <Mono style={styles.profitVal}>{rupiah(rep.data?.total_profit ?? rep.data?.total_part_profit)}</Mono>  ·  {rep.data?.count ?? 0} nota</Text>
        </View>
        <Button title="Export Excel" variant="dark" icon="download-outline" loading={busy} onPress={doExport} style={{ marginBottom: 12 }} testID="sales-export-button" />

        {rep.isLoading ? <Loading /> : rows.length === 0 ? <Empty text="Belum ada data pada bulan ini." icon="receipt-outline" testID="sales-empty" /> :
          rows.map((r) => (
            <View key={r.id} style={styles.card} testID={`sales-card-${r.id}`}>
              <View style={styles.cardHead}>
                <Text style={styles.no}>{tab === "servis" ? (r.invoice_no || r.trx_no) : r.sale_no}</Text>
                <Text style={styles.date}>{ymdToDisplay(r.date || "")}</Text>
              </View>
              <Text style={styles.cust}>{r.customer_name || "Umum"}{r.customer_phone ? ` · ${r.customer_phone}` : ""}</Text>
              {tab === "servis" ? (
                <Text style={styles.meta}>{r.plate} · {r.vehicle_name || "-"}  ·  Mekanik: {r.mechanic_name || "-"}</Text>
              ) : (
                <Text style={styles.meta}>{r.outlet_name}{r.customer_address ? ` · ${r.customer_address}` : ""}  ·  {r.method}</Text>
              )}
              {tab === "servis" && r.next_recommendation ? <Text style={styles.saran}>Saran servis: {r.next_recommendation}</Text> : null}

              {tab === "servis" && (r.jasa_items ?? []).length > 0 ? (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>JASA</Text>
                  {r.jasa_items.map((j: any, idx: number) => (
                    <View key={idx} style={styles.line}><Text style={styles.itName}>{j.name} x{j.qty}</Text><Mono style={styles.itVal}>{rupiah(j.subtotal)}</Mono></View>
                  ))}
                </View>
              ) : null}

              {((tab === "servis" ? r.part_items : r.items) ?? []).length > 0 ? (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>SUKU CADANG</Text>
                  <View style={styles.partHeader}>
                    <Text style={[styles.ph, { flex: 2 }]}>Part</Text>
                    <Text style={[styles.ph, styles.phNum]}>Jual</Text>
                    <Text style={[styles.ph, styles.phNum]}>Beli</Text>
                    <Text style={[styles.ph, styles.phNum]}>Laba</Text>
                  </View>
                  {(tab === "servis" ? r.part_items : r.items).map((p: any, idx: number) => (
                    <View key={idx} style={styles.partRow}>
                      <Text style={[styles.itName, { flex: 2 }]} numberOfLines={2}>{p.name} x{p.qty}</Text>
                      <Mono style={[styles.pv, styles.phNum]}>{rupiah(p.price)}</Mono>
                      <Mono style={[styles.pv, styles.phNum]}>{rupiah(p.cost)}</Mono>
                      <Mono style={[styles.pv, styles.phNum, { color: colors.success }]}>{rupiah(p.profit)}</Mono>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.footer}>
                {tab === "servis" ? (
                  <Text style={styles.foot}>Jasa {rupiah(r.total_jasa)} · Part {rupiah(r.total_part)}{r.discount ? ` · Diskon ${rupiah(r.discount)}` : ""}</Text>
                ) : (
                  <Text style={styles.foot}>{r.debt_amount ? `Sisa hutang ${rupiah(r.debt_amount)}` : "Lunas"}</Text>
                )}
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <Text style={styles.foot}>Laba <Mono style={{ color: colors.success }}>{rupiah(tab === "servis" ? r.total_part_profit : r.total_profit)}</Mono></Text>
                  <Mono style={styles.grand}>{rupiah(r.total)}</Mono>
                </View>
              </View>
            </View>
          ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  rangeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12, backgroundColor: c.surface, borderBottomWidth: 2, borderBottomColor: c.divider },
  totalBox: { backgroundColor: c.surfaceInverse, padding: 16, marginBottom: 12, borderLeftWidth: 6, borderLeftColor: c.brandPrimary },
  totalLabel: { color: c.brandPrimary, fontSize: 11, letterSpacing: 1.2 },
  totalVal: { color: c.onSurfaceInverse, fontSize: 28, marginTop: 4 },
  profitLabel: { color: c.onSurfaceInverse, opacity: 0.85, fontSize: 12, marginTop: 4 },
  profitVal: { color: c.success, fontSize: 13 },
  card: { borderWidth: 2, borderColor: c.border, marginBottom: 12, padding: 12, backgroundColor: c.surface },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  no: { fontWeight: "700", color: c.brandPrimary, fontSize: 14 },
  date: { color: c.muted, fontSize: 12 },
  cust: { color: c.onSurface, fontSize: 15, fontWeight: "600" },
  meta: { color: c.muted, fontSize: 12, marginTop: 2 },
  saran: { color: c.onSurface, fontSize: 12, marginTop: 4, fontStyle: "italic" },
  block: { marginTop: 8 },
  blockTitle: { fontSize: 10, letterSpacing: 1, color: c.muted, marginBottom: 4 },
  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  itName: { color: c.onSurface, fontSize: 13 },
  itVal: { color: c.onSurface, fontSize: 13 },
  partHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.divider, paddingBottom: 2, marginBottom: 2 },
  ph: { fontSize: 10, color: c.muted },
  phNum: { flex: 1, textAlign: "right" },
  partRow: { flexDirection: "row", alignItems: "center", paddingVertical: 2 },
  pv: { fontSize: 12, color: c.onSurface },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: c.divider, marginTop: 8, paddingTop: 6, flexWrap: "wrap", gap: 4 },
  foot: { fontSize: 12, color: c.muted },
  grand: { fontSize: 16, color: c.onSurface, fontWeight: "700" },
}));
