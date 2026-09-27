import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qs } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, Button, Empty, Header, Input, Loading, Mono, Sheet, useToast } from "@/src/components/ui";
import { parseNum, rupiah } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

const EMPTY = { code: "", name: "", price: "", active: true };

export default function Jasa() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<any | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [wipe, setWipe] = useState(false);
  const [wipePw, setWipePw] = useState("");
  const list = useQuery({ queryKey: ["services", q], queryFn: () => api<any[]>(`/services${qs({ q })}`) });
  const wipeMut = useMutation({
    mutationFn: () => api<{ deleted: number }>("/services/delete-all", { body: { owner_password: wipePw } }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["services"] }); setWipe(false); toast.show(`${r.deleted} jasa dihapus`, "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = { code: form.code, name: form.name, price: parseNum(form.price), active: form.active };
      return edit?.id ? api(`/services/${edit.id}`, { method: "PUT", body }) : api("/services", { body });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); setEdit(null); toast.show("Jasa tersimpan", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  return (
    <View style={styles.root} testID="services-screen">
      <Header title="DATA JASA" subtitle={`${list.data?.length ?? 0} jasa`} back
        right={isOwner ? <Pressable onPress={() => { setWipe(true); setWipePw(""); }} hitSlop={8} testID="services-delete-all-button"><Ionicons name="trash-outline" size={22} color={colors.error} /></Pressable> : undefined} />
      <View style={styles.searchWrap}><Input value={q} onChangeText={setQ} placeholder="Cari kode atau nama jasa" testID="services-search-input" /></View>
      {list.isLoading ? <Loading /> : (
        <FlatList data={list.data ?? []} keyExtractor={(s) => s.id} contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={<Empty text="Belum ada jasa." icon="construct-outline" />}
          renderItem={({ item: s }) => (
            <Pressable style={styles.row} disabled={!isOwner} onPress={() => { setEdit(s); setForm({ code: s.code, name: s.name, price: String(s.price), active: s.active }); }} testID={`service-row-${s.code}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{s.name}</Text>
                <Text style={styles.sub}>{s.code}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Mono style={styles.price}>{rupiah(s.price)}</Mono>
                {!s.active ? <Badge label="NONAKTIF" tone="error" /> : null}
              </View>
            </Pressable>
          )} />
      )}
      {isOwner ? (
        <View style={[styles.fabWrap, { bottom: insets.bottom + 16 }]}>
          <Button title="+ Jasa Baru" onPress={() => { setEdit({}); setForm(EMPTY); }} testID="service-add-button" />
        </View>
      ) : null}
      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Ubah Jasa" : "Jasa Baru"} testID="service-sheet">
        <Input label="Kode *" value={form.code} onChangeText={(v) => setForm({ ...form, code: v.toUpperCase() })} autoCapitalize="characters" testID="service-code-input" />
        <Input label="Nama jasa *" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} testID="service-name-input" />
        <Input label="Harga *" value={form.price} onChangeText={(v) => setForm({ ...form, price: v })} keyboardType="number-pad" testID="service-price-input" />
        <Pressable onPress={() => setForm({ ...form, active: !form.active })} style={styles.toggle} testID="service-active-toggle">
          <Text style={styles.name}>Status: {form.active ? "AKTIF" : "NONAKTIF"}</Text>
          <Badge label={form.active ? "AKTIF" : "NONAKTIF"} tone={form.active ? "success" : "error"} />
        </Pressable>
        <Button title="Simpan" onPress={() => save.mutate()} loading={save.isPending} disabled={!form.code.trim() || !form.name.trim() || !parseNum(form.price)} testID="service-save-button" />
      </Sheet>
      <Sheet visible={wipe} onClose={() => setWipe(false)} title="Hapus Semua Data Jasa" testID="services-wipe-sheet" scroll={false}>
        <Text style={styles.warn}>Semua data jasa ({list.data?.length ?? 0} item) akan dihapus dari master. Histori transaksi tetap tersimpan. Masukkan password Owner untuk konfirmasi.</Text>
        <Input label="Password Owner" value={wipePw} onChangeText={setWipePw} secureTextEntry testID="services-wipe-password-input" />
        <Button title="Ya, Hapus Semua Jasa" variant="danger" loading={wipeMut.isPending} disabled={!wipePw} onPress={() => wipeMut.mutate()} testID="services-wipe-confirm-button" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  searchWrap: { padding: 16, paddingBottom: 4, borderBottomWidth: 2, borderBottomColor: c.divider },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 2, borderBottomColor: c.divider },
  name: { fontSize: 16, color: c.onSurface, fontWeight: "500" },
  sub: { fontSize: 12, color: c.muted, marginTop: 2 },
  price: { fontSize: 15 },
  fabWrap: { position: "absolute", left: 16, right: 16 },
  toggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, borderWidth: 2, borderColor: c.border, marginBottom: 12 },
  warn: { color: c.onSurface, fontSize: 14, lineHeight: 20, marginBottom: 12 },
}));
