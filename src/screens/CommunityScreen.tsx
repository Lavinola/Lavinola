import React, { useEffect, useState, useCallback } from "react";
import { View, FlatList, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Text } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { contarChatsConNoLeidos } from "../lib/chats";
import { listarMisGrupos, contarComentariosNuevosPorGrupo, listarSolicitudesDeMisGrupos } from "../lib/groups";
import { listarMisPosts, listarPostsSiguiendo, listarPostsParaTi, Post } from "../lib/posts";
import PostCard from "../components/PostCard";
import TopPills from "../components/TopPills";
import UnderlineTabs from "../components/UnderlineTabs";
import GroupsScreen from "./GroupsScreen";
import ActivityScreen from "./ActivityScreen";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type SubTab = "lobby" | "misPosts" | "grupos" | "chats";
type LobbySubTab = "paraTi" | "siguiendo";

export default function CommunityScreen({ navigation }: any) {
  const { t } = useT();
  const [subTab, setSubTab] = useState<SubTab>("lobby");
  const [lobbySubTab, setLobbySubTab] = useState<LobbySubTab>("paraTi");
  const [gruposNoLeidos, setGruposNoLeidos] = useState(0);
  const [chatsNoLeidos, setChatsNoLeidos] = useState(0);

  useEffect(() => {
    cargarBadges();
  }, [subTab]);

  useFocusEffect(
    useCallback(() => {
      cargarBadges();
    }, [])
  );

  async function cargarBadges() {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;
    const [misGrupos, chats, solicitudes] = await Promise.all([listarMisGrupos(uid), contarChatsConNoLeidos(uid), listarSolicitudesDeMisGrupos(uid)]);
    const conteoPorGrupo = await contarComentariosNuevosPorGrupo(uid, misGrupos.map((g) => g.id));
    const gruposConComentarios = Object.keys(conteoPorGrupo).filter((id) => conteoPorGrupo[id] > 0).length;
    const gruposConSolicitudes = new Set(solicitudes.map((s) => s.group_id)).size;
    setGruposNoLeidos(gruposConComentarios + gruposConSolicitudes);
    setChatsNoLeidos(chats);
  }

  return (
    <View style={styles.container}>
      <TopPills
        variante="rect"
        opciones={[
          { key: "lobby", label: t("Lobby") },
          { key: "misPosts", label: t("Mis posts") },
          { key: "grupos", label: t("Grupos"), badge: gruposNoLeidos },
          { key: "chats", label: t("Chats"), badge: chatsNoLeidos },
        ]}
        valor={subTab}
        onCambiar={setSubTab}
      />
      {subTab === "lobby" && (
        <>
          <View style={styles.lobbyTogglesWrap}>
            <View style={{ flex: 1 }}>
              <UnderlineTabs
                opciones={[
                  { key: "paraTi", label: t("Para ti") },
                  { key: "siguiendo", label: t("Siguiendo") },
                ]}
                valor={lobbySubTab}
                onCambiar={setLobbySubTab}
              />
            </View>
            <Pressable style={styles.lupaBtn} onPress={() => navigation.navigate("BuscarEnLobby", { modo: "lobby" })} hitSlop={10}>
              <Ionicons name="search" size={20} color={theme.colors.primaryLight} />
            </Pressable>
          </View>
          {lobbySubTab === "paraTi" && <FeedDePosts modo="paraTi" navigation={navigation} />}
          {lobbySubTab === "siguiendo" && <FeedDePosts modo="siguiendo" navigation={navigation} />}
        </>
      )}
      {subTab === "misPosts" && (
        <>
          <View style={styles.misPostsHeaderRow}>
            <Pressable style={styles.lupaBtnMisPosts} onPress={() => navigation.navigate("BuscarEnLobby", { modo: "misPosts" })} hitSlop={10}>
              <Ionicons name="search" size={18} color={theme.colors.primaryLight} />
              <Text style={styles.lupaBtnMisPostsTexto}>{t("Buscar en mis posts")}</Text>
            </Pressable>
          </View>
          <FeedDePosts modo="mios" navigation={navigation} />
        </>
      )}
      {subTab === "grupos" && <GroupsScreen navigation={navigation} />}
      {subTab === "chats" && <ActivityScreen navigation={navigation} />}
    </View>
  );
}

function FeedDePosts({ modo, navigation }: { modo: "paraTi" | "siguiendo" | "mios"; navigation: any }) {
  const { t } = useT();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [hayMas, setHayMas] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, [modo]);

  async function cargar() {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      setUserId(uid);
      setHayMas(true);
      if (modo === "mios") setPosts(await listarMisPosts(uid));
      else if (modo === "siguiendo") setPosts(await listarPostsSiguiendo(uid));
      else setPosts(await listarPostsParaTi(uid));
    } finally {
      setLoading(false);
    }
  }

  async function cargarMas() {
    if (cargandoMas || !hayMas || modo === "mios" || posts.length === 0) return;
    setCargandoMas(true);
    try {
      const ultimaFecha = posts[posts.length - 1].created_at;
      const nuevos = modo === "siguiendo" ? await listarPostsSiguiendo(userId!, ultimaFecha) : await listarPostsParaTi(userId, ultimaFecha);
      if (nuevos.length === 0) setHayMas(false);
      setPosts((prev) => [...prev, ...nuevos]);
    } finally {
      setCargandoMas(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 32 }} color={theme.colors.primary} />;

  return (
    <FlatList
      data={posts}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ padding: 12 }}
      onRefresh={cargar}
      refreshing={loading}
      onEndReached={cargarMas}
      onEndReachedThreshold={0.4}
      ListFooterComponent={cargandoMas ? <ActivityIndicator style={{ marginVertical: 16 }} color={theme.colors.primary} /> : null}
      ListEmptyComponent={
        <View style={styles.proximamente}>
          <Text style={styles.proximamenteTitulo}>{t("Todavía no hay nada acá")} 👀</Text>
          <Text style={styles.proximamenteTexto}>
            {modo === "mios"
              ? t("Andá a una película, serie o capítulo y tocá el botón violeta con la flecha para publicar en el Lobby.")
              : modo === "siguiendo"
              ? t("La gente que seguís todavía no publicó nada.")
              : t("Todavía no hay publicaciones para mostrar.")}
          </Text>
        </View>
      }
      renderItem={({ item }) => <PostCard post={item} navigation={navigation} onCambio={cargar} mostrarNoInteresa={modo === "paraTi"} />}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  lobbyTogglesWrap: { flexDirection: "row", alignItems: "center", backgroundColor: "#000000" },
  lupaBtn: { paddingHorizontal: 14, paddingVertical: 12 },
  misPostsHeaderRow: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
  lupaBtnMisPosts: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  lupaBtnMisPostsTexto: { color: theme.colors.textMuted, fontSize: 13 },
  proximamente: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  proximamenteTitulo: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  proximamenteTexto: { fontSize: 13, color: theme.colors.textMuted, textAlign: "center" },
});
