import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, Button, Chips, Confirm, Empty, Header, Input, Loading, Mono, Sheet, useToast } from "@/src/components/ui";
import { fmtDate, parseNum } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";
import { CHECK_TONE } from "@/app/cek-stok";

type Filter = "all" | "diff" | "unchecked";

export default function CekStokDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can, user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [edit, setEdit] = useState<any | null>(null);
  const [physical, setPhysical] = useState("");
  const [confirm, setConfirm] = useState<"submit" | "finish" | "approve" | "reject" | null>(null);

  const q = useQuery({ queryKey: ["stock-check", id], queryFn: () => api<any>(`/stock-checks/${id}`) });
  const chk = q.data;
  const shown = useMemo(() => {
    const items: any[] = chk?.items ?? [];
    return items.filter((it) => filter === "diff" ? it.checked && it.diff !== 0 : filter === "unchecked" ? !it.checked : true);
  }, [chk, filter]);
  const isProses = chk?.status === "PROSES";
  const isDiajukan = chk?.status === "DIAJUKAN";

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["stock-check", id] }); qc.invalidateQueries({ queryKey: ["stock-checks"] }); };
  const onErr = (e: any) => toast.show(e.message, "error");

  const saveItem = useMutation({
    mutationFn: (v: { iid: string; physical: number; checked: boolean }) => api(`/stock-checks/${id}/items/${v.iid}`, { method: "PUT", body: { physical: v.physical, checked: v.checked } }),
    onSuccess: () => { setEdit(null); invalidate(); },
    onError: onErr,
  });
  const act = useMutation({
    mutationFn: (action: "submit" | "finish" | "approve" | "reject") => api(`/stock-checks/${id}/${action}`, { method: "POST", body: {} }),
    onSuccess: (_r, action) => {
      setConfirm(null); invalidate();
      const msg = { submit: "Selisih diajukan ke Owner", finish: "Sesi cek fisik selesai", approve: "Penyesuaian stok disetujui & diterapkan", reject: "Pengajuan ditolak" }[action];
      toast.show(msg, "success");
    },
    onError: onErr,
  });

  const openEdit = (it: any) => {
    if (!isProses) return;
    setEdit(it);
    setPhysical(it.stock_physical !== null && it.stock_physical !== undefined ? String(it.stock_physical) : "");
  };

  const diffLabel = (d: number) => (d > 0 ? `+${d}` : `${d}`);

  return (
    <View style={styles.root} testID="stock-check-detail-screen">
      <Header title="CEK FISIK STOK" back
        subtitle={chk ? `${fmtDate(chk.date)} · ${chk.checked_count}/${chk.total_items} dicek · ${chk.diff_count} selisih · @${chk.created_by}` : ""}
        right={chk ? <Badge label={chk.status} tone={CHECK_TONE[chk.status] ?? "neutral"} big /> : null} />
      <Chips options={[{ key: "all", label: "Semua" }, { key: "diff", label: `Selisih (${chk?.diff_count ?? 0})` }, { key: "unchecked", label: "Belum Dicek" }]}
        value={filter} onChange={setFilter} testID="stock-check-filter" />
      {q.isLoading ? <Loading /> : (
        <FlatList
          data={shown}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingBottom: (isProses || (isDiajukan && user?.role === "owner")) ? 170 : insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Empty text={filter === "diff" ? "Tidak ada selisih." : filter === "unchecked" ? "Semua part sudah dicek." : "Tidak ada part."} icon="cube-outline" testID="stock-check-detail-empty" />}
          renderItem={({ item: it }) => {
            const hasDiff = it.checked && it.diff !== 0;
            return (
              <Pressable style={[styles.row, hasDiff && styles.rowDiff]} onPress={() => openEdit(it)} disabled={!isProses} testID={`check-item-${it.part_code}`}>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {it.rack ? <View style={styles.rack}><Text style={styles.rackText}>{it.rack}</Text></View> : null}
                    <Text style={styles.code}>{it.part_code}</Text>
                  </View>
                  <Text style={styles.name}>{it.part_name}</Text>
                  {it.checked ? (
                    <Text style={styles.counts}>
                      Sistem <Mono>{it.stock_system}</Mono> · Fisik <Mono>{it.stock_physical}</Mono>
                      {hasDiff ? <> · Selisih <Mono style={{ color: colors.error }}>{diffLabel(it.diff)}</Mono></> : " · Sesuai"}
                    </Text>
                  ) : <Text style={styles.pending}>Belum dicek fisik</Text>}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  {it.adj_status ? <Badge label={it.adj_status} tone={it.adj_status === "DISETUJUI" ? "success" : it.adj_status === "DITOLAK" ? "error" : "warning"} /> : null}
                  {it.checked ? (
                    <Ionicons name={hasDiff ? "alert-circle" : "checkmark-circle"} size={26} color={hasDiff ? colors.error : colors.success} />
                  ) : (
                    <View style={styles.unchecked}><Ionicons name="square-outline" size={24} color={colors.muted} /></View>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {isProses && can("partman") ? (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <Button title={`Ajukan Penyesuaian (${chk?.diff_count ?? 0} selisih)`} variant="primary" icon="send-outline" small style={{ flex: 1 }}
            disabled={!chk?.diff_count} onPress={() => setConfirm("submit")} testID="stock-check-submit-button" />
          <Button title="Selesai" variant="outline" icon="checkmark-done-outline" small onPress={() => setConfirm("finish")} testID="stock-check-finish-button" />
        </View>
      ) : null}
      {isDiajukan && user?.role === "owner" ? (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <Button title="Setujui & Sesuaikan Stok" variant="primary" icon="checkmark-circle-outline" small style={{ flex: 1 }}
            onPress={() => setConfirm("approve")} testID="stock-check-approve-button" />
          <Button title="Tolak" variant="danger" icon="close-circle-outline" small onPress={() => setConfirm("reject")} testID="stock-check-reject-button" />
        </View>
      ) : null}

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit ? `Cek Fisik: ${edit.part_name}` : ""} testID="check-item-sheet" scroll={false}>
        {edit ? (
          <View>
            <Text style={styles.sheetInfo}>Kode {edit.part_code}{edit.rack ? ` · Rak ${edit.rack}` : ""} · Stok sistem: <Mono>{edit.stock_system} {edit.unit}</Mono></Text>
            <Input label="Jumlah Fisik di Rak" value={physical} onChangeText={setPhysical} keyboardType="number-pad" placeholder="0" testID="check-physical-input" />
            {physical !== "" && parseNum(physical) !== edit.stock_system ? (
              <Text style={styles.sheetDiff}>Selisih: {diffLabel(parseNum(physical) - edit.stock_system)} {edit.unit} — perlu persetujuan Owner untuk menyesuaikan stok</Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Button title={`Sesuai Sistem (${edit.stock_system})`} variant="outline" small style={{ flex: 1 }} loading={saveItem.isPending}
                onPress={() => saveItem.mutate({ iid: edit.id, physical: edit.stock_system, checked: true })} testID="check-match-button" />
              <Button title="Simpan" variant="primary" small style={{ flex: 1 }} loading={saveItem.isPending} disabled={physical === ""}
                onPress={() => saveItem.mutate({ iid: edit.id, physical: parseNum(physical), checked: true })} testID="check-save-button" />
            </View>
          </View>
        ) : null}
      </Sheet>

      <Confirm visible={confirm === "submit"} title="Ajukan Penyesuaian Stok" testID="confirm-submit" loading={act.isPending}
        message={`${chk?.diff_count ?? 0} part dengan selisih akan diajukan ke Owner. Stok sistem baru berubah setelah Owner menyetujui. Lanjutkan?`}
        onCancel={() => setConfirm(null)} onConfirm={() => act.mutate("submit")} />
      <Confirm visible={confirm === "finish"} title="Selesaikan Cek Fisik" testID="confirm-finish" loading={act.isPending}
        message="Sesi ditutup tanpa pengajuan penyesuaian. Part yang belum dicek dibiarkan. Lanjutkan?"
        onCancel={() => setConfirm(null)} onConfirm={() => act.mutate("finish")} />
      <Confirm visible={confirm === "approve"} title="Setujui Penyesuaian" testID="confirm-approve" loading={act.isPending}
        message={`Stok sistem ${chk?.diff_count ?? 0} part akan diubah mengikuti jumlah fisik dan dicatat di mutasi stok. Lanjutkan?`}
        onCancel={() => setConfirm(null)} onConfirm={() => act.mutate("approve")} />
      <Confirm visible={confirm === "reject"} title="Tolak Pengajuan" testID="confirm-reject" loading={act.isPending} danger
        message="Pengajuan penyesuaian ditolak dan stok sistem tidak berubah. Lanjutkan?"
        onCancel={() => setConfirm(null)} onConfirm={() => act.mutate("reject")} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  row: { flexDirection: "row", gap: 12, padding: 12, borderBottomWidth: 2, borderBottomColor: c.divider, alignItems: "center" },
  rowDiff: { backgroundColor: c.brandTertiary, borderLeftWidth: 4, borderLeftColor: c.error },
  rack: { backgroundColor: c.surfaceInverse, paddingHorizontal: 6, paddingVertical: 2 },
  rackText: { fontSize: 11, color: c.brandPrimary, fontWeight: "700" },
  code: { fontSize: 12, color: c.muted },
  name: { fontSize: 15, color: c.onSurface, fontWeight: "500" },
  counts: { fontSize: 12, color: c.onSurface },
  pending: { fontSize: 12, color: c.muted, fontStyle: "italic" },
  unchecked: { opacity: 0.6 },
  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 8, padding: 12, backgroundColor: c.surface, borderTopWidth: 2, borderTopColor: c.border },
  sheetInfo: { fontSize: 13, color: c.onSurface, marginBottom: 12, lineHeight: 19 },
  sheetDiff: { fontSize: 13, color: c.error, marginTop: 8, lineHeight: 18 },
}));
