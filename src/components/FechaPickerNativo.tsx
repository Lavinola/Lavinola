import React, { useState } from "react";
import { Modal, View, TextInput, Pressable, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  value: Date;
  maximumDate?: Date;
  onElegida: (fecha: Date) => void;
  onCerrar: () => void;
}

/**
 * Picker de fecha propio, hecho 100% con componentes de React Native —
 * así funciona igual, garantizado, en web y en la app nativa. Antes
 * usábamos @react-native-community/datetimepicker (no dibuja nada en
 * web) y después un <input type="date"> del navegador (podía chocar con
 * el modal que lo abre según el navegador) — ninguno de los dos daba
 * una experiencia confiable en todas las plataformas a la vez.
 */
export default function FechaPickerNativo({ value, maximumDate, onElegida, onCerrar }: Props) {
  const { t } = useT();
  const [dia, setDia] = useState(String(value.getDate()));
  const [mes, setMes] = useState(String(value.getMonth() + 1));
  const [anio, setAnio] = useState(String(value.getFullYear()));
  const [error, setError] = useState(false);

  function confirmar() {
    const d = parseInt(dia, 10);
    const m = parseInt(mes, 10);
    const a = parseInt(anio, 10);
    if (!d || !m || !a || d < 1 || d > 31 || m < 1 || m > 12 || a < 1900 || a > 9999) {
      setError(true);
      return;
    }
    const fecha = new Date(a, m - 1, d);
    // Si el día no existe en ese mes (ej: 31 de febrero), JS "corrige" solo
    // corriéndose de mes — lo detectamos comparando que el mes no haya cambiado.
    if (isNaN(fecha.getTime()) || fecha.getMonth() !== m - 1) {
      setError(true);
      return;
    }
    if (maximumDate) {
      const maxSinHora = new Date(maximumDate);
      maxSinHora.setHours(23, 59, 59, 999);
      if (fecha > maxSinHora) {
        setError(true);
        return;
      }
    }
    onElegida(fecha);
    onCerrar();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.caja} onPress={() => {}}>
          <Text style={styles.titulo}>{t("Elegir fecha")}</Text>
          <View style={styles.filaInputs}>
            <TextInput
              style={styles.inputDiaMes}
              value={dia}
              onChangeText={(v) => {
                setError(false);
                setDia(v.replace(/[^0-9]/g, ""));
              }}
              keyboardType="number-pad"
              placeholder={t("DD")}
              placeholderTextColor={theme.colors.textFaint}
              maxLength={2}
            />
            <Text style={styles.separador}>/</Text>
            <TextInput
              style={styles.inputDiaMes}
              value={mes}
              onChangeText={(v) => {
                setError(false);
                setMes(v.replace(/[^0-9]/g, ""));
              }}
              keyboardType="number-pad"
              placeholder="MM"
              placeholderTextColor={theme.colors.textFaint}
              maxLength={2}
            />
            <Text style={styles.separador}>/</Text>
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
            />
          </View>
          {error && <Text style={styles.errorTexto}>{t("Fecha inválida")}</Text>}
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
  inputDiaMes: {
    width: 52,
    textAlign: "center",
    fontSize: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceAlt,
  },
  inputAnio: {
    width: 76,
    textAlign: "center",
    fontSize: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceAlt,
  },
  separador: { fontSize: 18, color: theme.colors.textMuted },
  errorTexto: { color: "#E05555", fontSize: 12, textAlign: "center", marginTop: 10 },
  botonesRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  btnCancelar: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border },
  btnCancelarTexto: { color: theme.colors.textMuted, fontWeight: "700", fontSize: 14 },
  btnConfirmar: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 8, backgroundColor: theme.colors.primary },
  btnConfirmarTexto: { color: "#000000", fontWeight: "700", fontSize: 14 },
});
