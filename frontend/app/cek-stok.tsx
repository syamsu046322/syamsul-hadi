import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Badge, Button, Empty, Header, Loading, Mono, useToast } from "@/src/components/ui";
import { fmtDate, fmtTime } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

export const CHECK_TONE: Record<string, "info" | "warning" | "success" | "error" | "neutral"> = {
  PROSES: "info", DIAJUKAN: "warning", DISETUJUI: "success", DITOLAK: "error", SELESAI: "neutral",
};

export default function CekStok() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["stock-checks"], queryFn: () => api<any[]>("/stock-checks") });
  const start = useMutation({
    mutationFn: () => api<any>("/stock-checks", { method: "POST", body: {} }),
    onSuccess: (s) => { qc.invalidateQueries({ queryKey: ["stock-checks"] }); router.push(`/cek-stok/${s.id}`); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  const today = q.data?.find((s) => s.status === "PROSES");

  return (
    <View style={styles.root} testID="stock-check-screen">
      <Header title="CEK FISIK STOK" subtitle="Stock opname berurutan per rak" back />
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <Button title={today ? "Lanjutkan Cek Fisik Hari Ini" : "Mulai Cek Fisik Hari Ini"} variant="primary" icon="clipboard-outline"
          loading={start.isPending} onPress={() => start.mutate()} testID="stock-check-start-button" />
      </View>
      {q.isLoading ? <Loading /> : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Empty text="Belum ada riwayat cek fisik stok." icon="clipboard-outline" testID="stock-check-empty" />}
          renderItem={({ item: s }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/cek-stok/${s.id}`)} testID={`stock-check-row-${s.date}-${fmtTime(s.created_at)}`}>
              <View style={styles.iconBox}><Ionicons name="clipboard-outline" size={22} color={colors.onSurfaceInverse} /></View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.date}>{fmtDate(s.date)}</Text>
                  <Badge label={s.status} tone={CHECK_TONE[s.status] ?? "neutral"} />
                </View>
                <Text style={styles.sub}>
                  <Mono>{s.checked_count}/{s.total_items}</Mono> dicek · <Mono>{s.diff_count}</Mono> selisih · oleh @{s.created_by}
                  {s.decided_by ? ` · diputuskan @${s.decided_by}` : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 2, borderColor: c.border, padding: 12, marginBottom: 10, minHeight: 64 },
  iconBox: { width: 40, height: 40, backgroundColor: c.surfaceInverse, alignItems: "center", justifyContent: "center" },
  date: { fontSize: 16, color: c.onSurface, fontWeight: "500" },
  sub: { fontSize: 12, color: c.muted },
}));
