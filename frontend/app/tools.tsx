import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Badge, Button, Card, Confirm, Header, Input, Loading, SectionTitle, Sheet, useToast } from "@/src/components/ui";
import { fmtDateTime } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

type Status = "ADA" | "RUSAK" | "HILANG";

export default function Tools() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const tools = useQuery({ queryKey: ["tools"], queryFn: () => api<any[]>("/tools") });
  const status = useQuery({ queryKey: ["tools-status"], queryFn: () => api<any>("/tools/status") });
  const history = useQuery({ queryKey: ["tool-checklists"], queryFn: () => api<any[]>("/tools/checklists") });
  const [marks, setMarks] = useState<Record<string, { status: Status; note: string }>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [del, setDel] = useState<any | null>(null);
  const [note, setNote] = useState("");

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["tools"] }); qc.invalidateQueries({ queryKey: ["tools-status"] }); qc.invalidateQueries({ queryKey: ["tool-checklists"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); qc.invalidateQueries({ queryKey: ["notifications"] }); };
  const addTool = useMutation({ mutationFn: () => api("/tools", { body: { name: newName } }), onSuccess: () => { invalidate(); setAddOpen(false); setNewName(""); toast.show("Peralatan ditambahkan", "success"); }, onError: (e: any) => toast.show(e.message, "error") });
  const removeTool = useMutation({ mutationFn: (id: string) => api(`/tools/${id}`, { method: "DELETE" }), onSuccess: () => { invalidate(); setDel(null); }, onError: (e: any) => toast.show(e.message, "error") });
  const submit = useMutation({
    mutationFn: () => api("/tools/checklists", { body: { items: (tools.data ?? []).map((t) => ({ tool_id: t.id, status: marks[t.id]?.status ?? "ADA", note: marks[t.id]?.note ?? "" })), note } }),
    onSuccess: (r: any) => { invalidate(); setMarks({}); setNote(""); toast.show(`Checklist tersimpan: ${r.ok}/${r.total} lengkap`, "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  const mark = (id: string, s: Status) => setMarks({ ...marks, [id]: { status: s, note: marks[id]?.note ?? "" } });
  const st = status.data;
  const problem = Object.values(marks).filter((m) => m.status !== "ADA").length;

  return (
    <View style={styles.root} testID="tools-screen">
      <Header title="CHECKLIST TOOLS" subtitle={st?.last_checklist_at ? `Terakhir: ${fmtDateTime(st.last_checklist_at)}` : "Belum pernah checklist"} back
        right={<Pressable onPress={() => setAddOpen(true)} style={styles.addBtn} testID="tool-add-button"><Ionicons name="add" size={20} color={colors.onBrandPrimary} /><Text style={styles.addText}>ALAT</Text></Pressable>} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }} refreshControl={<RefreshControl refreshing={tools.isRefetching} onRefresh={() => { tools.refetch(); status.refetch(); history.refetch(); }} tintColor={colors.brandPrimary} />}>
        {st?.due ? (
          <View style={styles.banner} testID="tools-due-banner">
            <Ionicons name="alarm" size={22} color={colors.onWarning} />
            <Text style={styles.bannerText}>Waktunya checklist mingguan! {st.days_since != null ? `Sudah ${st.days_since} hari sejak checklist terakhir.` : "Belum ada checklist."}</Text>
          </View>
        ) : null}
        <SectionTitle title={`Peralatan (${tools.data?.length ?? 0})`} />
        {tools.isLoading ? <Loading /> : (tools.data ?? []).length === 0 ? (
          <Card><Text style={styles.muted}>Belum ada peralatan. Tekan tombol + ALAT untuk menambahkan (contoh: Kunci Ring 8-24, Obeng set, Kunci T, Tang).</Text></Card>
        ) : (tools.data ?? []).map((t) => {
          const m = marks[t.id]?.status ?? "ADA";
          return (
            <View key={t.id} style={styles.toolRow} testID={`tool-row-${t.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toolName}>{t.name}</Text>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                  {(["ADA", "RUSAK", "HILANG"] as Status[]).map((s) => (
                    <Pressable key={s} onPress={() => mark(t.id, s)} style={[styles.stChip, m === s && (s === "ADA" ? styles.stOk : s === "RUSAK" ? styles.stWarn : styles.stBad)]} testID={`tool-${t.id}-${s}`}>
                      <Text style={[styles.stText, m === s && { color: colors.onSurfaceInverse }]}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
                {m !== "ADA" ? <Input value={marks[t.id]?.note ?? ""} onChangeText={(v) => setMarks({ ...marks, [t.id]: { status: m, note: v } })} placeholder="Catatan (opsional)" style={{ marginTop: 8, minHeight: 40 }} testID={`tool-${t.id}-note`} /> : null}
              </View>
              <Pressable onPress={() => setDel(t)} hitSlop={8} style={{ padding: 6 }} testID={`tool-delete-${t.id}`}><Ionicons name="trash-outline" size={20} color={colors.muted} /></Pressable>
            </View>
          );
        })}
        {(tools.data ?? []).length ? <Input label="Catatan checklist" value={note} onChangeText={setNote} testID="checklist-note-input" style={{ marginTop: 8 }} /> : null}

        <SectionTitle title="Riwayat Checklist" />
        {(history.data ?? []).slice(0, 10).map((h) => (
          <View key={h.id} style={styles.histRow} testID={`checklist-row-${h.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toolName}>{fmtDateTime(h.created_at)}</Text>
              <Text style={styles.muted}>{h.mechanic_name}{h.note ? ` · ${h.note}` : ""}</Text>
              {h.items.filter((i: any) => i.status !== "ADA").map((i: any, idx: number) => <Text key={idx} style={[styles.muted, { color: colors.error }]}>• {i.name}: {i.status}{i.note ? ` (${i.note})` : ""}</Text>)}
            </View>
            <Badge label={`${h.ok}/${h.total} OK`} tone={h.ok === h.total ? "success" : "warning"} />
          </View>
        ))}
        {(history.data ?? []).length === 0 ? <Text style={styles.muted}>Belum ada riwayat.</Text> : null}
      </ScrollView>
      {(tools.data ?? []).length ? (
        <View style={[styles.sticky, { paddingBottom: insets.bottom + 12 }]}>
          <View style={{ flex: 1 }}><Text style={styles.stickyLabel}>{problem ? `${problem} ALAT BERMASALAH` : "SEMUA ALAT LENGKAP"}</Text></View>
          <Button title="Simpan Checklist" variant="success" icon="checkmark-done" onPress={() => submit.mutate()} loading={submit.isPending} testID="checklist-submit-button" style={{ flex: 1.3 }} />
        </View>
      ) : null}
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Tambah Peralatan" testID="tool-add-sheet" scroll={false}>
        <Input label="Nama peralatan *" value={newName} onChangeText={setNewName} autoFocus placeholder="cth: Kunci Ring 14" testID="tool-name-input" />
        <Button title="Tambahkan" onPress={() => addTool.mutate()} loading={addTool.isPending} disabled={!newName.trim()} testID="tool-save-button" />
      </Sheet>
      <Confirm visible={!!del} title="Hapus Peralatan" message={`Hapus ${del?.name} dari daftar tools?`} confirmLabel="YA, HAPUS" danger loading={removeTool.isPending} testID="tool-delete-confirm" onCancel={() => setDel(null)} onConfirm={() => removeTool.mutate(del.id)} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  addBtn: { flexDirection: "row", alignItems: "center", backgroundColor: c.brandPrimary, height: 36, paddingHorizontal: 10, gap: 2 },
  addText: { color: c.onBrandPrimary, fontWeight: "500", fontSize: 12 },
  banner: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: c.warning, padding: 12, marginBottom: 12, borderWidth: 2, borderColor: c.border },
  bannerText: { color: c.onWarning, fontWeight: "500", flex: 1, fontSize: 13 },
  muted: { color: c.muted, fontSize: 12 },
  toolRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: c.divider },
  toolName: { fontSize: 15, color: c.onSurface, fontWeight: "500" },
  stChip: { height: 34, paddingHorizontal: 12, borderWidth: 2, borderColor: c.border, justifyContent: "center" },
  stOk: { backgroundColor: c.success, borderColor: c.success },
  stWarn: { backgroundColor: c.warning, borderColor: c.warning },
  stBad: { backgroundColor: c.error, borderColor: c.error },
  stText: { fontSize: 12, fontWeight: "500", color: c.onSurface },
  histRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider },
  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 12, padding: 16, backgroundColor: c.surfaceInverse, borderTopWidth: 3, borderTopColor: c.brandPrimary },
  stickyLabel: { color: c.brandPrimary, fontSize: 12, letterSpacing: 1 },
}));
