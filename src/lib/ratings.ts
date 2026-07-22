import { supabase } from "./supabase";

export async function calificarSerie(userId: string, tmdbId: number, rating: number) {
  const { error } = await supabase.from("user_series").update({ rating }).eq("user_id", userId).eq("series_tmdb_id", tmdbId);
  if (error) { console.error("calificarSerie:", error.message); throw new Error(`No se pudo guardar la calificación (${error.message}).`); }
}

export async function calificarPelicula(userId: string, tmdbId: number, rating: number) {
  const { error } = await supabase.from("user_movies").update({ rating }).eq("user_id", userId).eq("movie_tmdb_id", tmdbId);
  if (error) { console.error("calificarPelicula:", error.message); throw new Error(`No se pudo guardar la calificación (${error.message}).`); }
}

export async function guardarPlataformaSerie(userId: string, tmdbId: number, plataforma: string) {
  const { error } = await supabase.from("user_series").update({ watched_platform: plataforma }).eq("user_id", userId).eq("series_tmdb_id", tmdbId);
  if (error) { console.error("guardarPlataformaSerie:", error.message); throw new Error(`No se pudo guardar (${error.message}).`); }
}

export async function guardarPlataformaPelicula(userId: string, tmdbId: number, plataforma: string) {
  const { error } = await supabase.from("user_movies").update({ watched_platform: plataforma }).eq("user_id", userId).eq("movie_tmdb_id", tmdbId);
  if (error) { console.error("guardarPlataformaPelicula:", error.message); throw new Error(`No se pudo guardar (${error.message}).`); }
}

export async function guardarPlataformaEpisodio(userId: string, seriesTmdbId: number, season: number, episode: number, plataforma: string) {
  await supabase
    .from("user_episodes_watched")
    .update({ watched_platform: plataforma })
    .eq("user_id", userId)
    .eq("series_tmdb_id", seriesTmdbId)
    .eq("season_number", season)
    .eq("episode_number", episode);
}

export async function calificarEpisodio(
  userId: string,
  seriesTmdbId: number,
  season: number,
  episode: number,
  rating: number
) {
  await supabase
    .from("user_episodes_watched")
    .update({ rating })
    .eq("user_id", userId)
    .eq("series_tmdb_id", seriesTmdbId)
    .eq("season_number", season)
    .eq("episode_number", episode);
}

async function promedio(tabla: string, filtro: Record<string, any>): Promise<{ promedio: number | null; cantidad: number }> {
  let query = supabase.from(tabla).select("rating").not("rating", "is", null);
  for (const [k, v] of Object.entries(filtro)) query = query.eq(k, v);
  const { data } = await query;
  if (!data || data.length === 0) return { promedio: null, cantidad: 0 };
  const suma = data.reduce((acc, r: any) => acc + r.rating, 0);
  return { promedio: suma / data.length, cantidad: data.length };
}

export function promedioSerie(tmdbId: number) {
  return promedio("user_series", { series_tmdb_id: tmdbId });
}

export function promedioPelicula(tmdbId: number) {
  return promedio("user_movies", { movie_tmdb_id: tmdbId });
}

export function promedioEpisodio(seriesTmdbId: number, season: number, episode: number) {
  return promedio("user_episodes_watched", { series_tmdb_id: seriesTmdbId, season_number: season, episode_number: episode });
}

/** Cuánta gente agregó este título — el "Popularidad: X han añadido" de TV Time. */
export async function cantidadQueAgregaron(tabla: "user_series" | "user_movies", tmdbId: number): Promise<number> {
  const columna = tabla === "user_series" ? "series_tmdb_id" : "movie_tmdb_id";
  const { count } = await supabase.from(tabla).select("*", { count: "exact", head: true }).eq(columna, tmdbId);
  return count ?? 0;
}
