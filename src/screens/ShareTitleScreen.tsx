import React, { useEffect, useState } from "react";
import { View, TextInput, FlatList, Pressable, Image, StyleSheet } from "react-native";
import { Alert } from "../lib/alert";
import { supabase } from "../lib/supabase";
import { usuariosQueSigo, UsuarioBasico } from "../lib/follows";
import { compartirTitulo, LIMITE_NOTA } from "../lib/sharedTitles";
import { Text } from "../components/Themed";
import { theme } from "../theme";

interface Props {
  route: any;
  navigation: any;
}

export default function ShareTitleScreen({ route, navigation }: Props) {
  const { itemType, tmdbId, tituloNombre } = route.params;
  const [siguiendo, setSiguiendo] = useState<UsuarioBasico[]>([]);
  const [destinatario, setDestinatario] = useState<UsuarioBasico | null>(null);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const lista = await usuariosQueSigo(data.user.id);
      setSiguiendo(lista);
    });
  }, []);

  async function enviar() {
    if (!destinatario) return;
    setEnviando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      await compartirTitulo({
        senderId: userId,
        receiverId: destinatario.id,
        itemType,
        tmdbId,
        note: nota.trim() || undefined,
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("No se pudo enviar", e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Compartir "{tituloNombre}"</Text>

      {!destinatario ? (
        <>
          <Text style={styles.label}>Elegí a quién enviárselo (de la gente que seguís):</Text>
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={siguiendo}
            keyExtractor={(u) => u.id}
            ListEmptyComponent={<Text style={styles.vacio}>Todavía no seguís a nadie.</Text>}
            renderItem={({ item }) => (
              <Pressable style={styles.card} onPress={() => setDestinatario(item)}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]} />
                )}
                <Text style={styles.username}>{item.username ?? "Usuario"}</Text>
              </Pressable>
            )}
          />
        </>
      ) : (
        <>
          <Text style={styles.label}>Para: {destinatario.username ?? "Usuario"}</Text>
          <TextInput placeholderTextColor={theme.colors.textFaint}
            style={styles.input}
            placeholder={`Notita opcional (máx. ${LIMITE_NOTA} caracteres, sin fotos)`}
            value={nota}
            onChangeText={setNota}
            maxLength={LIMITE_NOTA}
            multiline
          />
          <Pressable style={styles.enviarBtn} onPress={enviar} disabled={enviando}>
            <Text style={styles.enviarBtnText}>{enviando ? "Enviando..." : "Enviar"}</Text>
          </Pressable>
          <Pressable onPress={() => setDestinatario(null)}>
            <Text style={styles.cambiar}>Cambiar destinatario</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: theme.colors.background },
  titulo: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  label: { fontSize: 14, color: theme.colors.textMuted, marginBottom: 8 },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24 },
  card: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: theme.colors.surfaceAlt },
  avatarPlaceholder: {},
  username: { fontSize: 15 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 10, marginBottom: 12, minHeight: 60, color: theme.colors.text, backgroundColor: theme.colors.surface },
  enviarBtn: { backgroundColor: theme.colors.primary, borderRadius: 8, padding: 12, alignItems: "center" },
  enviarBtnText: { color: "#000000", fontWeight: "700" },
  cambiar: { textAlign: "center", marginTop: 12, color: theme.colors.primaryLight },
});
