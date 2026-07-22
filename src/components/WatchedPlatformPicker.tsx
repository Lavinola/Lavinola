import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  opciones: string[]; // nombres de plataformas (de "Dónde verlo"), sin "Otro"
  valor: string | null;
  onCambiar: (plataforma: string) => void;
}

export default function WatchedPlatformPicker({ opciones, valor, onCambiar }: Props) {
  const { t } = useT();
  const todasLasOpciones = [...opciones, t("Otro")];

  return (
    <View>
      <Text style={styles.label}>{t("¿Dónde lo viste?")}</Text>
      <View style={styles.row}>
        {todasLasOpciones.map((opcion) => (
          <Pressable
            key={opcion}
            onPress={() => onCambiar(opcion)}
            style={[styles.chip, valor === opcion && styles.chipActivo]}
          >
            <Text style={[styles.chipTexto, valor === opcion && styles.chipTextoActivo]}>{opcion}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 8, marginTop: 16 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border },
  chipActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipTexto: { fontSize: 12, color: theme.colors.textMuted },
  chipTextoActivo: { color: "#000000", fontWeight: "700" },
});
