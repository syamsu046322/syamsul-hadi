import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qs } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Scanner } from "@/src/components/scanner";
import { Badge, Button, Chips, Empty, Input, Loading, Mono, Sheet, useToast } from "@/src/components/ui";
import { rupiah } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

export default function Stok() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ low?: string }>();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "low">("all");
  const [scan, setScan] = useState(false);
  const [wipe, setWipe] = useState(false);
  const [wipePw, setWipePw] = useState("");
  const wipeMut = useMutation({
    mutationFn: () => api<{ deleted: number }>("/parts/delete-all", { body: { owner_password: wipePw } }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["parts"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); setWipe(false); toast.show(`${r.deleted} part dihapus`, "success"); },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  useEffect(() => { if (params.low) setFilter("low"); }, [params.low]);

  const parts = useQuery({ queryKey: ["parts", q, filter], queryFn: () => api<any[]>(`/parts${qs({ q, low: filter === "low" })}`) });

  const onScanned = async (code: string) => {
    setScan(false);
    try {
      const found = await api<any[]>(`/parts${qs({ barcode: code })}`);
      if (found.length) router.push(`/stok/${found[0].id}`);
      else if (can("partman")) router.push({ pathname: "/stok/[id]", params: { id: "baru", barcode: code } });
      else toast.show(`Part ${code} tidak ditemukan`, "error");
    } catch (e: any) { toast.show(e.message, "error"); }
  };

  return (
    <View style={styles.root} testID="stock-screen">
      <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <Text style={styles.title}>STOK SUKU CADANG</Text>
          {user?.role === "owner" ? (
            <Pressable onPress={() => { setWipe(true); setWipePw(""); }} hitSlop={8} testID="stock-delete-all-button">
              <Ionicons name="trash-outline" size={22} color={colors.error} />
            </Pressable>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={[styles.searchRow, { flex: 1 }]}>
            <Ionicons name="search" size={20} color={colors.muted} />
            <Input value={q} onChangeText={setQ} placeholder="Cari kode, nama, atau rak" style={styles.search} testID="stock-search-input" />
          </View>
          <Pressable style={styles.scanBtn} onPress={() => setScan(true)} testID="stock-scan-button">
            <Ionicons name="barcode-outline" size={28} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      </View>
      <Chips options={[{ key: "all", label: "Semua Part" }, { key: "low", label: "Stok Menipis" }]} value={filter} onChange={setFilter} testID="stock-filter" />
      {parts.isLoading ? <Loading /> : (
        <FlatList
          data={parts.data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={parts.isRefetching} onRefresh={parts.refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Empty text="Part tidak ditemukan. Scan atau cari part." icon="cube-outline" testID="stock-empty" />}
          renderItem={({ item: p }) => {
            const low = p.stock <= p.min_stock;
            const empty = p.stock <= 0;
            return (
              <Pressable style={[styles.row, empty && styles.rowEmpty]} onPress={() => router.push(`/stok/${p.id}`)} testID={`part-row-${p.code}`}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.name, empty && { color: colors.muted }]}>{p.name}</Text>
                  <Text style={styles.sub}>{p.code}{p.barcode ? ` · ${p.barcode}` : ""}</Text>
                  {p.rack ? <View style={styles.rack}><Ionicons name="location-outline" size={12} color={colors.onBrandTertiary} /><Text style={styles.rackText} testID={`part-rack-${p.code}`}>RAK {p.rack}</Text></View> : null}
                  <Mono style={[styles.price, empty && { color: colors.muted }]}>{rupiah(p.price)}</Mono>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <View style={[styles.stockPill, empty ? styles.stockPillEmpty : low ? styles.stockPillLow : styles.stockPillOk]}>
                    <Mono style={[styles.stock, { color: empty ? colors.muted : colors.onSurfaceInverse }]} testID={`part-stock-${p.code}`}>{p.stock} <Text style={[styles.unit, { color: empty ? colors.muted : colors.onSurfaceInverse }]}>{p.unit}</Text></Mono>
                  </View>
                  <Badge label={empty ? "HABIS" : low ? "MENIPIS" : "TERSEDIA"} tone={empty ? "neutral" : low ? "warning" : "success"} />
                </View>
              </Pressable>
            );
          }}
        />
      )}
      {can("partman") ? (
        <Pressable style={styles.fab} onPress={() => router.push("/stok/baru")} testID="stock-add-fab">
          <Ionicons name="add" size={26} color={colors.onBrandPrimary} />
          <Text style={styles.fabText}>PART BARU</Text>
        </Pressable>
      ) : null}
      <Scanner visible={scan} onClose={() => setScan(false)} onScan={onScanned} />
      <Sheet visible={wipe} onClose={() => setWipe(false)} title="Hapus Semua Data Sparepart" testID="stock-wipe-sheet" scroll={false}>
        <Text style={styles.warn}>Semua data part ({parts.data?.length ?? 0} item) akan dihapus dari daftar stok. Histori transaksi & mutasi tetap tersimpan. Masukkan password Owner untuk konfirmasi.</Text>
        <Input label="Password Owner" value={wipePw} onChangeText={setWipePw} secureTextEntry testID="stock-wipe-password-input" />
        <Button title="Ya, Hapus Semua Sparepart" variant="danger" loading={wipeMut.isPending} disabled={!wipePw} onPress={() => wipeMut.mutate()} testID="stock-wipe-confirm-button" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  top: { backgroundColor: c.surfaceInverse, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 3, borderBottomColor: c.brandPrimary },
  title: { color: c.onSurfaceInverse, fontSize: 20, fontWeight: "500", letterSpacing: 1.5 },
  warn: { color: c.onSurface, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surface, paddingLeft: 12, borderWidth: 2, borderColor: c.brandPrimary },
  search: { borderWidth: 0, flex: 1, minHeight: 44 },
  scanBtn: { width: 52, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.brandPrimary },
  row: { flexDirection: "row", gap: 12, padding: 14, borderBottomWidth: 2, borderBottomColor: c.divider, alignItems: "center" },
  rowEmpty: { backgroundColor: c.surfaceSecondary, opacity: 0.75 },
  stockPill: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: 2 },
  stockPillOk: { backgroundColor: c.success, borderColor: c.success },
  stockPillLow: { backgroundColor: c.warning, borderColor: c.warning },
  stockPillEmpty: { backgroundColor: c.surfaceTertiary, borderColor: c.surfaceTertiary },
  name: { fontSize: 16, color: c.onSurface, fontWeight: "500" },
  sub: { fontSize: 12, color: c.muted },
  price: { fontSize: 13, marginTop: 2 },
  rack: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", backgroundColor: c.brandTertiary, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 },
  rackText: { fontSize: 11, color: c.onBrandTertiary, fontWeight: "500" },
  stock: { fontSize: 20 },
  unit: { fontSize: 12 },
  fab: { position: "absolute", right: 16, bottom: 20, backgroundColor: c.brandPrimary, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, height: 56, borderWidth: 2, borderColor: c.border },
  fabText: { color: c.onBrandPrimary, fontWeight: "500", letterSpacing: 0.5 },
}));
