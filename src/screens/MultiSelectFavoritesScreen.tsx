import React, { useEffect, useState } from "react";
import { View, FlatList, Image, Pressable, StyleSheet, Alert } from "react-native";
import { Text, AppButton } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { posterUrl } from "../lib/tmdb";
import { listarFavoritos, toggleFavorito } from "../lib/favorites";
import { fetchAllRows } from "../lib/pagination";
import { computeSeriesStatus } from "../types";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  route: any;
  navigation: any;
}

interface ItemSeleccionable {
  tmdb_id: number;
  nombre: string;
  poster_path: string | null;
  yaFavorito: boolean;
}

export default function MultiSelectFavoritesScreen({ route, navigation }: Props) {
  const { t } = useT();
  const { tipo } = route.params;
  const [items, setItems] = useState<ItemSeleccionable[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    setUserId(uid);

    if (tipo === "series") {
      // Antes esto traía "user_series" DOS VECES por separado — una adentro
      // de progresoDeSeries (para saber el estado) y otra aparte después
      // (para el nombre/tapa) — la segunda ni siquiera arrancaba hasta que
      // terminara la primera tanda entera. Ahora se trae todo junto en una
      // sola consulta, en paralelo con lo demás.
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

      const lista: ItemSeleccionable[] = (seriesRows ?? [])
        // Acá solo tiene sentido ofrecer series que ya empezaste a ver — no
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
          yaFavorito: favoritosIds.has(r.series_tmdb_id),
        }));
      setItems(lista);
    } else {
      const [favs, movieRows] = await Promise.all([
        listarFavoritos(uid),
        supabase.from("user_movies").select("movie_tmdb_id, custom_poster_path, movies_cache(title, poster_path)").eq("user_id", uid).eq("watched", true),
      ]);
      const favoritosIds = new Set(favs.filter((f) => f.item_type === "movie").map((f) => f.tmdb_id));
      const lista: ItemSeleccionable[] = (movieRows.data ?? []).map((r: any) => ({
        tmdb_id: r.movie_tmdb_id,
        nombre: r.movies_cache?.title ?? "—",
        poster_path: r.custom_poster_path ?? r.movies_cache?.poster_path ?? null,
        yaFavorito: favoritosIds.has(r.movie_tmdb_id),
      }));
      setItems(lista);
    }
  }

  function toggleSeleccion(tmdbId: number) {
    setSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(tmdbId)) nuevo.delete(tmdbId);
      else nuevo.add(tmdbId);
      return nuevo;
    });
  }

  async function confirmar() {
    if (!userId || seleccionados.size === 0) return;
    setGuardando(true);
    try {
      for (const tmdbId of seleccionados) {
        await toggleFavorito(userId, tipo, tmdbId, false); // false = todavía no es favorito, así que lo agrega
      }
      navigation.goBack();
    } finally {
      setGuardando(false);
    }
  }

  const pendientes = items.filter((i) => !i.yaFavorito);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Text style={styles.ayuda}>{t("Tocá las que quieras agregar a favoritos, y confirmá abajo.")}</Text>
      <FlatList
        data={pendientes}
        keyExtractor={(i) => String(i.tmdb_id)}
        numColumns={3}
        contentContainerStyle={{ padding: 8 }}
        ListEmptyComponent={<Text style={styles.vacio}>{t("Ya tenés todo marcado como favorito, o no hay nada agregado todavía.")}</Text>}
        renderItem={({ item }) => {
          const marcado = seleccionados.has(item.tmdb_id);
          return (
            <Pressable style={styles.cell} onPress={() => toggleSeleccion(item.tmdb_id)}>
              {item.poster_path ? (
                <Image source={{ uri: posterUrl(item.poster_path, "w342")! }} style={[styles.poster, marcado && styles.posterMarcado]} />
              ) : (
                <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }, marcado && styles.posterMarcado]} />
              )}
              {marcado && (
                <View style={styles.check}>
                  <Text style={styles.checkTexto}>✓</Text>
                </View>
              )}
              <Text numberOfLines={1} style={styles.nombre}>
                {item.nombre}
              </Text>
            </Pressable>
          );
        }}
      />
      {seleccionados.size > 0 && (
        <View style={styles.footer}>
          <AppButton title={guardando ? t("Agregando...") : t("Agregar {n} a favoritos").replace("{n}", String(seleccionados.size))} onPress={confirmar} disabled={guardando} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ayuda: { fontSize: 13, color: theme.colors.textMuted, padding: 12 },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24, width: "100%" },
  cell: { flex: 1 / 3, padding: 6 },
  poster: { width: "100%", aspectRatio: 2 / 3, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt },
  posterMarcado: { opacity: 0.5, borderWidth: 3, borderColor: theme.colors.primary },
  check: { position: "absolute", top: 10, right: 10, width: 26, height: 26, borderRadius: 13, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  checkTexto: { color: "#000000", fontWeight: "700" },
  nombre: { fontSize: 11, marginTop: 4 },
  footer: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
});
