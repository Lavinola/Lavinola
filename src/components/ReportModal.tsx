import React, { useState } from "react";
import { Modal, View, Pressable, TextInput, StyleSheet } from "react-native";
import { Alert } from "../lib/alert";
import { Text, AppButton } from "./Themed";
import { reportar, TargetReportable } from "../lib/reports";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

const MOTIVOS = ["Spam o venta ilegal", "Contenido inapropiado", "Acoso o bullying", "Discurso de odio", "Suplantación de identidad", "Otro"];

interface Props {
  visible: boolean;
  onCerrar: () => void;
  reporterId: string | null;
  targetType: TargetReportable;
  targetId: string;
}

export default function ReportModal({ visible, onCerrar, reporterId, targetType, targetId }: Props) {
  const { t } = useT();
  const [motivo, setMotivo] = useState<string | null>(null);
  const [detalle, setDetalle] = useState("");
  const [enviando, setEnviando] = useState(false);

  function reset() {
    setMotivo(null);
    setDetalle("");
    setEnviando(false);
  }

  function cerrar() {
    reset();
    onCerrar();
  }

  async function enviar() {
    if (!reporterId || !motivo) return;
    setEnviando(true);
    try {
      await reportar({ reporterId, targetType, targetId, reason: motivo, details: detalle });
      cerrar();
      Alert.alert(t("Gracias"), t("Denuncia enviada, la va a revisar un admin."));
    } catch (e: any) {
      Alert.alert(t("No se pudo enviar"), e.message);
      setEnviando(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cerrar}>
      <Pressable style={styles.fondo} onPress={cerrar}>
        <Pressable style={styles.hoja} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.titulo}>{t("¿Por qué lo estás denunciando?")}</Text>

          {MOTIVOS.map((m) => (
            <Pressable key={m} style={styles.opcion} onPress={() => setMotivo(m)}>
              <View style={[styles.radio, motivo === m && styles.radioActivo]}>{motivo === m && <View style={styles.radioPunto} />}</View>
              <Text style={styles.opcionTexto}>{t(m)}</Text>
            </Pressable>
          ))}

          <Text style={styles.label}>{t("Contanos qué pasó (opcional)")}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("Detalles para el admin...")}
            placeholderTextColor={theme.colors.textFaint}
            value={detalle}
            onChangeText={setDetalle}
            multiline
            maxLength={500}
          />

          <View style={{ height: 8 }} />
          <AppButton title={enviando ? t("Enviando...") : t("Enviar denuncia")} onPress={enviar} disabled={!motivo || enviando} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  hoja: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, padding: 20 },
  titulo: { fontSize: 15, fontWeight: "700", marginBottom: 12 },
  opcion: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center", marginRight: 10 },
  radioActivo: { borderColor: theme.colors.primary },
  radioPunto: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.primary },
  opcionTexto: { fontSize: 14, color: theme.colors.text },
  label: { fontSize: 12, color: theme.colors.textMuted, marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    padding: 10,
    minHeight: 70,
    textAlignVertical: "top",
  },
});
