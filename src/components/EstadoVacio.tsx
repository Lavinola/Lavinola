import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

/**
 * Estado vacío estándar de la app — un ícono simple arriba del texto, en
 * vez de solo texto gris colgado en el medio de la pantalla. Se usa en
 * cualquier lista que puede no tener nada: notificaciones, guardados,
 * listas, resultados de búsqueda, favoritos, etc.
 */
export default function EstadoVacio({
  icono,
  titulo,
  subtitulo,
  compacto,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  titulo: string;
  subtitulo?: string;
  compacto?: boolean; // para cuando el estado vacío va DENTRO de otro contenido (no ocupa toda la pantalla) — menos margen
}) {
  return (
    <View style={[styles.wrap, compacto && styles.wrapCompacto]}>
      <Ionicons name={icono} size={40} color={theme.colors.textFaint} />
      <Text style={styles.titulo}>{titulo}</Text>
      {!!subtitulo && <Text style={styles.subtitulo}>{subtitulo}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", marginTop: 48, paddingHorizontal: 32 },
  wrapCompacto: { marginTop: 24, paddingHorizontal: 16 },
  titulo: { textAlign: "center", color: theme.colors.textMuted, marginTop: 12, fontSize: 15, fontWeight: "600" },
  subtitulo: { textAlign: "center", color: theme.colors.textFaint, marginTop: 4, fontSize: 13 },
});
