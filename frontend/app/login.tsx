import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, Input } from "@/src/components/ui";
import { api } from "@/src/api";
import { logoUri } from "@/src/shop";
import { makeStyles } from "@/src/theme";
import { useQuery } from "@tanstack/react-query";

const HERO = "https://images.unsplash.com/photo-1517524206127-48bbd363f3d7?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

export default function Login() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();
  const shop = useQuery({ queryKey: ["shop"], queryFn: () => api<any>("/shop"), retry: false });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) { setError("Username dan password wajib diisi"); return; }
    setLoading(true); setError("");
    try {
      await login(username.trim().toLowerCase(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message ?? "Login gagal");
    } finally { setLoading(false); }
  };

  return (
    <View style={styles.root} testID="login-screen">
      <KeyboardAwareScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <View style={styles.hero}>
          <Image source={{ uri: HERO }} style={styles.heroImg} contentFit="cover" transition={300} />
          <View style={[styles.heroOverlay, { paddingTop: insets.top + 24 }]}>
            <View style={styles.logoBox}><Image source={{ uri: logoUri(shop.data?.logo_version) }} style={{ width: 72, height: 72 }} contentFit="contain" transition={200} /></View>
            <Text style={styles.brand}>{shop.data?.name ?? "KLINIK SUEL MOTOR"}</Text>
            <Text style={styles.tag}>Sistem Manajemen Bengkel</Text>
          </View>
        </View>
        <View style={[styles.form, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.title}>MASUK</Text>
          <Input label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="username" testID="login-username-input" returnKeyType="next" />
          <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" testID="login-password-input" returnKeyType="go" onSubmitEditing={submit} />
          {error ? <Text style={styles.error} testID="login-error-text">{error}</Text> : null}
          <Button title="MASUK" onPress={submit} loading={loading} testID="login-submit-button" style={{ minHeight: 60 }} />
          <Text style={styles.hint}>Owner · Kasir · Mekanik · Partman</Text>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { height: 300, backgroundColor: c.surfaceInverse },
  heroImg: { position: "absolute", width: "100%", height: "100%", opacity: 0.45 },
  heroOverlay: { flex: 1, padding: 24, justifyContent: "flex-end" },
  logoBox: { width: 80, height: 80, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.brandPrimary, marginBottom: 12 },
  brand: { color: c.onSurfaceInverse, fontSize: 28, fontWeight: "500", letterSpacing: 1 },
  tag: { color: c.brandPrimary, fontSize: 14, marginTop: 4, letterSpacing: 1 },
  form: { padding: 24, borderTopWidth: 4, borderTopColor: c.brandPrimary },
  title: { fontSize: 22, fontWeight: "500", color: c.onSurface, marginBottom: 16, letterSpacing: 2 },
  error: { color: c.error, marginBottom: 12, fontSize: 14 },
  hint: { color: c.muted, textAlign: "center", marginTop: 16, fontSize: 12, letterSpacing: 1 },
}));
