import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Themed";
import { EstadoUsername } from "../lib/username";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function UsernameEstadoIndicador({ estado }: { estado: EstadoUsername }) {
  const { t } = useT();

  if (estado === "vacio") return null;

  if (estado === "revisando") {
    return (
      <View style={styles.fila}>
        <ActivityIndicator size="small" color={theme.colors.textMuted} />
      </View>
    );
  }

  if (estado === "disponible") {
    return (
      <View style={styles.fila}>
        <Ionicons name="checkmark-circle" size={18} color="#4CD964" />
        <Text style={[styles.texto, { color: "#4CD964" }]}>{t("Disponible")}</Text>
      </View>
    );
  }

  if (estado === "ocupado") {
    return (
      <View style={styles.fila}>
        <Ionicons name="close-circle" size={18} color={theme.colors.danger} />
        <Text style={[styles.texto, { color: theme.colors.danger }]}>{t("Ya está en uso")}</Text>
      </View>
    );
  }

  if (estado === "muy_corto") {
    return (
      <View style={styles.fila}>
        <Text style={[styles.texto, { color: theme.colors.textFaint }]}>{t("Mínimo 3 caracteres")}</Text>
      </View>
    );
  }

  // invalido
  return (
    <View style={styles.fila}>
      <Ionicons name="close-circle" size={18} color={theme.colors.danger} />
      <Text style={[styles.texto, { color: theme.colors.danger }]}>{t("Solo letras, números, puntos o guiones bajos")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4, marginBottom: 6 },
  texto: { fontSize: 11.5, fontWeight: "600" },
});
