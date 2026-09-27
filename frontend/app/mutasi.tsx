import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { DateEditSheet, isoToDMY } from "@/src/components/date-edit";
import { Empty, Header, Loading, Mono, useToast } from "@/src/components/ui";
import { fmtDateTime } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

export default function Mutasi() {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [edit, setEdit] = useState<any | null>(null);
  const list = useQuery({ queryKey: ["stock-movements"], queryFn: () => api<any[]>("/stock-movements") });
  const editDate = useMutation({
    mutationFn: (dmy: string) => api(`/stock-movements/${edit.id}/date`, { method: "PUT", body: { date: dmy } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stock-movements"] }); qc.invalidateQueries({ queryKey: ["movements"] }); setEdit(null); toast.show("Tanggal mutasi diperbarui", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });
  return (
    <View style={styles.root} testID="movements-screen">
      <Header title="MUTASI STOK" subtitle="Riwayat keluar / masuk part" back />
      {list.isLoading ? <Loading /> : (
        <FlatList data={list.data ?? []} keyExtractor={(m) => m.id} contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Empty text="Belum ada mutasi stok." icon="swap-vertical-outline" />}
          renderItem={({ item: m }) => (
            <View style={styles.row} testID={`movement-row-${m.id}`}>
              <Mono style={[styles.qty, { color: m.qty < 0 ? colors.error : colors.success }]}>{m.qty > 0 ? `+${m.qty}` : m.qty}</Mono>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{m.part_name} <Text style={styles.muted}>({m.part_code})</Text></Text>
                <Text style={styles.reason}>{m.reason}{m.transaction_no ? ` · ${m.transaction_no}` : ""}{m.note ? ` · ${m.note}` : ""}</Text>
                <Text style={styles.muted}>{fmtDateTime(m.created_at)} · {m.username}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Mono style={styles.muted}>{m.stock_before} → {m.stock_after}</Mono>
                {isOwner ? (
                  <Pressable onPress={() => setEdit(m)} hitSlop={8} style={styles.dateBtn} testID={`movement-edit-date-${m.id}`}>
                    <Ionicons name="calendar-outline" size={16} color={colors.brandPrimary} />
                    <Text style={styles.dateBtnText}>Tanggal</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )} />
      )}
      <DateEditSheet visible={!!edit} onClose={() => setEdit(null)} initial={isoToDMY(edit?.created_at)} onSave={(dmy) => editDate.mutate(dmy)} loading={editDate.isPending} note={`Ubah tanggal mutasi ${edit?.part_name ?? ""}. Format HH/BB/TTTT.`} testID="movement-date-sheet" />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: 2, borderBottomColor: c.divider },
  qty: { fontSize: 18, width: 48 },
  name: { fontSize: 15, color: c.onSurface, fontWeight: "500" },
  reason: { fontSize: 13, color: c.onSurface },
  muted: { fontSize: 12, color: c.muted },
  dateBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderColor: c.brandPrimary, paddingHorizontal: 8, paddingVertical: 4 },
  dateBtnText: { fontSize: 11, color: c.brandPrimary, fontWeight: "600" },
}));
