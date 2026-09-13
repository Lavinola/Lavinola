import React from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { Text } from "./Themed";
import { useT } from "../i18n/i18n";

interface Props {
  temporada: number;
  capitulo: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * "T2 E4" (o "S2 E4" en inglés/italiano) — hasta qué capítulo vas de una
 * serie. Solo tiene sentido mostrarlo sobre series con la barrita
 * amarilla (estado "viendo" o "abandonada"); eso lo decide quien use este
 * componente, no el componente en sí. La posición (arriba a la izquierda
 * en grilla, al lado en modo lista) también la define quien lo llama, vía
 * `style`.
 */
export default function UltimoCapituloBadge({ temporada, capitulo, style }: Props) {
  const { idioma } = useT();
  const prefijo = idioma === "en" || idioma === "it" ? "S" : "T";
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.texto}>{`${prefijo}${temporada} E${capitulo}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  texto: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
});
