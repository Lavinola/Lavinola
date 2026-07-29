import React, { useEffect, useState } from "react";
import { View, FlatList, StyleSheet, Platform } from "react-native";
import { Text } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { cargarMensajesChatParaAdmin, MensajeChat } from "../lib/chats";
import { formatearFechaHora } from "../lib/dates";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  route: {
    params: {
      chatId: string;
      usernameA: string | null;
      userIdA: string;
      usernameB: string | null;
      userIdB: string;
    };
  };
  navigation: any;
}

export default function AdminVerChatScreen({ route, navigation }: Props) {
  const { t } = useT();
  const { chatId, usernameA, userIdA, usernameB, userIdB } = route.params;
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [cargando, setCargando] = useState(true);
  const [autorizado, setAutorizado] = useState<boolean | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: `@${usernameA ?? "—"} ↔ @${usernameB ?? "—"}` });
    verificarYcargar();
  }, []);

  async function verificarYcargar() {
    // Igual que AdminUserChatsScreen: esta vista de "todos los mensajes,
    // sin filtrar por reportados" queda reservada a la webapp.
    if (Platform.OS !== "web") {
      setAutorizado(false);
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setAutorizado(false);
      return;
    }
    const { data: perfil } = await supabase.from("profiles").select("is_admin").eq("id", uid).single();
    if (!perfil?.is_admin) {
      setAutorizado(false);
      return;
    }
    setAutorizado(true);
    setCargando(true);
    setMensajes(await cargarMensajesChatParaAdmin(chatId));
    setCargando(false);
  }

  function nombrePorId(id: string) {
    if (id === userIdA) return usernameA ?? "—";
    if (id === userIdB) return usernameB ?? "—";
    return "—";
  }

  function descripcion(m: MensajeChat): string {
    if (m.deleted) return t("(mensaje eliminado)");
    if (m.kind === "shared_title") {
      const que = m.tmdb_id
        ? `${t("Compartió un")} ${m.item_type === "movie" ? t("película") : t("serie")} (TMDB #${m.tmdb_id})`
        : m.shared_group_id
        ? t("Compartió un grupo")
        : m.shared_list_id
        ? t("Compartió una lista")
        : t("Mensaje de chat");
      return m.content ? `${que} — "${m.content}"` : que;
    }
    if (m.gif_url && !m.content) return t("(GIF)");
    return m.content ?? "";
  }

  if (autorizado === false) {
    return (
      <View style={styles.centro}>
        <Text style={styles.vacio}>{t("No tenés permiso para ver esto.")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={mensajes}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={!cargando ? <Text style={styles.vacio}>{t("Todavía no hay mensajes en este chat.")}</Text> : null}
        renderItem={({ item }) => (
          <View style={styles.fila}>
            <Text style={styles.remitente}>@{nombrePorId(item.sender_id)}</Text>
            <Text style={[styles.contenido, item.deleted && styles.contenidoEliminado]}>{descripcion(item)}</Text>
            <Text style={styles.fecha}>{formatearFechaHora(item.created_at)}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 32 },
  fila: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 10, marginBottom: 8 },
  remitente: { fontSize: 12, fontWeight: "700", color: theme.colors.primaryLight, marginBottom: 3 },
  contenido: { fontSize: 14, color: theme.colors.text },
  contenidoEliminado: { fontStyle: "italic", color: theme.colors.textMuted },
  fecha: { fontSize: 10.5, color: theme.colors.textFaint, marginTop: 4 },
});
