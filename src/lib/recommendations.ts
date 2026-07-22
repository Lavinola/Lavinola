import { supabase } from "./supabase";
import { discoverSeriesByGenres, discoverMoviesByGenres } from "./tmdb";

/**
 * "Las mejores series/películas para ti": mira los géneros de lo que el
 * usuario ya sigue/tiene agregado, se queda con los 3 más frecuentes, y le
 * pide a TMDB los títulos más populares de esos géneros — excluyendo lo que
 * ya tiene en su lista.
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

export async function recomendarSeries(userId: string): Promise<any[]> {
  const { data: seguidas } = await supabase
    .from("user_series")
    .select("series_tmdb_id, series_cache(genre_ids)")
    .eq("user_id", userId);

  const { data: descartadas } = await supabase
    .from("user_disliked_titles")
    .select("tmdb_id")
    .eq("user_id", userId)
    .eq("item_type", "series");

  const idsYaAgregados = new Set((seguidas ?? []).map((s: any) => s.series_tmdb_id));
  (descartadas ?? []).forEach((d) => idsYaAgregados.add(d.tmdb_id));
  const generos = await generosMasFrecuentes((seguidas ?? []).map((s: any) => s.series_cache?.genre_ids));

  if (generos.length === 0) return []; // todavía no hay suficiente info del usuario

  const data = await discoverSeriesByGenres(generos);
  return (data.results ?? []).filter((r: any) => !idsYaAgregados.has(r.id)).slice(0, 10);
}

export async function recomendarPeliculas(userId: string): Promise<any[]> {
  const { data: agregadas } = await supabase
    .from("user_movies")
    .select("movie_tmdb_id, movies_cache(genre_ids)")
    .eq("user_id", userId);

  const { data: descartadas } = await supabase
    .from("user_disliked_titles")
    .select("tmdb_id")
    .eq("user_id", userId)
    .eq("item_type", "movie");

  const idsYaAgregados = new Set((agregadas ?? []).map((s: any) => s.movie_tmdb_id));
  (descartadas ?? []).forEach((d) => idsYaAgregados.add(d.tmdb_id));
  const generos = await generosMasFrecuentes((agregadas ?? []).map((s: any) => s.movies_cache?.genre_ids));

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
