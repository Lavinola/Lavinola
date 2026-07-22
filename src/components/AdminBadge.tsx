import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { theme } from "../theme";

export default function AdminBadge() {
  return (
    <View style={styles.badge}>
      <Text style={styles.texto}>ADMIN</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 6 },
  texto: { color: "#FFFFFF", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
});
