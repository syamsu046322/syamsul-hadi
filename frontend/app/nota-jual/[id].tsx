import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import * as Print from "expo-print";
import React, { useState } from "react";
import { Linking, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { DateEditSheet, ymdToDMY } from "@/src/components/date-edit";
import { Button, Header, Loading, useToast } from "@/src/components/ui";
import { fmtDateTime, MONO, rupiah } from "@/src/format";
import { logoUri } from "@/src/shop";
import { makeStyles } from "@/src/theme";

export default function NotaJual() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [dateOpen, setDateOpen] = useState(false);
  const q = useQuery({ queryKey: ["sale", id], queryFn: () => api<any>(`/sales/${id}`) });
  const editDate = useMutation({
    mutationFn: (dmy: string) => api(`/sales/${id}/date`, { method: "PUT", body: { date: dmy } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sale", id] }); qc.invalidateQueries({ queryKey: ["sales"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); setDateOpen(false); toast.show("Tanggal faktur diperbarui", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });
  const print = useMutation({
    mutationFn: async () => {
      const { sale: s, shop } = q.data;
      const rows = s.items.map((i: any) => `<tr><td>${i.name} (${i.qty} x ${rupiah(i.price)})</td><td style="text-align:right">${rupiah(i.subtotal)}</td></tr>`).join("");
      await Print.printAsync({ html: `<html><body style="font-family:'Courier New',monospace;font-size:12px;max-width:380px;margin:0 auto;padding:12px">
        <div style="text-align:center"><img src="${logoUri(shop.logo_version)}" style="width:100px;height:100px;object-fit:contain"/></div>
        <h2 style="text-align:center;margin:4px 0">${shop.name}</h2><div style="text-align:center;font-size:11px">${s.outlet_name}<br/>${shop.address}<br/>${shop.phone}</div><hr/>
        <table style="width:100%"><tr><td>No Faktur</td><td style="text-align:right">${s.sale_no}</td></tr><tr><td>Tanggal</td><td style="text-align:right">${fmtDateTime(s.created_at)}</td></tr>
        <tr><td>Pelanggan</td><td style="text-align:right">${s.customer_name}</td></tr>${s.customer_address ? `<tr><td>Alamat</td><td style="text-align:right">${s.customer_address}</td></tr>` : ""}<tr><td>Kasir</td><td style="text-align:right">${s.cashier}</td></tr></table><hr/>
        <table style="width:100%">${rows}</table><hr/><table style="width:100%"><tr><td>Subtotal</td><td style="text-align:right">${rupiah(s.subtotal)}</td></tr>
        <tr><td>Diskon</td><td style="text-align:right">- ${rupiah(s.discount)}</td></tr><tr style="font-weight:bold;font-size:14px"><td>TOTAL</td><td style="text-align:right">${rupiah(s.total)}</td></tr>
        <tr><td>Bayar (${s.method})</td><td style="text-align:right">${rupiah(s.amount_paid)}</td></tr>${s.debt_amount ? `<tr><td>Sisa Hutang</td><td style="text-align:right">${rupiah(s.debt_amount)}${s.debt_due_date ? ` (JT ${s.debt_due_date})` : ""}</td></tr>` : `<tr><td>Kembalian</td><td style="text-align:right">${rupiah(s.change)}</td></tr>`}</table>
        <hr/><div style="text-align:center;font-size:11px">Terima kasih telah berbelanja di ${shop.name}.</div></body></html>` });
    },
    onError: (e: any) => { if (!/cancel|dismiss/i.test(e.message ?? "")) toast.show(e.message ?? "Gagal mencetak", "error"); },
  });
  const wa = useMutation({
    mutationFn: () => api<any>(`/sales/${id}/whatsapp`, { method: "POST", body: {} }),
    onSuccess: (r) => { if (r.url) Linking.openURL(r.url).catch(() => Share.share({ message: r.message })); else { toast.show("No HP pelanggan kosong — bagikan manual", "error"); Share.share({ message: r.message }); } },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  if (q.isLoading || !q.data) return <View style={styles.root}><Header title="FAKTUR PENJUALAN" back /><Loading /></View>;
  const { sale: s, shop } = q.data;
  const Row = ({ l, r, bold }: { l: string; r: string; bold?: boolean }) => (
    <View style={styles.row}><Text style={[styles.t, bold && styles.bold]}>{l}</Text><Text style={[styles.t, styles.right, bold && styles.bold]}>{r}</Text></View>
  );
  return (
    <View style={styles.root} testID="sale-receipt-screen">
      <Header title="FAKTUR PENJUALAN" subtitle={s.sale_no} back />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        <View style={styles.paper} testID="sale-receipt-paper">
          <Image source={{ uri: logoUri(shop.logo_version) }} style={{ width: 90, height: 90, alignSelf: "center" }} contentFit="contain" />
          <Text style={styles.shop}>{shop.name}</Text>
          <Text style={styles.center}>{s.outlet_name} · {shop.address}</Text>
          <View style={styles.hr} />
          <Row l="No Faktur" r={s.sale_no} /><Row l="Tanggal" r={fmtDateTime(s.created_at)} /><Row l="Pelanggan" r={s.customer_name} />{s.customer_address ? <Row l="Alamat" r={s.customer_address} /> : null}<Row l="Kasir" r={s.cashier} />
          <View style={styles.hr} />
          {s.items.map((i: any) => <Row key={i.part_id} l={`${i.name} (${i.qty}x${rupiah(i.price)})${i.discount ? ` -${rupiah(i.discount)}` : ""}`} r={rupiah(i.subtotal)} />)}
          <View style={styles.hr} />
          <Row l="Subtotal" r={rupiah(s.subtotal)} /><Row l="Diskon" r={`- ${rupiah(s.discount)}`} /><Row l="TOTAL" r={rupiah(s.total)} bold />
          <Row l={`Bayar (${s.method})`} r={rupiah(s.amount_paid)} />
          {s.debt_amount ? <Row l={`Sisa Hutang${s.debt_due_date ? ` (JT ${s.debt_due_date})` : ""}`} r={rupiah(s.debt_amount)} /> : <Row l="Kembalian" r={rupiah(s.change)} />}
          {user?.role === "owner" ? <Row l="Laba (internal)" r={rupiah(s.total_profit)} /> : null}
          <View style={styles.hr} />
          <Text style={[styles.center, { marginTop: 4 }]}>Terima kasih telah berbelanja di {shop.name}.</Text>
        </View>
        <View style={{ gap: 10 }}>
          <Button title="🖨️  Cetak Faktur" variant="dark" onPress={() => print.mutate()} loading={print.isPending} testID="sale-print-button" />
          <Button title="📱  Kirim via WhatsApp" variant="success" onPress={() => wa.mutate()} loading={wa.isPending} testID="sale-whatsapp-button" />
          {user?.role === "owner" ? <Button title="Ubah Tanggal Faktur" variant="outline" icon="calendar-outline" onPress={() => setDateOpen(true)} testID="sale-edit-date-button" /> : null}
        </View>
      </ScrollView>
      <DateEditSheet visible={dateOpen} onClose={() => setDateOpen(false)} initial={ymdToDMY(s.date)} onSave={(dmy) => editDate.mutate(dmy)} loading={editDate.isPending} note={`Ubah tanggal faktur ${s.sale_no}. Format HH/BB/TTTT. Laporan & omzet mengikuti tanggal baru.`} testID="sale-date-sheet" />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  paper: { backgroundColor: c.surface, borderWidth: 2, borderColor: c.border, padding: 16, marginBottom: 16 },
  shop: { fontFamily: MONO, fontSize: 17, textAlign: "center", color: c.onSurface, letterSpacing: 2, marginTop: 6 },
  center: { fontFamily: MONO, fontSize: 11, textAlign: "center", color: c.muted },
  hr: { borderTopWidth: 2, borderStyle: "dashed", borderColor: c.border, marginVertical: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8, paddingVertical: 2 },
  t: { fontFamily: MONO, fontSize: 12, color: c.onSurface, flex: 1 },
  right: { textAlign: "right", flex: 0, minWidth: 90 },
  bold: { fontWeight: "500", fontSize: 14 },
}));
