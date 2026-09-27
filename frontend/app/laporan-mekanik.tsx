import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qs } from "@/src/api";
import { Chips, Empty, Header, Loading, Mono } from "@/src/components/ui";
import { rupiah } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

function monthKey(offset = 0) {
  const d = new Date(); d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const monthLabel = (m: string) => new Date(`${m}-01`).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

export default function LaporanMekanik() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(monthKey(0));
  const q = useQuery({ queryKey: ["report-mechanics", month], queryFn: () => api<any>(`/reports/mechanics${qs({ month })}`) });
  const rows: any[] = q.data?.rows ?? [];
  const max = Math.max(1, ...rows.map((r) => r.revenue));

  return (
    <View style={styles.root} testID="mechanic-report-screen">
      <Header title="RIWAYAT PER MEKANIK" subtitle={monthLabel(month)} back />
      <Chips options={[0, 1, 2, 3, 4, 5].map((o) => ({ key: monthKey(o), label: new Date(`${monthKey(o)}-01`).toLocaleDateString("id-ID", { month: "short", year: "numeric" }) }))} value={month} onChange={setMonth} testID="mechanic-month" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}>
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>TOTAL {q.data?.total_count ?? 0} SERVIS SELESAI</Text>
          <Mono style={styles.totalVal}>{rupiah(q.data?.total_revenue)}</Mono>
        </View>
        {q.isLoading ? <Loading /> : rows.length === 0 ? <Empty text="Belum ada servis selesai di bulan ini." icon="construct-outline" /> : rows.map((r, idx) => (
          <View key={r.mechanic} style={styles.row} testID={`mechanic-row-${idx}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.name}>{idx + 1}. {r.mechanic}</Text>
              <Mono style={styles.rev}>{rupiah(r.revenue)}</Mono>
            </View>
            <View style={styles.barBg}><View style={[styles.bar, { width: `${Math.max(3, (r.revenue / max) * 100)}%` }]} /></View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.sub}>{r.count} servis · rata-rata {rupiah(Math.round(r.revenue / Math.max(r.count, 1)))}</Text>
              <Text style={styles.sub}>Jasa {rupiah(r.jasa)} · Part {rupiah(r.part)}</Text>
            </View>
          </View>
        ))}
        <Text style={styles.hint}>Omzet jasa per mekanik dapat dipakai sebagai dasar perhitungan bonus.</Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  totalBox: { backgroundColor: c.surfaceInverse, padding: 16, marginBottom: 16, borderLeftWidth: 6, borderLeftColor: c.brandPrimary },
  totalLabel: { color: c.brandPrimary, fontSize: 11, letterSpacing: 1.5 },
  totalVal: { color: c.onSurfaceInverse, fontSize: 28, marginTop: 4 },
  row: { paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: c.divider, gap: 6 },
  name: { fontSize: 16, color: c.onSurface, fontWeight: "500" },
  rev: { fontSize: 16 },
  barBg: { height: 8, backgroundColor: c.surfaceTertiary },
  bar: { height: 8, backgroundColor: c.brandPrimary },
  sub: { fontSize: 12, color: c.muted },
  hint: { color: c.muted, fontSize: 12, marginTop: 16, textAlign: "center" },
}));
