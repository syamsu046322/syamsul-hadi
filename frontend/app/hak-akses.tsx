import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Chips, Header, Loading, useToast } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

type Feature = { key: string; label: string };
type Perms = Record<string, string[]>;
const CONFIG_ROLES = [
  { key: "mekanik", label: "MEKANIK" },
  { key: "kasir", label: "KASIR" },
  { key: "partman", label: "PARTMAN" },
] as const;

export default function HakAkses() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [role, setRole] = useState<string>("mekanik");
  const [draft, setDraft] = useState<Perms>({});
  const q = useQuery({ queryKey: ["permissions"], queryFn: () => api<{ features: Feature[]; roles: Perms }>("/permissions") });

  useEffect(() => {
    if (q.data?.roles) setDraft(q.data.roles);
  }, [q.data]);

  const features: Feature[] = q.data?.features ?? [];
  const active = draft[role] ?? [];
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(q.data?.roles ?? {}), [draft, q.data]);

  const toggle = (key: string) => {
    setDraft((d) => {
      const cur = new Set(d[role] ?? []);
      if (cur.has(key)) cur.delete(key); else cur.add(key);
      return { ...d, [role]: features.filter((f) => cur.has(f.key)).map((f) => f.key) };
    });
  };

  const save = useMutation({
    mutationFn: () => api("/permissions", { method: "PUT", body: { roles: draft } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["permissions"] }); toast.show("Hak akses tersimpan", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  if (user && user.role !== "owner") return <Redirect href="/(tabs)" />;

  return (
    <View style={styles.root} testID="permissions-screen">
      <Header title="HAK AKSES JABATAN" subtitle="Centang menu yang boleh dipakai tiap jabatan" back />
      <Chips options={CONFIG_ROLES.map((r) => ({ key: r.key, label: r.label }))} value={role} onChange={setRole} testID="perm-role" />
      {q.isLoading ? <Loading /> : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}>
          <Text style={styles.hint}>Owner selalu punya akses penuh. Perubahan berlaku saat karyawan login berikutnya.</Text>
          {features.map((f) => {
            const on = active.includes(f.key);
            return (
              <Pressable key={f.key} style={[styles.item, on && { borderColor: colors.brandPrimary }]} onPress={() => toggle(f.key)} testID={`perm-${role}-${f.key}`}>
                <Text style={styles.itemLabel}>{f.label}</Text>
                <View style={[styles.check, on && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
                  {on ? <Ionicons name="checkmark" size={18} color={colors.onSurfaceInverse} /> : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button title="SIMPAN HAK AKSES" onPress={() => save.mutate()} loading={save.isPending} disabled={!dirty} testID="perm-save-button" />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hint: { fontSize: 12, color: c.muted, marginBottom: 12, lineHeight: 17 },
  item: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 2, borderColor: c.border, padding: 14, marginBottom: 10, minHeight: 56 },
  itemLabel: { fontSize: 15, color: c.onSurface, fontWeight: "500", flex: 1 },
  check: { width: 28, height: 28, borderWidth: 2, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  footer: { padding: 16, borderTopWidth: 2, borderTopColor: c.divider, backgroundColor: c.surface },
}));
