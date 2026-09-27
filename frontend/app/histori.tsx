import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import { api, qs } from "@/src/api";
import { Badge, Empty, Header, Input, Loading, Mono } from "@/src/components/ui";
import { fmtDate, rupiah } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

export default function Histori() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ vehicle_id?: string; plate?: string }>();
  const [q, setQ] = useState("");
  const list = useQuery({ queryKey: ["history", q, params.vehicle_id], queryFn: () => api<any[]>(`/history${qs({ q, vehicle_id: params.vehicle_id })}`) });
  const total = (list.data ?? []).reduce((s, t) => s + (t.total ?? 0), 0);

  return (
    <View style={styles.root} testID="history-screen">
      <Header title={params.plate ? `HISTORI ${params.plate}` : "HISTORI SERVIS"} subtitle={`${list.data?.length ?? 0} servis · ${rupiah(total)}`} back />
      <View style={styles.searchWrap}>
        <Input value={q} onChangeText={setQ} placeholder="Cari nota, nopol, nama, HP, tanggal, mekanik" testID="history-search-input" />
      </View>
      {list.isLoading ? <Loading /> : (
        <FlatList
          data={list.data ?? []}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Empty text="Belum ada histori servis." icon="time-outline" testID="history-empty" />}
          renderItem={({ item: t }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/transaksi/${t.id}`)} testID={`history-row-${t.trx_no}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Mono style={styles.date}>{fmtDate(t.paid_at ?? t.created_at)}</Mono>
                <Badge status={t.status} />
              </View>
              <Text style={styles.title}>{t.vehicle_name || "Motor"} – {t.plate}</Text>
              <Text style={styles.sub}>{t.customer_name} · {t.customer_phone || "-"}</Text>
              <Text style={styles.items} numberOfLines={2}>• {(t.item_names ?? []).join("  • ") || "-"}</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                <Text style={styles.sub}>Mekanik: {t.mechanic_name || "-"} · {t.invoice_no ?? t.trx_no}</Text>
                <Mono style={styles.total}>{rupiah(t.total)}</Mono>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  searchWrap: { padding: 16, paddingBottom: 4, borderBottomWidth: 2, borderBottomColor: c.divider },
  row: { padding: 16, borderBottomWidth: 2, borderBottomColor: c.divider, gap: 2 },
  date: { fontSize: 13, color: c.brandPrimary },
  title: { fontSize: 16, color: c.onSurface, fontWeight: "500", marginTop: 4 },
  sub: { fontSize: 12, color: c.muted },
  items: { fontSize: 13, color: c.onSurface, marginTop: 4 },
  total: { fontSize: 15 },
}));
