import React from "react";
import { View, StyleSheet } from "react-native";
import { SeriesStatusFilter } from "../types";
import { theme } from "../theme";

interface Props {
  estado: SeriesStatusFilter;
  porcentaje: number; // 0-100
}

/**
 * - "viendo" / "abandonada": barra amarilla, llena según % de capítulos vistos.
 * - "al_dia": barra verde completa (al día, la serie sigue en emisión).
 * - "terminada": barra violeta completa (la viste toda y la serie ya terminó para siempre).
 * - "sin_comenzar": sin barra.
 */
export default function SeriesProgressBar({ estado, porcentaje }: Props) {
  if (estado === "sin_comenzar") return <View style={styles.track} />;

  const color = estado === "terminada" ? theme.colors.primary : estado === "al_dia" ? theme.colors.success : "#E0B22E";
  const ancho = estado === "terminada" || estado === "al_dia" ? 100 : Math.max(6, porcentaje);

  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${ancho}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, backgroundColor: theme.colors.surfaceAlt, overflow: "hidden", marginTop: 4 },
  fill: { height: "100%", borderRadius: 2 },
});
