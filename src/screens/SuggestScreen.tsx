import React, { useState } from "react";
import { View, TextInput, StyleSheet, Alert } from "react-native";
import { Text, AppButton } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { enviarSugerencia } from "../lib/suggestions";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function SuggestScreen({ navigation }: any) {
  const { t } = useT();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      await enviarSugerencia(userId, texto.trim());
      Alert.alert(t("¡Gracias!"), t("Tu idea le llega directo al admin."));
      navigation.goBack();
    } catch (e: any) {
      Alert.alert(t("Error"), e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>{t("Sugerí una mejora")}</Text>
      <Text style={styles.subtitulo}>
        {t("Esto le llega directo al admin de Lavinola. Contanos qué cambiarías, qué te falta, o qué no te convence.")}
      </Text>
      <TextInput
        style={styles.input}
        value={texto}
        onChangeText={setTexto}
        placeholder={t("Tu idea...")}
        placeholderTextColor={theme.colors.textFaint}
        multiline
        maxLength={1000}
      />
      <AppButton title={enviando ? t("Enviando...") : t("Enviar")} onPress={enviar} disabled={enviando} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  titulo: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  subtitulo: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    padding: 12,
    minHeight: 140,
    textAlignVertical: "top",
    marginBottom: 16,
  },
});
