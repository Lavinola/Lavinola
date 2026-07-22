import React, { useEffect, useState } from "react";
import { View, FlatList, TextInput, Pressable, StyleSheet } from "react-native";
import { Text, AppButton } from "../components/Themed";
import { listarSugerencias, responderSugerencia, Sugerencia } from "../lib/suggestions";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function AdminSuggestionsScreen() {
  const { t } = useT();
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  const [texto, setTexto] = useState("");

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setSugerencias(await listarSugerencias());
  }

  async function enviar(id: string) {
    if (!texto.trim()) return;
    await responderSugerencia(id, texto.trim());
    setTexto("");
    setRespondiendo(null);
    cargar();
  }

  return (
    <FlatList
      data={sugerencias}
      keyExtractor={(s) => s.id}
      contentContainerStyle={{ padding: 12 }}
      ListEmptyComponent={<Text style={styles.vacio}>No hay sugerencias todavía.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.autor}>{item.autor_username ?? "Usuario"}</Text>
          <Text style={styles.contenido}>{item.content}</Text>

          {item.admin_reply ? (
            <View style={styles.respuestaBox}>
              <Text style={styles.respuestaLabel}>Tu respuesta:</Text>
              <Text style={styles.respuestaTexto}>{item.admin_reply}</Text>
            </View>
          ) : respondiendo === item.id ? (
            <View style={{ marginTop: 8 }}>
              <TextInput
                style={styles.input}
                placeholder={t("Tu respuesta...")}
                placeholderTextColor={theme.colors.textFaint}
                value={texto}
                onChangeText={setTexto}
                multiline
              />
              <AppButton title="Enviar respuesta" onPress={() => enviar(item.id)} />
            </View>
          ) : (
            <Pressable onPress={() => setRespondiendo(item.id)}>
              <Text style={styles.link}>Responder</Text>
            </Pressable>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24 },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 12, marginBottom: 10 },
  autor: { fontSize: 12, fontWeight: "700", color: theme.colors.textMuted },
  contenido: { fontSize: 14, marginTop: 4 },
  link: { color: theme.colors.primaryLight, fontSize: 13, marginTop: 8 },
  input: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.background, color: theme.colors.text, borderRadius: theme.radius.md, padding: 10, marginBottom: 8, minHeight: 60 },
  respuestaBox: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, paddingTop: 8 },
  respuestaLabel: { fontSize: 11, color: theme.colors.textMuted },
  respuestaTexto: { fontSize: 13, color: theme.colors.primaryLight, marginTop: 2 },
});
