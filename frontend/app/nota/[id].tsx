import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Print from "expo-print";
import React from "react";
import { Linking, Platform, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Header, Loading, useToast } from "@/src/components/ui";
import { fmtDateTime, MONO, rupiah } from "@/src/format";
import { logoUri } from "@/src/shop";
import { makeStyles } from "@/src/theme";

function receiptHtml(shop: any, d: any): string {
  const row = (l: string, r: string) => `<tr><td>${l}</td><td style="text-align:right">${r}</td></tr>`;
  const items = (arr: any[]) => arr.map((i) => row(`${i.name} (${i.qty} x ${rupiah(i.price)})`, rupiah(i.subtotal))).join("");
  const ok = d.items.filter((i: any) => i.approval === "DISETUJUI");
  const est = ok.filter((i: any) => i.source === "ESTIMASI");
  const add = ok.filter((i: any) => i.source === "TAMBAHAN");
  return `<html><head><meta charset="utf-8"><style>
    body{font-family:'Courier New',monospace;font-size:12px;max-width:380px;margin:0 auto;padding:12px;color:#111}
    h1{font-size:18px;margin:0;text-align:center;letter-spacing:2px} .c{text-align:center;font-size:11px}
    table{width:100%;border-collapse:collapse} td{padding:2px 0;vertical-align:top} .hr{border-top:2px dashed #111;margin:8px 0}
    .tot td{font-weight:bold;font-size:14px} .sec{font-weight:bold;margin-top:6px;text-transform:uppercase}
  </style></head><body>
    <div style="text-align:center;margin-bottom:6px"><img src="${logoUri(shop.logo_version)}" style="width:110px;height:110px;object-fit:contain"/></div>
    <h1>${shop.name}</h1><div class="c">${shop.address}<br/>${shop.phone}</div><div class="hr"></div>
    <table>${row("No Nota", d.invoice?.invoice_no ?? d.trx_no)}${row("Tanggal", fmtDateTime(d.paid_at))}${row("Antrian", d.queue_no)}
    ${row("Pelanggan", d.customer_name)}${row("No HP", d.customer_phone || "-")}${row("Motor", d.vehicle_name || "-")}${row("No Polisi", d.plate)}
    ${row("Kilometer", String(d.km_in ?? "-"))}${row("Mekanik", d.mechanic_name || "-")}</table><div class="hr"></div>
    <div class="sec">Keluhan</div><div>${d.complaint_main}</div><div class="hr"></div>
    <div class="sec">Jasa & Sparepart</div><table>${items(est)}</table>
    ${add.length ? `<div class="sec">Tambahan</div><table>${items(add)}</table>` : ""}<div class="hr"></div>
    <table>${row("Subtotal", rupiah(d.totals.subtotal))}${row("Diskon", "- " + rupiah(d.totals.discount))}
    <tr class="tot"><td>TOTAL</td><td style="text-align:right">${rupiah(d.totals.total)}</td></tr>
    ${row("Pembayaran (" + (d.payment?.method ?? "-") + ")", rupiah(d.payment?.amount_paid))}${d.payment?.method === "CASH" ? row("Kembalian", rupiah(d.payment?.change)) : ""}
    ${d.debt_status ? row("Sisa Hutang" + (d.debt_due_date ? " (jt " + d.debt_due_date + ")" : ""), d.debt_status === "LUNAS" ? "LUNAS" : rupiah(d.debt_amount)) : ""}</table><div class="hr"></div>
    ${d.mechanic_note ? `<div><b>Catatan:</b> ${d.mechanic_note}</div>` : ""}
    ${d.next_recommendation ? `<div><b>Rekomendasi berikutnya:</b> ${d.next_recommendation}${d.next_km ? " (KM " + d.next_km + ")" : ""}${d.next_date ? " · " + d.next_date : ""}</div>` : ""}
    <div class="hr"></div><div class="c">Terima kasih telah mempercayakan perawatan motor Anda kepada Klinik Suel Motor.</div>
  </body></html>`;
}

export default function Nota() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ["receipt", id], queryFn: () => api<any>(`/transactions/${id}/receipt`) });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["receipt", id] }); qc.invalidateQueries({ queryKey: ["transaction", id] }); qc.invalidateQueries({ queryKey: ["transactions"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };

  const print = useMutation({
    mutationFn: async () => {
      const html = receiptHtml(q.data.shop, q.data.detail);
      await Print.printAsync({ html });
      await api(`/transactions/${id}/print`, { method: "POST", body: {} });
    },
    onSuccess: () => { invalidate(); toast.show("Nota dicetak", "success"); },
    onError: (e: any) => { if (!/cancel|dismiss/i.test(e.message ?? "")) toast.show(e.message ?? "Gagal mencetak", "error"); },
  });
  const wa = useMutation({
    mutationFn: () => api<any>(`/transactions/${id}/whatsapp`, { method: "POST", body: {} }),
    onSuccess: async (r) => {
      invalidate();
      if (r.url) { toast.show("Membuka WhatsApp…", "success"); Linking.openURL(r.url).catch(() => Share.share({ message: r.message })); }
      else { toast.show("Nomor HP pelanggan tidak ada — bagikan manual", "error"); Share.share({ message: r.message }); }
    },
    onError: (e: any) => toast.show(e.message, "error"),
  });
  const done = useMutation({
    mutationFn: () => api(`/transactions/${id}/complete`, { method: "POST", body: {} }),
    onSuccess: () => { invalidate(); toast.show("Transaksi SELESAI. Histori servis tersimpan.", "success"); router.replace("/(tabs)/antrian"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  if (q.isLoading || !q.data) return <View style={styles.root}><Header title="NOTA" back /><Loading /></View>;
  const { shop, detail: d } = q.data;
  const ok = d.items.filter((i: any) => i.approval === "DISETUJUI");
  const est = ok.filter((i: any) => i.source === "ESTIMASI");
  const add = ok.filter((i: any) => i.source === "TAMBAHAN");
  const waStatus = d.whatsapp_logs?.[0]?.status ?? "BELUM DIKIRIM";

  const Row = ({ l, r, bold }: { l: string; r: string; bold?: boolean }) => (
    <View style={styles.row}><Text style={[styles.rTxt, bold && styles.bold]}>{l}</Text><Text style={[styles.rTxt, styles.right, bold && styles.bold]}>{r}</Text></View>
  );

  return (
    <View style={styles.root} testID="receipt-screen">
      <Header title="NOTA SERVIS" subtitle={d.invoice?.invoice_no ?? d.trx_no} back />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        <View style={styles.paper} testID="receipt-paper">
          <View style={styles.logo}><Image source={{ uri: logoUri(shop.logo_version) }} style={{ width: 96, height: 96 }} contentFit="contain" /></View>
          <Text style={styles.shop}>{shop.name}</Text>
          <Text style={styles.center}>{shop.address}</Text>
          <Text style={styles.center}>{shop.phone}</Text>
          <View style={styles.hr} />
          <Row l="No Nota" r={d.invoice?.invoice_no ?? d.trx_no} />
          <Row l="Tanggal" r={fmtDateTime(d.paid_at)} />
          <Row l="Pelanggan" r={d.customer_name} />
          <Row l="No HP" r={d.customer_phone || "-"} />
          <Row l="Motor" r={d.vehicle_name || "-"} />
          <Row l="No Polisi" r={d.plate} />
          <Row l="Kilometer" r={String(d.km_in ?? "-")} />
          <Row l="Mekanik" r={d.mechanic_name || "-"} />
          <View style={styles.hr} />
          <Text style={styles.sec}>KELUHAN</Text>
          <Text style={styles.rTxt}>{d.complaint_main}</Text>
          <View style={styles.hr} />
          <Text style={styles.sec}>JASA & SPAREPART</Text>
          {est.map((i: any) => <Row key={i.id} l={`${i.name} (${i.qty}x${rupiah(i.price)})`} r={rupiah(i.subtotal)} />)}
          {add.length ? <><Text style={styles.sec}>TAMBAHAN</Text>{add.map((i: any) => <Row key={i.id} l={`${i.name} (${i.qty}x${rupiah(i.price)})`} r={rupiah(i.subtotal)} />)}</> : null}
          <View style={styles.hr} />
          <Row l="Subtotal" r={rupiah(d.totals.subtotal)} />
          <Row l="Diskon" r={`- ${rupiah(d.totals.discount)}`} />
          <Row l="TOTAL" r={rupiah(d.totals.total)} bold />
          <Row l={`Bayar (${d.payment?.method ?? "-"})`} r={rupiah(d.payment?.amount_paid)} />
          {d.payment?.method === "CASH" ? <Row l="Kembalian" r={rupiah(d.payment?.change)} /> : null}
          {d.debt_status ? <Row l={`Sisa Hutang${d.debt_due_date ? ` (jt ${d.debt_due_date})` : ""}`} r={d.debt_status === "LUNAS" ? "LUNAS" : rupiah(d.debt_amount)} bold /> : null}
          <View style={styles.hr} />
          {d.mechanic_note ? <Text style={styles.rTxt}>Catatan: {d.mechanic_note}</Text> : null}
          {d.next_recommendation ? <Text style={styles.rTxt}>Rekomendasi: {d.next_recommendation}{d.next_km ? ` (KM ${d.next_km})` : ""}{d.next_date ? ` · ${d.next_date}` : ""}</Text> : null}
          <Text style={[styles.center, { marginTop: 8 }]}>Terima kasih telah mempercayakan perawatan motor Anda kepada Klinik Suel Motor.</Text>
        </View>

        <Text style={styles.waStatus} testID="whatsapp-status">Status WhatsApp: {waStatus}{d.whatsapp_logs?.[0] ? ` · ${fmtDateTime(d.whatsapp_logs[0].created_at)}` : ""}</Text>
        {can("kasir") ? (
          <View style={{ gap: 10 }}>
            <Button title="🖨️  Cetak Nota (Thermal / A4)" variant="dark" onPress={() => print.mutate()} loading={print.isPending} testID="print-receipt-button" style={{ minHeight: 56 }} />
            <Button title="📱  Kirim Nota via WhatsApp" variant="success" onPress={() => wa.mutate()} loading={wa.isPending} testID="send-whatsapp-button" style={{ minHeight: 56 }} />
            {d.status !== "SELESAI" ? <Button title="Selesaikan Transaksi" variant="primary" icon="checkmark-circle" onPress={() => done.mutate()} loading={done.isPending} testID="complete-transaction-button" style={{ minHeight: 56 }} /> : (
              <View style={styles.doneBox}><Text style={styles.doneTxt}>TRANSAKSI SELESAI ✓</Text></View>
            )}
          </View>
        ) : null}
        {Platform.OS === "web" ? <Text style={styles.hint}>Di web, tombol cetak membuka dialog print browser.</Text> : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  paper: { backgroundColor: c.surface, borderWidth: 2, borderColor: c.border, padding: 16, marginBottom: 16 },
  logo: { alignSelf: "center", marginBottom: 6 },
  shop: { fontFamily: MONO, fontSize: 17, textAlign: "center", color: c.onSurface, letterSpacing: 2 },
  center: { fontFamily: MONO, fontSize: 11, textAlign: "center", color: c.muted },
  hr: { borderTopWidth: 2, borderStyle: "dashed", borderColor: c.border, marginVertical: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8, paddingVertical: 2 },
  rTxt: { fontFamily: MONO, fontSize: 12, color: c.onSurface, flex: 1 },
  right: { textAlign: "right", flex: 0, minWidth: 90 },
  bold: { fontWeight: "500", fontSize: 14 },
  sec: { fontFamily: MONO, fontSize: 12, fontWeight: "500", color: c.onSurface, marginTop: 6, marginBottom: 2 },
  waStatus: { fontSize: 12, color: c.muted, marginBottom: 12, textAlign: "center" },
  doneBox: { borderWidth: 2, borderColor: c.success, backgroundColor: c.successTint, padding: 16, alignItems: "center" },
  doneTxt: { color: c.success, fontWeight: "500", letterSpacing: 1 },
  hint: { fontSize: 11, color: c.muted, textAlign: "center", marginTop: 12 },
}));
