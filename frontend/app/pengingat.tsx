import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Linking, Pressable, RefreshControl, Share, Text, View } from "react-native";

import { api, qs } from "@/src/api";
import { Badge, Button, Chips, Empty, Header, Loading, Mono, useToast } from "@/src/components/ui";
import { fmtDate } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

type Filter = "all" | "TERLAMBAT" | "SEGERA" | "MENDATANG";

export default function Pengingat() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const list = useQuery({ queryKey: ["reminders"], queryFn: () => api<any[]>("/reminders") });
  const rows = (list.data ?? []).filter((r) => filter === "all" || r.status === filter);

  const send = useMutation({
    mutationFn: async (r: any) => {
      if (r.wa_url) await Linking.openURL(r.wa_url).catch(() => Share.share({ message: r.message }));
      else await Share.share({ message: r.message });
      await api(`/reminders/${r.vehicle_id}/sent${qs({ due_date: r.due_date })}`, { method: "POST", body: {} });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reminders"] }); toast.show("Pengingat dikirim via WhatsApp", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  const tone = (s: string) => (s === "TERLAMBAT" ? "error" : s === "SEGERA" ? "warning" : "info");
  const counts = { TERLAMBAT: 0, SEGERA: 0, MENDATANG: 0 } as Record<string, number>;
  (list.data ?? []).forEach((r) => { counts[r.status] = (counts[r.status] ?? 0) + 1; });

  return (
    <View style={styles.root} testID="reminders-screen">
      <Header title="PENGINGAT SERVIS" subtitle={`${counts.TERLAMBAT} terlambat · ${counts.SEGERA} segera · ${counts.MENDATANG} mendatang`} back />
      <Chips options={[{ key: "all", label: "Semua" }, { key: "TERLAMBAT", label: "Terlambat" }, { key: "SEGERA", label: "7 Hari Ini" }, { key: "MENDATANG", label: "Mendatang" }]} value={filter} onChange={setFilter} testID="reminder-filter" />
      {list.isLoading ? <Loading /> : (
        <FlatList data={rows} keyExtractor={(r) => r.vehicle_id} contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Empty text="Tidak ada pengingat servis." icon="alarm-outline" testID="reminders-empty" />}
          renderItem={({ item: r }) => (
            <View style={styles.row} testID={`reminder-row-${r.plate.replace(/\s/g, "")}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Mono style={styles.plate}>{r.plate}</Mono>
                <Badge label={r.status === "TERLAMBAT" ? `TERLAMBAT ${Math.abs(r.days_left)} HARI` : r.status === "SEGERA" ? `${r.days_left} HARI LAGI` : fmtDate(r.due_date)} tone={tone(r.status)} />
              </View>
              <Text style={styles.name}>{r.vehicle_name || "Motor"} · {r.customer_name}</Text>
              <Text style={styles.sub}>Servis terakhir {fmtDate(r.last_service_at)} · Jadwal berikutnya {fmtDate(r.due_date)}{r.next_km ? ` · KM ${r.next_km}` : ""}</Text>
              {r.recommendation ? <Text style={styles.sub}>Rekomendasi: {r.recommendation}</Text> : null}
              {r.reminder_sent_at ? <Text style={[styles.sub, { color: colors.success }]}>✓ Pengingat terkirim {fmtDate(r.reminder_sent_at)}</Text> : null}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <Button title="Kirim WhatsApp" variant="success" icon="logo-whatsapp" small onPress={() => send.mutate(r)} disabled={!r.customer_phone} style={{ flex: 1 }} testID={`reminder-wa-${r.plate.replace(/\s/g, "")}`} />
                <Pressable style={styles.linkBtn} onPress={() => router.push({ pathname: "/histori", params: { vehicle_id: r.vehicle_id, plate: r.plate } })} testID={`reminder-history-${r.plate.replace(/\s/g, "")}`}>
                  <Text style={styles.linkText}>Histori</Text>
                </Pressable>
              </View>
              {!r.customer_phone ? <Text style={[styles.sub, { color: colors.error }]}>No HP pelanggan belum ada</Text> : null}
            </View>
          )} />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  row: { padding: 16, borderBottomWidth: 2, borderBottomColor: c.divider, gap: 2 },
  plate: { fontSize: 17, color: c.brandPrimary },
  name: { fontSize: 15, color: c.onSurface, fontWeight: "500", marginTop: 4 },
  sub: { fontSize: 12, color: c.muted, marginTop: 2 },
  linkBtn: { height: 40, paddingHorizontal: 14, borderWidth: 2, borderColor: c.border, justifyContent: "center" },
  linkText: { color: c.onSurface, fontWeight: "500", fontSize: 13 },
}));
