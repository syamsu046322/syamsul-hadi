import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceInverse }} testID="splash-loading">
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }
  return <Redirect href={user ? "/(tabs)" : "/login"} />;
}
