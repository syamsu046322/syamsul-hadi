import Ionicons from "@react-native-vector-icons/ionicons";
import { Redirect, Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import React from "react";
import { Platform } from "react-native";

import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme";

const isIOS26 = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;

export default function TabsLayout() {
  const { user, loading, can } = useAuth();
  const { colors } = useTheme();
  if (!loading && !user) return <Redirect href="/login" />;
  const showStok = can("partman", "mekanik");
  const showAntrian = can("kasir", "mekanik");

  if (isIOS26) {
    return (
      <NativeTabs tintColor={colors.brandPrimary}>
        <NativeTabs.Trigger name="index"><NativeTabs.Trigger.Icon sf="house.fill" /><NativeTabs.Trigger.Label>Beranda</NativeTabs.Trigger.Label></NativeTabs.Trigger>
        <NativeTabs.Trigger name="antrian" hidden={!showAntrian}><NativeTabs.Trigger.Icon sf="list.bullet.rectangle" /><NativeTabs.Trigger.Label>Antrian</NativeTabs.Trigger.Label></NativeTabs.Trigger>
        <NativeTabs.Trigger name="stok" hidden={!showStok}><NativeTabs.Trigger.Icon sf="shippingbox.fill" /><NativeTabs.Trigger.Label>Stok</NativeTabs.Trigger.Label></NativeTabs.Trigger>
        <NativeTabs.Trigger name="lainnya"><NativeTabs.Trigger.Icon sf="ellipsis.circle" /><NativeTabs.Trigger.Label>Lainnya</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surfaceInverse, borderTopWidth: 2, borderTopColor: colors.brandPrimary, ...(Platform.OS === "web" ? { height: 64 } : {}) },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500", letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Beranda", tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="antrian" options={{ title: "Antrian", href: showAntrian ? undefined : null, tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} /> }} />
      <Tabs.Screen name="stok" options={{ title: "Stok", href: showStok ? undefined : null, tabBarIcon: ({ color, size }) => <Ionicons name="cube" size={size} color={color} /> }} />
      <Tabs.Screen name="lainnya" options={{ title: "Lainnya", tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal-circle" size={size} color={color} /> }} />
    </Tabs>
  );
}
