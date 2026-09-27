import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qs } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Chips, Empty, Header, Input, Loading, Mono, Sheet, useToast } from "@/src/components/ui";
import { rupiah } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

function monthKey(offset = 0) {
  const d = new Date(); d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const monthLabel = (m: string) => new Date(`${m}-01`).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
const roleLabel: Record<string, string> = { owner: "Pemilik", mekanik: "Mekanik", kasir: "Kasir", partman: "Partman" };

export default function Penggajian() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [month, setMonth] = useState(monthKey(0));
  const [setOpen, setSetOpen] = useState(false);
  const [bonus, setBonus] = useState("");
  const [draw, setDraw] = useState("");

  const settings = useQuery({ queryKey: ["payroll-settings"], queryFn: () => api<any>("/payroll/settings") });
  const report = useQuery({ queryKey: ["payroll-report", month], queryFn: () => api<any>(`/payroll/report${qs({ month })}`) });

  useEffect(() => {
    if (settings.data) { setBonus(String(settings.data.bonus_per_unit ?? 0)); setDraw(String(settings.data.owner_draw ?? 0)); }
  }, [settings.data]);

  const saveSet = useMutation({
    mutationFn: () => api("/payroll/settings", { method: "PUT", body: { bonus_per_unit: Number(bonus) || 0, owner_draw: Number(draw) || 0 } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll-settings"] }); qc.invalidateQueries({ queryKey: ["payroll-report"] }); setSetOpen(false); toast.show("Pengaturan gaji tersimpan", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  const rows: any[] = report.data?.rows ?? [];

  if (user && user.role !== "owner") return <Redirect href="/(tabs)" />;

  return (
    <View style={styles.root} testID="payroll-screen">
      <Header title="PENGGAJIAN KARYAWAN" subtitle={monthLabel(month)} back
        right={<Pressable onPress={() => setSetOpen(true)} hitSlop={8} testID="payroll-settings-button"><Ionicons name="settings-outline" size={22} color={colors.brandPrimary} /></Pressable>} />
      <Chips options={[0, 1, 2, 3, 4, 5].map((o) => ({ key: monthKey(o), label: new Date(`${monthKey(o)}-01`).toLocaleDateString("id-ID", { month: "short", year: "numeric" }) }))} value={month} onChange={setMonth} testID="payroll-month" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} refreshControl={<RefreshControl refreshing={report.isRefetching} onRefresh={report.refetch} tintColor={colors.brandPrimary} />}>
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>TOTAL PENGELUARAN GAJI · {rows.length} KARYAWAN</Text>
          <Mono style={styles.totalVal}>{rupiah(report.data?.grand_total)}</Mono>
          <Text style={styles.totalSub}>Gaji pokok {rupiah(report.data?.total_base)} · Bonus {rupiah(report.data?.total_bonus)}</Text>
        </View>
        {report.isLoading ? <Loading /> : rows.length === 0 ? <Empty text="Belum ada data karyawan." icon="people-outline" /> : rows.map((r) => (
          <Pressable key={r.user_id} style={styles.row} onPress={() => router.push(`/slip-gaji/${r.user_id}${qs({ month })}` as any)} testID={`payroll-row-${r.username}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{r.name}</Text>
              <Text style={styles.sub}>{roleLabel[r.role] || r.role}{r.role === "mekanik" ? ` · ${r.unit_count} unit servis × ${rupiah(r.bonus_per_unit)}` : ""}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Mono style={styles.total}>{rupiah(r.total)}</Mono>
              {r.bonus_total > 0 ? <Text style={styles.bonus}>+ bonus {rupiah(r.bonus_total)}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))}
        <Text style={styles.hint}>Ketuk karyawan untuk melihat & mencetak slip gaji. Bonus mekanik dihitung otomatis dari jumlah nota servis lunas bulan berjalan.</Text>
      </ScrollView>
      <Sheet visible={setOpen} onClose={() => setSetOpen(false)} title="Pengaturan Penggajian" testID="payroll-settings-sheet">
        <Input label="Bonus per unit servis mekanik (Rp)" value={bonus} onChangeText={(v) => setBonus(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="0" testID="payroll-bonus-input" />
        <Input label="Pengambilan tetap Owner / bulan (Rp)" value={draw} onChangeText={(v) => setDraw(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="0" testID="payroll-draw-input" />
        <Button title="Simpan" onPress={() => saveSet.mutate()} loading={saveSet.isPending} testID="payroll-settings-save" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  totalBox: { backgroundColor: c.surfaceInverse, padding: 16, marginBottom: 16, borderLeftWidth: 6, borderLeftColor: c.brandPrimary },
  totalLabel: { color: c.brandPrimary, fontSize: 11, letterSpacing: 1.2 },
  totalVal: { color: c.onSurfaceInverse, fontSize: 28, marginTop: 4 },
  totalSub: { color: c.onSurfaceInverse, fontSize: 12, marginTop: 4, opacity: 0.85 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: c.divider },
  name: { fontSize: 16, color: c.onSurface, fontWeight: "500" },
  sub: { fontSize: 12, color: c.muted, marginTop: 2 },
  total: { fontSize: 16 },
  bonus: { fontSize: 11, color: c.success, marginTop: 2 },
  hint: { color: c.muted, fontSize: 12, marginTop: 16, textAlign: "center", lineHeight: 17 },
}));
