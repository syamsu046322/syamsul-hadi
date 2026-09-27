import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, TextInputProps, useWindowDimensions, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MONO } from "@/src/format";
import { STATUS_LABEL, STATUS_TONE, Tone, toneColors } from "@/src/status";
import { makeStyles, useTheme } from "@/src/theme";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

// ----------------------------------------------------------------------------- Button
type Variant = "primary" | "dark" | "outline" | "success" | "info" | "warning" | "danger" | "ghost";

export function Button({
  title, onPress, variant = "primary", disabled, loading, icon, testID, style, small,
}: {
  title: string; onPress?: () => void; variant?: Variant; disabled?: boolean; loading?: boolean;
  icon?: IoniconName; testID?: string; style?: ViewStyle; small?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const map: Record<Variant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.brandPrimary, fg: colors.onBrandPrimary, border: colors.brandPrimary },
    dark: { bg: colors.surfaceInverse, fg: colors.onSurfaceInverse, border: colors.surfaceInverse },
    outline: { bg: colors.surface, fg: colors.onSurface, border: colors.border },
    success: { bg: colors.success, fg: colors.onSuccess, border: colors.success },
    info: { bg: colors.info, fg: colors.onInfo, border: colors.info },
    warning: { bg: colors.warning, fg: colors.onWarning, border: colors.warning },
    danger: { bg: colors.error, fg: colors.onError, border: colors.error },
    ghost: { bg: "transparent", fg: colors.onSurface, border: "transparent" },
  };
  const m = map[variant];
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.btn, small && styles.btnSmall,
        { backgroundColor: m.bg, borderColor: m.border, opacity: off ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={m.fg} /> : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 20} color={m.fg} /> : null}
          <Text style={[styles.btnText, small && styles.btnTextSmall, { color: m.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

// ----------------------------------------------------------------------------- Input
export function Input({ label, error, testID, style, ...props }: TextInputProps & { label?: string; error?: string; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.inputWrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        testID={testID}
        placeholderTextColor={colors.muted}
        style={[styles.input, props.multiline && styles.inputMulti, error && { borderColor: colors.error }, style]}
        {...props}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

// ----------------------------------------------------------------------------- Header
export function Header({ title, subtitle, back, right, testID }: { title: string; subtitle?: string; back?: boolean; right?: React.ReactNode; testID?: string }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]} testID={testID}>
      {back ? (
        <Pressable testID="header-back-button" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.onSurfaceInverse} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// ----------------------------------------------------------------------------- Card / Section
export function Card({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }) {
  const styles = useStyles();
  return <View style={[styles.card, style]} testID={testID}>{children}</View>;
}

export function SectionTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {right}
    </View>
  );
}

export function KV({ k, v, mono, testID }: { k: string; v: string | number | undefined | null; mono?: boolean; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvKey}>{k}</Text>
      <Text style={[styles.kvVal, mono && { fontFamily: MONO }]} testID={testID}>{v === undefined || v === null || v === "" ? "-" : String(v)}</Text>
    </View>
  );
}

export function Mono({ children, style, testID }: { children: React.ReactNode; style?: any; testID?: string }) {
  const styles = useStyles();
  return <Text style={[styles.mono, style]} testID={testID}>{children}</Text>;
}

// ----------------------------------------------------------------------------- Badge
export function Badge({ status, label, tone, testID, big }: { status?: string; label?: string; tone?: Tone; testID?: string; big?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = tone ?? (status ? STATUS_TONE[status] ?? "neutral" : "neutral");
  const c = toneColors(colors, t);
  const text = label ?? (status ? STATUS_LABEL[status] ?? status : "");
  return (
    <View style={[styles.badge, big && styles.badgeBig, { backgroundColor: c.bg, borderColor: c.fg }]} testID={testID}>
      <Text style={[styles.badgeText, big && styles.badgeTextBig, { color: c.fg }]}>{text}</Text>
    </View>
  );
}

// ----------------------------------------------------------------------------- Chips
export function Chips<T extends string>({ options, value, onChange, testID }: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.chipRowWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} testID={testID}>
        {options.map((o) => {
          const sel = o.key === value;
          return (
            <Pressable key={o.key} testID={`${testID ?? "chip"}-${o.key}`} onPress={() => onChange(o.key)} style={[styles.chip, sel && styles.chipSel]}>
              <Text style={[styles.chipText, sel && styles.chipTextSel]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ----------------------------------------------------------------------------- Empty / Loading
export function Empty({ text, icon = "file-tray-outline", testID }: { text: string; icon?: IoniconName; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.empty} testID={testID}>
      <Ionicons name={icon} size={40} color={colors.muted} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={{ padding: 32, alignItems: "center" }}>
      <ActivityIndicator color={colors.brandPrimary} size="large" />
    </View>
  );
}

// ----------------------------------------------------------------------------- Sheet (bottom modal)
export function Sheet({ visible, onClose, title, children, testID, scroll = true }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode; testID?: string; scroll?: boolean }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const maxH = Math.round(height * 0.9) - insets.bottom - insets.top;
  const bodyMax = maxH - 96;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} testID={`${testID ?? "sheet"}-backdrop`} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: maxH }]} testID={testID}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} testID={`${testID ?? "sheet"}-close`}>
              <Ionicons name="close" size={26} color={colors.onSurface} />
            </Pressable>
          </View>
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: bodyMax, flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator>
              {children}
            </ScrollView>
          ) : children}
        </View>
      </View>
    </Modal>
  );
}

export function Confirm({ visible, title, message, onCancel, onConfirm, confirmLabel = "YA, LANJUTKAN", danger, loading, testID = "confirm" }: {
  visible: boolean; title: string; message: string; onCancel: () => void; onConfirm: () => void; confirmLabel?: string; danger?: boolean; loading?: boolean; testID?: string;
}) {
  const styles = useStyles();
  return (
    <Sheet visible={visible} onClose={onCancel} title={title} testID={testID} scroll={false}>
      <Text style={styles.confirmMsg}>{message}</Text>
      <Button title={confirmLabel} variant={danger ? "danger" : "success"} onPress={onConfirm} loading={loading} testID={`${testID}-yes`} />
      <View style={{ height: 8 }} />
      <Button title="BATAL" variant="outline" onPress={onCancel} testID={`${testID}-cancel`} />
    </Sheet>
  );
}

// ----------------------------------------------------------------------------- Toast
type ToastCtx = { show: (msg: string, type?: "success" | "error" | "info") => void };
const ToastContext = createContext<ToastCtx>({ show: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const show = useCallback((msg: string, type: "success" | "error" | "info" = "info") => {
    setToast({ msg, type });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const value = useMemo(() => ({ show }), [show]);
  const bg = toast?.type === "error" ? colors.error : toast?.type === "success" ? colors.success : colors.surfaceInverse;
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View style={{ position: "absolute", left: 16, right: 16, top: insets.top + 12, pointerEvents: "none" }}>
          <View testID="toast" style={{ backgroundColor: bg, padding: 14, borderWidth: 2, borderColor: colors.border }}>
            <Text testID="toast-message" style={{ color: colors.onSurfaceInverse, fontSize: 15, fontWeight: "500" }}>{toast.msg}</Text>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

// ----------------------------------------------------------------------------- Styles
const useStyles = makeStyles((c) => ({
  btn: { minHeight: 52, borderWidth: 2, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  btnSmall: { minHeight: 40, paddingHorizontal: 12 },
  btnText: { fontSize: 15, fontWeight: "500", letterSpacing: 0.5, textTransform: "uppercase" },
  btnTextSmall: { fontSize: 13 },
  inputWrap: { marginBottom: 12 },
  label: { fontSize: 12, color: c.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.6 },
  input: { borderWidth: 2, borderColor: c.border, backgroundColor: c.surface, color: c.onSurface, paddingHorizontal: 12, minHeight: 48, fontSize: 16 },
  inputMulti: { minHeight: 80, paddingTop: 12, textAlignVertical: "top" },
  errorText: { color: c.error, fontSize: 12, marginTop: 4 },
  header: { backgroundColor: c.surfaceInverse, paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 3, borderBottomColor: c.brandPrimary },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  headerTitle: { color: c.onSurfaceInverse, fontSize: 20, fontWeight: "500", letterSpacing: 0.5 },
  headerSub: { color: c.brandPrimary, fontSize: 12, marginTop: 2, fontFamily: MONO },
  card: { borderWidth: 2, borderColor: c.border, backgroundColor: c.surface, padding: 12, marginBottom: 12 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: "500", color: c.onSurface, letterSpacing: 1, textTransform: "uppercase" },
  kvRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, gap: 12 },
  kvKey: { color: c.muted, fontSize: 13, flexShrink: 0 },
  kvVal: { color: c.onSurface, fontSize: 14, textAlign: "right", flex: 1 },
  mono: { fontFamily: MONO, color: c.onSurface, fontSize: 14 },
  badge: { borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  badgeBig: { paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontSize: 11, fontWeight: "500", letterSpacing: 0.5 },
  badgeTextBig: { fontSize: 13 },
  chipRowWrap: { height: 56, justifyContent: "center", backgroundColor: c.surface, borderBottomWidth: 2, borderBottomColor: c.divider },
  chipRow: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  chip: { height: 36, paddingHorizontal: 14, borderWidth: 2, borderColor: c.border, justifyContent: "center", flexShrink: 0, backgroundColor: c.surface },
  chipSel: { backgroundColor: c.surfaceInverse, borderColor: c.surfaceInverse },
  chipText: { fontSize: 13, color: c.onSurface, fontWeight: "500" },
  chipTextSel: { color: c.onSurfaceInverse },
  empty: { alignItems: "center", padding: 32, gap: 12 },
  emptyText: { color: c.muted, fontSize: 15, textAlign: "center" },
  sheetBackdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopWidth: 3, borderTopColor: c.brandPrimary, padding: 16 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: "500", color: c.onSurface, textTransform: "uppercase", letterSpacing: 0.5 },
  confirmMsg: { fontSize: 16, color: c.onSurface, marginBottom: 16, lineHeight: 22 },
}));
