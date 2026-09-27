import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Button, Card, Header, Input, useToast } from "@/src/components/ui";
import { logoUri } from "@/src/shop";
import { makeStyles, useTheme } from "@/src/theme";

export default function ProfilBengkel() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const shop = useQuery({ queryKey: ["shop"], queryFn: () => api<any>("/shop") });
  const [form, setForm] = useState({ name: "", address: "", phone: "", whatsapp: "", postal_code: "" });
  const [permAsked, setPermAsked] = useState(false);

  useEffect(() => {
    if (shop.data) setForm({ name: shop.data.name ?? "", address: shop.data.address ?? "", phone: shop.data.phone ?? "", whatsapp: shop.data.whatsapp ?? "", postal_code: shop.data.postal_code ?? "" });
  }, [shop.data]);

  const save = useMutation({
    mutationFn: () => api("/shop", { method: "PUT", body: form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shop"] }); toast.show("Profil bengkel tersimpan", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (Platform.OS !== "web") {
        const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
        if (!cur.granted) {
          if (!cur.canAskAgain) { throw new Error("SETTINGS"); }
          setPermAsked(true);
          const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!req.granted) throw new Error(req.canAskAgain ? "Izin galeri diperlukan untuk memilih logo" : "SETTINGS");
        }
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (res.canceled || !res.assets?.length) return null;
      const a = res.assets[0];
      const fd = new FormData();
      const name = a.fileName ?? "logo.jpg";
      const type = a.mimeType ?? "image/jpeg";
      if (Platform.OS === "web") {
        const blob = await (await fetch(a.uri)).blob();
        fd.append("file", blob, name);
      } else {
        fd.append("file", { uri: a.uri, name, type } as any);
      }
      return api("/shop/logo", { method: "POST", formData: fd });
    },
    onSuccess: (r) => { if (r) { qc.invalidateQueries({ queryKey: ["shop"] }); toast.show("Logo diperbarui", "success"); } },
    onError: (e: any) => {
      if (e.message === "SETTINGS") toast.show("Izin galeri ditolak. Buka Pengaturan untuk mengizinkan.", "error");
      else toast.show(e.message, "error");
    },
  });

  const logoUrl = logoUri(shop.data?.logo_version);
  const resetLogo = useMutation({
    mutationFn: () => api("/shop/logo", { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shop"] }); toast.show("Logo default dipulihkan", "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });
  const permBlocked = upload.error && (upload.error as any).message === "SETTINGS";

  return (
    <View style={styles.root} testID="shop-profile-screen">
      <Header title="PROFIL BENGKEL" subtitle="Nama, alamat, kontak & logo untuk nota" back />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <Card style={{ alignItems: "center" }} testID="shop-logo-card">
          <View style={styles.logoBox}>
            <Image source={{ uri: logoUrl }} style={{ width: 140, height: 140 }} contentFit="contain" transition={200} cachePolicy="none" />
          </View>
          <Button title="Ganti Logo dari Galeri" variant="dark" icon="image-outline" onPress={() => upload.mutate()} loading={upload.isPending} testID="shop-change-logo-button" />
          {shop.data?.logo_path ? <Button title="Kembalikan logo default" variant="ghost" small onPress={() => resetLogo.mutate()} loading={resetLogo.isPending} testID="shop-reset-logo-button" style={{ marginTop: 4 }} /> : null}
          {permBlocked ? <Pressable onPress={() => Linking.openSettings()} style={{ marginTop: 8 }} testID="shop-open-settings"><Text style={{ color: colors.info }}>Buka Pengaturan</Text></Pressable> : null}
          {permAsked ? <Text style={styles.hint}>Logo dipakai di layar login dan nota cetak.</Text> : <Text style={styles.hint}>Logo dipakai di layar login dan nota cetak.</Text>}
        </Card>
        <Card>
          <Input label="Nama bengkel *" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} testID="shop-name-input" />
          <Input label="Alamat" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} multiline testID="shop-address-input" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Input label="Kode pos" value={form.postal_code} onChangeText={(v) => setForm({ ...form, postal_code: v })} keyboardType="number-pad" testID="shop-postal-input" /></View>
            <View style={{ flex: 2 }}><Input label="No HP / Telepon" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" testID="shop-phone-input" /></View>
          </View>
          <Input label="WhatsApp Owner (untuk notifikasi hutang)" value={form.whatsapp} onChangeText={(v) => setForm({ ...form, whatsapp: v })} keyboardType="phone-pad" testID="shop-whatsapp-input" />
          <Button title="Simpan Profil" onPress={() => save.mutate()} loading={save.isPending} disabled={!form.name.trim()} testID="shop-save-button" />
        </Card>
        <View style={styles.infoRow}>
          <Ionicons name="information-circle-outline" size={18} color={colors.muted} />
          <Text style={styles.hint}>Perubahan langsung berlaku di nota berikutnya dan pesan WhatsApp.</Text>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  logoBox: { width: 160, height: 160, borderWidth: 3, borderColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: 12, backgroundColor: c.surface },
  hint: { color: c.muted, fontSize: 12, marginTop: 8, textAlign: "center", flex: 1 },
  infoRow: { flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 4 },
}));
