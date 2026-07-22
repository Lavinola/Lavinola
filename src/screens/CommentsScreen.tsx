import React, { useEffect, useRef, useState } from "react";
import { View, ScrollView, Image, Pressable, ActivityIndicator, Animated, LayoutChangeEvent, StyleSheet } from "react-native";
import { Text } from "../components/Themed";
import CommentThread from "../components/CommentThread";
import { Ionicons } from "@expo/vector-icons";
import PostCard from "../components/PostCard";
import UnderlineTabs from "../components/UnderlineTabs";
import { listarPostsDeTitulo, Post } from "../lib/posts";
import { posterUrl, getMovieReviews, getSeriesReviews } from "../lib/tmdb";
import { traducirTexto, idiomaCorto } from "../lib/translate";
import { supabase } from "../lib/supabase";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Contexto {
  poster_path: string | null;
  titulo: string;
  subtitulo: string | null;
}

export default function CommentsScreen({ route, navigation }: any) {
  const { t } = useT();
  const { targetType, targetId, groupId, highlightCommentId } = route.params;
  const [posts, setPosts] = useState<Post[]>([]);
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [subTab, setSubTab] = useState<"todos" | "siguiendo" | "yo">("todos");
  const [siguiendoIds, setSiguiendoIds] = useState<Set<string>>(new Set());
  const [miUserId, setMiUserId] = useState<string | null>(null);
  const [fuente, setFuente] = useState<"lavinola" | "tmdb">("lavinola");
  const [anchoToggle, setAnchoToggle] = useState(0);
  const animFuente = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animFuente, { toValue: fuente === "lavinola" ? 0 : 1, duration: 220, useNativeDriver: true }).start();
  }, [fuente]);
  const [reseñasTmdb, setReseñasTmdb] = useState<any[]>([]);
  const [cargandoReseñas, setCargandoReseñas] = useState(false);
  const [errorReseñas, setErrorReseñas] = useState(false);
  const [traduccionesReseñas, setTraduccionesReseñas] = useState<Record<string, string>>({});
  const [traduciendoId, setTraduciendoId] = useState<string | null>(null);
  const [miIdioma, setMiIdioma] = useState("en");

  const esTitulo = targetType === "series" || targetType === "movie" || targetType === "episode";

  useEffect(() => {
    if (esTitulo) {
      cargarPosts();
      cargarContexto();
      cargarSiguiendo();
    }
  }, []);

  useEffect(() => {
    if (fuente !== "tmdb" || !esTitulo || reseñasTmdb.length > 0) return;
    cargarReseñasTmdb();
  }, [fuente]);

  async function cargarReseñasTmdb() {
    setCargandoReseñas(true);
    setErrorReseñas(false);
    try {
      let tmdbIdParaReseñas: number;
      let esSerie: boolean;
      if (targetType === "episode") {
        // TMDB no tiene reseñas por episodio — mostramos las de la serie entera.
        const [seriesTmdbId] = targetId.split(":").map(Number);
        tmdbIdParaReseñas = seriesTmdbId;
        esSerie = true;
      } else {
        tmdbIdParaReseñas = Number(targetId);
        esSerie = targetType === "series";
      }
      const data = esSerie ? await getSeriesReviews(tmdbIdParaReseñas) : await getMovieReviews(tmdbIdParaReseñas);
      setReseñasTmdb(data.results ?? []);
    } catch (e) {
      console.error("Error al cargar reseñas de TMDB:", e);
      setErrorReseñas(true);
    } finally {
      setCargandoReseñas(false);
    }
  }

  async function cargarSiguiendo() {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;
    setMiUserId(uid);
    const { data: sigo } = await supabase.from("follows").select("followee_id").eq("follower_id", uid);
    setSiguiendoIds(new Set((sigo ?? []).map((f: any) => f.followee_id)));
    const { data: perfil } = await supabase.from("profiles").select("content_language").eq("id", uid).maybeSingle();
    setMiIdioma(idiomaCorto(perfil?.content_language));
  }

  async function cargarContexto() {
    try {
      if (targetType === "movie") {
        const { data } = await supabase.from("movies_cache").select("title, poster_path, release_date").eq("tmdb_id", Number(targetId)).maybeSingle();
        if (data) setContexto({ poster_path: data.poster_path, titulo: data.title, subtitulo: data.release_date ? String(data.release_date).slice(0, 4) : null });
      } else if (targetType === "series") {
        const { data } = await supabase.from("series_cache").select("name, poster_path, total_seasons").eq("tmdb_id", Number(targetId)).maybeSingle();
        if (data)
          setContexto({
            poster_path: data.poster_path,
            titulo: data.name,
            subtitulo: data.total_seasons ? `${data.total_seasons} ${data.total_seasons === 1 ? t("temporada") : t("temporadas")}` : null,
          });
      } else if (targetType === "episode") {
        const [seriesTmdbId, season, episode] = targetId.split(":").map(Number);
        const [{ data: serie }, { data: ep }] = await Promise.all([
          supabase.from("series_cache").select("name, poster_path").eq("tmdb_id", seriesTmdbId).maybeSingle(),
          supabase.from("episodes_cache").select("name").eq("series_tmdb_id", seriesTmdbId).eq("season_number", season).eq("episode_number", episode).maybeSingle(),
        ]);
        setContexto({
          poster_path: serie?.poster_path ?? null,
          titulo: `${serie?.name ?? "Serie"} — ${ep?.name ?? `T${season}E${episode}`}`,
          subtitulo: `T${season} - E${episode}`,
        });
      }
    } catch (e) {
      console.error("Error al cargar el contexto del comentario:", e);
    }
  }

  async function cargarPosts() {
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      if (targetType === "episode") {
        // formato del targetId: "seriesTmdbId:temporada:episodio"
        const [seriesTmdbId, season, episode] = targetId.split(":").map(Number);
        setPosts(await listarPostsDeTitulo("episode", seriesTmdbId, season, episode, uid));
      } else {
        setPosts(await listarPostsDeTitulo(targetType, Number(targetId), undefined, undefined, uid));
      }
    } catch (e) {
      console.error("Error al cargar posts del título:", e);
    }
  }

  async function traducirReseña(id: string, texto: string) {
    setTraduciendoId(id);
    try {
      const traduccion = await traducirTexto(texto, miIdioma);
      if (traduccion.trim()) {
        setTraduccionesReseñas((prev) => ({ ...prev, [id]: traduccion }));
      }
    } catch (e) {
      console.error("Error al traducir reseña de TMDB:", e);
    } finally {
      setTraduciendoId(null);
    }
  }

  function abrirTitulo() {
    if (targetType === "episode") {
      const [seriesTmdbId, season, episode] = targetId.split(":").map(Number);
      navigation.navigate("EpisodioDetalle", { seriesTmdbId, seasonNumber: season, episodeNumber: episode, episodeName: null });
    } else {
      navigation.navigate("DetalleTitulo", { tmdbId: Number(targetId), tipo: targetType });
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ paddingHorizontal: 10 }}>
      {contexto && (
        <Pressable style={styles.contextoCard} onPress={abrirTitulo}>
          {contexto.poster_path ? (
            <Image source={{ uri: posterUrl(contexto.poster_path, "w185")! }} style={styles.contextoPoster} />
          ) : (
            <View style={[styles.contextoPoster, { backgroundColor: theme.colors.surfaceAlt }]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.contextoTitulo} numberOfLines={2}>
              {contexto.titulo}
            </Text>
            {contexto.subtitulo && <Text style={styles.contextoSub}>{contexto.subtitulo}</Text>}
          </View>
        </Pressable>
      )}

      {esTitulo && targetType !== "episode" && (
        <View style={styles.fuenteRow} onLayout={(e: LayoutChangeEvent) => setAnchoToggle(e.nativeEvent.layout.width)}>
          <Pressable
            style={[styles.fuenteBtn, styles.fuenteBtnIzq, fuente === "lavinola" && styles.fuenteBtnActivo]}
            onPress={() => setFuente("lavinola")}
          >
            <Image source={require("../../assets/logo-wordmark.png")} style={styles.fuenteLogoLavinola} resizeMode="contain" />
          </Pressable>
          <Pressable
            style={[styles.fuenteBtn, styles.fuenteBtnDer, fuente === "tmdb" && styles.fuenteBtnActivo]}
            onPress={() => setFuente("tmdb")}
          >
            <Image source={require("../../assets/tmdb-icon-only.png")} style={styles.fuenteLogoTmdb} resizeMode="contain" />
          </Pressable>
          {anchoToggle > 0 && (
            <Animated.View
              style={[
                styles.fuenteSubrayado,
                {
                  width: anchoToggle / 2,
                  transform: [{ translateX: Animated.multiply(animFuente, anchoToggle / 2) }],
                },
              ]}
            />
          )}
        </View>
      )}

      {fuente === "tmdb" ? (
        <View style={{ marginTop: 14 }}>
          <Text style={styles.avisoTmdb}>{t("Reseñas de TMDB, solo lectura — no son de la comunidad de Lavinola.")}</Text>
          {cargandoReseñas ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={theme.colors.primary} />
          ) : errorReseñas ? (
            <Text style={styles.vacioTmdb}>{t("No pudimos traer las reseñas de TMDB. Probá de nuevo en un rato.")}</Text>
          ) : reseñasTmdb.length === 0 ? (
            <Text style={styles.vacioTmdb}>{t("Todavía no hay reseñas de TMDB para este título.")}</Text>
          ) : (
            reseñasTmdb.map((r) => (
              <View key={r.id} style={styles.reseñaCard}>
                <View style={styles.reseñaHeaderRow}>
                  {r.author_details?.avatar_path ? (
                    <Image
                      source={{
                        uri: r.author_details.avatar_path.startsWith("/https")
                          ? r.author_details.avatar_path.slice(1)
                          : posterUrl(r.author_details.avatar_path, "w185")!,
                      }}
                      style={styles.reseñaAvatar}
                    />
                  ) : (
                    <View style={[styles.reseñaAvatar, styles.reseñaAvatarPlaceholder]}>
                      <Text style={styles.reseñaAvatarInicial}>{(r.author ?? "?").charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reseñaAutor}>{r.author}</Text>
                    {r.author_details?.rating != null && (
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Ionicons name="star" size={11} color={theme.colors.primaryLight} />
                        <Text style={styles.reseñaRating}> {r.author_details.rating}/10</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={styles.reseñaContenido}>{traduccionesReseñas[r.id] || r.content}</Text>
                <Pressable
                  style={styles.traducirBtn}
                  onPress={() => {
                    if (traduccionesReseñas[r.id]) {
                      setTraduccionesReseñas((prev) => {
                        const copia = { ...prev };
                        delete copia[r.id];
                        return copia;
                      });
                    } else {
                      traducirReseña(r.id, r.content);
                    }
                  }}
                  disabled={traduciendoId === r.id}
                >
                  <Text style={styles.traducirBtnTexto}>
                    {traduciendoId === r.id ? t("Traduciendo...") : traduccionesReseñas[r.id] ? t("Ver original") : t("Traducir")}
                  </Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      ) : (
        <>
          {esTitulo && (
            <View style={styles.tabsWrap}>
              <UnderlineTabs
                opciones={[
                  { key: "todos", label: t("Todos") },
                  { key: "siguiendo", label: t("Siguiendo") },
                  { key: "yo", label: t("Yo") },
                ]}
                valor={subTab}
                onCambiar={setSubTab}
              />
            </View>
          )}

          {posts.length > 0 && (
            <View style={{ marginTop: 10 }}>
              {posts
                .filter((p) => subTab === "todos" || (subTab === "siguiendo" && siguiendoIds.has(p.user_id)) || (subTab === "yo" && p.user_id === miUserId))
                .map((p) => (
                  <PostCard key={p.id} post={p} navigation={navigation} onCambio={cargarPosts} mostrarTipo />
                ))}
            </View>
          )}
          <CommentThread
            targetType={targetType}
            targetId={targetId}
            groupId={groupId}
            navigation={navigation}
            highlightCommentId={highlightCommentId}
            soloSiguiendo={esTitulo && subTab === "siguiendo"}
            soloAutorId={esTitulo && subTab === "yo" ? miUserId ?? undefined : undefined}
            mostrarTipo={esTitulo}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contextoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 10,
    marginTop: 10,
  },
  contextoPoster: { width: 52, height: 52, borderRadius: 6, marginRight: 10 },
  contextoTitulo: { fontSize: 15, fontWeight: "700" },
  contextoSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  tabsWrap: { marginTop: 12, marginHorizontal: -10 },
  fuenteRow: { flexDirection: "row", marginTop: 14, marginHorizontal: -10, position: "relative" },
  fuenteBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    backgroundColor: theme.colors.background,
  },
  fuenteBtnIzq: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: theme.colors.border },
  fuenteBtnDer: {},
  fuenteBtnActivo: {},
  fuenteSubrayado: { position: "absolute", left: 0, bottom: 0, height: 3, backgroundColor: theme.colors.primary },
  fuenteLogoLavinola: { width: 110, height: 26 },
  fuenteLogoTmdb: { width: 92, height: 24 },
  avisoTmdb: { fontSize: 11, color: theme.colors.textFaint, marginBottom: 10 },
  vacioTmdb: { fontSize: 13, color: theme.colors.textMuted, textAlign: "center", marginTop: 24 },
  reseñaCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 14, marginBottom: 10 },
  reseñaHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  reseñaAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  reseñaAvatarPlaceholder: { backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  reseñaAvatarInicial: { color: theme.colors.textMuted, fontWeight: "800", fontSize: 15 },
  reseñaAutor: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  reseñaRating: { fontSize: 11, color: theme.colors.textMuted },
  reseñaContenido: { fontSize: 13, color: theme.colors.text, lineHeight: 19 },
  traducirBtn: { alignSelf: "flex-end", marginTop: 8 },
  traducirBtnTexto: { fontSize: 12, fontWeight: "700", color: theme.colors.primaryLight },
});
