import React, { useState } from "react";
import { View, TextInput, StyleSheet, Alert } from "react-native";
import { Text, AppButton } from "../components/Themed";
import { crearAnuncio } from "../lib/announcements";
import ConfirmModal from "../components/ConfirmModal";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function AdminBroadcastScreen({ navigation }: any) {
  const { t } = useT();
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  function pedirConfirmacion() {
    if (!mensaje.trim()) return;
    setConfirmVisible(true);
  }

  async function enviar() {
    setEnviando(true);
    const resultado = await crearAnuncio(mensaje.trim());
    setEnviando(false);
    if (resultado.ok) {
      Alert.alert("Enviado", "El anuncio ya está visible para todos.");
      navigation.goBack();
    } else {
      Alert.alert("Error", resultado.motivo ?? "No se pudo enviar.");
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Anuncio para toda la comunidad</Text>
      <Text style={styles.subtitulo}>
        Se muestra a todos los usuarios dentro de la app, y les llega como push a quienes tengan notificaciones
        activadas.
      </Text>
      <TextInput
        style={styles.input}
        value={mensaje}
        onChangeText={setMensaje}
        placeholder={t("Escribí el mensaje...")}
        placeholderTextColor={theme.colors.textFaint}
        multiline
        maxLength={500}
      />
      <AppButton title={enviando ? "Enviando..." : "Mandar a todos"} onPress={pedirConfirmacion} disabled={enviando} variant="danger" />
      <ConfirmModal
        visible={confirmVisible}
        onCerrar={() => setConfirmVisible(false)}
        titulo="Confirmar envío"
        mensaje="Esto le va a llegar a TODOS los usuarios (push + visible en la app). ¿Mandar?"
        botones={[
          { label: "Cancelar", onPress: () => {} },
          { label: "Mandar a todos", onPress: enviar, destacado: true },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  titulo: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  subtitulo: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 16 },
  input: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: 12, minHeight: 120, textAlignVertical: "top", marginBottom: 16 },
});
