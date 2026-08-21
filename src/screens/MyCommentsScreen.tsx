import React, { useCallback, useRef, useState } from "react";
import { View, FlatList, Image, Pressable, StyleSheet } from "react-native";
import { Alert } from "../lib/alert";
import { useFocusEffect } from "@react-navigation/native";
import { Text } from "../components/Themed";
import EstadoVacio from "../components/EstadoVacio";
import { supabase } from "../lib/supabase";
import { misComentarios, resolverLugares, ComentarioPropio } from "../lib/comments";
import { listarMisPosts, Post } from "../lib/posts";
import PostCard from "../components/PostCard";
import { formatearFechaHora } from "../lib/dates";
import { traducirTexto, idiomaCorto } from "../lib/translate";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  route: { params?: { userId?: string; highlightPostId?: string } };
  navigation: any;
}

type Item = { tipo: "comentario"; data: ComentarioPropio; created_at: string } | { tipo: "post"; data: Post; created_at: string };

export default function MyCommentsScreen({ route, navigation }: Props) {
  const { t } = useT();
  const [items, setItems] = useState<Item[]>([]);
  const [lugares, setLugares] = useState<Record<string, string>>({});
  const [idiomaUsuario, setIdiomaUsuario] = useState("en");
  const listRef = useRef<FlatList>(null);
  const yaScrolleoRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      yaScrolleoRef.current = false;
      cargar();
      cargarIdioma();
    }, [])
  );

  async function cargarIdioma() {
    const { data: userData } = await supabase.auth.getSession();
    const uid = userData.session?.user?.id;
    if (!uid) return;
    const { data: perfil } = await supabase.from("profiles").select("content_language").eq("id", uid).maybeSingle();
    setIdiomaUsuario(idiomaCorto(perfil?.content_language));
  }

  async function cargar() {
    let userId = route.params?.userId;
    if (!userId) {
      const { data } = await supabase.auth.getSession();
      userId = data.session?.user?.id;
    }
    if (!userId) return;
    const [comentarios, posts] = await Promise.all([misComentarios(userId), listarMisPosts(userId)]);
    setLugares(await resolverLugares(comentarios, t));
    const combinados: Item[] = [
      ...comentarios.map((c): Item => ({ tipo: "comentario", data: c, created_at: c.created_at })),
      ...posts.map((p): Item => ({ tipo: "post", data: p, created_at: p.created_at })),
    ];
    combinados.sort((a, b) => b.created_at.localeCompare(a.created_at));
    setItems(combinados);

    const highlightPostId = route.params?.highlightPostId;
    if (highlightPostId && !yaScrolleoRef.current) {
      const indice = combinados.findIndex((it) => it.tipo === "post" && it.data.id === highlightPostId);
      if (indice >= 0) {
        yaScrolleoRef.current = true;
        setTimeout(() => listRef.current?.scrollToIndex({ index: indice, animated: true, viewPosition: 0.2 }), 200);
      }
    }
  }

  async function abrir(c: ComentarioPropio) {
    if (c.target_type === "series" || c.target_type === "movie") {
      navigation.navigate("Comentarios", { targetType: c.target_type, targetId: c.target_id, highlightCommentId: c.id });
    } else if (c.target_type === "episode") {
      navigation.navigate("Comentarios", { targetType: "episode", targetId: c.target_id, highlightCommentId: c.id });
    } else if (c.target_type === "group" && c.group_id) {
      const { data } = await supabase.from("groups").select("name").eq("id", c.group_id).maybeSingle();
      navigation.navigate("DetalleGrupo", { groupId: c.group_id, groupName: data?.name ?? t("Grupo") });
    }
  }

  function abrirTitulo(c: ComentarioPropio) {
    if (c.target_type === "series") {
      navigation.navigate("DetalleTitulo", { tmdbId: Number(c.target_id), tipo: "series" });
    } else if (c.target_type === "movie") {
      navigation.navigate("DetalleTitulo", { tmdbId: Number(c.target_id), tipo: "movie" });
    } else if (c.target_type === "episode") {
      const [seriesTmdbId, season, episode] = c.target_id.split(":").map(Number);
      navigation.navigate("EpisodioDetalle", { seriesTmdbId, seasonNumber: season, episodeNumber: episode, episodeName: null });
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => `${item.tipo}-${item.data.id}`}
        contentContainerStyle={{ padding: 12 }}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.2 }), 250);
        }}
        ListEmptyComponent={
          <EstadoVacio
            icono="chatbox-ellipses-outline"
            titulo={route.params?.userId ? "Todavía no escribió ningún comentario ni publicó nada." : "Todavía no escribiste ningún comentario ni publicaste nada."}
          />
        }
        renderItem={({ item }) =>
          item.tipo === "post" ? (
            <View style={item.data.id === route.params?.highlightPostId ? styles.postResaltado : undefined}>
              <PostCard post={item.data} navigation={navigation} onCambio={cargar} mostrarTipo />
            </View>
          ) : (
            <TarjetaComentario
              comentario={item.data}
              lugar={lugares[item.data.id] ?? "..."}
              idiomaUsuario={idiomaUsuario}
              onAbrir={() => abrir(item.data)}
              onAbrirTitulo={() => abrirTitulo(item.data)}
            />
          )
        }
      />
    </View>
  );
}

function TarjetaComentario({
  comentario,
  lugar,
  idiomaUsuario,
  onAbrir,
  onAbrirTitulo,
}: {
  comentario: ComentarioPropio;
  lugar: string;
  idiomaUsuario: string;
  onAbrir: () => void;
  onAbrirTitulo: () => void;
}) {
  const { t } = useT();
  const [traduccion, setTraduccion] = useState<string | null>(null);
  const [traduciendo, setTraduciendo] = useState(false);

  async function traducir() {
    if (traduccion) {
      setTraduccion(null);
      return;
    }
    setTraduciendo(true);
    try {
      setTraduccion(await traducirTexto(comentario.content ?? "", idiomaUsuario));
    } catch (e: any) {
      Alert.alert(t("No se pudo traducir"), e.message ?? t("Probá de nuevo en un rato."));
    } finally {
      setTraduciendo(false);
    }
  }

  return (
    <Pressable style={styles.card} onPress={onAbrir}>
      <View style={styles.lugarRow}>
        <Pressable onPress={onAbrirTitulo} style={{ flex: 1 }}>
          <Text style={styles.lugar} numberOfLines={1}>
            {lugar}
          </Text>
        </Pressable>
        <View style={styles.tipoTag}>
          <Text style={styles.tipoTagTexto}>{t("Comentario")}</Text>
        </View>
      </View>
      {comentario.content ? <Text style={styles.contenido}>{traduccion ?? comentario.content}</Text> : null}
      {comentario.gif_url && <Image source={{ uri: comentario.gif_url }} style={styles.gif} />}
      <View style={styles.pieRow}>
        <Text style={styles.fecha}>{formatearFechaHora(comentario.created_at)}</Text>
        {comentario.content && (
          <Pressable onPress={traducir} disabled={traduciendo} hitSlop={6} style={styles.traducirBtn}>
            <Text style={styles.traducirTexto}>{traduciendo ? t("Traduciendo...") : traduccion ? t("Ver original") : t("Traducir")}</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  postResaltado: { borderWidth: 1.5, borderColor: theme.colors.primary, borderRadius: theme.radius.md },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24 },
  card: { padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, marginBottom: 8 },
  lugarRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  lugar: { fontSize: 12, fontWeight: "700", color: theme.colors.primaryLight, flex: 1 },
  tipoTag: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tipoTagTexto: { fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, textTransform: "uppercase" },
  contenido: { fontSize: 14 },
  gif: { width: 120, height: 120, borderRadius: 8, marginTop: 6, backgroundColor: theme.colors.surfaceAlt },
  fecha: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6 },
  pieRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  traducirBtn: { marginLeft: "auto" },
  traducirTexto: { fontSize: 11, color: theme.colors.primaryLight, fontWeight: "700" },
});
