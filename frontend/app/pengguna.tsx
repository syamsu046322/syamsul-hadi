import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Badge, Button, Confirm, Empty, Header, Input, Loading, Sheet, useToast } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

const ROLES = ["owner", "kasir", "mekanik", "partman"] as const;
const EMPTY = { username: "", name: "", password: "", role: "mekanik" as (typeof ROLES)[number], disabled: false };

export default function Pengguna() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<any | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [del, setDel] = useState<any | null>(null);
  const list = useQuery({ queryKey: ["users"], queryFn: () => api<any[]>("/users") });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); qc.invalidateQueries({ queryKey: ["mechanics"] }); setDel(null); toast.show("Pengguna dihapus", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  const save = useMutation({
    mutationFn: () => edit?.id
      ? api(`/users/${edit.id}`, { method: "PUT", body: { name: form.name, role: form.role, disabled: form.disabled, ...(form.password ? { password: form.password } : {}) } })
      : api("/users", { body: { username: form.username, name: form.name, password: form.password, role: form.role } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); qc.invalidateQueries({ queryKey: ["mechanics"] }); setEdit(null); toast.show("Pengguna tersimpan", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  return (
    <View style={styles.root} testID="users-screen">
      <Header title="PENGGUNA" subtitle={`${list.data?.length ?? 0} akun`} back />
      {list.isLoading ? <Loading /> : (
        <FlatList data={list.data ?? []} keyExtractor={(u) => u.id} contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={<Empty text="Belum ada pengguna." />}
          renderItem={({ item: u }) => (
            <Pressable style={styles.row} onPress={() => { setEdit(u); setForm({ username: u.username, name: u.name, password: "", role: u.role, disabled: !!u.disabled }); }} testID={`user-row-${u.username}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{u.name}</Text>
                <Text style={styles.sub}>@{u.username}</Text>
              </View>
              <Badge label={u.role.toUpperCase()} tone={u.role === "owner" ? "brand" : "neutral"} />
              {u.disabled ? <Badge label="NONAKTIF" tone="error" /> : null}
              {u.role !== "owner" ? (
                <Pressable onPress={() => setDel(u)} hitSlop={8} style={{ padding: 6 }} testID={`user-delete-${u.username}`}>
                  <Ionicons name="trash-outline" size={22} color={colors.error} />
                </Pressable>
              ) : null}
            </Pressable>
          )} />
      )}
      <Confirm visible={!!del} title="Hapus Pengguna" message={`Hapus akun ${del?.name} (@${del?.username})? Akun tidak akan bisa login lagi.`} confirmLabel="YA, HAPUS" danger loading={remove.isPending} testID="user-delete-confirm"
        onCancel={() => setDel(null)} onConfirm={() => remove.mutate(del.id)} />
      <View style={[styles.fabWrap, { bottom: insets.bottom + 16 }]}>
        <Button title="+ Pengguna Baru" onPress={() => { setEdit({}); setForm(EMPTY); }} testID="user-add-button" />
      </View>
      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Ubah Pengguna" : "Pengguna Baru"} testID="user-sheet">
        <Input label="Username *" value={form.username} onChangeText={(v) => setForm({ ...form, username: v.toLowerCase() })} autoCapitalize="none" editable={!edit?.id} testID="user-username-input" />
        <Input label="Nama lengkap *" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} testID="user-name-input" />
        <Input label={edit?.id ? "Password baru (kosongkan jika tidak diubah)" : "Password *"} value={form.password} onChangeText={(v) => setForm({ ...form, password: v })} secureTextEntry testID="user-password-input" />
        <Text style={styles.label}>ROLE</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {ROLES.map((r) => (
            <Pressable key={r} onPress={() => setForm({ ...form, role: r })} style={[styles.roleChip, form.role === r && { backgroundColor: colors.surfaceInverse }]} testID={`user-role-${r}`}>
              <Text style={[styles.roleText, form.role === r && { color: colors.onSurfaceInverse }]}>{r.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
        {edit?.id ? (
          <Pressable onPress={() => setForm({ ...form, disabled: !form.disabled })} style={styles.toggle} testID="user-disabled-toggle">
            <Text style={styles.name}>Akun {form.disabled ? "NONAKTIF" : "AKTIF"}</Text>
            <Badge label={form.disabled ? "NONAKTIF" : "AKTIF"} tone={form.disabled ? "error" : "success"} />
          </Pressable>
        ) : null}
        <Button title="Simpan" onPress={() => save.mutate()} loading={save.isPending} disabled={!form.name.trim() || (!edit?.id && (!form.username.trim() || !form.password))} testID="user-save-button" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderBottomWidth: 2, borderBottomColor: c.divider },
  name: { fontSize: 16, color: c.onSurface, fontWeight: "500" },
  sub: { fontSize: 12, color: c.muted, marginTop: 2 },
  fabWrap: { position: "absolute", left: 16, right: 16 },
  label: { fontSize: 12, color: c.muted, marginBottom: 6, letterSpacing: 0.6 },
  roleChip: { height: 40, paddingHorizontal: 14, borderWidth: 2, borderColor: c.border, justifyContent: "center" },
  roleText: { color: c.onSurface, fontWeight: "500", fontSize: 13 },
  toggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, borderWidth: 2, borderColor: c.border, marginBottom: 12 },
}));
