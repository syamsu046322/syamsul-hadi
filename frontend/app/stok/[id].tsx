import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Scanner } from "@/src/components/scanner";
import { Badge, Button, Card, Header, Input, KV, Loading, Mono, SectionTitle, Sheet, useToast } from "@/src/components/ui";
import { fmtDateTime, parseNum, rupiah } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

export default function PartDetail() {
  const { id, barcode } = useLocalSearchParams<{ id: string; barcode?: string }>();
  const isNew = id === "baru";
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const canEdit = can("partman");

  const part = useQuery({ queryKey: ["part", id], queryFn: async () => (await api<any[]>(`/parts`)).find((p) => p.id === id), enabled: !isNew });
  const moves = useQuery({ queryKey: ["movements", id], queryFn: () => api<any[]>(`/parts/${id}/movements`), enabled: !isNew });

  const [form, setForm] = useState({ code: "", name: "", barcode: barcode ?? "", price: "", cost: "", stock: "", min_stock: "5", unit: "pcs", rack: "" });
  const [editing, setEditing] = useState(isNew);
  const [adjust, setAdjust] = useState<null | "in" | "out">(null);
  const [adj, setAdj] = useState({ qty: "", reason: "", note: "" });
  const [scan, setScan] = useState(false);

  useEffect(() => {
    if (part.data) setForm({ code: part.data.code, name: part.data.name, barcode: part.data.barcode ?? "", price: String(part.data.price), cost: String(part.data.cost ?? 0), stock: String(part.data.stock), min_stock: String(part.data.min_stock ?? 5), unit: part.data.unit ?? "pcs", rack: part.data.rack ?? "" });
  }, [part.data]);

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["parts"] }); qc.invalidateQueries({ queryKey: ["part", id] }); qc.invalidateQueries({ queryKey: ["movements", id] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };

  const save = useMutation({
    mutationFn: () => {
      const body = { code: form.code, name: form.name, barcode: form.barcode, price: parseNum(form.price), cost: parseNum(form.cost), stock: parseNum(form.stock), min_stock: parseNum(form.min_stock), unit: form.unit || "pcs", rack: form.rack.trim(), active: true };
      return isNew ? api<any>("/parts", { body }) : api<any>(`/parts/${id}`, { method: "PUT", body });
    },
    onSuccess: (p) => { invalidate(); toast.show("Part tersimpan", "success"); if (isNew) router.replace(`/stok/${p.id}`); else setEditing(false); },
    onError: (e: any) => toast.show(e.message, "error"),
  });
  const doAdjust = useMutation({
    mutationFn: () => api(`/parts/${id}/adjust`, { body: { qty: (adjust === "out" ? -1 : 1) * parseNum(adj.qty), reason: adj.reason || (adjust === "in" ? "PEMBELIAN" : "PENYESUAIAN"), note: adj.note } }),
    onSuccess: () => { invalidate(); setAdjust(null); setAdj({ qty: "", reason: "", note: "" }); toast.show("Stok diperbarui", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  if (!isNew && (part.isLoading || !part.data)) return <View style={styles.root}><Header title="PART" back /><Loading /></View>;
  const p = part.data;
  const low = p && p.stock <= p.min_stock;

  return (
    <View style={styles.root} testID="part-detail-screen">
      <Header title={isNew ? "PART BARU" : p.name} subtitle={isNew ? "Master suku cadang" : p.code} back />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} bottomOffset={24} keyboardShouldPersistTaps="handled">
        {!isNew && !editing ? (
          <>
            <View style={styles.stockBox} testID="part-stock-box">
              <View style={{ flex: 1 }}>
                <Text style={styles.stockLabel}>STOK SAAT INI</Text>
                <Mono style={[styles.stockVal, low && { color: colors.error }]} testID="part-stock-value">{p.stock} <Text style={styles.unit}>{p.unit}</Text></Mono>
              </View>
              <Badge label={p.stock === 0 ? "HABIS" : low ? "MENIPIS" : "AMAN"} tone={p.stock === 0 ? "error" : low ? "warning" : "success"} big />
            </View>
            <Card>
              <KV k="Kode" v={p.code} mono />
              <KV k="Barcode" v={p.barcode} mono />
              <KV k="Harga jual" v={rupiah(p.price)} mono />
              <KV k="Harga beli" v={rupiah(p.cost)} mono />
              <KV k="Stok minimum" v={p.min_stock} mono />
              <KV k="Lokasi rak" v={p.rack} mono testID="part-rack-value" />
            </Card>
            {canEdit ? (
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                <Button title="Stok Masuk" variant="success" icon="arrow-down" onPress={() => setAdjust("in")} style={{ flex: 1 }} testID="stock-in-button" />
                <Button title="Stok Keluar" variant="danger" icon="arrow-up" onPress={() => setAdjust("out")} style={{ flex: 1 }} testID="stock-out-button" />
                <Button title="Ubah" variant="outline" icon="create-outline" onPress={() => setEditing(true)} testID="part-edit-button" />
              </View>
            ) : null}
            <SectionTitle title="Histori Mutasi Stok" />
            {moves.isLoading ? <Loading /> : (moves.data ?? []).length === 0 ? <Text style={styles.muted}>Belum ada mutasi.</Text> : (moves.data ?? []).map((m: any) => (
              <View key={m.id} style={styles.moveRow} testID={`movement-${m.id}`}>
                <Mono style={[styles.moveQty, { color: m.qty < 0 ? colors.error : colors.success }]}>{m.qty > 0 ? `+${m.qty}` : m.qty}</Mono>
                <View style={{ flex: 1 }}>
                  <Text style={styles.moveReason}>{m.reason}{m.transaction_no ? ` · ${m.transaction_no}` : ""}{m.note ? ` · ${m.note}` : ""}</Text>
                  <Text style={styles.muted}>{fmtDateTime(m.created_at)} · {m.username}</Text>
                </View>
                <Mono style={styles.muted}>{m.stock_before} → {m.stock_after}</Mono>
              </View>
            ))}
          </>
        ) : (
          <Card>
            <Input label="Kode part *" value={form.code} onChangeText={(v) => setForm({ ...form, code: v.toUpperCase() })} autoCapitalize="characters" editable={isNew} testID="part-code-input" />
            <Input label="Nama part *" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} testID="part-name-input" />
            <Input label="Lokasi rak (cth: R1-A2)" value={form.rack} onChangeText={(v) => setForm({ ...form, rack: v.toUpperCase() })} autoCapitalize="characters" testID="part-rack-input" />
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}><Input label="Barcode" value={form.barcode} onChangeText={(v) => setForm({ ...form, barcode: v })} testID="part-barcode-input" /></View>
              <Pressable style={styles.scanBtn} onPress={() => setScan(true)} testID="part-scan-barcode-button"><Ionicons name="barcode-outline" size={24} color={colors.onBrandPrimary} /></Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Harga jual *" value={form.price} onChangeText={(v) => setForm({ ...form, price: v })} keyboardType="number-pad" testID="part-price-input" /></View>
              <View style={{ flex: 1 }}><Input label="Harga beli" value={form.cost} onChangeText={(v) => setForm({ ...form, cost: v })} keyboardType="number-pad" testID="part-cost-input" /></View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {isNew ? <View style={{ flex: 1 }}><Input label="Stok awal" value={form.stock} onChangeText={(v) => setForm({ ...form, stock: v })} keyboardType="number-pad" testID="part-stock-input" /></View> : null}
              <View style={{ flex: 1 }}><Input label="Stok minimum" value={form.min_stock} onChangeText={(v) => setForm({ ...form, min_stock: v })} keyboardType="number-pad" testID="part-minstock-input" /></View>
              <View style={{ flex: 1 }}><Input label="Satuan" value={form.unit} onChangeText={(v) => setForm({ ...form, unit: v })} testID="part-unit-input" /></View>
            </View>
            <Button title="Simpan Part" onPress={() => save.mutate()} loading={save.isPending} disabled={!form.code.trim() || !form.name.trim() || !parseNum(form.price)} testID="part-save-button" />
            {!isNew ? <><View style={{ height: 8 }} /><Button title="Batal" variant="outline" onPress={() => setEditing(false)} testID="part-cancel-edit-button" /></> : null}
          </Card>
        )}
      </KeyboardAwareScrollView>

      <Sheet visible={!!adjust} onClose={() => setAdjust(null)} title={adjust === "in" ? "Stok Masuk" : "Stok Keluar"} testID="adjust-sheet" scroll={false}>
        <Input label="Jumlah *" value={adj.qty} onChangeText={(v) => setAdj({ ...adj, qty: v })} keyboardType="number-pad" testID="adjust-qty-input" autoFocus />
        <Input label="Alasan" value={adj.reason} onChangeText={(v) => setAdj({ ...adj, reason: v })} placeholder={adjust === "in" ? "PEMBELIAN / RETUR" : "RUSAK / PENYESUAIAN"} testID="adjust-reason-input" />
        <Input label="Catatan" value={adj.note} onChangeText={(v) => setAdj({ ...adj, note: v })} testID="adjust-note-input" />
        <Button title={adjust === "in" ? "Tambah Stok" : "Kurangi Stok"} variant={adjust === "in" ? "success" : "danger"} onPress={() => doAdjust.mutate()} loading={doAdjust.isPending} disabled={!parseNum(adj.qty)} testID="adjust-submit-button" />
      </Sheet>
      <Scanner visible={scan} onClose={() => setScan(false)} onScan={(code) => { setForm({ ...form, barcode: code }); setScan(false); }} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  stockBox: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceInverse, padding: 16, marginBottom: 12, borderLeftWidth: 6, borderLeftColor: c.brandPrimary },
  stockLabel: { color: c.brandPrimary, fontSize: 11, letterSpacing: 1.5 },
  stockVal: { color: c.onSurfaceInverse, fontSize: 34 },
  unit: { fontSize: 14, color: c.onSurfaceInverse, opacity: 0.7 },
  muted: { color: c.muted, fontSize: 12 },
  moveRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider },
  moveQty: { fontSize: 18, width: 48 },
  moveReason: { fontSize: 14, color: c.onSurface },
  scanBtn: { width: 48, height: 48, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: 12 },
}));
