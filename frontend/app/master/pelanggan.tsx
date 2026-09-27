import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qs } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AddressFields } from "@/src/components/AddressFields";
import { Button, Empty, Header, Input, Loading, Sheet, useToast } from "@/src/components/ui";
import { makeStyles } from "@/src/theme";

const EMPTY = { name: "", phone: "", address: "", notes: "", dusun: "", desa: "", kecamatan: "", kabupaten: "" };

export default function Pelanggan() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<any | null>(null);
  const [form, setForm] = useState(EMPTY);
  const list = useQuery({ queryKey: ["customers", q], queryFn: () => api<any[]>(`/customers${qs({ q })}`) });

  const save = useMutation({
    mutationFn: () => (edit?.id ? api(`/customers/${edit.id}`, { method: "PUT", body: form }) : api("/customers", { body: form })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); setEdit(null); toast.show("Pelanggan tersimpan", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  return (
    <View style={styles.root} testID="customers-screen">
      <Header title="DATA PELANGGAN" subtitle={`${list.data?.length ?? 0} pelanggan`} back />
      <View style={styles.searchWrap}><Input value={q} onChangeText={setQ} placeholder="Cari nama, HP, atau nopol" testID="customers-search-input" /></View>
      {list.isLoading ? <Loading /> : (
        <FlatList data={list.data ?? []} keyExtractor={(c) => c.id} contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={<Empty text="Belum ada pelanggan." icon="people-outline" />}
          renderItem={({ item: c }) => (
            <Pressable style={styles.row} onPress={() => { setEdit(c); setForm({ name: c.name, phone: c.phone ?? "", address: c.address ?? "", notes: c.notes ?? "", dusun: c.dusun ?? "", desa: c.desa ?? "", kecamatan: c.kecamatan ?? "", kabupaten: c.kabupaten ?? "" }); }} testID={`customer-row-${c.code}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{c.name}</Text>
                <Text style={styles.sub}>{c.code} · {c.phone || "-"}{c.address ? ` · ${c.address}` : ""}</Text>
              </View>
              <Button title="Motor" variant="outline" small onPress={() => router.push({ pathname: "/master/motor", params: { customer_id: c.id, customer_name: c.name } })} testID={`customer-vehicles-${c.code}`} />
            </Pressable>
          )} />
      )}
      {can("mekanik", "kasir") ? (
        <View style={[styles.fabWrap, { bottom: insets.bottom + 16 }]}>
          <Button title="+ Pelanggan Baru" onPress={() => { setEdit({}); setForm(EMPTY); }} testID="customer-add-button" />
        </View>
      ) : null}
      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Ubah Pelanggan" : "Pelanggan Baru"} testID="customer-sheet">
        <Input label="Nama *" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} testID="customer-name-input" />
        <Input label="Nomor HP" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" testID="customer-phone-input" />
        <Input label="Alamat (jalan/patokan)" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} testID="customer-address-input" />
        <AddressFields value={{ dusun: form.dusun, desa: form.desa, kecamatan: form.kecamatan, kabupaten: form.kabupaten }} onChange={(a) => setForm({ ...form, ...a })} testPrefix="customer-address" />
        <Input label="Catatan" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} testID="customer-notes-input" />
        <Button title="Simpan" onPress={() => save.mutate()} loading={save.isPending} disabled={!form.name.trim()} testID="customer-save-button" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  searchWrap: { padding: 16, paddingBottom: 4, borderBottomWidth: 2, borderBottomColor: c.divider },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 2, borderBottomColor: c.divider },
  name: { fontSize: 16, color: c.onSurface, fontWeight: "500" },
  sub: { fontSize: 12, color: c.muted, marginTop: 2 },
  fabWrap: { position: "absolute", left: 16, right: 16 },
}));
