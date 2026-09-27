import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qs } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Empty, Header, Input, Loading, Mono, Sheet, useToast } from "@/src/components/ui";
import { fmtDate, parseNum } from "@/src/format";
import { makeStyles } from "@/src/theme";

const EMPTY = { plate: "", brand: "", model: "", year: "", color: "", chassis_no: "", engine_no: "", km_last: "" };

export default function Motor() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const params = useLocalSearchParams<{ customer_id?: string; customer_name?: string }>();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<any | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [custQ, setCustQ] = useState("");
  const [cust, setCust] = useState<any | null>(params.customer_id ? { id: params.customer_id, name: params.customer_name } : null);

  const list = useQuery({ queryKey: ["vehicles", q, params.customer_id], queryFn: () => api<any[]>(`/vehicles${qs({ q, customer_id: params.customer_id })}`) });
  const customers = useQuery({ queryKey: ["customers", custQ], queryFn: () => api<any[]>(`/customers${qs({ q: custQ })}`), enabled: !!edit && !cust && custQ.length >= 2 });

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, km_last: parseNum(form.km_last), customer_id: cust?.id ?? edit.customer_id };
      return edit?.id ? api(`/vehicles/${edit.id}`, { method: "PUT", body }) : api("/vehicles", { body });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehicles"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); setEdit(null); toast.show("Motor tersimpan", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  const openEdit = (v: any) => {
    setEdit(v); setCust({ id: v.customer_id, name: v.customer_name });
    setForm({ plate: v.plate, brand: v.brand ?? "", model: v.model ?? "", year: String(v.year ?? ""), color: v.color ?? "", chassis_no: v.chassis_no ?? "", engine_no: v.engine_no ?? "", km_last: String(v.km_last ?? "") });
  };

  return (
    <View style={styles.root} testID="vehicles-screen">
      <Header title="DATA MOTOR" subtitle={params.customer_name ? `Pelanggan: ${params.customer_name}` : `${list.data?.length ?? 0} kendaraan`} back />
      <View style={styles.searchWrap}><Input value={q} onChangeText={setQ} placeholder="Cari nopol, merek, tipe" testID="vehicles-search-input" /></View>
      {list.isLoading ? <Loading /> : (
        <FlatList data={list.data ?? []} keyExtractor={(v) => v.id} contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={<Empty text="Belum ada motor." icon="bicycle-outline" />}
          renderItem={({ item: v }) => (
            <Pressable style={styles.row} onPress={() => openEdit(v)} testID={`vehicle-row-${v.plate.replace(/\s/g, "")}`}>
              <View style={{ flex: 1 }}>
                <Mono style={styles.plate}>{v.plate}</Mono>
                <Text style={styles.name}>{v.brand} {v.model} {v.year ? `(${v.year})` : ""} {v.color}</Text>
                <Text style={styles.sub}>{v.customer_name} · KM {v.km_last ?? 0} · Servis terakhir: {fmtDate(v.last_service_at)}</Text>
              </View>
              <Button title="Histori" variant="outline" small onPress={() => router.push({ pathname: "/histori", params: { vehicle_id: v.id, plate: v.plate } })} testID={`vehicle-history-${v.plate.replace(/\s/g, "")}`} />
            </Pressable>
          )} />
      )}
      {can("mekanik", "kasir") ? (
        <View style={[styles.fabWrap, { bottom: insets.bottom + 16 }]}>
          <Button title="+ Motor Baru" onPress={() => { setEdit({}); setForm(EMPTY); if (!params.customer_id) setCust(null); }} testID="vehicle-add-button" />
        </View>
      ) : null}
      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Ubah Motor" : "Motor Baru"} testID="vehicle-sheet">
        <Text style={styles.label}>PEMILIK</Text>
        {cust ? (
          <View style={styles.custRow}><Text style={styles.name}>{cust.name}</Text>{!edit?.id ? <Button title="Ganti" variant="outline" small onPress={() => setCust(null)} testID="vehicle-change-owner" /> : null}</View>
        ) : (
          <>
            <Input value={custQ} onChangeText={setCustQ} placeholder="Cari pelanggan (nama/HP)" testID="vehicle-owner-search" />
            {(customers.data ?? []).slice(0, 6).map((c) => <Pressable key={c.id} style={styles.opt} onPress={() => setCust(c)} testID={`vehicle-owner-option-${c.code}`}><Text style={styles.name}>{c.name}</Text><Text style={styles.sub}>{c.phone}</Text></Pressable>)}
          </>
        )}
        <Input label="Nomor polisi *" value={form.plate} onChangeText={(v) => setForm({ ...form, plate: v.toUpperCase() })} autoCapitalize="characters" testID="vehicle-plate-input" />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Input label="Merek" value={form.brand} onChangeText={(v) => setForm({ ...form, brand: v })} testID="vehicle-brand-input" /></View>
          <View style={{ flex: 1 }}><Input label="Tipe" value={form.model} onChangeText={(v) => setForm({ ...form, model: v })} testID="vehicle-model-input" /></View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Input label="Tahun" value={form.year} onChangeText={(v) => setForm({ ...form, year: v })} keyboardType="number-pad" testID="vehicle-year-input" /></View>
          <View style={{ flex: 1 }}><Input label="Warna" value={form.color} onChangeText={(v) => setForm({ ...form, color: v })} testID="vehicle-color-input" /></View>
        </View>
        <Input label="No rangka" value={form.chassis_no} onChangeText={(v) => setForm({ ...form, chassis_no: v })} testID="vehicle-chassis-input" />
        <Input label="No mesin" value={form.engine_no} onChangeText={(v) => setForm({ ...form, engine_no: v })} testID="vehicle-engine-input" />
        <Input label="KM terakhir" value={form.km_last} onChangeText={(v) => setForm({ ...form, km_last: v })} keyboardType="number-pad" testID="vehicle-km-input" />
        <Button title="Simpan" onPress={() => save.mutate()} loading={save.isPending} disabled={!form.plate.trim() || !cust} testID="vehicle-save-button" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  searchWrap: { padding: 16, paddingBottom: 4, borderBottomWidth: 2, borderBottomColor: c.divider },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 2, borderBottomColor: c.divider },
  plate: { fontSize: 17, color: c.brandPrimary },
  name: { fontSize: 15, color: c.onSurface, fontWeight: "500" },
  sub: { fontSize: 12, color: c.muted, marginTop: 2 },
  fabWrap: { position: "absolute", left: 16, right: 16 },
  label: { fontSize: 12, color: c.muted, marginBottom: 6, letterSpacing: 0.6 },
  custRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 2, borderColor: c.success, backgroundColor: c.successTint, padding: 10, marginBottom: 12 },
  opt: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider },
}));
