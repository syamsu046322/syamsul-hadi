import Ionicons from "@react-native-vector-icons/ionicons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import { Linking, Modal, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Input } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export function Scanner({ visible, onClose, onScan }: { visible: boolean; onClose: () => void; onScan: (code: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState("");
  const [asked, setAsked] = useState(false);
  const lock = useRef(false);

  const handle = (code: string) => {
    // DataMatrix / GS1 (Honda genuine parts) sering menyisipkan karakter kontrol FNC1 (GS \x1d) — bersihkan agar cocok dgn barcode part.
    const cleaned = (code || "").replace(/[\x00-\x1f\x7f]/g, "").trim();
    if (lock.current || !cleaned) return;
    lock.current = true;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onScan(cleaned);
    setTimeout(() => (lock.current = false), 1500);
  };

  const granted = permission?.granted;
  const canAsk = permission?.canAskAgain !== false;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]} testID="scanner-modal">
        <View style={styles.top}>
          <Text style={styles.title}>SCAN BARCODE PART</Text>          <Pressable onPress={onClose} hitSlop={10} testID="scanner-close-button">
            <Ionicons name="close" size={28} color={colors.onSurfaceInverse} />
          </Pressable>
        </View>
        <View style={styles.cameraWrap}>
          {granted ? (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "code128", "code39", "code93", "codabar", "itf14", "qr", "pdf417", "aztec", "datamatrix", "upc_a", "upc_e"] }}
              onBarcodeScanned={(r) => handle(r.data)}
            />
          ) : (
            <View style={styles.permBox}>
              <Ionicons name="camera-outline" size={48} color={colors.brandPrimary} />
              <Text style={styles.permText}>
                {canAsk
                  ? "Kamera dipakai untuk memindai barcode part sehingga pencarian stok lebih cepat."
                  : "Izin kamera ditolak. Buka pengaturan untuk mengizinkan kamera, atau ketik kode part secara manual di bawah."}
              </Text>
              {canAsk ? (
                <Button title={asked ? "Coba izinkan lagi" : "Izinkan Kamera"} onPress={() => { setAsked(true); requestPermission(); }} testID="scanner-permission-button" />
              ) : (
                <Button title="Buka Pengaturan" variant="dark" onPress={() => Linking.openSettings()} testID="scanner-open-settings-button" />
              )}
            </View>
          )}
        </View>
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.hint}>Mendukung barcode 1D & 2D DataMatrix (Honda genuine). Atau ketik kode / barcode manual</Text>
          <Input value={manual} onChangeText={setManual} placeholder="Kode part atau barcode" autoCapitalize="characters" testID="scanner-manual-input" />
          <Button title="CARI KODE" variant="dark" onPress={() => handle(manual)} disabled={!manual.trim()} testID="scanner-manual-submit" />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceInverse },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  title: { color: c.onSurfaceInverse, fontSize: 18, fontWeight: "500", letterSpacing: 1 },
  cameraWrap: { flex: 1, margin: 16, borderWidth: 3, borderColor: c.brandPrimary, overflow: "hidden", backgroundColor: c.surfaceInverse },
  permBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  permText: { color: c.onSurfaceInverse, textAlign: "center", fontSize: 15, lineHeight: 22 },
  bottom: { backgroundColor: c.surface, padding: 16, borderTopWidth: 3, borderTopColor: c.brandPrimary },
  hint: { color: c.muted, fontSize: 13, marginBottom: 8 },
}));
