import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Confirm } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

export default function Lainnya() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, can, logout } = useAuth();
  const [confirm, setConfirm] = useState(false);

  const items: { label: string; sub: string; icon: IoniconName; href: string; show: boolean; testID: string }[] = [
    { label: "Histori Servis", sub: "Cari nota, nopol, pelanggan", icon: "time-outline", href: "/histori", show: true, testID: "menu-history" },
    { label: "Pengingat Servis", sub: "Jadwal servis berikutnya + WhatsApp", icon: "alarm-outline", href: "/pengingat", show: true, testID: "menu-reminders" },
    { label: "Piutang / Hutang", sub: "Nota belum lunas & pembayaran cicilan", icon: "wallet-outline", href: "/piutang", show: can("kasir"), testID: "menu-debts" },
    { label: "Belanja", sub: "Belanja bengkel, keluarga (kasbon), pinjaman", icon: "cart-outline", href: "/belanja", show: can("kasir"), testID: "menu-expenses" },
    { label: "Checklist Tools", sub: "Cek peralatan mingguan", icon: "hammer-outline", href: "/tools", show: can("mekanik"), testID: "menu-tools" },
    { label: "Outlet & Penjualan Part", sub: "Jualan langsung: konsumen, part, laba, cash/kredit", icon: "storefront-outline", href: "/outlet", show: can("kasir", "partman"), testID: "menu-outlet" },
    { label: "Cek Fisik Stok", sub: "Stock opname per rak & persetujuan selisih", icon: "clipboard-outline", href: "/cek-stok", show: can("partman"), testID: "menu-stock-check" },
    { label: "Notifikasi", sub: "Pemberitahuan untuk Anda", icon: "notifications-outline", href: "/notifikasi", show: user?.role !== "owner", testID: "menu-notifications-role" },
    { label: "Data Pelanggan", sub: "Master pelanggan", icon: "people-outline", href: "/master/pelanggan", show: can("mekanik", "kasir"), testID: "menu-customers" },
    { label: "Data Motor", sub: "Master kendaraan", icon: "bicycle-outline", href: "/master/motor", show: can("mekanik", "kasir"), testID: "menu-vehicles" },
    { label: "Data Jasa", sub: "Master jasa & harga", icon: "construct-outline", href: "/master/jasa", show: true, testID: "menu-services" },
    { label: "Mutasi Stok", sub: "Riwayat keluar/masuk part", icon: "swap-vertical-outline", href: "/mutasi", show: can("partman", "mekanik"), testID: "menu-stock-movements" },
    { label: "Laporan & Excel", sub: "Omzet harian/bulanan, export/import", icon: "stats-chart-outline", href: "/laporan", show: user?.role === "owner", testID: "menu-reports" },
    { label: "Laporan Pembatalan", sub: "Faktur yang dibatalkan & alasannya", icon: "close-circle-outline", href: "/pembatalan", show: user?.role === "owner", testID: "menu-cancellations" },
    { label: "Riwayat Per Mekanik", sub: "Servis selesai & omzet bulanan per mekanik", icon: "construct-outline", href: "/laporan-mekanik", show: user?.role === "owner", testID: "menu-mechanic-report" },
    { label: "Notifikasi", sub: "Hutang & pemberitahuan penting", icon: "notifications-outline", href: "/notifikasi", show: user?.role === "owner", testID: "menu-notifications" },
    { label: "Profil Bengkel", sub: "Nama, alamat, kontak, logo nota", icon: "storefront-outline", href: "/profil-bengkel", show: user?.role === "owner", testID: "menu-shop-profile" },
    { label: "Pengguna", sub: "Kelola akun Mekanik, Kasir, Partman", icon: "key-outline", href: "/pengguna", show: user?.role === "owner", testID: "menu-users" },
  ];

  return (
    <View style={styles.root} testID="more-screen">
      <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>LAINNYA</Text>
        <Text style={styles.sub}>{user?.name} · {user?.role.toUpperCase()} · @{user?.username}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {items.filter((i) => i.show).map((i) => (
          <Pressable key={i.href} style={styles.item} onPress={() => router.push(i.href as any)} testID={i.testID}>
            <View style={styles.iconBox}><Ionicons name={i.icon} size={22} color={colors.onSurfaceInverse} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemLabel}>{i.label}</Text>
              <Text style={styles.itemSub}>{i.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        ))}
        <Pressable style={[styles.item, { borderColor: colors.error, marginTop: 12 }]} onPress={() => setConfirm(true)} testID="menu-logout">
          <View style={[styles.iconBox, { backgroundColor: colors.error }]}><Ionicons name="log-out-outline" size={22} color={colors.onError} /></View>
          <Text style={[styles.itemLabel, { color: colors.error }]}>Keluar</Text>
        </Pressable>
      </ScrollView>
      <Confirm visible={confirm} title="Keluar" message="Anda yakin ingin keluar dari aplikasi?" onCancel={() => setConfirm(false)} confirmLabel="YA, KELUAR" danger
        onConfirm={async () => { setConfirm(false); await logout(); router.replace("/login"); }} testID="logout-confirm" />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  top: { backgroundColor: c.surfaceInverse, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 3, borderBottomColor: c.brandPrimary },
  title: { color: c.onSurfaceInverse, fontSize: 20, fontWeight: "500", letterSpacing: 1.5 },
  sub: { color: c.brandPrimary, fontSize: 12, marginTop: 4 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 2, borderColor: c.border, padding: 12, marginBottom: 10, minHeight: 64 },
  iconBox: { width: 40, height: 40, backgroundColor: c.surfaceInverse, alignItems: "center", justifyContent: "center" },
  itemLabel: { fontSize: 16, color: c.onSurface, fontWeight: "500" },
  itemSub: { fontSize: 12, color: c.muted, marginTop: 2 },
}));
