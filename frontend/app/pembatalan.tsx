import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import { api } from "@/src/api";
import { Badge, Empty, Header, Loading, Mono } from "@/src/components/ui";
import { fmtDateTime, rupiah } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

export default function Pembatalan() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: ["cancellations"], queryFn: () => api<any>("/reports/cancellations") });
  const d = q.data;
  return (
    <View style={styles.root} testID="cancellations-screen">
      <Header title="LAPORAN PEMBATALAN" subtitle={d ? `${d.count} faktur · ${rupiah(d.total_value)} · ${d.paid_cancelled} sudah dibayar` : ""} back />
      {q.isLoading ? <Loading /> : (
        <FlatList data={d?.rows ?? []} keyExtractor={(r) => r.id} contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Empty text="Belum ada pembatalan." icon="close-circle-outline" testID="cancellations-empty" />}
          renderItem={({ item: r }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/transaksi/${r.id}`)} testID={`cancel-row-${r.trx_no}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Mono style={styles.no}>{r.invoice_no ?? r.trx_no} · {r.queue_no}</Mono>
                <Badge label={r.was_paid ? "SUDAH DIBAYAR" : r.status_before_cancel ? r.status_before_cancel.replace(/_/g, " ") : "BELUM BAYAR"} tone={r.was_paid ? "error" : "neutral"} />
              </View>
              <Text style={styles.name}>{r.customer_name} · {r.plate}</Text>
              <Text style={styles.reason}>Alasan: {r.cancel_reason || "-"}</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={styles.sub}>Oleh {r.cancelled_by || "-"} · {fmtDateTime(r.cancelled_at)}</Text>
                <Mono style={styles.total}>{rupiah(r.total)}</Mono>
              </View>
            </Pressable>
          )} />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  row: { padding: 16, borderBottomWidth: 2, borderBottomColor: c.divider, gap: 2 },
  no: { fontSize: 12, color: c.brandPrimary },
  name: { fontSize: 15, color: c.onSurface, fontWeight: "500", marginTop: 4 },
  reason: { fontSize: 13, color: c.onSurface, marginTop: 2 },
  sub: { fontSize: 12, color: c.muted },
  total: { fontSize: 14 },
}));
