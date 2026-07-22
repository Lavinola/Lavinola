import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  valor: number; // 0-5, puede ser decimal si es solo lectura (promedio)
  onCambiar?: (v: number) => void; // si no se pasa, es de solo lectura
  size?: number;
  conEtiquetas?: boolean; // muestra "Mala/Normal/Buena/Genial/Increíble" debajo, estrellas más grandes
}

const ETIQUETAS_ES = ["Mala", "Normal", "Buena", "Genial", "Increíble"];

export default function StarRating({ valor, onCambiar, size = 22, conEtiquetas }: Props) {
  const { t } = useT();
  const soloLectura = !onCambiar;

  if (conEtiquetas) {
    const tamano = size ?? 34;
    return (
      <View style={styles.boxConEtiquetas}>
        <View style={styles.rowEtiquetas}>
          {[1, 2, 3, 4, 5].map((n) => {
            const lleno = valor >= n - 0.25;
            return (
              <Pressable key={n} disabled={soloLectura} onPress={() => onCambiar?.(n)} hitSlop={4} style={styles.columnaEtiqueta}>
                <Text style={{ fontSize: tamano, color: lleno ? theme.colors.primaryLight : theme.colors.border }}>★</Text>
                <Text style={styles.etiquetaTexto}>{t(ETIQUETAS_ES[n - 1])}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => {
        const lleno = valor >= n - 0.25;
        return (
          <Pressable key={n} disabled={soloLectura} onPress={() => onCambiar?.(n)} hitSlop={4}>
            <Text style={{ fontSize: size, color: lleno ? theme.colors.primaryLight : theme.colors.border }}>★</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 2 },
  boxConEtiquetas: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, paddingVertical: 20, paddingHorizontal: 4 },
  rowEtiquetas: { flexDirection: "row", justifyContent: "space-around" },
  columnaEtiqueta: { alignItems: "center", flex: 1 },
  etiquetaTexto: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6, fontWeight: "700", textTransform: "uppercase", textAlign: "center" },
});
