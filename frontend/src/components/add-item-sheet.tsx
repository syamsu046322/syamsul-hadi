import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { api, qs } from "@/src/api";
import { Scanner } from "@/src/components/scanner";
import { Badge, Button, Input, Loading, Mono, Sheet, useToast } from "@/src/components/ui";
import { parseNum, rupiah } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

export type NewItem = { kind: "jasa" | "part"; ref_id?: string | null; name: string; code: string; price: number; qty: number; note: string };

export function AddItemSheet({ visible, onClose, onAdd, kind: initialKind, allowCustomJasa = true, extraBody }: {
  visible: boolean; onClose: () => void; onAdd: (item: NewItem) => Promise<void> | void; kind: "jasa" | "part"; allowCustomJasa?: boolean; extraBody?: Record<string, any>;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const [kind, setKind] = useState<"jasa" | "part">(initialKind);
  const [q, setQ] = useState("");
  const [scan, setScan] = useState(false);
  const [picked, setPicked] = useState<any | null>(null);
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  React.useEffect(() => { if (visible) { setKind(initialKind); reset(); } }, [visible, initialKind]);

  const reset = () => { setPicked(null); setCustom(false); setName(""); setPrice(""); setQty("1"); setNote(""); setQ(""); };

  const services = useQuery({ queryKey: ["services", q], queryFn: () => api<any[]>(`/services${qs({ q })}`), enabled: visible && kind === "jasa" });
  const parts = useQuery({ queryKey: ["parts", q], queryFn: () => api<any[]>(`/parts${qs({ q })}`), enabled: visible && kind === "part" });
  const list = kind === "jasa" ? services : parts;

  const pick = (item: any) => { setPicked(item); setName(item.name); setPrice(String(item.price)); setQty("1"); };

  const onScanned = async (code: string) => {
    setScan(false);
    try {
      const found = await api<any[]>(`/parts${qs({ barcode: code })}`);
      if (found.length) { setKind("part"); pick(found[0]); toast.show(`Part ditemukan: ${found[0].name}`, "success"); }
      else toast.show(`Part dengan kode ${code} tidak ditemukan`, "error");
    } catch (e: any) { toast.show(e.message, "error"); }
  };

  const submit = async () => {
    const p = parseNum(price); const n = parseNum(qty) || 1;
    if (!name.trim() || p <= 0) { toast.show("Nama dan harga wajib diisi", "error"); return; }
    if (kind === "part" && !picked) { toast.show("Part harus dipilih dari master stok", "error"); return; }
    if (kind === "part" && picked && picked.stock < n) { toast.show(`STOK TIDAK CUKUP (tersedia ${picked.stock})`, "error"); return; }
    setSaving(true);
    try {
      await onAdd({ kind, ref_id: picked?.id ?? null, name: name.trim(), code: picked?.code ?? "", price: p, qty: n, note, ...(extraBody ?? {}) });
      reset(); onClose();
    } catch (e: any) { toast.show(e.message, "error"); } finally { setSaving(false); }
  };

  const showForm = picked || custom;
  const stockOk = picked && kind === "part" ? picked.stock >= (parseNum(qty) || 1) : true;

  return (
    <Sheet visible={visible} onClose={onClose} title={kind === "jasa" ? "Tambah Jasa" : "Tambah Part"} testID="add-item-sheet">
      <View style={styles.kindRow}>
        {(["jasa", "part"] as const).map((k) => (
          <Pressable key={k} testID={`add-item-kind-${k}`} onPress={() => { setKind(k); reset(); }} style={[styles.kindBtn, kind === k && styles.kindSel]}>
            <Text style={[styles.kindText, kind === k && styles.kindTextSel]}>{k === "jasa" ? "JASA" : "PART"}</Text>
          </Pressable>
        ))}
      </View>
      {!showForm ? (
        <>
          <View style={styles.searchRow}>
            <View style={{ flex: 1 }}>
              <Input value={q} onChangeText={setQ} placeholder={kind === "jasa" ? "Cari nama/kode jasa" : "Cari kode/nama/barcode part"} testID="add-item-search-input" autoFocus />
            </View>
            {kind === "part" ? (
              <Pressable style={styles.scanBtn} onPress={() => setScan(true)} testID="add-item-scan-button">
                <Ionicons name="barcode-outline" size={26} color={colors.onBrandPrimary} />
              </Pressable>
            ) : null}
          </View>
          {list.isLoading ? <Loading /> : (
            <View>
              {(list.data ?? []).slice(0, 30).map((it: any) => {
                const empty = kind === "part" && it.stock <= 0;
                return (
                  <Pressable key={it.id} onPress={() => { if (empty) { toast.show("STOK HABIS — part tidak bisa ditambahkan", "error"); return; } pick(it); }} style={[styles.row, empty && { opacity: 0.5 }]} testID={`add-item-option-${it.code}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowName, empty && { color: colors.muted }]}>{it.name}</Text>
                      <Text style={styles.rowCode}>{it.code}{kind === "part" ? ` · Stok: ${it.stock} ${it.unit ?? ""}` : ""}{kind === "part" && it.rack ? ` · RAK ${it.rack}` : ""}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Mono>{rupiah(it.price)}</Mono>
                      {kind === "part" ? <Badge label={empty ? "HABIS" : "TERSEDIA"} tone={empty ? "neutral" : "success"} /> : null}
                    </View>
                  </Pressable>
                );
              })}
              {list.data && list.data.length === 0 ? <Text style={styles.none}>Tidak ditemukan.</Text> : null}
              {kind === "jasa" && allowCustomJasa ? (
                <Button title="+ Jasa manual (isi sendiri)" variant="outline" onPress={() => { setCustom(true); setName(q); }} testID="add-item-custom-jasa-button" style={{ marginTop: 8 }} />
              ) : null}
            </View>
          )}
        </>
      ) : (
        <View>
          {picked && kind === "part" ? (
            <View style={styles.pickedBox}>
              <Text style={styles.rowName}>{picked.name}</Text>
              <Text style={styles.rowCode}>{picked.code} · Stok tersedia: {picked.stock}</Text>
              {picked.rack ? <Badge label={`AMBIL DI RAK ${picked.rack}`} tone="brand" testID="add-item-rack" /> : null}
              <Badge label={stockOk ? "STOK TERSEDIA" : "STOK TIDAK CUKUP"} tone={stockOk ? "success" : "error"} testID="add-item-stock-status" />
            </View>
          ) : (
            <Input label="Nama jasa (bisa diubah)" value={name} onChangeText={setName} testID="add-item-name-input" />
          )}
          {picked && kind === "jasa" ? <Text style={styles.rowCode}>Dari master: {picked.code} · harga master {rupiah(picked.price)}</Text> : null}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Input label="Harga" value={price} onChangeText={setPrice} keyboardType="number-pad" editable={kind === "jasa"} testID="add-item-price-input" />
            </View>
            <View style={{ width: 110 }}>
              <Input label="Qty" value={qty} onChangeText={setQty} keyboardType="number-pad" testID="add-item-qty-input" />
            </View>
          </View>
          <Input label="Catatan (opsional)" value={note} onChangeText={setNote} testID="add-item-note-input" />
          <View style={styles.subRow}>
            <Text style={styles.subLabel}>SUBTOTAL</Text>
            <Mono style={styles.subVal} testID="add-item-subtotal">{rupiah(parseNum(price) * (parseNum(qty) || 1))}</Mono>
          </View>
          <Button title="TAMBAHKAN" onPress={submit} loading={saving} disabled={!stockOk} testID="add-item-submit-button" />
          <View style={{ height: 8 }} />
          <Button title="Pilih yang lain" variant="outline" onPress={reset} testID="add-item-reset-button" />
        </View>
      )}
      <Scanner visible={scan} onClose={() => setScan(false)} onScan={onScanned} />
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  kindRow: { flexDirection: "row", marginBottom: 12, borderWidth: 2, borderColor: c.border },
  kindBtn: { flex: 1, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  kindSel: { backgroundColor: c.brandPrimary },
  kindText: { fontWeight: "500", color: c.onSurface, letterSpacing: 1 },
  kindTextSel: { color: c.onBrandPrimary },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  scanBtn: { width: 48, height: 48, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.border },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.divider },
  rowName: { fontSize: 15, color: c.onSurface, fontWeight: "500" },
  rowCode: { fontSize: 12, color: c.muted, marginTop: 2 },
  none: { color: c.muted, textAlign: "center", padding: 16 },
  pickedBox: { borderWidth: 2, borderColor: c.brandPrimary, backgroundColor: c.brandTertiary, padding: 12, marginBottom: 12, gap: 4 },
  subRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderTopWidth: 2, borderTopColor: c.border, marginBottom: 12 },
  subLabel: { color: c.muted, letterSpacing: 1 },
  subVal: { fontSize: 20 },
}));
