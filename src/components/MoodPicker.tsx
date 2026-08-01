import React from "react";
import { View, Pressable, Image, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { MOODS } from "../lib/moods";
import { theme } from "../theme";

interface Props {
  miMood: string | null;
  porcentajes: Record<string, number>;
  onElegir: (mood: string) => void;
}

/**
 * Grilla de 12 caritas de ánimo, 2 filas de 6, con la palabra completa abajo
 * de cada una. Una vez que el usuario eligió una, se muestra el porcentaje
 * que sacó cada opción entre todos los usuarios que vieron este título.
 *
 * La palabra de abajo NO se achica para entrar — en vez de eso, se le da un
 * ancho más grande que el propio casillero (position: absolute, centrada),
 * así "come" un poco del espacio de los casilleros vecinos cuando hace
 * falta (ej. "ENTRETENIDO"), sin afectar el tamaño ni la posición de sus
 * círculos. El "labelSpacer" de abajo reserva el lugar en el flujo normal
 * para que no se pise con el porcentaje.
 */
export default function MoodPicker({ miMood, porcentajes, onElegir }: Props) {
  const yaVoto = !!miMood;
  return (
    <View style={styles.grid}>
      {MOODS.map((m) => {
        const elegida = miMood === m.key;
        return (
          <Pressable key={m.key} style={styles.celda} onPress={() => onElegir(m.key)}>
            <View style={[styles.circulo, elegida && styles.circuloElegido]}>
              <Image source={m.imagen} style={styles.carita} resizeMode="contain" />
            </View>
            <View style={styles.labelSpacer} />
            <Text style={[styles.label, elegida && styles.labelElegido]} numberOfLines={1}>
              {m.label}
            </Text>
            {yaVoto && <Text style={styles.porcentaje}>{porcentajes[m.key] ?? 0}%</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap" },
  celda: { width: "16.66%", alignItems: "center", marginBottom: 16, paddingHorizontal: 1, position: "relative" },
  circulo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  circuloElegido: { borderColor: theme.colors.primaryLight, backgroundColor: theme.colors.primaryDark },
  carita: { width: 45, height: 45 },
  labelSpacer: { height: 12, marginTop: 5 },
  label: {
    position: "absolute",
    top: 61, // 56 (círculo) + 5 (el mismo margen que tenía el spacer)
    left: -25,
    right: -25, // ancla los dos bordes en vez de centrar por margen — más confiable en la web
    fontSize: 9,
    color: theme.colors.textMuted,
    textAlign: "center",
    textTransform: "uppercase",
    fontWeight: "700",
  },
  labelElegido: { color: theme.colors.primaryLight },
  porcentaje: { fontSize: 10, color: theme.colors.textFaint, marginTop: 2 },
});
