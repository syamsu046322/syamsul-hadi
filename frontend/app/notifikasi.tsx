import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Linking, Pressable, RefreshControl, Text, View } from "react-native";

import { api } from "@/src/api";
import { Badge, Button, Empty, Header, Loading, useToast } from "@/src/components/ui";
import { fmtDateTime } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

export default function Notifikasi() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ unread: number; items: any[] }>("/notifications") });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["notifications"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const read = useMutation({ mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "POST", body: {} }), onSuccess: invalidate });
  const readAll = useMutation({ mutationFn: () => api("/notifications/read-all", { method: "POST", body: {} }), onSuccess: () => { invalidate(); toast.show("Semua ditandai dibaca", "success"); } });

  return (
    <View style={styles.root} testID="notifications-screen">
      <Header title="NOTIFIKASI" subtitle={`${q.data?.unread ?? 0} belum dibaca`} back
        right={<Pressable onPress={() => readAll.mutate()} style={styles.readAll} testID="notif-read-all-button"><Text style={styles.readAllText}>BACA SEMUA</Text></Pressable>} />
      {q.isLoading ? <Loading /> : (
        <FlatList data={q.data?.items ?? []} keyExtractor={(n) => n.id} contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Empty text="Belum ada notifikasi." icon="notifications-outline" testID="notif-empty" />}
          renderItem={({ item: n }) => (
            <Pressable style={[styles.row, !n.read && styles.unread]} testID={`notif-row-${n.id}`}
              onPress={() => { if (!n.read) read.mutate(n.id); if (n.transaction_id) router.push(`/transaksi/${n.transaction_id}`); else if (n.meta?.part_id) router.push(`/stok/${n.meta.part_id}`); else if (n.meta?.check_id) router.push(`/cek-stok/${n.meta.check_id}`); else if (n.kind === "CHECKLIST TOOLS") router.push("/tools"); }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <Badge label={n.kind} tone={n.kind === "HUTANG" || n.kind === "KASBON OWNER" ? "warning" : n.kind === "STOK MENIPIS" || n.kind === "TOOLS BERMASALAH" ? "error" : n.kind === "CHECKLIST TOOLS" || n.kind === "CEK FISIK STOK" ? "info" : "success"} />
                <Text style={styles.time}>{fmtDateTime(n.created_at)}</Text>
              </View>
              <Text style={styles.title}>{n.title}</Text>
              <Text style={styles.body}>{n.body}</Text>
              {n.wa_url ? <Button title="Kirim ke WhatsApp Owner" variant="success" icon="logo-whatsapp" small onPress={() => Linking.openURL(n.wa_url)} style={{ marginTop: 8, alignSelf: "flex-start" }} testID={`notif-wa-${n.id}`} /> : null}
            </Pressable>
          )} />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  readAll: { height: 36, paddingHorizontal: 10, borderWidth: 1.5, borderColor: c.brandPrimary, justifyContent: "center" },
  readAllText: { color: c.brandPrimary, fontSize: 12, fontWeight: "500", letterSpacing: 0.5 },
  row: { padding: 16, borderBottomWidth: 2, borderBottomColor: c.divider, gap: 4 },
  unread: { backgroundColor: c.brandTertiary, borderLeftWidth: 4, borderLeftColor: c.brandPrimary },
  time: { fontSize: 11, color: c.muted },
  title: { fontSize: 15, color: c.onSurface, fontWeight: "500", marginTop: 4 },
  body: { fontSize: 13, color: c.onSurface, lineHeight: 19 },
}));
