import React from "react";
import { View, Pressable, Image, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { MOODS } from "../lib/moods";
import { theme } from "../theme";

interface Props {
  misMoods: string[];
  porcentajes: Record<string, number>;
  onElegir: (mood: string) => void;
}

/**
 * Grilla de 12 caritas de ánimo, en 2 filas de 6, con la palabra completa
 * abajo de cada una. Antes se probó con posición absoluta para que la
 * palabra "coma" espacio de los vecinos, pero esa clase de truco no se
 * comporta igual en la web — acá se resolvió distinto y de forma más
 * robusta: cada casillero NO tiene un ancho fijo, mide lo que necesite su
 * propio contenido (el círculo o la palabra, lo que sea más ancho), y la
 * fila los acomoda con espacio parejo entre sí — así una palabra larga
 * como "ENTRETENIDO" empuja de forma natural a sus vecinos, sin
 * necesidad de achicar la letra ni de posicionar nada a mano.
 *
 * Se pueden elegir hasta 2 caritas (no una sola) — tocar una ya elegida
 * la saca; si ya hay 2 y se toca una tercera, se resuelve solo en
 * elegirMood (se reemplaza la más vieja).
 */
export default function MoodPicker({ misMoods, porcentajes, onElegir }: Props) {
  const yaVoto = misMoods.length > 0;
  const filas = [MOODS.slice(0, 6), MOODS.slice(6, 12)];

  return (
    <View>
      {filas.map((fila, i) => (
        <View key={i} style={styles.fila}>
          {fila.map((m) => {
            const elegida = misMoods.includes(m.key);
            return (
              <Pressable key={m.key} style={styles.celda} onPress={() => onElegir(m.key)}>
                <View style={[styles.circulo, elegida && styles.circuloElegido]}>
                  <Image source={m.imagen} style={styles.carita} resizeMode="contain" />
                </View>
                <Text style={[styles.label, elegida && styles.labelElegido]} numberOfLines={1}>
                  {m.label}
                </Text>
                {yaVoto && <Text style={styles.porcentaje}>{porcentajes[m.key] ?? 0}%</Text>}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  celda: { alignItems: "center", paddingHorizontal: 2 },
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
  label: { fontSize: 9, color: theme.colors.textMuted, marginTop: 5, textAlign: "center", textTransform: "uppercase", fontWeight: "700" },
  labelElegido: { color: theme.colors.primaryLight },
  porcentaje: { fontSize: 10, color: theme.colors.textFaint, marginTop: 2 },
});
