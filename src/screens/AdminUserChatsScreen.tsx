import React, { useEffect, useState } from "react";
import { View, FlatList, Image, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { listarChatsDeUsuarioParaAdmin, ChatResumenAdmin } from "../lib/chats";
import { formatearFechaHora } from "../lib/dates";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  route: { params: { userId: string; username: string | null } };
  navigation: any;
}

export default function AdminUserChatsScreen({ route, navigation }: Props) {
  const { t } = useT();
  const { userId, username } = route.params;
  const [chats, setChats] = useState<ChatResumenAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [autorizado, setAutorizado] = useState<boolean | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: t("Chats de {nombre}").replace("{nombre}", username ?? t("este usuario")) });
    verificarYcargar();
  }, []);

  async function verificarYcargar() {
    // Ver TODOS los chats de un usuario (no solo los reportados) queda
    // reservado a la webapp — ver PublicProfileScreen para la explicación.
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
    setChats(await listarChatsDeUsuarioParaAdmin(userId));
    setCargando(false);
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
      <View style={styles.avisoBox}>
        <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.primaryLight} />
        <Text style={styles.avisoTexto}>{t("Vista de moderación: se ve el historial completo, sin filtrar.")}</Text>
      </View>
      <FlatList
        data={chats}
        keyExtractor={(c) => c.chatId}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={!cargando ? <Text style={styles.vacio}>{t("Este usuario no tiene chats.")}</Text> : null}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() =>
              navigation.navigate("AdminVerChat", {
                chatId: item.chatId,
                usernameA: username,
                userIdA: userId,
                usernameB: item.otroUsername,
                userIdB: item.otroUserId,
              })
            }
          >
            {item.otroAvatarUrl ? (
              <Image source={{ uri: item.otroAvatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.nombre}>{t("Chat con")} @{item.otroUsername ?? "—"}</Text>
              <Text style={styles.detalle}>
                {t("{n} mensajes").replace("{n}", String(item.cantidadMensajes))}
                {item.ultimoMensajeFecha ? ` · ${formatearFechaHora(item.ultimoMensajeFecha)}` : ""}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background },
  avisoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.surfaceAlt,
    padding: 10,
    margin: 12,
    marginBottom: 0,
    borderRadius: theme.radius.md,
  },
  avisoTexto: { flex: 1, fontSize: 12, color: theme.colors.textMuted },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 32 },
  card: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.colors.surfaceAlt },
  avatarPlaceholder: {},
  nombre: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  detalle: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
});
