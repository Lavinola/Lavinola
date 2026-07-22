import { supabase } from "./supabase";

export interface Favorito {
  tmdb_id: number;
  item_type: "series" | "movie";
  nombre: string;
  poster_path: string | null;
  order_index: number;
  added_at: string;
}

export interface UsuarioFavoriteo {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
}

export async function contarFavoritosDeTitulo(itemType: "series" | "movie", tmdbId: number): Promise<number> {
  const { data, error } = await supabase.rpc("contar_favoritos_titulo", { p_item_type: itemType, p_tmdb_id: tmdbId });
  if (error) throw error;
  return data ?? 0;
}

function jaccard(a: Set<string>, b: Set<string>): number | null {
  if (a.size === 0 && b.size === 0) return null;
  const interseccion = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? null : interseccion / union;
}

/**
 * % de compatibilidad entre dos usuarios, combinando varias señales
 * (lo que más pesa son las favoritas en común; el resto suma menos):
 *  - Favoritas en común (peso 0.5)
 *  - Películas vistas en común (peso 0.2)
 *  - Series con capítulos vistos en común (peso 0.15)
 *  - Calificaciones parecidas (a 1 estrella de diferencia o menos) en
 *    títulos/capítulos que los dos calificaron (peso 0.15)
 * Si una señal no tiene datos de ninguno de los dos, se excluye y se
 * reparte su peso entre las que sí tienen datos. Si ninguna tiene datos,
 * devuelve null (no hay nada que comparar todavía).
 */
export async function calcularCompatibilidad(userIdA: string, userIdB: string): Promise<number | null> {
  const [
    { data: favA },
    { data: favB },
    { data: moviesA },
    { data: moviesB },
    { data: seriesA },
    { data: seriesB },
    { data: episodiosA },
    { data: episodiosB },
  ] = await Promise.all([
    supabase.from("user_favorites").select("item_type, tmdb_id").eq("user_id", userIdA),
    supabase.from("user_favorites").select("item_type, tmdb_id").eq("user_id", userIdB),
    supabase.from("user_movies").select("movie_tmdb_id, watched, rating").eq("user_id", userIdA),
    supabase.from("user_movies").select("movie_tmdb_id, watched, rating").eq("user_id", userIdB),
    supabase.from("user_series").select("series_tmdb_id, rating").eq("user_id", userIdA),
    supabase.from("user_series").select("series_tmdb_id, rating").eq("user_id", userIdB),
    supabase.from("user_episodes_watched").select("series_tmdb_id, season_number, episode_number, rating").eq("user_id", userIdA),
    supabase.from("user_episodes_watched").select("series_tmdb_id, season_number, episode_number, rating").eq("user_id", userIdB),
  ]);

  // --- Favoritas en común ---
  const claveFav = (f: { item_type: string; tmdb_id: number }) => `${f.item_type}:${f.tmdb_id}`;
  const favScore = jaccard(new Set((favA ?? []).map(claveFav)), new Set((favB ?? []).map(claveFav)));

  // --- Películas vistas en común ---
  const vistasA = new Set((moviesA ?? []).filter((m: any) => m.watched).map((m: any) => m.movie_tmdb_id));
  const vistasB = new Set((moviesB ?? []).filter((m: any) => m.watched).map((m: any) => m.movie_tmdb_id));
  const moviesScore = jaccard(vistasA, vistasB);

  // --- Series con algún capítulo visto en común ---
  const seriesConVistoA = new Set((episodiosA ?? []).map((e: any) => e.series_tmdb_id));
  const seriesConVistoB = new Set((episodiosB ?? []).map((e: any) => e.series_tmdb_id));
  const seriesScore = jaccard(seriesConVistoA, seriesConVistoB);

  // --- Calificaciones parecidas (películas + series + capítulos que los dos calificaron) ---
  const calA: Record<string, number> = {};
  (moviesA ?? []).forEach((m: any) => { if (m.rating != null) calA[`movie:${m.movie_tmdb_id}`] = m.rating; });
  (seriesA ?? []).forEach((s: any) => { if (s.rating != null) calA[`series:${s.series_tmdb_id}`] = s.rating; });
  (episodiosA ?? []).forEach((e: any) => { if (e.rating != null) calA[`ep:${e.series_tmdb_id}:${e.season_number}:${e.episode_number}`] = e.rating; });
  const calB: Record<string, number> = {};
  (moviesB ?? []).forEach((m: any) => { if (m.rating != null) calB[`movie:${m.movie_tmdb_id}`] = m.rating; });
  (seriesB ?? []).forEach((s: any) => { if (s.rating != null) calB[`series:${s.series_tmdb_id}`] = s.rating; });
  (episodiosB ?? []).forEach((e: any) => { if (e.rating != null) calB[`ep:${e.series_tmdb_id}:${e.season_number}:${e.episode_number}`] = e.rating; });

  const clavesEnComun = Object.keys(calA).filter((k) => k in calB);
  const ratingsScore =
    clavesEnComun.length === 0 ? null : clavesEnComun.filter((k) => Math.abs(calA[k] - calB[k]) <= 1).length / clavesEnComun.length;

  const señales: { score: number | null; peso: number }[] = [
    { score: favScore, peso: 0.5 },
    { score: moviesScore, peso: 0.2 },
    { score: seriesScore, peso: 0.15 },
    { score: ratingsScore, peso: 0.15 },
  ];
  const disponibles = señales.filter((s) => s.score !== null);
  if (disponibles.length === 0) return null;

  const pesoTotal = disponibles.reduce((acc, s) => acc + s.peso, 0);
  const combinado = disponibles.reduce((acc, s) => acc + (s.score as number) * (s.peso / pesoTotal), 0);
  return Math.round(combinado * 100);
}

export async function listarUsuariosQueFavoritearon(itemType: "series" | "movie", tmdbId: number): Promise<UsuarioFavoriteo[]> {
  const { data, error } = await supabase.rpc("listar_favoritos_titulo", { p_item_type: itemType, p_tmdb_id: tmdbId });
  if (error) throw error;
  return data ?? [];
}

export async function esFavorito(userId: string, itemType: "series" | "movie", tmdbId: number): Promise<boolean> {
  const { data } = await supabase
    .from("user_favorites")
    .select("tmdb_id")
    .eq("user_id", userId)
    .eq("item_type", itemType)
    .eq("tmdb_id", tmdbId)
    .maybeSingle();
  return !!data;
}

export async function toggleFavorito(
  userId: string,
  itemType: "series" | "movie",
  tmdbId: number,
  esFavoritoActual: boolean
) {
  if (esFavoritoActual) {
    await supabase
      .from("user_favorites")
      .delete()
      .eq("user_id", userId)
      .eq("item_type", itemType)
      .eq("tmdb_id", tmdbId);
  } else {
    // Nuevo favorito va al final del orden personalizado.
    const { data: ultimo } = await supabase
      .from("user_favorites")
      .select("order_index")
      .eq("user_id", userId)
      .eq("item_type", itemType)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    const siguienteOrden = (ultimo?.order_index ?? -1) + 1;
    await supabase.from("user_favorites").insert({ user_id: userId, item_type: itemType, tmdb_id: tmdbId, order_index: siguienteOrden });
  }
}

/** Trae los favoritos del usuario con nombre/poster ya resueltos desde el cache, en su orden personalizado. */
export async function listarFavoritos(userId: string): Promise<Favorito[]> {
  const { data, error } = await supabase
    .from("user_favorites")
    .select("item_type, tmdb_id, order_index, added_at")
    .eq("user_id", userId)
    .order("order_index", { ascending: true });
  if (error) throw error;
  const favs = data ?? [];
  if (favs.length === 0) return [];

  // Antes esto hacía 4 consultas POR CADA favorito (nombre+tapa, una fila
  // atrás de la otra) — con muchos favoritos, se sentía como minutos de
  // espera. Ahora se trae todo en un puñado de consultas en tanda, y se arma
  // el resultado acá mismo, en memoria.
  const idsSeries = favs.filter((f) => f.item_type === "series").map((f) => f.tmdb_id);
  const idsMovies = favs.filter((f) => f.item_type === "movie").map((f) => f.tmdb_id);

  const [seriesCache, moviesCache, userSeries, userMovies] = await Promise.all([
    idsSeries.length > 0 ? supabase.from("series_cache").select("tmdb_id, name, poster_path").in("tmdb_id", idsSeries) : Promise.resolve({ data: [] }),
    idsMovies.length > 0 ? supabase.from("movies_cache").select("tmdb_id, title, poster_path").in("tmdb_id", idsMovies) : Promise.resolve({ data: [] }),
    idsSeries.length > 0
      ? supabase.from("user_series").select("series_tmdb_id, custom_poster_path").eq("user_id", userId).in("series_tmdb_id", idsSeries)
      : Promise.resolve({ data: [] }),
    idsMovies.length > 0
      ? supabase.from("user_movies").select("movie_tmdb_id, custom_poster_path").eq("user_id", userId).in("movie_tmdb_id", idsMovies)
      : Promise.resolve({ data: [] }),
  ]);

  const seriesCacheMap = new Map((seriesCache.data ?? []).map((r: any) => [r.tmdb_id, r]));
  const moviesCacheMap = new Map((moviesCache.data ?? []).map((r: any) => [r.tmdb_id, r]));
  const userSeriesMap = new Map((userSeries.data ?? []).map((r: any) => [r.series_tmdb_id, r]));
  const userMoviesMap = new Map((userMovies.data ?? []).map((r: any) => [r.movie_tmdb_id, r]));

  return favs.map((fav) => {
    if (fav.item_type === "series") {
      const cache = seriesCacheMap.get(fav.tmdb_id);
      const custom = userSeriesMap.get(fav.tmdb_id);
      return {
        tmdb_id: fav.tmdb_id,
        item_type: "series" as const,
        nombre: cache?.name ?? "—",
        poster_path: custom?.custom_poster_path ?? cache?.poster_path ?? null,
        order_index: fav.order_index,
        added_at: fav.added_at,
      };
    } else {
      const cache = moviesCacheMap.get(fav.tmdb_id);
      const custom = userMoviesMap.get(fav.tmdb_id);
      return {
        tmdb_id: fav.tmdb_id,
        item_type: "movie" as const,
        nombre: cache?.title ?? "—",
        poster_path: custom?.custom_poster_path ?? cache?.poster_path ?? null,
        order_index: fav.order_index,
        added_at: fav.added_at,
      };
    }
  });
}

/** Guarda el orden nuevo completo después de arrastrar y soltar. */
export async function guardarOrdenCompleto(userId: string, itemType: "series" | "movie", tmdbIdsEnOrden: number[]) {
  await Promise.all(
    tmdbIdsEnOrden.map((tmdbId, index) =>
      supabase.from("user_favorites").update({ order_index: index }).eq("user_id", userId).eq("item_type", itemType).eq("tmdb_id", tmdbId)
    )
  );
}

/** Intercambia el orden de un favorito con el de arriba o abajo (reordenar a mano). */
export async function moverFavorito(
  userId: string,
  itemType: "series" | "movie",
  ordenActual: Favorito[],
  tmdbId: number,
  direccion: "arriba" | "abajo"
) {
  const idx = ordenActual.findIndex((f) => f.tmdb_id === tmdbId);
  const idxVecino = direccion === "arriba" ? idx - 1 : idx + 1;
  if (idx === -1 || idxVecino < 0 || idxVecino >= ordenActual.length) return;

  const actual = ordenActual[idx];
  const vecino = ordenActual[idxVecino];

  await supabase.from("user_favorites").update({ order_index: vecino.order_index }).eq("user_id", userId).eq("item_type", itemType).eq("tmdb_id", actual.tmdb_id);
  await supabase.from("user_favorites").update({ order_index: actual.order_index }).eq("user_id", userId).eq("item_type", itemType).eq("tmdb_id", vecino.tmdb_id);
}
