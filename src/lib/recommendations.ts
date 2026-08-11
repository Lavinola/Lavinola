import { supabase } from "./supabase";
import { fetchAllRows } from "./pagination";
import { discoverSeriesByGenres, discoverMoviesByGenres, getMovieRecommendations, getSeriesRecommendations } from "./tmdb";

const CANTIDAD_SEMILLAS = 10; // de cuántos títulos propios partimos para pedir "recomendado a partir de esto"

/**
 * "Las mejores series/películas para ti": mira los géneros de lo que el
 * usuario ya sigue/tiene agregado, se queda con los 3 más frecuentes, y le
 * pide a TMDB los títulos más populares de esos géneros — excluyendo lo que
 * ya tiene en su lista.
 *
 * Se usa como red de seguridad para usuarios nuevos, que todavía no tienen
 * nada calificado/visto de donde partir para el algoritmo de "títulos
 * similares" de más abajo (que es el que se usa normalmente).
 */
export async function generosMasFrecuentes(genreArrays: (number[] | null)[]): Promise<number[]> {
  const conteo: Record<number, number> = {};
  for (const generos of genreArrays) {
    for (const g of generos ?? []) {
      conteo[g] = (conteo[g] ?? 0) + 1;
    }
  }
  return Object.entries(conteo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => Number(id));
}

/**
 * Arma la lista de "semillas": los títulos propios de los que partir para
 * pedirle a TMDB "gente que vio esto también vio...". Prioriza los mejor
 * calificados (4-5 estrellas); si no hay suficientes, completa con los
 * vistos más recientemente (calificados o no) — así igual arranca a
 * recomendar aunque el usuario todavía no haya calificado nada.
 */
function elegirSemillas<T extends { tmdb_id: number; rating: number | null; fecha: string | null }>(items: T[]): number[] {
  const bienCalificados = items.filter((i) => (i.rating ?? 0) >= 4).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const resto = items
    .filter((i) => (i.rating ?? 0) < 4)
    .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  return [...bienCalificados, ...resto].slice(0, CANTIDAD_SEMILLAS).map((i) => i.tmdb_id);
}

/** Junta las recomendaciones de varias semillas, saca duplicados y lo que ya tiene el usuario, y prioriza lo que salió recomendado por más de una semilla. */
function mezclarRecomendaciones(porSemilla: any[][], idsExcluir: Set<number>): any[] {
  const conteo = new Map<number, { item: any; veces: number }>();
  for (const resultados of porSemilla) {
    for (const item of resultados) {
      if (idsExcluir.has(item.id)) continue;
      const actual = conteo.get(item.id);
      if (actual) actual.veces += 1;
      else conteo.set(item.id, { item, veces: 1 });
    }
  }
  return [...conteo.values()]
    .sort((a, b) => b.veces - a.veces || (b.item.popularity ?? 0) - (a.item.popularity ?? 0))
    .map((c) => c.item)
    .slice(0, 30); // igual que en tendencia: de más, para que después de filtrar lo ya agregado siga quedando un margen cómodo
}

export async function recomendarSeries(userId: string): Promise<any[]> {
  const seguidas = await fetchAllRows<any>((desde, hasta) =>
    supabase
      .from("user_series")
      .select("series_tmdb_id, rating, last_watched_at, created_at, series_cache(genre_ids)")
      .eq("user_id", userId)
      .range(desde, hasta)
  );

  const { data: descartadas } = await supabase
    .from("user_disliked_titles")
    .select("tmdb_id")
    .eq("user_id", userId)
    .eq("item_type", "series");

  const idsYaAgregados = new Set(seguidas.map((s: any) => s.series_tmdb_id));
  (descartadas ?? []).forEach((d) => idsYaAgregados.add(d.tmdb_id));

  const semillas = elegirSemillas(
    seguidas.map((s: any) => ({ tmdb_id: s.series_tmdb_id, rating: s.rating, fecha: s.last_watched_at ?? s.created_at }))
  );

  if (semillas.length > 0) {
    const porSemilla = await Promise.all(
      semillas.map((id) =>
        getSeriesRecommendations(id)
          .then((r: any) => r.results ?? [])
          .catch(() => [])
      )
    );
    const mezcladas = mezclarRecomendaciones(porSemilla, idsYaAgregados);
    if (mezcladas.length > 0) return mezcladas;
    // si ninguna semilla trajo nada (poco común, títulos muy de nicho), cae al respaldo de géneros de abajo
  }

  const generos = await generosMasFrecuentes(seguidas.map((s: any) => s.series_cache?.genre_ids));
  if (generos.length === 0) return []; // todavía no hay suficiente info del usuario
  const data = await discoverSeriesByGenres(generos);
  return (data.results ?? []).filter((r: any) => !idsYaAgregados.has(r.id)).slice(0, 10);
}

export async function recomendarPeliculas(userId: string): Promise<any[]> {
  const agregadas = await fetchAllRows<any>((desde, hasta) =>
    supabase
      .from("user_movies")
      .select("movie_tmdb_id, rating, watched_at, added_at, movies_cache(genre_ids)")
      .eq("user_id", userId)
      .range(desde, hasta)
  );

  const { data: descartadas } = await supabase
    .from("user_disliked_titles")
    .select("tmdb_id")
    .eq("user_id", userId)
    .eq("item_type", "movie");

  const idsYaAgregados = new Set(agregadas.map((s: any) => s.movie_tmdb_id));
  (descartadas ?? []).forEach((d) => idsYaAgregados.add(d.tmdb_id));

  const semillas = elegirSemillas(
    agregadas.map((s: any) => ({ tmdb_id: s.movie_tmdb_id, rating: s.rating, fecha: s.watched_at ?? s.added_at }))
  );

  if (semillas.length > 0) {
    const porSemilla = await Promise.all(
      semillas.map((id) =>
        getMovieRecommendations(id)
          .then((r: any) => r.results ?? [])
          .catch(() => [])
      )
    );
    const mezcladas = mezclarRecomendaciones(porSemilla, idsYaAgregados);
    if (mezcladas.length > 0) return mezcladas;
  }

  const generos = await generosMasFrecuentes(agregadas.map((s: any) => s.movies_cache?.genre_ids));
  if (generos.length === 0) return [];
  const data = await discoverMoviesByGenres(generos);
  return (data.results ?? []).filter((r: any) => !idsYaAgregados.has(r.id)).slice(0, 10);
}

export async function marcarNoMeInteresa(userId: string, tipo: "series" | "movie", tmdbId: number) {
  await supabase.from("user_disliked_titles").insert({ user_id: userId, item_type: tipo, tmdb_id: tmdbId });
}

export async function listarDescartados(userId: string): Promise<{ item_type: "series" | "movie"; tmdb_id: number; nombre: string; poster_path: string | null }[]> {
  const { data } = await supabase.from("user_disliked_titles").select("item_type, tmdb_id").eq("user_id", userId);
  const resultado = [];
  for (const d of data ?? []) {
    const tabla = d.item_type === "series" ? "series_cache" : "movies_cache";
    const { data: cache } = await supabase.from(tabla).select("*").eq("tmdb_id", d.tmdb_id).maybeSingle();
    resultado.push({
      item_type: d.item_type as "series" | "movie",
      tmdb_id: d.tmdb_id,
      nombre: cache ? (d.item_type === "series" ? cache.name : cache.title) : "—",
      poster_path: cache?.poster_path ?? null,
    });
  }
  return resultado;
}

export async function quitarDescarte(userId: string, tipo: "series" | "movie", tmdbId: number) {
  await supabase.from("user_disliked_titles").delete().eq("user_id", userId).eq("item_type", tipo).eq("tmdb_id", tmdbId);
}
