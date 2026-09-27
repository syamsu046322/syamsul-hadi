import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qs } from "@/src/api";
import { dmyToYmd } from "@/src/components/date-edit";
import { Button, Chips, Empty, Header, Input, Loading, Mono, SectionTitle, useToast } from "@/src/components/ui";
import { exportReportXlsx } from "@/src/excel";
import { rupiah, ymdToDisplay } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

function monthKey(offset = 0) {
  const d = new Date(); d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const monthLabel = (m: string) => new Date(`${m}-01`).toLocaleDateString("id-ID", { month: "short", year: "numeric" });

export default function LaporanBelanja() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [month, setMonth] = useState(monthKey(0));
  const [range, setRange] = useState<"bulan" | "rentang">("bulan");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const dfrom = range === "rentang" ? dmyToYmd(from) : "";
  const dto = range === "rentang" ? dmyToYmd(to) : "";
  const rep = useQuery({ queryKey: ["report-purchases", month, range, dfrom, dto], queryFn: () => api<any>(`/reports/purchases${qs({ month: range === "bulan" ? month : "", date_from: dfrom, date_to: dto })}`) });
  const d = rep.data;
  const periodLabel = range === "bulan" ? monthLabel(month) : `${from || "awal"} – ${to || "akhir"}`;

  const doExport = async () => {
    setBusy(true);
    try { toast.show(await exportReportXlsx("purchases", range === "rentang" ? { dateFrom: dfrom, dateTo: dto } : { month }), "success"); }
    catch (e: any) { toast.show(e.message ?? "Export gagal", "error"); }
    finally { setBusy(false); }
  };

  const FilterBar = (
    <>
      <Chips options={[{ key: "bulan", label: "Per Bulan" }, { key: "rentang", label: "Rentang Tanggal" }]} value={range} onChange={(v) => setRange(v as any)} testID="purchase-filtermode" />
      {range === "bulan" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {[0, 1, 2, 3, 4, 5].map((o) => {
            const m = monthKey(o);
            return <Text key={m} onPress={() => setMonth(m)} style={[styles.chip, month === m && styles.chipSel]} testID={`purchase-month-${m}`}>{monthLabel(m)}</Text>;
          })}
        </ScrollView>
      ) : (
        <View style={styles.rangeRow}>
          <View style={{ flex: 1 }}><Input label="Dari (HH/BB/TTTT)" value={from} onChangeText={setFrom} placeholder="01/09/2026" keyboardType="numbers-and-punctuation" testID="purchase-from-input" /></View>
          <View style={{ flex: 1 }}><Input label="Sampai (HH/BB/TTTT)" value={to} onChangeText={setTo} placeholder="30/09/2026" keyboardType="numbers-and-punctuation" testID="purchase-to-input" /></View>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.root} testID="purchases-report-screen">
      <Header title="LAPORAN BELANJA" subtitle="Pembelian, kasbon & operasional" back />
      {FilterBar}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={rep.isRefetching} onRefresh={rep.refetch} tintColor={colors.brandPrimary} />}>
        {rep.isLoading || !d ? <Loading /> : (
          <>
            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>TOTAL BELANJA · {periodLabel}</Text>
              <Mono style={styles.totalVal}>{rupiah(d.grand_total)}</Mono>
              <Text style={styles.byMethod}>Cash {rupiah(d.by_method?.CASH)} · Hutang {rupiah(d.by_method?.HUTANG)} · Transfer {rupiah(d.by_method?.TRANSFER)}</Text>
            </View>
            <Button title="Export Excel" variant="dark" icon="download-outline" loading={busy} onPress={doExport} style={{ marginBottom: 12 }} testID="purchase-export-button" />

            <SectionTitle title={`Pembelian Part (${rupiah(d.total_parts)})`} />
            {d.parts.length === 0 ? <Empty text="Belum ada pembelian part." icon="cube-outline" testID="purchase-parts-empty" /> : d.parts.map((r: any) => (
              <View key={r.id} style={styles.row} testID={`purchase-part-${r.id}`}>
                <View style={styles.rowHead}>
                  <Text style={styles.name}>{r.part_name || r.category}{r.qty ? ` x${r.qty}` : ""}</Text>
                  <Mono style={styles.amt}>{rupiah(r.amount)}</Mono>
                </View>
                <Text style={styles.sub}>{ymdToDisplay(r.date)}{r.supplier ? ` · ${r.supplier}` : ""} · {r.payment_method}</Text>
                <Text style={styles.sub}>Satuan {rupiah(r.unit_price)} · HET {rupiah(r.het)} · Diskon {rupiah(r.discount)} · Ongkir {rupiah(r.ongkir)}</Text>
                {r.note ? <Text style={styles.sub}>{r.note}</Text> : null}
              </View>
            ))}

            <SectionTitle title={`Kasbon Mekanik (${rupiah(d.total_kasbon_mekanik)})`} />
            {d.kasbon_mekanik.length === 0 ? <Text style={styles.muted}>Tidak ada.</Text> : d.kasbon_mekanik.map((r: any) => <SimpleRow key={r.id} r={r} styles={styles} />)}

            <SectionTitle title={`Kasbon Owner / Keluarga (${rupiah(d.total_kasbon_owner)})`} />
            {d.kasbon_owner.length === 0 ? <Text style={styles.muted}>Tidak ada.</Text> : d.kasbon_owner.map((r: any) => <SimpleRow key={r.id} r={r} styles={styles} />)}

            <SectionTitle title={`Biaya Operasional (${rupiah(d.total_operasional)})`} />
            {d.operasional.length === 0 ? <Text style={styles.muted}>Tidak ada.</Text> : d.operasional.map((r: any) => <SimpleRow key={r.id} r={r} styles={styles} />)}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SimpleRow({ r, styles }: { r: any; styles: any }) {
  return (
    <View style={styles.row} testID={`purchase-row-${r.id}`}>
      <View style={styles.rowHead}>
        <Text style={styles.name}>{r.category}{r.supplier ? ` · ${r.supplier}` : ""}</Text>
        <Mono style={styles.amt}>{rupiah(r.amount)}</Mono>
      </View>
      <Text style={styles.sub}>{ymdToDisplay(r.date)} · {r.payment_method}{r.note ? ` · ${r.note}` : ""}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  rangeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: c.surface },
  chipRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { height: 36, lineHeight: 34, paddingHorizontal: 14, borderWidth: 2, borderColor: c.border, color: c.onSurface, fontSize: 13, overflow: "hidden", flexShrink: 0 },
  chipSel: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary, color: c.onBrandPrimary, fontWeight: "700" },
  totalBox: { backgroundColor: c.surfaceInverse, padding: 16, marginBottom: 12, borderLeftWidth: 6, borderLeftColor: c.brandPrimary },
  totalLabel: { color: c.brandPrimary, fontSize: 11, letterSpacing: 1.2 },
  totalVal: { color: c.onSurfaceInverse, fontSize: 28, marginTop: 4 },
  byMethod: { color: c.onSurfaceInverse, opacity: 0.85, fontSize: 12, marginTop: 4 },
  row: { borderBottomWidth: 2, borderBottomColor: c.divider, paddingVertical: 10 },
  rowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { color: c.onSurface, fontSize: 14, fontWeight: "600", flex: 1, marginRight: 8 },
  amt: { color: c.error, fontSize: 14 },
  sub: { color: c.muted, fontSize: 12, marginTop: 2 },
  muted: { color: c.muted, fontSize: 13, paddingVertical: 6 },
}));
