import React, { useCallback, useState } from "react";
import { FlatList, Pressable, View, Image, StyleSheet } from "react-native";
import { Text } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { listarNotificaciones, marcarTodasLeidas, textoNotificacion, Notificacion } from "../lib/notificationsFeed";
import { listarSolicitudesPendientes } from "../lib/followRequests";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";
import { formatearFechaHora } from "../lib/dates";

/** A dónde navegar según el target_type/target_id de un comentario (sirve para "like" y "reply") — directo al hilo de comentarios, no a la ficha. */
async function navegarAComentario(targetType: string | null, targetId: string | null, navigation: any) {
  if (!targetType || !targetId) return;

  if (targetType === "series" || targetType === "movie" || targetType === "episode") {
    navigation.navigate("Comentarios", { targetType, targetId });
  } else if (targetType === "group") {
    const { data } = await supabase.from("groups").select("name").eq("id", targetId).maybeSingle();
    navigation.navigate("DetalleGrupo", { groupId: targetId, groupName: data?.name ?? "Grupo" });
  }
}

export default function NotificationsScreen({ navigation }: any) {
  const { t } = useT();
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [solicitudesCount, setSolicitudesCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [])
  );

  async function cargar() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    const [todas, solicitudes] = await Promise.all([listarNotificaciones(uid), listarSolicitudesPendientes(uid)]);
    // Las solicitudes de seguimiento van aparte, en su propio botón — no se mezclan con el resto.
    setNotificaciones(todas.filter((n) => n.type !== "follow_request"));
    setSolicitudesCount(solicitudes.length);
    await marcarTodasLeidas(uid);
  }

  async function abrir(n: Notificacion) {
    if (n.type === "follow") {
      if (n.actor_id) navigation.navigate("PerfilAjeno", { userId: n.actor_id });
      return;
    }

    if ((n.type === "group_muted" || n.type === "group_removed" || n.type === "group_message") && n.target_id) {
      const { data } = await supabase.from("groups").select("name").eq("id", n.target_id).maybeSingle();
      navigation.navigate("DetalleGrupo", { groupId: n.target_id, groupName: data?.name ?? "Grupo" });
      return;
    }

    if (n.type === "group_join_request") {
      navigation.navigate("AdminGrupos");
      return;
    }

    if (n.type === "shared_title" && n.target_id) {
      navigation.navigate("HiloActividad", { chatId: n.target_id, otroUsername: n.actor_username, otroUserId: n.actor_id });
      return;
    }

    if ((n.type === "list_item_added" || n.type === "list_followed") && n.target_id) {
      const { data } = await supabase.from("lists").select("title").eq("id", n.target_id).maybeSingle();
      navigation.navigate("DetalleLista", { listId: n.target_id, listTitle: data?.title ?? t("Lista") });
      return;
    }

    if (n.type === "reply") {
      await navegarAComentario(n.target_type, n.target_id, navigation);
      return;
    }

    if (n.type === "like" && n.target_type === "comment" && n.target_id) {
      const { data } = await supabase.from("comentarios").select("target_type, target_id").eq("id", n.target_id).maybeSingle();
      if (data) await navegarAComentario(data.target_type, data.target_id, navigation);
    }
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      data={notificaciones}
      keyExtractor={(n) => n.id}
      contentContainerStyle={{ padding: 12 }}
      ListHeaderComponent={
        <Pressable
          style={[styles.solicitudesBtn, solicitudesCount > 0 && styles.solicitudesBtnActivo]}
          onPress={() => navigation.navigate("Solicitudes")}
        >
          <Text style={[styles.solicitudesBtnTexto, solicitudesCount > 0 && styles.solicitudesBtnTextoActivo]}>{t("Solicitudes")}</Text>
          {solicitudesCount > 0 && (
            <View style={styles.solicitudesBadge}>
              <Text style={styles.solicitudesBadgeTexto}>{solicitudesCount > 99 ? "99+" : solicitudesCount}</Text>
            </View>
          )}
        </Pressable>
      }
      ListEmptyComponent={<Text style={styles.vacio}>{t("No tenés notificaciones todavía.")}</Text>}
      renderItem={({ item }) => (
        <Pressable style={[styles.card, !item.read && styles.cardNoLeida]} onPress={() => abrir(item)}>
          {item.actor_avatar_url ? (
            <Image source={{ uri: item.actor_avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.texto}>{textoNotificacion(item, t)}</Text>
            <Text style={styles.fecha}>{formatearFechaHora(item.created_at)}</Text>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24 },
  card: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, marginBottom: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: theme.colors.surfaceAlt },
  avatarPlaceholder: {},
  cardNoLeida: { borderWidth: 1, borderColor: theme.colors.primary },
  texto: { fontSize: 14 },
  fecha: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },
  solicitudesBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.pill,
    paddingVertical: 10,
    marginBottom: 12,
    position: "relative",
  },
  solicitudesBtnActivo: { backgroundColor: theme.colors.primary },
  solicitudesBtnTexto: { fontSize: 14, fontWeight: "700", color: theme.colors.textMuted },
  solicitudesBtnTextoActivo: { color: "#000000" },
  solicitudesBadge: {
    position: "absolute",
    top: -6,
    right: "30%",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#E8E8E8",
    borderWidth: 1,
    borderColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  solicitudesBadgeTexto: { fontSize: 10, fontWeight: "700", color: theme.colors.background },
});
