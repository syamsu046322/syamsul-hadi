import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qs } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, Chips, Empty, Input, Loading, Mono } from "@/src/components/ui";
import { fmtTime, rupiah } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

type Filter = "aktif" | "MENUNGGU_SERVIS" | "DIPROSES" | "MENUNGGU_PERSETUJUAN" | "kasir" | "dibayar" | "DIBATALKAN";

const OPTIONS: { key: Filter; label: string }[] = [
  { key: "aktif", label: "Semua Aktif" },
  { key: "MENUNGGU_SERVIS", label: "Menunggu" },
  { key: "DIPROSES", label: "Diproses" },
  { key: "MENUNGGU_PERSETUJUAN", label: "Persetujuan" },
  { key: "kasir", label: "Antrian Kasir" },
  { key: "dibayar", label: "Dibayar" },
  { key: "DIBATALKAN", label: "Dibatalkan" },
];

export function TrxRow({ t, onPress }: { t: any; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={styles.row} testID={`trx-row-${t.queue_no}`}>
      <View style={styles.queueBox}><Mono style={styles.queueText}>{t.queue_no}</Mono></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.name} numberOfLines={1}>{t.customer_name}</Text>
        <Text style={styles.sub} numberOfLines={1}>{t.plate} · {t.vehicle_name || "-"}</Text>
        <Text style={styles.sub} numberOfLines={1}>{t.mechanic_name ? `Mekanik: ${t.mechanic_name}` : "Belum ada mekanik"} · {fmtTime(t.created_at)}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <Badge status={t.status} testID={`trx-status-${t.queue_no}`} />
        <Mono style={styles.total}>{rupiah(t.total)}</Mono>
      </View>
    </Pressable>
  );
}

export default function Antrian() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, can } = useAuth();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<Filter>(user?.role === "kasir" ? "kasir" : "aktif");
  const [q, setQ] = useState("");

  useEffect(() => { if (params.filter) setFilter(params.filter as Filter); }, [params.filter]);

  const list = useQuery({
    queryKey: ["transactions", filter, q],
    queryFn: () => api<any[]>(`/transactions${qs({ status: filter, q })}`),
    refetchInterval: 15000,
  });

  return (
    <View style={styles.root} testID="queue-screen">
      <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>{filter === "kasir" ? "ANTRIAN KASIR" : "ANTRIAN SERVIS"}</Text>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={20} color={colors.muted} />
          <Input value={q} onChangeText={setQ} placeholder="Cari antrian, nopol, nama, HP" style={styles.search} testID="queue-search-input" />
        </View>
      </View>
      <Chips options={OPTIONS} value={filter} onChange={setFilter} testID="queue-filter" />
      {list.isLoading ? <Loading /> : (
        <FlatList
          data={list.data ?? []}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => <TrxRow t={item} onPress={() => router.push(`/transaksi/${item.id}`)} />}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Empty text={list.isError ? "Gagal memuat antrian." : "Tidak ada antrian."} icon="bicycle-outline" testID="queue-empty" />}
        />
      )}
      {can("mekanik", "kasir") ? (
        <Pressable style={styles.fab} onPress={() => router.push("/transaksi/baru")} testID="queue-new-transaction-fab">
          <Ionicons name="add" size={26} color={colors.onSuccess} />
          <Text style={styles.fabText}>TRANSAKSI SERVIS BARU</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  top: { backgroundColor: c.surfaceInverse, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 3, borderBottomColor: c.brandPrimary },
  title: { color: c.onSurfaceInverse, fontSize: 20, fontWeight: "500", letterSpacing: 1.5, marginBottom: 10 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surface, paddingLeft: 12, borderWidth: 2, borderColor: c.brandPrimary },
  search: { borderWidth: 0, flex: 1, minHeight: 44 },
  row: { flexDirection: "row", gap: 12, padding: 14, borderBottomWidth: 2, borderBottomColor: c.divider, alignItems: "center", backgroundColor: c.surface },
  queueBox: { backgroundColor: c.surfaceInverse, paddingHorizontal: 8, paddingVertical: 10, minWidth: 64, alignItems: "center" },
  queueText: { color: c.brandPrimary, fontSize: 16 },
  name: { fontSize: 16, color: c.onSurface, fontWeight: "500" },
  sub: { fontSize: 12, color: c.muted },
  total: { fontSize: 13, color: c.onSurface },
  fab: { position: "absolute", right: 16, bottom: 20, backgroundColor: c.success, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, height: 56, borderWidth: 2, borderColor: c.border },
  fabText: { color: c.onSuccess, fontWeight: "500", letterSpacing: 0.5 },
}));
