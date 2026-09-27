import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AddItemSheet, NewItem } from "@/src/components/add-item-sheet";
import { Badge, Button, Card, Confirm, Header, Input, KV, Loading, Mono, SectionTitle, Sheet, useToast } from "@/src/components/ui";
import { fmtDateTime, fmtTime, parseNum, rupiah } from "@/src/format";
import { PAID_STATUSES, STATUS_LABEL } from "@/src/status";
import { makeStyles, useTheme } from "@/src/theme";

const METHODS = ["CASH", "TRANSFER", "QRIS", "DEBIT", "KREDIT"] as const;

export default function TransaksiDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user, can } = useAuth();

  const q = useQuery({ queryKey: ["transaction", id], queryFn: () => api<any>(`/transactions/${id}`), refetchInterval: 15000 });
  const t = q.data;

  const [sheet, setSheet] = useState<null | "jasa" | "part">(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finish, setFinish] = useState({ work_done: "", condition: "", mechanic_note: "", next_recommendation: "", next_km: "", next_date: "" });
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ method: "CASH" as (typeof METHODS)[number], amount_paid: "", discount: "", reference: "", note: "", due_date: "" });
  const [payConfirm, setPayConfirm] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [priceItem, setPriceItem] = useState<any | null>(null);
  const [priceForm, setPriceForm] = useState({ name: "", price: "", qty: "", note: "", reason: "" });
  const [removeItem, setRemoveItem] = useState<any | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [ownerPw, setOwnerPw] = useState<string | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockPw, setUnlockPw] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [dateVal, setDateVal] = useState("");

  const setData = (d: any) => qc.setQueryData(["transaction", id], d);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["parts"] });
    qc.invalidateQueries({ queryKey: ["history"] });
    qc.invalidateQueries({ queryKey: ["debts"] });
  };
  const act = (path: string, body?: any, method?: string) => api(`/transactions/${id}${path}`, { method: method ?? "POST", body: body ?? {} });
  const mut = useMutation({
    mutationFn: ({ path, body, method }: { path: string; body?: any; method?: string }) => act(path, body, method),
    onSuccess: (d: any, v) => { if (d && d.id) setData(d); invalidate(); if (v.path !== "/checkout") toast.show("Berhasil", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  const unlock = async () => {
    setUnlocking(true);
    try {
      await api("/auth/verify-owner", { body: { owner_password: unlockPw } });
      setOwnerPw(unlockPw); setUnlockOpen(false); setUnlockPw("");
      toast.show("Mode edit faktur aktif (dikonfirmasi Owner)", "success");
    } catch (e: any) { toast.show(e.message, "error"); } finally { setUnlocking(false); }
  };

  if (q.isLoading || !t) return <View style={styles.root}><Header title="TRANSAKSI" back /><Loading /></View>;

  const status: string = t.status;
  const isPaid = PAID_STATUSES.includes(status);
  const isCancelled = status === "DIBATALKAN";
  const editingInvoice = isPaid && (user?.role === "owner" || !!ownerPw);
  const locked = (isPaid && !editingInvoice) || isCancelled;
  const canMech = can("mekanik");
  const canKasir = can("kasir");
  const est = t.items.filter((i: any) => i.source === "ESTIMASI");
  const add = t.items.filter((i: any) => i.source === "TAMBAHAN");
  const totals = t.totals;
  const discount = parseNum(pay.discount);
  const payTotal = Math.max(totals.subtotal - discount, 0);
  const paid = pay.method === "CASH" || pay.method === "KREDIT" ? parseNum(pay.amount_paid) : payTotal;
  const change = pay.method === "CASH" ? Math.max(paid - payTotal, 0) : 0;
  const debtLeft = pay.method === "KREDIT" ? Math.max(payTotal - paid, 0) : 0;
  const pwBody = ownerPw ? { owner_password: ownerPw } : {};

  const addItem = async (it: NewItem) => { const d = await act("/items", { ...it, ...pwBody }); setData(d); invalidate(); toast.show(`${it.kind === "jasa" ? "Jasa" : "Part"} ditambahkan`, "success"); };

  const openPay = async () => {
    if (status === "MENUNGGU_KASIR") mut.mutate({ path: "/checkout" });
    setPay({ method: "CASH", amount_paid: "", discount: String(totals.discount || ""), reference: "", note: "", due_date: "" });
    setPayOpen(true);
  };

  const doPay = () => {
    if (pay.method !== "KREDIT" && paid < payTotal) { toast.show("Jumlah dibayar kurang dari total", "error"); return; }
    if (pay.method === "KREDIT" && !pay.due_date.trim()) { toast.show("Isi tanggal jatuh tempo hutang", "error"); return; }
    setPayConfirm(true);
  };

  const openEdit = (i: any) => { setPriceItem(i); setPriceForm({ name: i.name, price: String(i.price), qty: String(i.qty), note: i.note ?? "", reason: "" }); };

  const ymdToDMY = (ymd?: string) => (ymd && ymd.length === 8 ? `${ymd.slice(6, 8)}/${ymd.slice(4, 6)}/${ymd.slice(0, 4)}` : "-");
  const openDateEdit = () => { setDateVal(ymdToDMY(t.date) === "-" ? "" : ymdToDMY(t.date)); setDateOpen(true); };
  const saveDate = async () => {
    try {
      const d = await act("/date", { date: dateVal }, "PUT");
      setData(d); invalidate(); setDateOpen(false); toast.show("Tanggal transaksi diperbarui", "success");
    } catch (e: any) { toast.show(e.message, "error"); }
  };

  const ItemRow = ({ i }: { i: any }) => (
    <View style={styles.itemRow} testID={`item-row-${i.id}`}>
      <Badge label={i.kind === "jasa" ? "JASA" : "PART"} tone={i.kind === "jasa" ? "info" : "brand"} />
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName}>{i.name}</Text>
        <Text style={styles.itemSub}>{i.qty} x {rupiah(i.price)}{i.code ? ` · ${i.code}` : ""}{i.note ? ` · ${i.note}` : ""}</Text>
        {i.kind === "part" && i.rack ? <Badge label={`RAK ${i.rack}`} tone="brand" testID={`item-rack-${i.id}`} /> : null}
        {i.kind === "part" && !isPaid && i.stock_ok === false ? <Badge label="STOK TIDAK CUKUP" tone="error" /> : null}
        {i.source === "TAMBAHAN" ? <Badge status={i.approval} testID={`item-approval-${i.id}`} /> : null}
      </View>
      <Mono style={[styles.itemTotal, i.approval === "DITOLAK" && { textDecorationLine: "line-through", color: colors.muted }]} testID={`item-price-${i.id}`}>{rupiah(i.subtotal)}</Mono>
      {!locked && can("mekanik", "kasir") ? (
        <View style={{ flexDirection: "row", gap: 4 }}>
          <Pressable onPress={() => openEdit(i)} hitSlop={6} style={styles.iconBtn} testID={`item-edit-${i.id}`}><Ionicons name="create-outline" size={20} color={colors.info} /></Pressable>
          <Pressable onPress={() => setRemoveItem(i)} hitSlop={6} style={styles.iconBtn} testID={`item-remove-${i.id}`}><Ionicons name="trash-outline" size={20} color={colors.error} /></Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.root} testID="transaction-detail-screen">
      <Header title={t.queue_no} subtitle={t.trx_no} back right={<Badge status={status} big testID="transaction-status-badge" />} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 160 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}>
        <Card testID="customer-card">
          <SectionTitle title="Pelanggan & Motor" />
          <KV k="Pelanggan" v={t.customer_name} />
          <KV k="No HP" v={t.customer_phone} mono />
          <KV k="Motor" v={t.vehicle_name} />
          <KV k="No Polisi" v={t.plate} mono />
          <KV k="KM Masuk" v={t.km_in} mono />
          <KV k="Mekanik" v={t.mechanic_name} />
          <KV k="Didaftarkan" v={fmtDateTime(t.created_at)} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <Text style={styles.para}>Tanggal Transaksi: <Mono>{ymdToDMY(t.date)}</Mono></Text>
            {user?.role === "owner" ? <Button title="Ubah Tanggal" variant="outline" icon="calendar-outline" small onPress={openDateEdit} testID="edit-date-button" /> : null}
          </View>
        </Card>

        <Card testID="complaint-card">
          <SectionTitle title="Keluhan Pelanggan" />
          <Text style={styles.para}>{t.complaint_main}</Text>
          {t.complaint_extra ? <Text style={styles.paraMuted}>Tambahan: {t.complaint_extra}</Text> : null}
          {t.initial_check ? <Text style={styles.paraMuted}>Pemeriksaan awal: {t.initial_check}</Text> : null}
        </Card>

        <Card testID="estimate-card">
          <SectionTitle title="Estimasi Awal" right={<Mono>{rupiah(totals.estimasi)}</Mono>} />
          {est.length ? est.map((i: any) => <ItemRow key={i.id} i={i} />) : <Text style={styles.paraMuted}>Tidak ada estimasi awal.</Text>}
          {status === "MENUNGGU_SERVIS" && can("mekanik", "kasir") ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Button title="Cari Jasa" variant="outline" icon="search" small onPress={() => setSheet("jasa")} style={{ flex: 1 }} testID="estimate-search-jasa-button" />
              <Button title="Cari Part" variant="outline" icon="search" small onPress={() => setSheet("part")} style={{ flex: 1 }} testID="estimate-search-part-button" />
            </View>
          ) : null}
        </Card>

        <Card testID="additional-card">
          <SectionTitle title="Tambahan Jasa / Part" right={<Mono>{rupiah(totals.add_jasa + totals.add_part)}</Mono>} />
          {add.length ? add.map((i: any) => (
            <View key={i.id}>
              <ItemRow i={i} />
              {i.approval === "MENUNGGU_PERSETUJUAN" && !locked && can("mekanik", "kasir") ? (
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                  <Button title="Setujui Tambahan" variant="success" small onPress={() => mut.mutate({ path: `/items/${i.id}/approve` })} style={{ flex: 1 }} testID={`item-approve-${i.id}`} />
                  <Button title="Tolak" variant="danger" small onPress={() => mut.mutate({ path: `/items/${i.id}/reject` })} style={{ flex: 1 }} testID={`item-reject-${i.id}`} />
                </View>
              ) : null}
            </View>
          )) : <Text style={styles.paraMuted}>Belum ada tambahan.</Text>}
          {!locked && ((canMech && status !== "MENUNGGU_KASIR" && status !== "MENUNGGU_PEMBAYARAN") || editingInvoice) ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Button title="Cari & Tambah Jasa" variant="warning" icon="search" onPress={() => setSheet("jasa")} style={{ flex: 1 }} testID="add-jasa-button" />
              <Button title="Cari & Tambah Part" variant="warning" icon="search" onPress={() => setSheet("part")} style={{ flex: 1 }} testID="add-part-button" />
            </View>
          ) : null}
        </Card>

        {isPaid && canKasir && !isCancelled ? (
          <Card style={editingInvoice ? { borderColor: colors.warning, backgroundColor: colors.warningTint } : undefined} testID="invoice-edit-card">
            <SectionTitle title="Edit Faktur" right={editingInvoice ? <Badge label="MODE EDIT AKTIF" tone="warning" /> : <Badge label="TERKUNCI" tone="neutral" />} />
            <Text style={styles.paraMuted}>Faktur yang sudah dibayar dikunci. Perubahan memerlukan konfirmasi password Owner dan tercatat di histori aktivitas.</Text>
            {editingInvoice ? (
              ownerPw ? <Button title="Selesai Edit (Kunci Lagi)" variant="dark" small onPress={() => setOwnerPw(null)} style={{ marginTop: 8 }} testID="invoice-lock-button" /> : null
            ) : (
              <Button title="Edit Faktur (Password Owner)" variant="outline" icon="lock-open-outline" onPress={() => { setUnlockOpen(true); setUnlockPw(""); }} style={{ marginTop: 8 }} testID="invoice-unlock-button" />
            )}
          </Card>
        ) : null}

        {(status !== "MENUNGGU_SERVIS" || t.work_done) ? (
          <Card testID="work-card">
            <SectionTitle title="Pekerjaan Mekanik" />
            <KV k="Mulai" v={fmtDateTime(t.started_at)} />
            <KV k="Selesai" v={fmtDateTime(t.finished_at)} />
            <KV k="Pekerjaan" v={t.work_done} />
            <KV k="Kondisi motor" v={t.condition} />
            <KV k="Catatan mekanik" v={t.mechanic_note} />
            <KV k="Rekomendasi berikutnya" v={t.next_recommendation} />
            <KV k="KM berikutnya" v={t.next_km} mono />
            <KV k="Tgl servis berikutnya" v={t.next_date} />
          </Card>
        ) : null}

        <Card testID="totals-card">
          <SectionTitle title="Rincian Tagihan" />
          <KV k="Total Jasa (estimasi)" v={rupiah(totals.est_jasa)} mono />
          <KV k="Total Part (estimasi)" v={rupiah(totals.est_part)} mono />
          <KV k="Tambahan Jasa" v={rupiah(totals.add_jasa)} mono />
          <KV k="Tambahan Part" v={rupiah(totals.add_part)} mono />
          <KV k="Diskon" v={`- ${rupiah(totals.discount)}`} mono />
          <View style={styles.grand}>
            <Text style={styles.grandLabel}>{isPaid ? "TOTAL DIBAYAR" : "TOTAL YANG HARUS DIBAYAR"}</Text>
            <Mono style={styles.grandVal} testID="transaction-total">{rupiah(totals.total)}</Mono>
          </View>
        </Card>

        {t.payment ? (
          <Card testID="payment-card">
            <SectionTitle title="Pembayaran" />
            <KV k="No Nota" v={t.invoice?.invoice_no} mono />
            <KV k="Metode" v={t.payment.method} />
            <KV k="Dibayar" v={rupiah(t.payment.amount_paid)} mono />
            <KV k="Kembalian" v={rupiah(t.payment.change)} mono />
            <KV k="Referensi" v={t.payment.reference} />
            <KV k="Kasir" v={t.payment.cashier} />
            <KV k="Waktu" v={fmtDateTime(t.payment.paid_at)} />
            <KV k="WhatsApp" v={t.whatsapp_logs?.[0]?.status ?? "BELUM DIKIRIM"} />
            {t.debt_status ? (
              <View style={styles.debtBox} testID="debt-box">
                <View style={{ flex: 1 }}>
                  <Text style={styles.debtLabel}>{t.debt_status === "LUNAS" ? "HUTANG LUNAS" : "SISA HUTANG"}{t.debt_due_date ? ` · JT ${t.debt_due_date}` : ""}</Text>
                  <Mono style={[styles.debtVal, t.debt_status === "LUNAS" && { color: colors.success }]} testID="debt-amount">{rupiah(t.debt_amount)}</Mono>
                  {t.payment.installments?.length ? <Text style={styles.paraMuted}>{t.payment.installments.length} kali cicilan</Text> : null}
                </View>
                {t.debt_status !== "LUNAS" && canKasir ? <Button title="Bayar Hutang" variant="primary" small onPress={() => router.push("/piutang")} testID="pay-debt-button" /> : null}
              </View>
            ) : null}
          </Card>
        ) : null}

        <Card testID="audit-card">
          <Pressable onPress={() => setShowAudit(!showAudit)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }} testID="audit-toggle">
            <Text style={styles.sectionTitle}>HISTORI AKTIVITAS ({t.audit_logs.length})</Text>
            <Ionicons name={showAudit ? "chevron-up" : "chevron-down"} size={20} color={colors.onSurface} />
          </Pressable>
          {showAudit ? t.audit_logs.map((a: any) => (
            <View key={a.id} style={styles.auditRow}>
              <Mono style={styles.auditTime}>{fmtTime(a.created_at)}</Mono>
              <View style={styles.auditLine} />
              <Text style={styles.auditText}>{a.detail || a.action} <Text style={{ color: colors.muted }}>— {a.username}</Text></Text>
            </View>
          )) : null}
        </Card>

        {!isCancelled && (can("mekanik", "kasir")) ? <Button title={isPaid ? "Batalkan Faktur (Password Owner)" : "Batalkan Transaksi"} variant="ghost" onPress={() => setCancelOpen(true)} testID="cancel-transaction-button" style={{ borderWidth: 2, borderColor: colors.error }} /> : null}
      </ScrollView>

      {/* Sticky bottom CTA */}
      <View style={[styles.sticky, { paddingBottom: insets.bottom + 12 }]} testID="sticky-bar">
        <View style={{ flex: 1 }}>
          <Text style={styles.stickyLabel}>{STATUS_LABEL[status]}</Text>
          <Mono style={styles.stickyVal}>{rupiah(totals.total)}</Mono>
        </View>
        <View style={{ flex: 1.4 }}>
          {status === "MENUNGGU_SERVIS" && canMech ? <Button title="Mulai Servis" variant="info" icon="play" onPress={() => mut.mutate({ path: "/start", body: { mechanic_id: t.mechanic_id } })} loading={mut.isPending} testID="start-service-button" style={{ minHeight: 56 }} /> : null}
          {(status === "DIPROSES" || status === "MENUNGGU_PERSETUJUAN") && canMech ? <Button title="Selesaikan Servis" variant="success" icon="checkmark-done" onPress={() => { setFinish({ ...finish, work_done: t.work_done || "" }); setFinishOpen(true); }} disabled={totals.pending_approval > 0} testID="finish-service-button" style={{ minHeight: 56 }} /> : null}
          {(status === "MENUNGGU_KASIR" || status === "MENUNGGU_PEMBAYARAN") && canKasir ? <Button title="Proses Pembayaran" variant="primary" icon="cash" onPress={openPay} testID="process-payment-button" style={{ minHeight: 56 }} /> : null}
          {(status === "MENUNGGU_KASIR" || status === "MENUNGGU_PEMBAYARAN") && !canKasir ? <Text style={styles.waitText}>Menunggu kasir</Text> : null}
          {isPaid ? <Button title="Lihat Nota" variant="dark" icon="receipt" onPress={() => router.push(`/nota/${id}`)} testID="view-receipt-button" style={{ minHeight: 56 }} /> : null}
          {(status === "MENUNGGU_SERVIS" || status === "DIPROSES") && !canMech ? <Text style={styles.waitText}>Sedang di mekanik</Text> : null}
          {status === "MENUNGGU_PERSETUJUAN" && canMech ? <Text style={styles.waitText}>Tinjau tambahan dulu</Text> : null}
        </View>
      </View>

      <AddItemSheet visible={!!sheet} kind={sheet ?? "jasa"} onClose={() => setSheet(null)} onAdd={addItem} />
      <Sheet visible={finishOpen} onClose={() => setFinishOpen(false)} title="Final Check" testID="finish-sheet">
        <Input label="Pekerjaan yang dilakukan" value={finish.work_done} onChangeText={(v) => setFinish({ ...finish, work_done: v })} multiline testID="finish-work-input" />
        <Input label="Kondisi motor" value={finish.condition} onChangeText={(v) => setFinish({ ...finish, condition: v })} testID="finish-condition-input" />
        <Input label="Catatan mekanik" value={finish.mechanic_note} onChangeText={(v) => setFinish({ ...finish, mechanic_note: v })} testID="finish-note-input" />
        <Input label="Rekomendasi servis berikutnya" value={finish.next_recommendation} onChangeText={(v) => setFinish({ ...finish, next_recommendation: v })} testID="finish-recommendation-input" />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Input label="KM berikutnya" value={finish.next_km} onChangeText={(v) => setFinish({ ...finish, next_km: v })} keyboardType="number-pad" testID="finish-next-km-input" /></View>
          <View style={{ flex: 1 }}><Input label="Estimasi tanggal" value={finish.next_date} onChangeText={(v) => setFinish({ ...finish, next_date: v })} placeholder="DD/MM/YYYY" testID="finish-next-date-input" /></View>
        </View>
        <Button title="Selesaikan Servis & Kirim ke Kasir" variant="success" loading={mut.isPending} testID="finish-submit-button"
          onPress={() => mut.mutate({ path: "/finish", body: { ...finish, next_km: finish.next_km ? parseNum(finish.next_km) : null } }, { onSuccess: () => setFinishOpen(false) })} />
      </Sheet>

      {/* Payment */}
      <Sheet visible={payOpen} onClose={() => setPayOpen(false)} title="Proses Pembayaran" testID="payment-sheet">
        <View style={styles.payTotalBox}>
          <Text style={styles.payTotalLabel}>TOTAL YANG HARUS DIBAYAR</Text>
          <Mono style={styles.payTotalVal} testID="payment-total">{rupiah(payTotal)}</Mono>
        </View>
        <Input label="Diskon (Rp)" value={pay.discount} onChangeText={(v) => setPay({ ...pay, discount: v })} keyboardType="number-pad" testID="payment-discount-input" />
        <Text style={styles.label}>METODE PEMBAYARAN</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {METHODS.map((m) => (
            <Pressable key={m} onPress={() => setPay({ ...pay, method: m })} style={[styles.method, pay.method === m && styles.methodSel]} testID={`payment-method-${m}`}>
              <Text style={[styles.methodText, pay.method === m && { color: colors.onBrandPrimary }]}>{m}</Text>
            </Pressable>
          ))}
        </View>
        {pay.method === "CASH" ? (
          <>
            <Input label="Uang diterima" value={pay.amount_paid} onChangeText={(v) => setPay({ ...pay, amount_paid: v })} keyboardType="number-pad" testID="payment-amount-input" />
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {[payTotal, Math.ceil(payTotal / 50000) * 50000, Math.ceil(payTotal / 100000) * 100000].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
                <Button key={v} title={rupiah(v)} variant="outline" small onPress={() => setPay({ ...pay, amount_paid: String(v) })} style={{ flex: 1 }} testID={`payment-quick-${v}`} />
              ))}
            </View>
            <View style={styles.changeRow}>
              <Text style={styles.label}>KEMBALIAN</Text>
              <Mono style={styles.changeVal} testID="payment-change">{rupiah(change)}</Mono>
            </View>
          </>
        ) : pay.method === "KREDIT" ? (
          <>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              <Button title="Hutang Penuh" variant={parseNum(pay.amount_paid) === 0 ? "dark" : "outline"} small onPress={() => setPay({ ...pay, amount_paid: "0" })} style={{ flex: 1 }} testID="payment-debt-full" />
              <Button title="Hutang Sebagian" variant={parseNum(pay.amount_paid) > 0 ? "dark" : "outline"} small onPress={() => setPay({ ...pay, amount_paid: String(Math.round(payTotal / 2)) })} style={{ flex: 1 }} testID="payment-debt-partial" />
            </View>
            <Input label="Dibayar sekarang (Rp)" value={pay.amount_paid} onChangeText={(v) => setPay({ ...pay, amount_paid: v })} keyboardType="number-pad" placeholder="0 = hutang penuh" testID="payment-amount-input" />
            <Input label="Tanggal jatuh tempo * (DD/MM/YYYY)" value={pay.due_date} onChangeText={(v) => setPay({ ...pay, due_date: v })} placeholder="30/06/2026" testID="payment-due-date-input" />
            <View style={[styles.changeRow, { borderColor: colors.warning, backgroundColor: colors.warningTint }]}>
              <Text style={styles.label}>SISA HUTANG</Text>
              <Mono style={[styles.changeVal, { color: colors.warning }]} testID="payment-debt-left">{rupiah(debtLeft)}</Mono>
            </View>
            <Text style={styles.paraMuted}>Owner akan menerima notifikasi hutang otomatis.</Text>
          </>
        ) : (
          <Input label="Nomor referensi (opsional)" value={pay.reference} onChangeText={(v) => setPay({ ...pay, reference: v })} testID="payment-reference-input" />
        )}
        <Input label="Catatan" value={pay.note} onChangeText={(v) => setPay({ ...pay, note: v })} testID="payment-note-input" />
        <Button title="Konfirmasi Pembayaran" variant="success" onPress={doPay} testID="payment-submit-button" style={{ minHeight: 56 }} />
      </Sheet>
      <Confirm visible={payConfirm} title="Konfirmasi Pembayaran" message={pay.method === "KREDIT" ? `Catat HUTANG ${rupiah(debtLeft)} (dibayar sekarang ${rupiah(paid)}), jatuh tempo ${pay.due_date}?` : `Apakah pembayaran ${pay.method} sebesar ${rupiah(paid)} sudah diterima dan sesuai?`} confirmLabel="YA, KONFIRMASI PEMBAYARAN" loading={mut.isPending} testID="payment-confirm"
        onCancel={() => setPayConfirm(false)}
        onConfirm={() => mut.mutate({ path: "/pay", body: { method: pay.method, amount_paid: paid, discount, reference: pay.reference, note: pay.note, due_date: pay.due_date } },
          { onSuccess: () => { setPayConfirm(false); setPayOpen(false); router.push(`/nota/${id}`); }, onError: () => setPayConfirm(false) })} />

      {/* Cancel */}
      <Sheet visible={cancelOpen} onClose={() => setCancelOpen(false)} title="Batalkan Transaksi" testID="cancel-sheet" scroll={false}>
        <Input label="Alasan pembatalan" value={cancelReason} onChangeText={setCancelReason} testID="cancel-reason-input" />
        {isPaid && user?.role !== "owner" ? <Input label="Password Owner *" value={unlockPw} onChangeText={setUnlockPw} secureTextEntry testID="cancel-owner-password-input" /> : null}
        {isPaid ? <Text style={styles.paraMuted}>Faktur sudah dibayar: stok part akan dikembalikan dan pembatalan masuk laporan Owner.</Text> : null}
        <View style={{ height: 8 }} />
        <Button title="Ya, Batalkan" variant="danger" loading={mut.isPending} disabled={isPaid && user?.role !== "owner" && !unlockPw} testID="cancel-submit-button"
          onPress={() => mut.mutate({ path: "/cancel", body: { reason: cancelReason, owner_password: isPaid ? (ownerPw ?? unlockPw) : undefined } }, { onSuccess: () => { setCancelOpen(false); setUnlockPw(""); } })} />
      </Sheet>

      {/* Edit item */}
      <Sheet visible={!!priceItem} onClose={() => setPriceItem(null)} title={editingInvoice ? "Edit Item Faktur" : "Edit Item"} testID="price-sheet">
        <Text style={styles.para}>{priceItem?.name} — {priceItem?.qty} x {rupiah(priceItem?.price)}</Text>
        {priceItem?.kind === "jasa" ? <Input label="Nama jasa" value={priceForm.name} onChangeText={(v) => setPriceForm({ ...priceForm, name: v })} testID="edit-item-name-input" /> : null}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 2 }}><Input label="Harga" value={priceForm.price} onChangeText={(v) => setPriceForm({ ...priceForm, price: v })} keyboardType="number-pad" testID="price-new-input" /></View>
          <View style={{ flex: 1 }}><Input label="Qty" value={priceForm.qty} onChangeText={(v) => setPriceForm({ ...priceForm, qty: v })} keyboardType="number-pad" testID="edit-item-qty-input" /></View>
        </View>
        <Input label="Catatan" value={priceForm.note} onChangeText={(v) => setPriceForm({ ...priceForm, note: v })} testID="edit-item-note-input" />
        <Input label={editingInvoice ? "Alasan perubahan *" : "Alasan perubahan (opsional)"} value={priceForm.reason} onChangeText={(v) => setPriceForm({ ...priceForm, reason: v })} testID="price-reason-input" />
        <View style={styles.subRow}>
          <Text style={styles.label}>SUBTOTAL BARU</Text>
          <Mono style={{ fontSize: 18 }}>{rupiah(parseNum(priceForm.price) * (parseNum(priceForm.qty) || 1))}</Mono>
        </View>
        <Button title="Simpan Perubahan" disabled={(editingInvoice && !priceForm.reason.trim()) || !parseNum(priceForm.qty)} loading={mut.isPending} testID="price-submit-button"
          onPress={() => mut.mutate({ path: `/items/${priceItem.id}`, method: "PUT", body: { name: priceForm.name, price: parseNum(priceForm.price), qty: parseNum(priceForm.qty), note: priceForm.note, reason: priceForm.reason, ...pwBody } }, { onSuccess: () => setPriceItem(null) })} />
      </Sheet>

      {/* Unlock invoice edit */}
      <Sheet visible={unlockOpen} onClose={() => setUnlockOpen(false)} title="Konfirmasi Password Owner" testID="unlock-sheet" scroll={false}>
        <Text style={styles.para}>Masukkan password Owner untuk membuka mode edit faktur {t.invoice_no ?? t.trx_no}.</Text>
        <Input label="Password Owner" value={unlockPw} onChangeText={setUnlockPw} secureTextEntry autoFocus testID="unlock-password-input" />
        <Button title="Buka Mode Edit" variant="warning" onPress={unlock} loading={unlocking} disabled={!unlockPw} testID="unlock-submit-button" />
      </Sheet>

      <Sheet visible={dateOpen} onClose={() => setDateOpen(false)} title="Ubah Tanggal Transaksi" testID="date-sheet" scroll={false}>
        <Text style={styles.para}>Ubah tanggal transaksi {t.invoice_no ?? t.trx_no}. Format: HH/BB/TTTT (mis. 25/09/2026). Omzet & laporan mengikuti tanggal baru.</Text>
        <Input label="Tanggal (HH/BB/TTTT)" value={dateVal} onChangeText={setDateVal} placeholder="25/09/2026" autoFocus testID="date-input" />
        <Button title="Simpan Tanggal" onPress={saveDate} disabled={!dateVal.trim()} testID="date-save-button" />
      </Sheet>

      <Confirm visible={!!removeItem} title="Hapus Item" message={`Hapus ${removeItem?.name} dari ${isPaid ? "faktur" : "transaksi"}?`} confirmLabel="YA, HAPUS" danger testID="remove-item-confirm"
        onCancel={() => setRemoveItem(null)} onConfirm={() => mut.mutate({ path: `/items/${removeItem.id}${ownerPw ? `?owner_password=${encodeURIComponent(ownerPw)}` : ""}`, method: "DELETE" }, { onSuccess: () => setRemoveItem(null) })} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  para: { fontSize: 15, color: c.onSurface, lineHeight: 22 },
  paraMuted: { fontSize: 13, color: c.muted, marginTop: 4 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider },
  itemName: { fontSize: 15, color: c.onSurface, fontWeight: "500" },
  itemSub: { fontSize: 12, color: c.muted, marginBottom: 2 },
  itemTotal: { fontSize: 14 },
  grand: { marginTop: 10, paddingTop: 10, borderTopWidth: 2, borderTopColor: c.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  grandLabel: { fontSize: 12, letterSpacing: 1, color: c.onSurface, fontWeight: "500" },
  grandVal: { fontSize: 22, color: c.brandPrimary },
  sectionTitle: { fontSize: 13, fontWeight: "500", color: c.onSurface, letterSpacing: 1 },
  auditRow: { flexDirection: "row", gap: 10, paddingVertical: 6, alignItems: "flex-start" },
  auditTime: { fontSize: 12, color: c.muted, width: 44 },
  auditLine: { width: 2, backgroundColor: c.brandPrimary, alignSelf: "stretch" },
  auditText: { flex: 1, fontSize: 13, color: c.onSurface, lineHeight: 18 },
  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 12, padding: 16, backgroundColor: c.surfaceInverse, borderTopWidth: 3, borderTopColor: c.brandPrimary },
  stickyLabel: { color: c.brandPrimary, fontSize: 11, letterSpacing: 1 },
  stickyVal: { color: c.onSurfaceInverse, fontSize: 22 },
  waitText: { color: c.onSurfaceInverse, opacity: 0.7, textAlign: "right", fontSize: 13 },
  label: { fontSize: 12, color: c.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.6 },
  payTotalBox: { backgroundColor: c.surfaceInverse, padding: 16, marginBottom: 12, borderLeftWidth: 6, borderLeftColor: c.brandPrimary },
  payTotalLabel: { color: c.brandPrimary, fontSize: 11, letterSpacing: 1.5 },
  payTotalVal: { color: c.onSurfaceInverse, fontSize: 30, marginTop: 4 },
  method: { height: 44, paddingHorizontal: 14, borderWidth: 2, borderColor: c.border, justifyContent: "center", minWidth: 90, alignItems: "center" },
  methodSel: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  methodText: { fontWeight: "500", color: c.onSurface },
  changeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, borderWidth: 2, borderColor: c.success, backgroundColor: c.successTint, marginBottom: 12 },
  changeVal: { fontSize: 22, color: c.success },
  iconBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  subRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderTopWidth: 2, borderTopColor: c.border, marginBottom: 12 },
  debtBox: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10, padding: 12, borderWidth: 2, borderColor: c.warning, backgroundColor: c.warningTint },
  debtLabel: { fontSize: 11, letterSpacing: 1, color: c.muted },
  debtVal: { fontSize: 20, color: c.warning },
}));
