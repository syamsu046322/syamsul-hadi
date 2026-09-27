import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qs } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, Button, Chips, Confirm, Empty, Header, Input, Loading, Mono, Sheet, useToast } from "@/src/components/ui";
import { fmtDate, parseNum, rupiah } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

type Group = "BENGKEL" | "KELUARGA" | "LAINNYA";
const GROUP_LABEL: Record<Group, string> = { BENGKEL: "Belanja Bengkel", KELUARGA: "Belanja Keluarga (Kasbon Owner)", LAINNYA: "Lain-lain (Pinjaman)" };

function monthKey(offset = 0) {
  const d = new Date(); d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const monthLabel = (m: string) => new Date(`${m}-01`).toLocaleDateString("id-ID", { month: "short", year: "numeric" });

export default function Belanja() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | "ALL">("ALL");
  const [month, setMonth] = useState(monthKey(0));
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<any | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const [eform, setEForm] = useState({ amount: "", note: "", counterparty: "", supplier: "", discount: "", het: "", ongkir: "", unit_price: "", payment_method: "CASH" as "CASH" | "HUTANG" | "TRANSFER", date: "" });
  const [form, setForm] = useState({ group: "BENGKEL" as Group, category: "", amount: "", note: "", counterparty: "", qty: "1", supplier: "", unit_price: "", het: "", ongkir: "", discount: "", payment_method: "CASH" as "CASH" | "HUTANG" | "TRANSFER" });
  const [partQ, setPartQ] = useState("");
  const [part, setPart] = useState<any | null>(null);

  const cats = useQuery({ queryKey: ["expense-categories"], queryFn: () => api<Record<Group, string[]>>("/expenses/categories") });
  const list = useQuery({ queryKey: ["expenses", group, month], queryFn: () => api<any[]>(`/expenses${qs({ group: group === "ALL" ? "" : group, month })}`) });
  const summary = useQuery({ queryKey: ["expense-summary", month], queryFn: () => api<any>(`/expenses/summary${qs({ month })}`) });
  const parts = useQuery({ queryKey: ["parts", partQ], queryFn: () => api<any[]>(`/parts${qs({ q: partQ })}`), enabled: open && form.category === "Beli Part" && !part });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["expenses"] }); qc.invalidateQueries({ queryKey: ["expense-summary"] }); qc.invalidateQueries({ queryKey: ["parts"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const save = useMutation({
    mutationFn: () => api("/expenses", { body: { group: form.group, category: form.category, amount: parseNum(form.amount), note: form.note, counterparty: form.counterparty, part_id: part?.id ?? null, qty: parseNum(form.qty), supplier: form.supplier, unit_price: parseNum(form.unit_price), het: parseNum(form.het), ongkir: parseNum(form.ongkir), discount: parseNum(form.discount), payment_method: form.payment_method } }),
    onSuccess: () => { invalidate(); setOpen(false); toast.show("Belanja tersimpan", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); setDel(null); toast.show("Belanja dihapus", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });
  const saveEdit = useMutation({
    mutationFn: () => api(`/expenses/${edit.id}`, { method: "PUT", body: {
      amount: parseNum(eform.amount), note: eform.note, counterparty: eform.counterparty, supplier: eform.supplier,
      discount: parseNum(eform.discount), het: parseNum(eform.het), ongkir: parseNum(eform.ongkir), unit_price: parseNum(eform.unit_price),
      payment_method: eform.payment_method, ...(eform.date.trim() ? { date: eform.date } : {}),
    } }),
    onSuccess: () => { invalidate(); setEdit(null); toast.show("Catatan belanja diperbarui", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });
  const openEdit = (e: any) => {
    const dmy = e.date && e.date.length >= 10 ? `${e.date.slice(8, 10)}/${e.date.slice(5, 7)}/${e.date.slice(0, 4)}` : "";
    setEForm({ amount: String(e.amount ?? ""), note: e.note ?? "", counterparty: e.counterparty ?? "", supplier: e.supplier ?? "", discount: String(e.discount ?? ""), het: String(e.het ?? ""), ongkir: String(e.ongkir ?? ""), unit_price: String(e.unit_price ?? ""), payment_method: e.payment_method ?? "CASH", date: dmy });
    setEdit(e);
  };

  const openNew = () => { setForm({ group: group === "ALL" ? "BENGKEL" : group, category: "", amount: "", note: "", counterparty: "", qty: "1", supplier: "", unit_price: "", het: "", ongkir: "", discount: "", payment_method: "CASH" }); setPart(null); setPartQ(""); setOpen(true); };
  const s = summary.data;
  const isBeliPart = form.group === "BENGKEL" && form.category === "Beli Part";
  const canSave = form.category && parseNum(form.amount) > 0 && (!isBeliPart || (part && parseNum(form.qty) > 0));

  return (
    <View style={styles.root} testID="expenses-screen">
      <Header title="BELANJA" subtitle={`${list.data?.length ?? 0} catatan · ${monthLabel(month)}`} back />
      <Chips options={[0, 1, 2, 3, 4, 5].map((o) => ({ key: monthKey(o), label: monthLabel(monthKey(o)) }))} value={month} onChange={setMonth} testID="expense-month" />
      <Chips options={[{ key: "ALL", label: "Semua" }, { key: "BENGKEL", label: "Bengkel" }, { key: "KELUARGA", label: "Keluarga / Kasbon" }, { key: "LAINNYA", label: "Lain-lain" }]} value={group} onChange={setGroup} testID="expense-group" />
      {list.isLoading ? <Loading /> : (
        <FlatList data={list.data ?? []} keyExtractor={(e) => e.id} contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => { list.refetch(); summary.refetch(); }} tintColor={colors.brandPrimary} />}
          ListHeaderComponent={s ? (
            <View style={styles.summary} testID="expense-summary">
              <View style={styles.sumRow}><Text style={styles.sumLabel}>OMZET BULAN INI</Text><Mono style={styles.sumVal}>{rupiah(s.omzet)}</Mono></View>
              <View style={styles.sumRow}><Text style={styles.sumLabel}>BELANJA BENGKEL</Text><Mono style={[styles.sumVal, { color: colors.error }]}>- {rupiah(s.belanja_bengkel)}</Mono></View>
              <View style={[styles.sumRow, styles.sumTotal]}><Text style={[styles.sumLabel, { color: colors.brandPrimary }]}>LABA BERSIH</Text><Mono style={[styles.sumVal, { color: colors.brandPrimary, fontSize: 20 }]} testID="expense-profit">{rupiah(s.laba_bersih)}</Mono></View>
              <View style={styles.sumRow}><Text style={styles.sumLabel}>KASBON OWNER (KELUARGA)</Text><Mono style={styles.sumVal}>{rupiah(s.kasbon_owner)}</Mono></View>
              <View style={styles.sumRow}><Text style={styles.sumLabel}>PINJAMAN MASUK / DIPINJAMKAN</Text><Mono style={styles.sumVal}>{rupiah(s.pinjaman_masuk)} / {rupiah(s.uang_dipinjam_keluar)}</Mono></View>
            </View>
          ) : null}
          ListEmptyComponent={<Empty text="Belum ada catatan belanja bulan ini." icon="cart-outline" testID="expenses-empty" />}
          renderItem={({ item: e }) => (
            <View style={styles.row} testID={`expense-row-${e.id}`}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginBottom: 2 }}>
                  <Badge label={e.group} tone={e.group === "BENGKEL" ? "brand" : e.group === "KELUARGA" ? "warning" : e.flow === "IN" ? "success" : "info"} />
                  <Text style={styles.sub}>{fmtDate(e.date)} · {e.created_by}</Text>
                </View>
                <Text style={styles.name}>{e.category}{e.part_name ? ` · ${e.part_name} x${e.qty}` : ""}{e.counterparty ? ` · ${e.counterparty}` : ""}</Text>
                {e.note ? <Text style={styles.sub}>{e.note}</Text> : null}
              </View>
              <Mono style={[styles.amount, e.flow === "IN" && { color: colors.success }]}>{e.flow === "IN" ? "+" : "-"} {rupiah(e.amount)}</Mono>
              {user?.role === "owner" || e.created_by === user?.name ? (
                <View style={{ flexDirection: "row", gap: 2 }}>
                  <Pressable onPress={() => openEdit(e)} hitSlop={8} style={{ padding: 4 }} testID={`expense-edit-${e.id}`}><Ionicons name="create-outline" size={20} color={colors.info} /></Pressable>
                  <Pressable onPress={() => setDel(e)} hitSlop={8} style={{ padding: 4 }} testID={`expense-delete-${e.id}`}><Ionicons name="trash-outline" size={20} color={colors.error} /></Pressable>
                </View>
              ) : null}
            </View>
          )} />
      )}
      <Pressable style={[styles.fab, { bottom: insets.bottom + 16 }]} onPress={openNew} testID="expense-add-fab">
        <Ionicons name="add" size={26} color={colors.onBrandPrimary} /><Text style={styles.fabText}>CATAT BELANJA</Text>
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Catat Belanja" testID="expense-sheet">
        <Text style={styles.label}>KATEGORI UTAMA</Text>
        <View style={{ gap: 6, marginBottom: 12 }}>
          {(["BENGKEL", "KELUARGA", "LAINNYA"] as Group[]).map((g) => (
            <Pressable key={g} onPress={() => { setForm({ ...form, group: g, category: "" }); setPart(null); }} style={[styles.groupBtn, form.group === g && styles.groupSel]} testID={`expense-sheet-group-${g}`}>
              <Text style={[styles.groupText, form.group === g && { color: colors.onSurfaceInverse }]}>{GROUP_LABEL[g]}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>JENIS</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {(cats.data?.[form.group] ?? []).map((c) => (
            <Pressable key={c} onPress={() => setForm({ ...form, category: c })} style={[styles.catChip, form.category === c && styles.catSel]} testID={`expense-cat-${c.replace(/[^a-zA-Z]/g, "")}`}>
              <Text style={[styles.catText, form.category === c && { color: colors.onBrandPrimary }]}>{c}</Text>
            </Pressable>
          ))}
        </View>
        {isBeliPart ? (
          part ? (
            <View style={styles.partBox}>
              <View style={{ flex: 1 }}><Text style={styles.name}>{part.name}</Text><Text style={styles.sub}>{part.code} · stok {part.stock}</Text></View>
              <Button title="Ganti" variant="outline" small onPress={() => setPart(null)} testID="expense-part-change" />
            </View>
          ) : (
            <>
              <Input value={partQ} onChangeText={setPartQ} placeholder="Cari part yang dibeli (kode/nama)" testID="expense-part-search" />
              {(parts.data ?? []).slice(0, 8).map((p) => <Pressable key={p.id} style={styles.opt} onPress={() => setPart(p)} testID={`expense-part-option-${p.code}`}><Text style={styles.name}>{p.name}</Text><Text style={styles.sub}>{p.code} · stok {p.stock}</Text></Pressable>)}
            </>
          )
        ) : null}
        {isBeliPart ? (
          <>
            <Input label="Supplier / Toko" value={form.supplier} onChangeText={(v) => setForm({ ...form, supplier: v })} testID="expense-supplier-input" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Harga Satuan" value={form.unit_price} onChangeText={(v) => setForm({ ...form, unit_price: v })} keyboardType="number-pad" testID="expense-unitprice-input" /></View>
              <View style={{ flex: 1 }}><Input label="HET" value={form.het} onChangeText={(v) => setForm({ ...form, het: v })} keyboardType="number-pad" testID="expense-het-input" /></View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Diskon (Rp)" value={form.discount} onChangeText={(v) => setForm({ ...form, discount: v })} keyboardType="number-pad" testID="expense-discount-input" /></View>
              <View style={{ flex: 1 }}><Input label="Ongkir (Rp)" value={form.ongkir} onChangeText={(v) => setForm({ ...form, ongkir: v })} keyboardType="number-pad" testID="expense-ongkir-input" /></View>
            </View>
          </>
        ) : null}
        {form.category === "Kasbon Mekanik" || form.category === "Gaji Mekanik" ? (
          <Input label="Nama Mekanik" value={form.counterparty} onChangeText={(v) => setForm({ ...form, counterparty: v })} testID="expense-mechanic-input" />
        ) : null}
        <Text style={styles.label}>METODE PEMBAYARAN</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          {(["CASH", "HUTANG", "TRANSFER"] as const).map((pm) => (
            <Pressable key={pm} onPress={() => setForm({ ...form, payment_method: pm })} style={[styles.catChip, { flex: 1, alignItems: "center" }, form.payment_method === pm && styles.catSel]} testID={`expense-pm-${pm}`}>
              <Text style={[styles.catText, form.payment_method === pm && { color: colors.onBrandPrimary }]}>{pm}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 2 }}><Input label="Nominal (Rp) *" value={form.amount} onChangeText={(v) => setForm({ ...form, amount: v })} keyboardType="number-pad" testID="expense-amount-input" /></View>
          {isBeliPart ? <View style={{ flex: 1 }}><Input label="Qty *" value={form.qty} onChangeText={(v) => setForm({ ...form, qty: v })} keyboardType="number-pad" testID="expense-qty-input" /></View> : null}
        </View>
        {form.group === "LAINNYA" ? <Input label="Pihak (bank / nama orang)" value={form.counterparty} onChangeText={(v) => setForm({ ...form, counterparty: v })} testID="expense-counterparty-input" /> : null}
        <Input label="Catatan" value={form.note} onChangeText={(v) => setForm({ ...form, note: v })} testID="expense-note-input" />
        <Button title="Simpan Belanja" onPress={() => save.mutate()} loading={save.isPending} disabled={!canSave} testID="expense-save-button" />
      </Sheet>
      <Confirm visible={!!del} title="Hapus Belanja" message={`Hapus catatan ${del?.category} ${rupiah(del?.amount)}?${del?.part_id ? " Stok part akan dikurangi kembali." : ""}`} confirmLabel="YA, HAPUS" danger loading={remove.isPending} testID="expense-delete-confirm" onCancel={() => setDel(null)} onConfirm={() => remove.mutate(del.id)} />

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title="Ubah Catatan Belanja" testID="expense-edit-sheet">
        <Text style={[styles.sub, { marginBottom: 10 }]}>{edit?.group} · {edit?.category}{edit?.part_name ? ` · ${edit.part_name}` : ""}</Text>
        <Input label="Nominal (Rp)" value={eform.amount} onChangeText={(v) => setEForm({ ...eform, amount: v })} keyboardType="number-pad" testID="expense-edit-amount" />
        {user?.role === "owner" ? <Input label="Tanggal (HH/BB/TTTT)" value={eform.date} onChangeText={(v) => setEForm({ ...eform, date: v })} placeholder="25/09/2026" keyboardType="numbers-and-punctuation" testID="expense-edit-date" /> : null}
        {edit?.part_id ? (
          <>
            <Input label="Supplier / Toko" value={eform.supplier} onChangeText={(v) => setEForm({ ...eform, supplier: v })} testID="expense-edit-supplier" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Harga Satuan" value={eform.unit_price} onChangeText={(v) => setEForm({ ...eform, unit_price: v })} keyboardType="number-pad" testID="expense-edit-unitprice" /></View>
              <View style={{ flex: 1 }}><Input label="HET" value={eform.het} onChangeText={(v) => setEForm({ ...eform, het: v })} keyboardType="number-pad" testID="expense-edit-het" /></View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Diskon (Rp)" value={eform.discount} onChangeText={(v) => setEForm({ ...eform, discount: v })} keyboardType="number-pad" testID="expense-edit-discount" /></View>
              <View style={{ flex: 1 }}><Input label="Ongkir (Rp)" value={eform.ongkir} onChangeText={(v) => setEForm({ ...eform, ongkir: v })} keyboardType="number-pad" testID="expense-edit-ongkir" /></View>
            </View>
          </>
        ) : null}
        {edit?.group === "LAINNYA" || edit?.category === "Kasbon Mekanik" || edit?.category === "Gaji Mekanik" ? (
          <Input label="Pihak / Nama" value={eform.counterparty} onChangeText={(v) => setEForm({ ...eform, counterparty: v })} testID="expense-edit-counterparty" />
        ) : null}
        <Text style={styles.label}>METODE PEMBAYARAN</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          {(["CASH", "HUTANG", "TRANSFER"] as const).map((pm) => (
            <Pressable key={pm} onPress={() => setEForm({ ...eform, payment_method: pm })} style={[styles.catChip, { flex: 1, alignItems: "center" }, eform.payment_method === pm && styles.catSel]} testID={`expense-edit-pm-${pm}`}>
              <Text style={[styles.catText, eform.payment_method === pm && { color: colors.onBrandPrimary }]}>{pm}</Text>
            </Pressable>
          ))}
        </View>
        <Input label="Catatan" value={eform.note} onChangeText={(v) => setEForm({ ...eform, note: v })} testID="expense-edit-note" />
        <Button title="Simpan Perubahan" onPress={() => saveEdit.mutate()} loading={saveEdit.isPending} disabled={parseNum(eform.amount) <= 0} testID="expense-edit-save" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  summary: { margin: 16, marginBottom: 4, backgroundColor: c.surfaceInverse, padding: 14, borderLeftWidth: 6, borderLeftColor: c.brandPrimary, gap: 6 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sumTotal: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.brandPrimary, paddingVertical: 6 },
  sumLabel: { color: c.onSurfaceInverse, opacity: 0.8, fontSize: 11, letterSpacing: 1 },
  sumVal: { color: c.onSurfaceInverse, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: 2, borderBottomColor: c.divider },
  name: { fontSize: 15, color: c.onSurface, fontWeight: "500" },
  sub: { fontSize: 12, color: c.muted },
  amount: { fontSize: 15, color: c.error },
  fab: { position: "absolute", right: 16, backgroundColor: c.brandPrimary, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, height: 56, borderWidth: 2, borderColor: c.border },
  fabText: { color: c.onBrandPrimary, fontWeight: "500", letterSpacing: 0.5 },
  label: { fontSize: 12, color: c.muted, marginBottom: 6, letterSpacing: 0.6 },
  groupBtn: { minHeight: 44, borderWidth: 2, borderColor: c.border, paddingHorizontal: 12, justifyContent: "center" },
  groupSel: { backgroundColor: c.surfaceInverse },
  groupText: { fontWeight: "500", color: c.onSurface },
  catChip: { height: 36, paddingHorizontal: 12, borderWidth: 2, borderColor: c.border, justifyContent: "center" },
  catSel: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  catText: { fontSize: 13, color: c.onSurface, fontWeight: "500" },
  partBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 2, borderColor: c.success, backgroundColor: c.successTint, padding: 10, marginBottom: 12 },
  opt: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider },
}));
