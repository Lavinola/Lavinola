import React, { useCallback, useState } from "react";
import { View, Image, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Themed";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { contarNoLeidas } from "../lib/notificationsFeed";
import { abrirAyuda } from "../lib/onboarding";
import { theme } from "../theme";

export default function AppHeader({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const [noLeidas, setNoLeidas] = useState(0);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [])
  );

  async function cargar() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    setNoLeidas(await contarNoLeidas(uid));
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8, height: 56 + insets.top }]}>
      <View style={[styles.lado, { flexDirection: "row", alignItems: "center" }]}>
        <Image source={require("../../assets/logo-wordmark.png")} style={styles.wordmark} resizeMode="contain" />
        <Pressable onPress={abrirAyuda} hitSlop={10} style={styles.ayudaBtn}>
          <Text style={styles.ayudaTexto}>?</Text>
        </Pressable>
      </View>

      <View style={styles.centro}>
        <Image source={require("../../assets/logo-icon-only.png")} style={styles.icono} resizeMode="contain" />
      </View>

      <View style={[styles.lado, { alignItems: "flex-end", flexDirection: "row", justifyContent: "flex-end", gap: 4 }]}>
        <Pressable onPress={() => navigation.navigate("BuscadorGlobal")} hitSlop={12} style={styles.campanaBtn}>
          {({ pressed }) => <Ionicons name="search" size={22} color={pressed ? theme.colors.primaryLight : theme.colors.textMuted} />}
        </Pressable>
        <Pressable onPress={() => navigation.navigate("Notificaciones")} hitSlop={12} style={styles.campanaBtn}>
          <Ionicons name="notifications" size={24} color={theme.colors.primaryLight} />
          {noLeidas > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeTexto}>{noLeidas > 9 ? "9+" : noLeidas}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  lado: { flex: 1, justifyContent: "center" },
  centro: { alignItems: "center", justifyContent: "center" },
  wordmark: { width: 110, height: 30 },
  ayudaBtn: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    borderWidth: 1.2,
    borderColor: theme.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
    alignSelf: "flex-end",
    marginBottom: 2,
  },
  ayudaTexto: { fontSize: 9, fontWeight: "800", color: theme.colors.primaryLight, lineHeight: 10 },
  icono: { width: 40, height: 28 },
  campanaBtn: { padding: 10 },
  badge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#E8E8E8",
    borderWidth: 1,
    borderColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  badgeTexto: { color: theme.colors.background, fontSize: 9, fontWeight: "700" },
});
