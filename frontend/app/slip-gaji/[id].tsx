import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qs } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Header, KV, Loading, Mono, useToast } from "@/src/components/ui";
import { rupiah, ymdToDisplay } from "@/src/format";
import { printThermal, thermalItem, thermalRow } from "@/src/thermal";
import { makeStyles, useTheme } from "@/src/theme";

const roleLabel: Record<string, string> = { owner: "Pemilik", mekanik: "Mekanik", kasir: "Kasir", partman: "Partman" };
const monthLabel = (m: string) => new Date(`${m}-01`).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

export default function SlipGaji() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const { id, month } = useLocalSearchParams<{ id: string; month?: string }>();
  const slip = useQuery({ queryKey: ["payroll-slip", id, month], queryFn: () => api<any>(`/payroll/slip/${id}${qs({ month: month || "" })}`) });
  const shop = useQuery({ queryKey: ["shop"], queryFn: () => api<any>("/shop") });

  const d = slip.data;
  const isMekanik = d?.user?.role === "mekanik";

  const doPrint = async () => {
    try {
      const shopName = shop.data?.name || "KLINIK SUEL MOTOR";
      let body = `<h1>${shopName}</h1><div class="c">SLIP GAJI KARYAWAN</div><div class="hr"></div><table>`;
      body += thermalRow("Nama", d.user.name);
      body += thermalRow("Jabatan", roleLabel[d.user.role] || d.user.role);
      body += thermalRow("Periode", monthLabel(d.month));
      body += `</table><div class="hr"></div><table>`;
      body += thermalRow(d.user.role === "owner" ? "Pengambilan tetap" : "Gaji pokok", rupiah(d.base_salary));
      if (isMekanik) {
        body += thermalRow(`Bonus ${d.unit_count} unit × ${rupiah(d.bonus_per_unit)}`, rupiah(d.bonus_total));
        if (d.units?.length) {
          body += `</table><div class="sec">RINCIAN UNIT SERVIS</div><table>`;
          d.units.forEach((u: any, i: number) => {
            body += thermalItem(`${i + 1}. ${u.plate || "-"} ${u.customer_name || ""}`.trim(), 1, ymdToDisplay(u.date), rupiah(u.total));
          });
        }
      }
      body += `</table><div class="hr"></div><table>`;
      body += thermalRow("TOTAL GAJI", rupiah(d.total), "tot");
      body += `</table><div class="hr"></div><div class="c">Dicetak ${new Date().toLocaleDateString("id-ID")}</div>`;
      await printThermal(body);
    } catch (e: any) {
      toast.show(e?.message || "Gagal mencetak slip", "error");
    }
  };

  if (user && user.role !== "owner") return <Redirect href="/(tabs)" />;

  return (
    <View style={styles.root} testID="payslip-screen">
      <Header title="SLIP GAJI" subtitle={d ? `${d.user.name} · ${monthLabel(d.month)}` : ""} back />
      {slip.isLoading || !d ? <Loading /> : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}>
          <View style={styles.card}>
            <Text style={styles.shop}>{shop.data?.name || "KLINIK SUEL MOTOR"}</Text>
            <Text style={styles.slipTitle}>SLIP GAJI KARYAWAN</Text>
            <View style={styles.hr} />
            <KV k="Nama" v={d.user.name} />
            <KV k="Jabatan" v={roleLabel[d.user.role] || d.user.role} />
            <KV k="Periode" v={monthLabel(d.month)} />
            <View style={styles.hr} />
            <KV k={d.user.role === "owner" ? "Pengambilan tetap" : "Gaji pokok"} v={rupiah(d.base_salary)} mono />
            {isMekanik ? (
              <>
                <KV k={`Bonus servis (${d.unit_count} unit × ${rupiah(d.bonus_per_unit)})`} v={rupiah(d.bonus_total)} mono />
                {d.units?.length ? (
                  <View style={styles.unitBox}>
                    <Text style={styles.unitHead}>RINCIAN UNIT SERVIS</Text>
                    {d.units.map((u: any, i: number) => (
                      <View key={i} style={styles.unitRow}>
                        <Text style={styles.unitText}>{i + 1}. {u.plate || "-"} {u.customer_name ? `· ${u.customer_name}` : ""}</Text>
                        <Text style={styles.unitDate}>{ymdToDisplay(u.date)}</Text>
                      </View>
                    ))}
                  </View>
                ) : <Text style={styles.empty}>Belum ada unit servis lunas bulan ini.</Text>}
              </>
            ) : null}
            <View style={styles.hr} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL GAJI</Text>
              <Mono style={styles.totalVal}>{rupiah(d.total)}</Mono>
            </View>
          </View>
        </ScrollView>
      )}
      {d ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Button title="CETAK SLIP" onPress={doPrint} testID="payslip-print-button" />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  card: { borderWidth: 2, borderColor: c.border, padding: 16 },
  shop: { fontSize: 18, fontWeight: "700", color: c.onSurface, textAlign: "center", letterSpacing: 1 },
  slipTitle: { fontSize: 12, color: c.muted, textAlign: "center", marginTop: 2, letterSpacing: 1 },
  hr: { borderTopWidth: 1, borderTopColor: c.divider, borderStyle: "dashed", marginVertical: 12 },
  unitBox: { marginTop: 8, backgroundColor: c.surfaceTertiary, padding: 10 },
  unitHead: { fontSize: 11, color: c.muted, letterSpacing: 1, marginBottom: 6 },
  unitRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, gap: 8 },
  unitText: { fontSize: 13, color: c.onSurface, flex: 1 },
  unitDate: { fontSize: 12, color: c.muted },
  empty: { fontSize: 12, color: c.muted, marginTop: 6 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  totalVal: { fontSize: 22, color: c.onSurface },
  footer: { padding: 16, borderTopWidth: 2, borderTopColor: c.divider, backgroundColor: c.surface },
}));
