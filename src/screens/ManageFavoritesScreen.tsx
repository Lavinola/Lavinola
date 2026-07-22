import React, { useCallback, useState } from "react";
import { View, TextInput, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { posterUrl } from "../lib/tmdb";
import { listarFavoritos, toggleFavorito } from "../lib/favorites";
import { fetchAllRows } from "../lib/pagination";
import { computeSeriesStatus } from "../types";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface ItemConFavorito {
  tmdb_id: number;
  nombre: string;
  poster_path: string | null;
  favorito: boolean;
}

export default function ManageFavoritesScreen({ route }: any) {
  const { t } = useT();
  const tipo: "series" | "movie" = route.params.tipo;
  const [items, setItems] = useState<ItemConFavorito[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [])
  );

  async function cargar() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setLoading(false);
      return;
    }
    setUserId(uid);

    // IMPORTANTE: antes esto hacía una consulta APARTE por cada
    // película/serie para ver si ya era favorita (con cientos de títulos,
    // cientos de idas y vueltas a la base, una atrás de la otra — de ahí
    // los 2-3 minutos de espera). Ahora se trae todo en un puñado de
    // consultas en tanda.
    if (tipo === "series") {
      const [favs, seriesRows, vistos] = await Promise.all([
        listarFavoritos(uid),
        fetchAllRows((desde, hasta) =>
          supabase
            .from("user_series")
            .select("series_tmdb_id, last_watched_at, custom_poster_path, series_cache(name, poster_path, status, total_episodes)")
            .eq("user_id", uid)
            .range(desde, hasta)
        ),
        fetchAllRows((desde, hasta) => supabase.from("user_episodes_watched").select("series_tmdb_id").eq("user_id", uid).range(desde, hasta)),
      ]);
      const favoritosIds = new Set(favs.filter((f) => f.item_type === "series").map((f) => f.tmdb_id));
      const conteoPorSerie: Record<number, number> = {};
      (vistos ?? []).forEach((v: any) => {
        conteoPorSerie[v.series_tmdb_id] = (conteoPorSerie[v.series_tmdb_id] ?? 0) + 1;
      });

      const lista: ItemConFavorito[] = (seriesRows ?? [])
        // Solo tiene sentido ofrecer series que ya empezaste a ver — no
        // tendría sentido "marcar como favorita" algo que ni arrancaste.
        .filter((r: any) => {
          const cache = r.series_cache;
          const estado = computeSeriesStatus({
            episodesWatched: conteoPorSerie[r.series_tmdb_id] ?? 0,
            totalEpisodes: cache?.total_episodes ?? 0,
            tmdbStatus: cache?.status ?? "",
            lastWatchedAt: r.last_watched_at,
          });
          return estado === "viendo" || estado === "al_dia" || estado === "terminada" || estado === "abandonada";
        })
        .map((r: any) => ({
          tmdb_id: r.series_tmdb_id,
          nombre: r.series_cache?.name ?? "—",
          poster_path: r.custom_poster_path ?? r.series_cache?.poster_path ?? null,
          favorito: favoritosIds.has(r.series_tmdb_id),
        }));
      lista.sort((a, b) => Number(b.favorito) - Number(a.favorito) || a.nombre.localeCompare(b.nombre));
      setItems(lista);
    } else {
      const [favs, movieRows] = await Promise.all([
        listarFavoritos(uid),
        supabase.from("user_movies").select("movie_tmdb_id, custom_poster_path, movies_cache(title, poster_path)").eq("user_id", uid).eq("watched", true),
      ]);
      const favoritosIds = new Set(favs.filter((f) => f.item_type === "movie").map((f) => f.tmdb_id));
      const lista: ItemConFavorito[] = (movieRows.data ?? []).map((r: any) => ({
        tmdb_id: r.movie_tmdb_id,
        nombre: r.movies_cache?.title ?? "—",
        poster_path: r.custom_poster_path ?? r.movies_cache?.poster_path ?? null,
        favorito: favoritosIds.has(r.movie_tmdb_id),
      }));
      lista.sort((a, b) => Number(b.favorito) - Number(a.favorito) || a.nombre.localeCompare(b.nombre));
      setItems(lista);
    }
    setLoading(false);
  }

  async function toggle(item: ItemConFavorito) {
    if (!userId) return;
    await toggleFavorito(userId, tipo, item.tmdb_id, item.favorito);
    setItems((prev) => prev.map((i) => (i.tmdb_id === item.tmdb_id ? { ...i, favorito: !i.favorito } : i)));
  }

  const filtrados = busqueda.trim()
    ? items.filter((i) => i.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : items;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TextInput
        style={styles.buscador}
        placeholder={tipo === "series" ? t("Buscar en tus series...") : t("Buscar en tus películas...")}
        placeholderTextColor={theme.colors.textFaint}
        value={busqueda}
        onChangeText={setBusqueda}
      />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={filtrados}
          keyExtractor={(i) => String(i.tmdb_id)}
          removeClippedSubviews
          maxToRenderPerBatch={16}
          windowSize={9}
          initialNumToRender={16}
          ListEmptyComponent={<Text style={styles.vacio}>{t("No encontramos nada con ese nombre.")}</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.fila} onPress={() => toggle(item)}>
              {item.poster_path ? (
                <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.poster} />
              ) : (
                <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              <Text style={styles.nombre} numberOfLines={2}>
                {item.nombre}
              </Text>
              <Ionicons name={item.favorito ? "heart" : "heart-outline"} size={24} color={theme.colors.primaryLight} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  buscador: { margin: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: 10 },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24 },
  fila: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 12 },
  poster: { width: 42, height: 63, borderRadius: 4, marginRight: 12 },
  nombre: { flex: 1, fontSize: 14, marginRight: 12 },
});
