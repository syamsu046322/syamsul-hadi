import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import { api, qs } from "@/src/api";
import { Badge, Button, Chips, Empty, Header, Input, Loading, Mono, Sheet, useToast } from "@/src/components/ui";
import { fmtDate, parseNum, rupiah } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

const METHODS = ["CASH", "TRANSFER", "QRIS", "DEBIT"] as const;

export default function Piutang() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"BELUM LUNAS" | "LUNAS">("BELUM LUNAS");
  const [pay, setPay] = useState<any | null>(null);
  const [form, setForm] = useState({ amount: "", method: "CASH" as (typeof METHODS)[number], reference: "" });
  const list = useQuery({ queryKey: ["debts", status], queryFn: () => api<any[]>(`/debts${qs({ status })}`) });
  const total = (list.data ?? []).reduce((s, d) => s + (d.debt_amount ?? 0), 0);

  const doPay = useMutation({
    mutationFn: () => api(`${pay.sale ? `/sales/${pay.id}` : `/transactions/${pay.id}`}/pay-debt`, { body: { amount: parseNum(form.amount), method: form.method, reference: form.reference } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["debts"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); qc.invalidateQueries({ queryKey: ["sales"] }); qc.invalidateQueries({ queryKey: ["transaction", pay.id] }); setPay(null); toast.show("Pembayaran hutang tersimpan", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  return (
    <View style={styles.root} testID="debts-screen">
      <Header title="PIUTANG / HUTANG" subtitle={`${list.data?.length ?? 0} nota · ${rupiah(total)}`} back />
      <Chips options={[{ key: "BELUM LUNAS", label: "Belum Lunas" }, { key: "LUNAS", label: "Sudah Lunas" }]} value={status} onChange={setStatus} testID="debt-filter" />
      {list.isLoading ? <Loading /> : (
        <FlatList data={list.data ?? []} keyExtractor={(d) => d.id} contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Empty text="Tidak ada hutang." icon="wallet-outline" testID="debts-empty" />}
          renderItem={({ item: d }) => (
            <Pressable style={styles.row} onPress={() => router.push(d.sale ? `/nota-jual/${d.id}` : `/transaksi/${d.id}`)} testID={`debt-row-${d.invoice_no}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Mono style={styles.inv}>{d.invoice_no}</Mono>
                <Badge label={d.overdue ? "JATUH TEMPO" : d.debt_status} tone={d.debt_status === "LUNAS" ? "success" : d.overdue ? "error" : "warning"} />
              </View>
              <Text style={styles.name}>{d.customer_name} · {d.plate}{d.sale ? "  🛒" : ""}</Text>
              <Text style={styles.sub}>{d.customer_phone || "-"} · Dibayar {fmtDate(d.paid_at)} · Jatuh tempo {d.debt_due_date || "-"}</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <View>
                  <Text style={styles.sub}>SISA HUTANG</Text>
                  <Mono style={[styles.amount, d.debt_status === "LUNAS" && { color: colors.success }]}>{rupiah(d.debt_amount)}</Mono>
                </View>
                {d.debt_status !== "LUNAS" ? <Button title="Bayar Hutang" variant="primary" small onPress={() => { setPay(d); setForm({ amount: String(d.debt_amount), method: "CASH", reference: "" }); }} testID={`debt-pay-${d.invoice_no}`} /> : null}
              </View>
            </Pressable>
          )} />
      )}
      <Sheet visible={!!pay} onClose={() => setPay(null)} title="Bayar Hutang" testID="debt-pay-sheet">
        <Text style={styles.name}>{pay?.customer_name} · {pay?.invoice_no}</Text>
        <Text style={[styles.sub, { marginBottom: 12 }]}>Sisa hutang: {rupiah(pay?.debt_amount)}</Text>
        <Input label="Nominal dibayar" value={form.amount} onChangeText={(v) => setForm({ ...form, amount: v })} keyboardType="number-pad" testID="debt-amount-input" />
        <Text style={styles.label}>METODE</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {METHODS.map((m) => (
            <Pressable key={m} onPress={() => setForm({ ...form, method: m })} style={[styles.method, form.method === m && styles.methodSel]} testID={`debt-method-${m}`}>
              <Text style={[styles.methodText, form.method === m && { color: colors.onBrandPrimary }]}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <Input label="Referensi (opsional)" value={form.reference} onChangeText={(v) => setForm({ ...form, reference: v })} testID="debt-reference-input" />
        <Button title="Konfirmasi Pembayaran Hutang" variant="success" onPress={() => doPay.mutate()} loading={doPay.isPending} disabled={!parseNum(form.amount)} testID="debt-pay-submit" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  row: { padding: 16, borderBottomWidth: 2, borderBottomColor: c.divider, gap: 2 },
  inv: { fontSize: 13, color: c.brandPrimary },
  name: { fontSize: 15, color: c.onSurface, fontWeight: "500", marginTop: 4 },
  sub: { fontSize: 12, color: c.muted, marginTop: 2 },
  amount: { fontSize: 20, color: c.error },
  label: { fontSize: 12, color: c.muted, marginBottom: 6, letterSpacing: 0.6 },
  method: { height: 44, paddingHorizontal: 14, borderWidth: 2, borderColor: c.border, justifyContent: "center", minWidth: 90, alignItems: "center" },
  methodSel: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  methodText: { fontWeight: "500", color: c.onSurface },
}));
