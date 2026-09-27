import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qs } from "@/src/api";
import { AddItemSheet, NewItem } from "@/src/components/add-item-sheet";
import { Address, AddressFields, EMPTY_ADDRESS } from "@/src/components/AddressFields";
import { Badge, Button, Card, Header, Input, Mono, SectionTitle, useToast } from "@/src/components/ui";
import { parseNum, rupiah } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

export default function TransaksiBaru() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const [custQ, setCustQ] = useState("");
  const [customer, setCustomer] = useState<any | null>(null);
  const [newCust, setNewCust] = useState(false);
  const [cForm, setCForm] = useState({ name: "", phone: "", address: "", notes: "" });
  const [cAddr, setCAddr] = useState<Address>(EMPTY_ADDRESS);

  const [vehicle, setVehicle] = useState<any | null>(null);
  const [newVeh, setNewVeh] = useState(false);
  const [vForm, setVForm] = useState({ plate: "", brand: "", model: "", year: "", color: "", chassis_no: "", engine_no: "" });

  const [complaint, setComplaint] = useState({ complaint_main: "", complaint_extra: "", initial_check: "", km_in: "" });
  const [items, setItems] = useState<NewItem[]>([]);
  const [sheet, setSheet] = useState<null | "jasa" | "part">(null);
  const [mechanicId, setMechanicId] = useState<string | null>(null);

  const customers = useQuery({ queryKey: ["customers", custQ], queryFn: () => api<any[]>(`/customers${qs({ q: custQ })}`), enabled: custQ.trim().length >= 2 && !customer });
  const vehicles = useQuery({ queryKey: ["vehicles", customer?.id], queryFn: () => api<any[]>(`/vehicles${qs({ customer_id: customer.id })}`), enabled: !!customer });
  const mechanics = useQuery({ queryKey: ["mechanics"], queryFn: () => api<any[]>("/mechanics") });

  const createCustomer = useMutation({
    mutationFn: () => api("/customers", { body: { ...cForm, address: cForm.address || [cAddr.dusun, cAddr.desa, cAddr.kecamatan, cAddr.kabupaten].filter(Boolean).join(", "), dusun: cAddr.dusun, desa: cAddr.desa, kecamatan: cAddr.kecamatan, kabupaten: cAddr.kabupaten } }),
    onSuccess: (c) => { setCustomer(c); setNewCust(false); setCAddr(EMPTY_ADDRESS); qc.invalidateQueries({ queryKey: ["customers"] }); toast.show("Pelanggan tersimpan", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });
  const createVehicle = useMutation({
    mutationFn: () => api("/vehicles", { body: { ...vForm, customer_id: customer.id } }),
    onSuccess: (v) => { setVehicle(v); setNewVeh(false); qc.invalidateQueries({ queryKey: ["vehicles"] }); toast.show("Motor tersimpan", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });
  const submit = useMutation({
    mutationFn: () => api("/transactions", {
      body: { customer_id: customer.id, vehicle_id: vehicle.id, km_in: parseNum(complaint.km_in), complaint_main: complaint.complaint_main,
        complaint_extra: complaint.complaint_extra, initial_check: complaint.initial_check, mechanic_id: mechanicId, items },
    }),
    onSuccess: (t: any) => {
      qc.invalidateQueries({ queryKey: ["transactions"] }); qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.show(`Terdaftar! Nomor antrian ${t.queue_no}`, "success");
      router.replace(`/transaksi/${t.id}`);
    },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const ready = customer && vehicle && complaint.complaint_main.trim().length > 0;

  const Step = ({ n, title, done }: { n: number; title: string; done: boolean }) => (
    <View style={styles.stepRow}>
      <View style={[styles.stepNum, done && { backgroundColor: colors.success }]}><Text style={styles.stepNumText}>{done ? "✓" : n}</Text></View>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );

  return (
    <View style={styles.root} testID="new-transaction-screen">
      <Header title="TRANSAKSI SERVIS BARU" subtitle="Pendaftaran servis" back />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled" bottomOffset={120}>
        {/* STEP 1: Pelanggan */}
        <Step n={1} title="DATA PELANGGAN" done={!!customer} />
        {customer ? (
          <Card style={styles.selected} testID="selected-customer-card">
            <View style={{ flex: 1 }}>
              <Text style={styles.selName}>{customer.name}</Text>
              <Text style={styles.selSub}>{customer.phone || "-"} · {customer.code}</Text>
              {customer.address ? <Text style={styles.selSub}>{customer.address}</Text> : null}
            </View>
            <Button title="Ganti" variant="outline" small onPress={() => { setCustomer(null); setVehicle(null); }} testID="change-customer-button" />
          </Card>
        ) : newCust ? (
          <Card>
            <Input label="Nama pelanggan *" value={cForm.name} onChangeText={(v) => setCForm({ ...cForm, name: v })} testID="new-customer-name-input" />
            <Input label="Nomor HP" value={cForm.phone} onChangeText={(v) => setCForm({ ...cForm, phone: v })} keyboardType="phone-pad" testID="new-customer-phone-input" />
            <AddressFields value={cAddr} onChange={setCAddr} testPrefix="new-customer-address" />
            <Input label="Catatan" value={cForm.notes} onChangeText={(v) => setCForm({ ...cForm, notes: v })} testID="new-customer-notes-input" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button title="Batal" variant="outline" onPress={() => setNewCust(false)} style={{ flex: 1 }} testID="new-customer-cancel-button" />
              <Button title="Simpan Pelanggan" onPress={() => createCustomer.mutate()} loading={createCustomer.isPending} disabled={!cForm.name.trim()} style={{ flex: 2 }} testID="new-customer-save-button" />
            </View>
          </Card>
        ) : (
          <Card>
            <Input value={custQ} onChangeText={setCustQ} placeholder="Cari nomor HP, nama, atau nopol" testID="customer-search-input" />
            {(customers.data ?? []).map((c) => (
              <Pressable key={c.id} style={styles.optRow} onPress={() => { setCustomer(c); setCustQ(""); }} testID={`customer-option-${c.code}`}>
                <Ionicons name="person-circle-outline" size={28} color={colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optName}>{c.name}</Text>
                  <Text style={styles.optSub}>{c.phone || "-"} · {c.code}</Text>
                </View>
              </Pressable>
            ))}
            {custQ.trim().length >= 2 && customers.data?.length === 0 ? <Text style={styles.none}>Pelanggan tidak ditemukan.</Text> : null}
            <Button title="+ Pelanggan Baru" variant="dark" onPress={() => { setNewCust(true); setCForm({ ...cForm, name: /\d/.test(custQ) ? "" : custQ, phone: /\d/.test(custQ) ? custQ : "" }); }} testID="new-customer-button" style={{ marginTop: 8 }} />
          </Card>
        )}

        {/* STEP 2: Motor */}
        <Step n={2} title="DATA MOTOR" done={!!vehicle} />
        {!customer ? <Card><Text style={styles.none}>Pilih pelanggan terlebih dahulu.</Text></Card> : vehicle ? (
          <Card style={styles.selected} testID="selected-vehicle-card">
            <View style={{ flex: 1 }}>
              <Mono style={styles.selName}>{vehicle.plate}</Mono>
              <Text style={styles.selSub}>{vehicle.brand} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ""} {vehicle.color}</Text>
              <Text style={styles.selSub}>KM terakhir: {vehicle.km_last ?? 0}</Text>
            </View>
            <View style={{ gap: 6 }}>
              <Button title="Ganti" variant="outline" small onPress={() => setVehicle(null)} testID="change-vehicle-button" />
              <Button title="Histori" variant="ghost" small onPress={() => router.push({ pathname: "/histori", params: { vehicle_id: vehicle.id, plate: vehicle.plate } })} testID="vehicle-history-button" />
            </View>
          </Card>
        ) : newVeh ? (
          <Card>
            <Input label="Nomor polisi *" value={vForm.plate} onChangeText={(v) => setVForm({ ...vForm, plate: v.toUpperCase() })} autoCapitalize="characters" testID="new-vehicle-plate-input" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Merek" value={vForm.brand} onChangeText={(v) => setVForm({ ...vForm, brand: v })} placeholder="Honda" testID="new-vehicle-brand-input" /></View>
              <View style={{ flex: 1 }}><Input label="Tipe/Model" value={vForm.model} onChangeText={(v) => setVForm({ ...vForm, model: v })} placeholder="Vario 125" testID="new-vehicle-model-input" /></View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Tahun" value={vForm.year} onChangeText={(v) => setVForm({ ...vForm, year: v })} keyboardType="number-pad" testID="new-vehicle-year-input" /></View>
              <View style={{ flex: 1 }}><Input label="Warna" value={vForm.color} onChangeText={(v) => setVForm({ ...vForm, color: v })} testID="new-vehicle-color-input" /></View>
            </View>
            <Input label="Nomor rangka" value={vForm.chassis_no} onChangeText={(v) => setVForm({ ...vForm, chassis_no: v })} testID="new-vehicle-chassis-input" />
            <Input label="Nomor mesin" value={vForm.engine_no} onChangeText={(v) => setVForm({ ...vForm, engine_no: v })} testID="new-vehicle-engine-input" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button title="Batal" variant="outline" onPress={() => setNewVeh(false)} style={{ flex: 1 }} testID="new-vehicle-cancel-button" />
              <Button title="Simpan Motor" onPress={() => createVehicle.mutate()} loading={createVehicle.isPending} disabled={!vForm.plate.trim()} style={{ flex: 2 }} testID="new-vehicle-save-button" />
            </View>
          </Card>
        ) : (
          <Card>
            {(vehicles.data ?? []).map((v) => (
              <Pressable key={v.id} style={styles.optRow} onPress={() => setVehicle(v)} testID={`vehicle-option-${v.plate.replace(/\s/g, "")}`}>
                <Ionicons name="bicycle-outline" size={26} color={colors.muted} />
                <View style={{ flex: 1 }}>
                  <Mono style={styles.optName}>{v.plate}</Mono>
                  <Text style={styles.optSub}>{v.brand} {v.model} {v.year}</Text>
                </View>
              </Pressable>
            ))}
            {vehicles.data?.length === 0 ? <Text style={styles.none}>Belum ada motor terdaftar untuk pelanggan ini.</Text> : null}
            <Button title="+ Motor Baru" variant="dark" onPress={() => setNewVeh(true)} testID="new-vehicle-button" style={{ marginTop: 8 }} />
          </Card>
        )}

        {/* STEP 3: Keluhan */}
        <Step n={3} title="KELUHAN PELANGGAN" done={complaint.complaint_main.trim().length > 0} />
        <Card>
          <Input label="Keluhan utama *" value={complaint.complaint_main} onChangeText={(v) => setComplaint({ ...complaint, complaint_main: v })} placeholder="cth: motor susah hidup, CVT berisik" multiline testID="complaint-main-input" />
          <Input label="Keluhan tambahan" value={complaint.complaint_extra} onChangeText={(v) => setComplaint({ ...complaint, complaint_extra: v })} testID="complaint-extra-input" />
          <Input label="Catatan pemeriksaan awal" value={complaint.initial_check} onChangeText={(v) => setComplaint({ ...complaint, initial_check: v })} testID="initial-check-input" />
          <Input label="Kilometer saat masuk" value={complaint.km_in} onChangeText={(v) => setComplaint({ ...complaint, km_in: v })} keyboardType="number-pad" testID="km-in-input" />
        </Card>

        {/* STEP 4: Estimasi */}
        <Step n={4} title="ESTIMASI AWAL" done={items.length > 0} />
        <Card testID="estimate-card">
          {items.map((it, idx) => (
            <View key={idx} style={styles.itemRow}>
              <Badge label={it.kind.toUpperCase()} tone={it.kind === "jasa" ? "info" : "brand"} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optName}>{it.name}</Text>
                <Text style={styles.optSub}>{it.qty} x {rupiah(it.price)}</Text>
              </View>
              <Mono>{rupiah(it.price * it.qty)}</Mono>
              <Pressable onPress={() => setItems(items.filter((_, i) => i !== idx))} hitSlop={8} testID={`estimate-remove-${idx}`}>
                <Ionicons name="trash-outline" size={22} color={colors.error} />
              </Pressable>
            </View>
          ))}
          {items.length === 0 ? <Text style={styles.none}>Belum ada estimasi. Estimasi awal belum dianggap tagihan final.</Text> : null}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <Button title="+ Jasa" variant="warning" onPress={() => setSheet("jasa")} style={{ flex: 1 }} testID="estimate-add-jasa-button" />
            <Button title="+ Part" variant="warning" onPress={() => setSheet("part")} style={{ flex: 1 }} testID="estimate-add-part-button" />
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL ESTIMASI AWAL</Text>
            <Mono style={styles.totalVal} testID="estimate-total">{rupiah(total)}</Mono>
          </View>
        </Card>

        {/* STEP 5: Mekanik */}
        <SectionTitle title="Mekanik (opsional)" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {(mechanics.data ?? []).map((m) => {
            const sel = mechanicId === m.id;
            return (
              <Pressable key={m.id} onPress={() => setMechanicId(sel ? null : m.id)} style={[styles.mechChip, sel && { backgroundColor: colors.surfaceInverse }]} testID={`mechanic-option-${m.username}`}>
                <Text style={[styles.mechText, sel && { color: colors.onSurfaceInverse }]}>{m.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.sticky, { paddingBottom: insets.bottom + 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.stickyLabel}>TOTAL ESTIMASI</Text>
            <Mono style={styles.stickyVal}>{rupiah(total)}</Mono>
          </View>
          <Button title="Simpan & Buat Antrian" variant="success" onPress={() => submit.mutate()} disabled={!ready} loading={submit.isPending} testID="submit-transaction-button" style={{ flex: 1.4, minHeight: 56 }} />
        </View>
      </KeyboardStickyView>

      <AddItemSheet visible={!!sheet} kind={sheet ?? "jasa"} onClose={() => setSheet(null)} onAdd={(it) => setItems([...items, it])} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8, marginTop: 4 },
  stepNum: { width: 28, height: 28, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  stepNumText: { color: c.onBrandPrimary, fontWeight: "500" },
  stepTitle: { fontSize: 13, fontWeight: "500", letterSpacing: 1, color: c.onSurface },
  selected: { flexDirection: "row", alignItems: "center", gap: 12, borderColor: c.success, backgroundColor: c.successTint },
  selName: { fontSize: 17, color: c.onSurface, fontWeight: "500" },
  selSub: { fontSize: 12, color: c.muted, marginTop: 2 },
  optRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.divider },
  optName: { fontSize: 15, color: c.onSurface, fontWeight: "500" },
  optSub: { fontSize: 12, color: c.muted },
  none: { color: c.muted, fontSize: 13, paddingVertical: 8 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTopWidth: 2, borderTopColor: c.border },
  totalLabel: { fontSize: 12, letterSpacing: 1, color: c.muted },
  totalVal: { fontSize: 20 },
  mechChip: { height: 40, paddingHorizontal: 14, borderWidth: 2, borderColor: c.border, justifyContent: "center" },
  mechText: { color: c.onSurface, fontWeight: "500" },
  sticky: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, backgroundColor: c.surfaceInverse, borderTopWidth: 3, borderTopColor: c.brandPrimary },
  stickyLabel: { color: c.brandPrimary, fontSize: 11, letterSpacing: 1 },
  stickyVal: { color: c.onSurfaceInverse, fontSize: 20 },
}));
