import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { View, FlatList, Pressable, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Text } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { contarChatsConNoLeidos } from "../lib/chats";
import { listarMisGrupos, contarComentariosNuevosPorGrupo, listarSolicitudesDeMisGrupos } from "../lib/groups";
import { listarMisPosts, listarPostsSiguiendo, listarPostsParaTi, Post } from "../lib/posts";
import { listarMisEncuestasDeLobby, listarEncuestasDeLobbySiguiendo, listarEncuestasDeLobbyParaTi, Encuesta } from "../lib/polls";
import PostCard from "../components/PostCard";
import EncuestaCard from "../components/EncuestaCard";
import TopPills from "../components/TopPills";
import UnderlineTabs from "../components/UnderlineTabs";
import { SkeletonPostCards } from "../components/SkeletonShapes";
import GroupsScreen from "./GroupsScreen";
import ActivityScreen from "./ActivityScreen";
import PublicarFAB from "../components/PublicarFAB";
import { useOcultarAlScrollear } from "../hooks/useOcultarAlScrollear";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type SubTab = "lobby" | "misPosts" | "grupos" | "chats";
type LobbySubTab = "paraTi" | "siguiendo";

export default function CommunityScreen({ navigation, route }: any) {
  const { t } = useT();
  const [subTab, setSubTab] = useState<SubTab>("lobby");
  const [lobbySubTab, setLobbySubTab] = useState<LobbySubTab>("paraTi");
  const [gruposNoLeidos, setGruposNoLeidos] = useState(0);
  const [chatsNoLeidos, setChatsNoLeidos] = useState(0);
  const { visible: fabVisible, onScroll: onScrollFeed } = useOcultarAlScrollear();

  // Doble toque en el ícono de Comunidad (armado en navigation/index.tsx) —
  // vuelve al Lobby estés donde estés, mandando una señal nueva cada vez
  // (con Date.now()) para que dispare incluso si ya estabas en "lobby".
  useEffect(() => {
    if (route?.params?.irALobby) setSubTab("lobby");
  }, [route?.params?.irALobby]);

  useEffect(() => {
    cargarBadges();
  }, [subTab]);

  useFocusEffect(
    useCallback(() => {
      cargarBadges();
    }, [])
  );

  async function cargarBadges() {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
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
            <Pressable style={styles.guardadosBtn} onPress={() => navigation.navigate("Guardados")} hitSlop={10}>
              <Ionicons name="bookmark" size={20} color={theme.colors.primary} />
            </Pressable>
            <Pressable style={styles.lupaBtn} onPress={() => navigation.navigate("BuscarEnLobby", { modo: "lobby" })} hitSlop={10}>
              <Ionicons name="search" size={20} color={theme.colors.primaryLight} />
            </Pressable>
          </View>
          {lobbySubTab === "paraTi" && <FeedDePosts modo="paraTi" navigation={navigation} onScroll={onScrollFeed} />}
          {lobbySubTab === "siguiendo" && <FeedDePosts modo="siguiendo" navigation={navigation} onScroll={onScrollFeed} />}
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
          <FeedDePosts modo="mios" navigation={navigation} onScroll={onScrollFeed} />
        </>
      )}
      {subTab === "grupos" && <GroupsScreen navigation={navigation} />}
      {subTab === "chats" && <ActivityScreen navigation={navigation} />}
      <PublicarFAB
        visible={fabVisible && (subTab === "lobby" || subTab === "misPosts")}
        onPress={() => navigation.navigate("SeleccionarTituloPost")}
      />
    </View>
  );
}

function FeedDePosts({
  modo,
  navigation,
  onScroll,
}: {
  modo: "paraTi" | "siguiendo" | "mios";
  navigation: any;
  onScroll?: (e: any) => void;
}) {
  const { t } = useT();
  const [posts, setPosts] = useState<Post[]>([]);
  const [polls, setPolls] = useState<Encuesta[]>([]);
  const [loading, setLoading] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  // Ref (no estado) para el chequeo de "¿ya hay un pedido en curso?" — con
  // scroll rápido, varios onEndReached pueden dispararse antes de que
  // cargandoMas llegue a reflejarse en un render, terminando en pedidos
  // duplicados del mismo tramo (mismo cursor de fecha) y posts repetidos.
  const cargandoMasRef = useRef(false);
  const [hayMas, setHayMas] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const yaCargoRef = useRef(false);
  const scrollYRef = useRef(0);
  const pullStartRef = useRef<number | null>(null);
  const [pullOffset, setPullOffset] = useState(0);
  const [refrescandoPull, setRefrescandoPull] = useState(false);

  function onScrollCombinado(e: any) {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
    onScroll?.(e);
  }

  // El "arrastrar para actualizar" nativo de Android/iOS ya funciona solo
  // (por onRefresh/refreshing más abajo) — pero react-native-web no lo
  // implementa en absoluto en la web, así que ahí lo armamos a mano
  // siguiendo el gesto táctil.
  function onTouchStart(e: any) {
    if (Platform.OS !== "web" || refrescandoPull) return;
    pullStartRef.current = scrollYRef.current <= 2 ? e.nativeEvent.touches[0].pageY : null;
  }
  function onTouchMove(e: any) {
    if (Platform.OS !== "web" || pullStartRef.current == null || refrescandoPull) return;
    const delta = e.nativeEvent.touches[0].pageY - pullStartRef.current;
    if (delta > 0) setPullOffset(Math.min(delta * 0.5, 70));
  }
  function onTouchEnd() {
    if (Platform.OS !== "web") return;
    if (pullOffset > 45 && !refrescandoPull) {
      setRefrescandoPull(true);
      cargar().finally(() => {
        setRefrescandoPull(false);
        setPullOffset(0);
      });
    } else {
      setPullOffset(0);
    }
    pullStartRef.current = null;
  }

  useFocusEffect(
    useCallback(() => {
      cargar(yaCargoRef.current); // silencioso a partir de la segunda vez, para no perder el scroll ni mostrar el spinner de golpe
      yaCargoRef.current = true;
    }, [modo])
  );

  type ItemFeed = { kind: "post"; createdAt: string; post: Post } | { kind: "poll"; createdAt: string; poll: Encuesta };
  const items: ItemFeed[] = useMemo(() => {
    const combinados: ItemFeed[] = [
      ...posts.map((p) => ({ kind: "post" as const, createdAt: p.created_at, post: p })),
      ...polls.map((p) => ({ kind: "poll" as const, createdAt: p.createdAt, poll: p })),
    ];
    combinados.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return combinados;
  }, [posts, polls]);

  async function cargar(silencioso = false) {
    if (!silencioso) setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) return;
      setUserId(uid);
      setHayMas(true);
      if (modo === "mios") {
        const [p, e] = await Promise.all([listarMisPosts(uid, undefined, 20), listarMisEncuestasDeLobby(uid, undefined, 20)]);
        setPosts(p);
        setPolls(e);
      } else if (modo === "siguiendo") {
        const [p, e] = await Promise.all([listarPostsSiguiendo(uid), listarEncuestasDeLobbySiguiendo(uid)]);
        setPosts(p);
        setPolls(e);
      } else {
        const [p, e] = await Promise.all([listarPostsParaTi(uid), listarEncuestasDeLobbyParaTi(uid)]);
        setPosts(p);
        setPolls(e);
      }
    } finally {
      if (!silencioso) setLoading(false);
    }
  }

  async function cargarMas() {
    if (cargandoMasRef.current || !hayMas || items.length === 0) return;
    cargandoMasRef.current = true;
    setCargandoMas(true);
    try {
      const ultimaFecha = items[items.length - 1].createdAt;
      const [nuevosPosts, nuevosPolls] =
        modo === "mios"
          ? await Promise.all([listarMisPosts(userId!, ultimaFecha, 20), listarMisEncuestasDeLobby(userId!, ultimaFecha, 20)])
          : modo === "siguiendo"
          ? await Promise.all([listarPostsSiguiendo(userId!, ultimaFecha), listarEncuestasDeLobbySiguiendo(userId!, ultimaFecha)])
          : await Promise.all([listarPostsParaTi(userId, ultimaFecha), listarEncuestasDeLobbyParaTi(userId, ultimaFecha)]);
      if (nuevosPosts.length === 0 && nuevosPolls.length === 0) setHayMas(false);
      setPosts((prev) => {
        const vistos = new Set(prev.map((p) => p.id));
        return [...prev, ...nuevosPosts.filter((p) => !vistos.has(p.id))];
      });
      setPolls((prev) => {
        const vistos = new Set(prev.map((p) => p.id));
        return [...prev, ...nuevosPolls.filter((p) => !vistos.has(p.id))];
      });
    } finally {
      cargandoMasRef.current = false;
      setCargandoMas(false);
    }
  }

  if (loading) return <SkeletonPostCards />;

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => (item.kind === "post" ? item.post.id : item.poll.id)}
      contentContainerStyle={{ padding: 12 }}
      onRefresh={cargar}
      refreshing={loading}
      onEndReached={cargarMas}
      onEndReachedThreshold={0.4}
      onScroll={onScrollCombinado}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      scrollEventThrottle={16}
      ListHeaderComponent={
        pullOffset > 0 || refrescandoPull ? (
          <View style={{ height: refrescandoPull ? 40 : pullOffset, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : null
      }
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
      renderItem={({ item }) =>
        item.kind === "post" ? (
          <PostCard post={item.post} navigation={navigation} onCambio={cargar} mostrarNoInteresa={modo === "paraTi"} />
        ) : (
          <EncuestaCard encuesta={item.poll} userId={userId} navigation={navigation} onCambio={cargar} />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  lobbyTogglesWrap: { flexDirection: "row", alignItems: "center", backgroundColor: "#000000" },
  lupaBtn: { paddingHorizontal: 14, paddingVertical: 12 },
  guardadosBtn: { paddingHorizontal: 6, paddingVertical: 12 },
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
