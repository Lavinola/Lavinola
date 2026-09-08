import React from "react";
import { View, Image, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { MOODS } from "../lib/moods";
import { MoodVotado } from "../lib/stats";
import { theme } from "../theme";

interface Props {
  moodsVotados: MoodVotado[];
}

/**
 * Igual estética que MoodPicker (las 12 caritas, 2 filas de 6), pero de
 * solo lectura — para mostrar en Estadísticas qué % de tus propias
 * reacciones le tocó a cada una. A diferencia de MoodPicker (que mide
 * layouts para animar un subrayado), acá no hace falta nada de eso.
 */
export default function MoodsStatsGrid({ moodsVotados }: Props) {
  const porcentajePorKey = new Map(moodsVotados.map((m) => [m.key, m.porcentaje]));
  const filas = [MOODS.slice(0, 6), MOODS.slice(6, 12)];

  return (
    <View>
      {filas.map((fila, i) => (
        <View key={i} style={styles.fila}>
          {fila.map((m) => (
            <View key={m.key} style={styles.celda}>
              <View style={styles.circulo}>
                <Image source={m.imagen} style={styles.carita} resizeMode="contain" />
              </View>
              <Text style={styles.label} numberOfLines={1}>
                {m.label}
              </Text>
              <Text style={styles.porcentaje}>{porcentajePorKey.get(m.key) ?? 0}%</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  celda: { alignItems: "center", paddingHorizontal: 1 },
  circulo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  carita: { width: 34, height: 34 },
  label: { fontSize: 8, color: theme.colors.textMuted, marginTop: 4, textAlign: "center", textTransform: "uppercase", fontWeight: "700" },
  porcentaje: { fontSize: 11, color: theme.colors.primaryLight, fontWeight: "800", marginTop: 2 },
});
