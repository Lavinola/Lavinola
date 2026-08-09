import React, { useEffect, useState } from "react";
import { View, FlatList, TextInput, ActivityIndicator, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { listarGuardados, ItemGuardado } from "../lib/savedItems";
import { idiomaCorto } from "../lib/translate";
import PostCard from "../components/PostCard";
import { NodoComentario } from "../components/CommentThread";
import { Text } from "../components/Themed";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function GuardadosScreen({ navigation }: any) {
  const { t } = useT();
  const [userId, setUserId] = useState<string | null>(null);
  const [idiomaUsuario, setIdiomaUsuario] = useState("en");
  const [items, setItems] = useState<ItemGuardado[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  useFocusEffect(
    React.useCallback(() => {
      cargar();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  async function cargar() {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;
    setUserId(uid);
    const { data: perfil } = await supabase.from("profiles").select("content_language").eq("id", uid).maybeSingle();
    setIdiomaUsuario(idiomaCorto(perfil?.content_language));
    try {
      setItems(await listarGuardados(uid));
    } finally {
      setLoading(false);
    }
  }

  const filtrados = busqueda.trim()
    ? items.filter((it) => {
        const texto = it.kind === "post" ? it.post?.content ?? "" : it.comentario?.content ?? "";
        return texto.toLowerCase().includes(busqueda.trim().toLowerCase());
      })
    : items;

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.buscador}
        placeholder={t("Buscar en tus guardados...")}
        placeholderTextColor={theme.colors.textFaint}
        value={busqueda}
        onChangeText={setBusqueda}
      />
      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={filtrados}
          keyExtractor={(it) => it.savedId}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={<Text style={styles.vacio}>{t("Todavía no guardaste nada.")}</Text>}
          renderItem={({ item }) =>
            item.kind === "post" && item.post ? (
              <PostCard post={item.post} navigation={navigation} onCambio={cargar} />
            ) : item.kind === "comment" && item.comentario ? (
              <View style={styles.comentarioWrap}>
                <NodoComentario
                  comentario={item.comentario}
                  nivel={0}
                  userId={userId}
                  idiomaUsuario={idiomaUsuario}
                  onReply={cargar}
                  targetType={(item.comentario.target_type as any) ?? "post"}
                  targetId={item.comentario.target_id ?? ""}
                  groupId={item.comentario.group_id ?? undefined}
                  navigation={navigation}
                />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  buscador: {
    margin: 12,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    padding: 10,
  },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 32 },
  comentarioWrap: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 10, marginBottom: 12 },
});
