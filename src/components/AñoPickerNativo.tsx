import React, { useState } from "react";
import { Modal, View, TextInput, Pressable, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  value: number; // año inicial que muestra el input
  minimumYear?: number;
  maximumYear?: number;
  onElegido: (año: number) => void;
  onCerrar: () => void;
}

/**
 * Mismo estilo y mecánica que FechaPickerNativo, pero pidiendo solo el
 * año — para "No sé la fecha exacta, elegir el año".
 */
export default function AñoPickerNativo({ value, minimumYear, maximumYear, onElegido, onCerrar }: Props) {
  const { t } = useT();
  const [anio, setAnio] = useState(String(value));
  const [error, setError] = useState(false);

  function confirmar() {
    const a = parseInt(anio, 10);
    if (!a || a < 1900 || a > 9999) {
      setError(true);
      return;
    }
    if (maximumYear != null && a > maximumYear) {
      setError(true);
      return;
    }
    if (minimumYear != null && a < minimumYear) {
      setError(true);
      return;
    }
    onElegido(a);
    onCerrar();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.caja} onPress={() => {}}>
          <Text style={styles.titulo}>{t("Elegir año")}</Text>
          <View style={styles.filaInputs}>
            <TextInput
              style={styles.inputAnio}
              value={anio}
              onChangeText={(v) => {
                setError(false);
                setAnio(v.replace(/[^0-9]/g, ""));
              }}
              keyboardType="number-pad"
              placeholder={t("AAAA")}
              placeholderTextColor={theme.colors.textFaint}
              maxLength={4}
              autoFocus
            />
          </View>
          {error && <Text style={styles.errorTexto}>{t("Año inválido")}</Text>}
          <View style={styles.botonesRow}>
            <Pressable style={styles.btnCancelar} onPress={onCerrar}>
              <Text style={styles.btnCancelarTexto}>{t("Cancelar")}</Text>
            </Pressable>
            <Pressable style={styles.btnConfirmar} onPress={confirmar}>
              <Text style={styles.btnConfirmarTexto}>{t("Confirmar")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 20 },
  caja: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 20, width: "100%", maxWidth: 320 },
  titulo: { fontSize: 16, fontWeight: "700", marginBottom: 16, textAlign: "center" },
  filaInputs: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  inputAnio: {
    width: 100,
    textAlign: "center",
    fontSize: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceAlt,
  },
  errorTexto: { color: "#E05555", fontSize: 12, textAlign: "center", marginTop: 10 },
  botonesRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  btnCancelar: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border },
  btnCancelarTexto: { color: theme.colors.textMuted, fontWeight: "700", fontSize: 14 },
  btnConfirmar: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 8, backgroundColor: theme.colors.primary },
  btnConfirmarTexto: { color: "#000000", fontWeight: "700", fontSize: 14 },
});
