import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qs } from "@/src/api";
import { markBackupDone } from "@/src/backup-reminder";
import { Button, Card, Chips, Confirm, Header, Loading, Mono, SectionTitle, useToast } from "@/src/components/ui";
import { Entity, ENTITY_LABEL, exportBackup, exportExcel, exportReport, importBackup, importExcel } from "@/src/excel";
import { fmtDate, rupiah } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

const ENTITIES: Entity[] = ["customers", "services", "parts", "vehicles"];

export default function Laporan() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const [mode, setMode] = useState<"daily" | "monthly">("daily");
  const [busy, setBusy] = useState<string | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const report = useQuery({ queryKey: ["report", mode], queryFn: () => api<any>(`/reports/omzet${qs({ mode })}`) });

  const doRestore = async () => {
    setRestoreConfirm(false);
    setBusy("restore");
    try {
      const r = await importBackup();
      if (r) { toast.show(`Restore selesai: ${r.parts} part, ${r.services} jasa, ${r.customers} pelanggan, ${r.transactions} transaksi`, "success"); qc.invalidateQueries(); }
    } catch (err: any) { toast.show(err.message ?? "Restore gagal", "error"); } finally { setBusy(null); }
  };

  const doExport = async (e: Entity) => {
    setBusy(`ex-${e}`);
    try { toast.show(await exportExcel(e), "success"); } catch (err: any) { toast.show(err.message ?? "Export gagal", "error"); } finally { setBusy(null); }
  };
  const doImport = async (e: Entity) => {
    setBusy(`im-${e}`);
    try {
      const r = await importExcel(e);
      if (r) { toast.show(`Import ${ENTITY_LABEL[e]}: ${r.inserted} baru, ${r.updated} diperbarui, ${r.skipped} dilewati`, "success"); qc.invalidateQueries(); }
    } catch (err: any) { toast.show(err.message ?? "Import gagal", "error"); } finally { setBusy(null); }
  };

  const rows: any[] = report.data?.rows ?? [];
  const max = Math.max(1, ...rows.map((r) => r.total));
  const periodLabel = (p: string) => (mode === "daily" ? fmtDate(p) : new Date(`${p}-01`).toLocaleDateString("id-ID", { month: "long", year: "numeric" }));

  return (
    <View style={styles.root} testID="report-screen">
      <Header title="LAPORAN KEUANGAN" subtitle="Omzet & Export/Import Excel" back />
      <Chips options={[{ key: "daily", label: "Omzet Harian" }, { key: "monthly", label: "Omzet Bulanan" }]} value={mode} onChange={setMode} testID="report-mode" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} refreshControl={<RefreshControl refreshing={report.isRefetching} onRefresh={report.refetch} tintColor={colors.brandPrimary} />}>
        <View style={styles.totalBox} testID="report-grand-total">
          <Text style={styles.totalLabel}>TOTAL OMZET ({mode === "daily" ? "30 HARI" : "12 BULAN"} TERAKHIR)</Text>
          <Mono style={styles.totalVal}>{rupiah(report.data?.grand_total)}</Mono>
        </View>
        <Button title={`Export Laporan ${mode === "daily" ? "Harian" : "Bulanan"} (Excel)`} variant="primary" icon="document-text-outline" loading={busy === "report"} disabled={!!busy} testID="export-report-button" style={{ marginBottom: 12 }}
          onPress={async () => { setBusy("report"); try { toast.show(await exportReport(mode), "success"); } catch (err: any) { toast.show(err.message ?? "Export gagal", "error"); } finally { setBusy(null); } }} />
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <Button title="Pembatalan" variant="outline" icon="close-circle-outline" small onPress={() => router.push("/pembatalan")} style={{ flex: 1 }} testID="open-cancellations-button" />
          <Button title="Piutang" variant="outline" icon="wallet-outline" small onPress={() => router.push("/piutang")} style={{ flex: 1 }} testID="open-debts-button" />
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <Button title="Per Mekanik" variant="outline" icon="construct-outline" small onPress={() => router.push("/laporan-mekanik")} style={{ flex: 1 }} testID="open-mechanic-report-button" />
          <Button title="Belanja & Laba" variant="outline" icon="cart-outline" small onPress={() => router.push("/belanja")} style={{ flex: 1 }} testID="open-expenses-button" />
        </View>
        <SectionTitle title="Laporan Rinci" />
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          <Button title="Penjualan Servis" variant="dark" icon="receipt-outline" small onPress={() => router.push("/laporan-penjualan")} style={{ flex: 1 }} testID="open-service-sales-button" />
          <Button title="Jualan Langsung" variant="dark" icon="pricetags-outline" small onPress={() => router.push("/laporan-penjualan?tab=jual")} style={{ flex: 1 }} testID="open-direct-sales-button" />
        </View>
        <Button title="Laporan Belanja Rinci (Pembelian, Kasbon, Operasional)" variant="dark" icon="clipboard-outline" small onPress={() => router.push("/laporan-belanja")} style={{ marginBottom: 12 }} testID="open-purchases-report-button" />
        <Button title="Backup Semua Data (Excel)" variant="dark" icon="cloud-download-outline" loading={busy === "backup"} disabled={!!busy} testID="export-backup-button" style={{ marginBottom: 12 }}
          onPress={async () => { setBusy("backup"); try { const msg = await exportBackup(); await markBackupDone(); toast.show(msg, "success"); } catch (err: any) { toast.show(err.message ?? "Backup gagal", "error"); } finally { setBusy(null); } }} />
        {report.isLoading ? <Loading /> : rows.length === 0 ? <Text style={styles.muted}>Belum ada transaksi dibayar.</Text> : rows.map((r) => (
          <View key={r.period} style={styles.row} testID={`report-row-${r.period}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={styles.period}>{periodLabel(r.period)}</Text>
              <Mono style={styles.rowTotal}>{rupiah(r.total)}</Mono>
            </View>
            <View style={styles.barBg}><View style={[styles.bar, { width: `${Math.max(3, (r.total / max) * 100)}%` }]} /></View>
            <Text style={styles.muted}>{r.count} transaksi · Jasa {rupiah(r.jasa)} · Part {rupiah(r.part)}{r.diskon ? ` · Diskon ${rupiah(r.diskon)}` : ""}</Text>
          </View>
        ))}

        <SectionTitle title="Export Data ke Excel (.xlsx)" />
        <Card>
          {ENTITIES.map((e) => <Button key={e} title={`Export ${ENTITY_LABEL[e]}`} variant="dark" icon="download-outline" onPress={() => doExport(e)} loading={busy === `ex-${e}`} disabled={!!busy} style={{ marginBottom: 8 }} testID={`export-${e}-button`} />)}
        </Card>
        <SectionTitle title="Import Data dari Excel (.xlsx)" />
        <Card>
          <Text style={[styles.muted, { marginBottom: 8 }]}>Gunakan format kolom yang sama dengan hasil export. Data dengan kode / No HP / nopol yang sama akan diperbarui.</Text>
          {ENTITIES.map((e) => <Button key={e} title={`Import ${ENTITY_LABEL[e]}`} variant="outline" icon="cloud-upload-outline" onPress={() => doImport(e)} loading={busy === `im-${e}`} disabled={!!busy} style={{ marginBottom: 8 }} testID={`import-${e}-button`} />)}
        </Card>
        <SectionTitle title="Restore dari File Backup" />
        <Card>
          <Text style={[styles.muted, { marginBottom: 8 }]}>Pulihkan seluruh data (part, jasa, pelanggan, motor, transaksi, pembayaran, belanja) dari file backup Excel (hasil tombol "Backup Semua Data"). Data hasil restore sebelumnya akan diganti; data yang Anda input manual tetap aman.</Text>
          <Button title="Restore Data dari Backup (Excel)" variant="primary" icon="cloud-upload-outline" loading={busy === "restore"} disabled={!!busy} onPress={() => setRestoreConfirm(true)} testID="restore-backup-button" />
        </Card>
      </ScrollView>
      <Confirm visible={restoreConfirm} title="Restore Data" message="Pilih file backup Excel (.xlsx). Proses ini akan memuat ulang data dari file backup. Lanjutkan?" confirmLabel="PILIH FILE" onCancel={() => setRestoreConfirm(false)} onConfirm={doRestore} testID="restore-confirm" />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  totalBox: { backgroundColor: c.surfaceInverse, padding: 16, marginBottom: 16, borderLeftWidth: 6, borderLeftColor: c.brandPrimary },
  totalLabel: { color: c.brandPrimary, fontSize: 11, letterSpacing: 1.5 },
  totalVal: { color: c.onSurfaceInverse, fontSize: 30, marginTop: 4 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider, marginBottom: 4 },
  period: { fontSize: 14, color: c.onSurface, fontWeight: "500" },
  rowTotal: { fontSize: 15 },
  barBg: { height: 8, backgroundColor: c.surfaceTertiary, marginBottom: 4 },
  bar: { height: 8, backgroundColor: c.brandPrimary },
  muted: { color: c.muted, fontSize: 12 },
}));
