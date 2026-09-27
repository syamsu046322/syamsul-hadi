import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qs } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Address, AddressFields, EMPTY_ADDRESS } from "@/src/components/AddressFields";
import { Badge, Button, Chips, Empty, Header, Input, Loading, Mono, Sheet, useToast } from "@/src/components/ui";
import { fmtDateTime, parseNum, rupiah } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

type Mode = "stok" | "riwayat";
type CartItem = { part: any; qty: number; price: string; cost: string; disc: string };
const METHODS = ["CASH", "TRANSFER", "QRIS", "DEBIT", "KREDIT"] as const;
const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
};

export default function Outlet() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [outletId, setOutletId] = useState<string>("");
  const [mode, setMode] = useState<Mode>("stok");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ customer_name: "", customer_address: "", customer_phone: "", method: "CASH" as (typeof METHODS)[number], amount_paid: "", due_date: "", sale_date: todayYmd() });
  const [addr, setAddr] = useState<Address>(EMPTY_ADDRESS);
  const [transfer, setTransfer] = useState<any | null>(null);
  const [tQty, setTQty] = useState("1");
  const [newOutlet, setNewOutlet] = useState(false);
  const [oForm, setOForm] = useState({ name: "", address: "", phone: "" });

  const outlets = useQuery({ queryKey: ["outlets"], queryFn: () => api<any[]>("/outlets") });
  const current = (outlets.data ?? []).find((o) => o.id === outletId) ?? outlets.data?.[0];
  const oid = current?.id ?? "";
  const stock = useQuery({ queryKey: ["outlet-stock", oid, q], queryFn: () => api<any[]>(`/outlets/${oid}/stock${qs({ q })}`), enabled: !!oid && mode === "stok" });
  const sales = useQuery({ queryKey: ["sales", oid, q], queryFn: () => api<any[]>(`/sales${qs({ outlet_id: oid, q })}`), enabled: !!oid && mode === "riwayat" });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["outlet-stock"] }); qc.invalidateQueries({ queryKey: ["sales"] }); qc.invalidateQueries({ queryKey: ["parts"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };

  const itemSub = (c: CartItem) => Math.max(parseNum(c.price) * c.qty - parseNum(c.disc), 0);
  const itemProfit = (c: CartItem) => itemSub(c) - parseNum(c.cost) * c.qty;
  const subtotal = cart.reduce((s, c) => s + itemSub(c), 0);
  const total = subtotal;
  const totalProfit = cart.reduce((s, c) => s + itemProfit(c), 0);
  const paid = pay.method === "CASH" || pay.method === "KREDIT" ? parseNum(pay.amount_paid) : total;
  const debt = pay.method === "KREDIT" ? Math.max(total - paid, 0) : 0;

  const addToCart = (p: any) => {
    if (p.outlet_stock <= 0) { toast.show("Stok di outlet ini habis", "error"); return; }
    const ex = cart.find((c) => c.part.id === p.id);
    if (ex && ex.qty >= p.outlet_stock) { toast.show("Melebihi stok outlet", "error"); return; }
    setCart(ex ? cart.map((c) => (c.part.id === p.id ? { ...c, qty: c.qty + 1 } : c)) : [...cart, { part: p, qty: 1, price: String(p.price ?? 0), cost: String(p.cost ?? 0), disc: "0" }]);
  };
  const sell = useMutation({
    mutationFn: () => api<any>("/sales", { body: {
      outlet_id: oid,
      items: cart.map((c) => ({ part_id: c.part.id, qty: c.qty, price: parseNum(c.price), cost: parseNum(c.cost), discount: parseNum(c.disc) })),
      customer_name: pay.customer_name || "Umum",
      customer_address: pay.customer_address || [addr.dusun, addr.desa, addr.kecamatan, addr.kabupaten].filter(Boolean).join(", "),
      customer_dusun: addr.dusun, customer_desa: addr.desa, customer_kecamatan: addr.kecamatan, customer_kabupaten: addr.kabupaten,
      customer_phone: pay.customer_phone,
      method: pay.method, amount_paid: paid, due_date: pay.due_date, sale_date: pay.sale_date,
    } }),
    onSuccess: (s) => { invalidate(); qc.invalidateQueries({ queryKey: ["debts"] }); setCart([]); setPayOpen(false); toast.show(`Faktur ${s.sale_no} tersimpan`, "success"); router.push(`/nota-jual/${s.id}`); },
    onError: (e: any) => toast.show(e.message, "error"),
  });
  const doTransfer = useMutation({
    mutationFn: () => api(`/outlets/${oid}/transfer`, { body: { part_id: transfer.id, qty: parseNum(tQty) } }),
    onSuccess: () => { invalidate(); setTransfer(null); toast.show("Stok dipindahkan ke outlet", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });
  const createOutlet = useMutation({
    mutationFn: () => api<any>("/outlets", { body: oForm }),
    onSuccess: (o) => { qc.invalidateQueries({ queryKey: ["outlets"] }); setNewOutlet(false); setOutletId(o.id); toast.show("Outlet cabang dibuat", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  return (
    <View style={styles.root} testID="outlet-screen">
      <Header title="OUTLET & PENJUALAN PART" subtitle={current ? `${current.name}${current.is_main ? " (pusat)" : ""}` : "Memuat…"} back
        right={user?.role === "owner" ? <Pressable onPress={() => { setNewOutlet(true); setOForm({ name: "", address: "", phone: "" }); }} style={styles.addBtn} testID="outlet-add-button"><Ionicons name="add" size={18} color={colors.onBrandPrimary} /><Text style={styles.addText}>CABANG</Text></Pressable> : undefined} />
      <Chips options={(outlets.data ?? []).map((o) => ({ key: o.id, label: o.name }))} value={oid} onChange={(v) => { setOutletId(v); setCart([]); }} testID="outlet-chip" />
      <Chips options={[{ key: "stok", label: "Stok & Jual" }, { key: "riwayat", label: "Riwayat Penjualan" }]} value={mode} onChange={setMode} testID="outlet-mode" />
      <View style={styles.searchWrap}><Input value={q} onChangeText={setQ} placeholder={mode === "stok" ? "Cari kode, nama, rak part" : "Cari no faktur / pelanggan"} testID="outlet-search-input" /></View>
      {mode === "stok" ? (
        stock.isLoading ? <Loading /> : (
          <FlatList data={stock.data ?? []} keyExtractor={(p) => p.id} contentContainerStyle={{ paddingBottom: 140 }}
            refreshControl={<RefreshControl refreshing={stock.isRefetching} onRefresh={stock.refetch} tintColor={colors.brandPrimary} />}
            ListEmptyComponent={<Empty text="Part tidak ditemukan." icon="cube-outline" />}
            renderItem={({ item: p }) => {
              const empty = p.outlet_stock <= 0;
              return (
                <View style={[styles.row, empty && { opacity: 0.6 }]} testID={`outlet-part-${p.code}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{p.name}</Text>
                    <Text style={styles.sub}>{p.code}{p.rack ? ` · RAK ${p.rack}` : ""} · {rupiah(p.price)}</Text>
                    {!current?.is_main ? <Text style={styles.sub}>Stok pusat: {p.stock}</Text> : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <Mono style={[styles.stock, empty && { color: colors.muted }]} testID={`outlet-stock-${p.code}`}>{p.outlet_stock} <Text style={styles.sub}>{p.unit}</Text></Mono>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {!current?.is_main ? <Button title="Transfer" variant="outline" small onPress={() => { setTransfer(p); setTQty("1"); }} testID={`outlet-transfer-${p.code}`} /> : null}
                      <Button title="+ Jual" variant="primary" small onPress={() => addToCart(p)} disabled={empty} testID={`outlet-sell-${p.code}`} />
                    </View>
                  </View>
                </View>
              );
            }} />
        )
      ) : sales.isLoading ? <Loading /> : (
        <FlatList data={sales.data ?? []} keyExtractor={(s) => s.id} contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={sales.isRefetching} onRefresh={sales.refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Empty text="Belum ada penjualan di outlet ini." icon="receipt-outline" testID="sales-empty" />}
          renderItem={({ item: s }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/nota-jual/${s.id}`)} testID={`sale-row-${s.sale_no}`}>
              <View style={{ flex: 1 }}>
                <Mono style={styles.saleNo}>{s.sale_no}</Mono>
                <Text style={styles.name}>{s.customer_name} · {s.items.length} item</Text>
                <Text style={styles.sub}>{fmtDateTime(s.created_at)} · {s.method} · {s.cashier}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}><Mono style={styles.stock}>{rupiah(s.total)}</Mono><Badge label={s.status} tone="success" /></View>
            </Pressable>
          )} />
      )}
      {cart.length && mode === "stok" ? (
        <View style={[styles.cartBar, { paddingBottom: insets.bottom + 12 }]} testID="cart-bar">
          <View style={{ flex: 1 }}>
            <Text style={styles.cartLabel}>{cart.reduce((s, c) => s + c.qty, 0)} ITEM · {cart.map((c) => `${c.part.name} x${c.qty}`).join(", ").slice(0, 40)}</Text>
            <Mono style={styles.cartVal}>{rupiah(subtotal)}</Mono>
          </View>
          <Pressable onPress={() => setCart([])} hitSlop={8} style={{ padding: 8 }} testID="cart-clear"><Ionicons name="trash-outline" size={22} color={colors.onSurfaceInverse} /></Pressable>
          <Button title="Bayar" variant="success" icon="cash" onPress={() => { setPay({ customer_name: "", customer_address: "", customer_phone: "", method: "CASH", amount_paid: String(subtotal), due_date: "", sale_date: todayYmd() }); setAddr(EMPTY_ADDRESS); setPayOpen(true); }} testID="cart-pay-button" />
        </View>
      ) : null}

      <Sheet visible={payOpen} onClose={() => setPayOpen(false)} title="Faktur Penjualan Part" testID="sale-sheet">
        {cart.map((c) => (
          <View key={c.part.id} style={styles.cartCard} testID={`cart-item-${c.part.code}`}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ flex: 1 }}><Text style={styles.name}>{c.part.name}</Text><Text style={styles.sub}>{c.part.rack ? `RAK ${c.part.rack}` : c.part.code}</Text></View>
              <Pressable onPress={() => setCart(cart.map((x) => (x.part.id === c.part.id ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))} style={styles.qtyBtn} testID={`cart-minus-${c.part.code}`}><Text style={styles.qtyText}>−</Text></Pressable>
              <Mono style={{ width: 28, textAlign: "center" }}>{c.qty}</Mono>
              <Pressable onPress={() => addToCart({ ...c.part })} style={styles.qtyBtn} testID={`cart-plus-${c.part.code}`}><Text style={styles.qtyText}>+</Text></Pressable>
              <Pressable onPress={() => setCart(cart.filter((x) => x.part.id !== c.part.id))} style={{ padding: 6 }} testID={`cart-remove-${c.part.code}`}><Ionicons name="close" size={18} color={colors.error} /></Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1 }}><Input label="Harga jual" value={c.price} onChangeText={(v) => setCart(cart.map((x) => (x.part.id === c.part.id ? { ...x, price: v } : x)))} keyboardType="number-pad" testID={`cart-price-${c.part.code}`} /></View>
              <View style={{ flex: 1 }}><Input label="Harga beli" value={c.cost} onChangeText={(v) => setCart(cart.map((x) => (x.part.id === c.part.id ? { ...x, cost: v } : x)))} keyboardType="number-pad" testID={`cart-cost-${c.part.code}`} /></View>
              <View style={{ flex: 1 }}><Input label="Diskon" value={c.disc} onChangeText={(v) => setCart(cart.map((x) => (x.part.id === c.part.id ? { ...x, disc: v } : x)))} keyboardType="number-pad" testID={`cart-disc-${c.part.code}`} /></View>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
              <Text style={styles.sub}>Subtotal {rupiah(itemSub(c))}</Text>
              <Text style={[styles.sub, { color: itemProfit(c) >= 0 ? colors.success : colors.error }]} testID={`cart-profit-${c.part.code}`}>Laba {rupiah(itemProfit(c))}</Text>
            </View>
          </View>
        ))}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <View style={{ flex: 1 }}><Input label="Nama konsumen" value={pay.customer_name} onChangeText={(v) => setPay({ ...pay, customer_name: v })} placeholder="Umum" testID="sale-customer-input" /></View>
          <View style={{ flex: 1 }}><Input label="No HP (WhatsApp)" value={pay.customer_phone} onChangeText={(v) => setPay({ ...pay, customer_phone: v })} keyboardType="phone-pad" testID="sale-phone-input" /></View>
        </View>
        <Input label="Alamat konsumen" value={pay.customer_address} onChangeText={(v) => setPay({ ...pay, customer_address: v })} placeholder="opsional — atau isi wilayah di bawah" testID="sale-address-input" />
        <AddressFields value={addr} onChange={setAddr} testPrefix="sale-address" />
        {user?.role === "owner" ? <Input label="Tanggal faktur (TTTTBBHH)" value={pay.sale_date} onChangeText={(v) => setPay({ ...pay, sale_date: v })} keyboardType="number-pad" testID="sale-date-input" /> : null}
        <Text style={styles.label}>METODE PEMBAYARAN</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {METHODS.map((m) => <Pressable key={m} onPress={() => setPay({ ...pay, method: m, amount_paid: m === "CASH" ? String(total) : m === "KREDIT" ? "0" : pay.amount_paid })} style={[styles.method, pay.method === m && styles.methodSel]} testID={`sale-method-${m}`}><Text style={[styles.methodText, pay.method === m && { color: colors.onBrandPrimary }]}>{m}</Text></Pressable>)}
        </View>
        {pay.method === "CASH" ? <Input label="Uang diterima" value={pay.amount_paid} onChangeText={(v) => setPay({ ...pay, amount_paid: v })} keyboardType="number-pad" testID="sale-amount-input" /> : null}
        {pay.method === "KREDIT" ? (
          <>
            <Input label="Uang muka (DP, boleh 0)" value={pay.amount_paid} onChangeText={(v) => setPay({ ...pay, amount_paid: v })} keyboardType="number-pad" testID="sale-dp-input" />
            <Input label="Jatuh tempo" value={pay.due_date} onChangeText={(v) => setPay({ ...pay, due_date: v })} placeholder="cth: 30/07/2026" testID="sale-due-input" />
          </>
        ) : null}
        <View style={styles.totalRow}><Text style={styles.cartLabel}>TOTAL</Text><Mono style={styles.totalVal} testID="sale-total">{rupiah(total)}</Mono></View>
        <View style={styles.totalRow}><Text style={styles.cartLabel}>TOTAL LABA</Text><Mono style={{ fontSize: 16, color: totalProfit >= 0 ? colors.success : colors.error }} testID="sale-profit">{rupiah(totalProfit)}</Mono></View>
        {pay.method === "CASH" ? <View style={styles.totalRow}><Text style={styles.cartLabel}>KEMBALIAN</Text><Mono style={{ fontSize: 16, color: colors.success }}>{rupiah(Math.max(paid - total, 0))}</Mono></View> : null}
        {pay.method === "KREDIT" ? <View style={styles.totalRow}><Text style={styles.cartLabel}>SISA HUTANG</Text><Mono style={{ fontSize: 16, color: colors.error }} testID="sale-debt">{rupiah(debt)}</Mono></View> : null}
        <Button title={pay.method === "KREDIT" ? "Simpan Faktur Kredit" : "Konfirmasi & Cetak Faktur"} variant="success" onPress={() => sell.mutate()} loading={sell.isPending} disabled={cart.length === 0 || (pay.method === "CASH" && paid < total)} testID="sale-submit-button" />
      </Sheet>
      <Sheet visible={!!transfer} onClose={() => setTransfer(null)} title={`Transfer ke ${current?.name ?? ""}`} testID="transfer-sheet">
        <Text style={styles.name}>{transfer?.name}</Text>
        <Text style={[styles.sub, { marginBottom: 12 }]}>Stok pusat: {transfer?.stock} · Stok outlet: {transfer?.outlet_stock}. Angka negatif = kembalikan ke pusat.</Text>
        <Input label="Jumlah dipindahkan" value={tQty} onChangeText={setTQty} keyboardType="numbers-and-punctuation" testID="transfer-qty-input" />
        <Button title="Pindahkan Stok" onPress={() => doTransfer.mutate()} loading={doTransfer.isPending} disabled={!tQty.trim() || tQty === "0"} testID="transfer-submit-button" />
      </Sheet>
      <Sheet visible={newOutlet} onClose={() => setNewOutlet(false)} title="Outlet Cabang Baru" testID="outlet-sheet">
        <Input label="Nama outlet *" value={oForm.name} onChangeText={(v) => setOForm({ ...oForm, name: v })} testID="outlet-name-input" />
        <Input label="Alamat" value={oForm.address} onChangeText={(v) => setOForm({ ...oForm, address: v })} testID="outlet-address-input" />
        <Input label="Telepon" value={oForm.phone} onChangeText={(v) => setOForm({ ...oForm, phone: v })} keyboardType="phone-pad" testID="outlet-phone-input" />
        <Button title="Simpan Outlet" onPress={() => createOutlet.mutate()} loading={createOutlet.isPending} disabled={!oForm.name.trim()} testID="outlet-save-button" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  addBtn: { flexDirection: "row", alignItems: "center", backgroundColor: c.brandPrimary, height: 36, paddingHorizontal: 10, gap: 2 },
  addText: { color: c.onBrandPrimary, fontWeight: "500", fontSize: 12 },
  searchWrap: { padding: 16, paddingBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: 2, borderBottomColor: c.divider },
  name: { fontSize: 15, color: c.onSurface, fontWeight: "500" },
  sub: { fontSize: 12, color: c.muted },
  stock: { fontSize: 18, color: c.onSurface },
  saleNo: { fontSize: 12, color: c.brandPrimary },
  cartBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 8, padding: 16, backgroundColor: c.surfaceInverse, borderTopWidth: 3, borderTopColor: c.brandPrimary },
  cartLabel: { color: c.brandPrimary, fontSize: 11, letterSpacing: 1 },
  cartVal: { color: c.onSurfaceInverse, fontSize: 20 },
  cartRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.divider },
  cartCard: { paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: c.divider },
  label: { fontSize: 12, color: c.muted, marginBottom: 6, marginTop: 4, letterSpacing: 0.6 },
  qtyBtn: { width: 32, height: 32, borderWidth: 2, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  qtyText: { fontSize: 18, color: c.onSurface },
  method: { height: 40, paddingHorizontal: 12, borderWidth: 2, borderColor: c.border, justifyContent: "center", minWidth: 80, alignItems: "center" },
  methodSel: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  methodText: { fontWeight: "500", color: c.onSurface, fontSize: 13 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderTopWidth: 2, borderTopColor: c.border },
  totalVal: { fontSize: 22, color: c.brandPrimary },
}));
