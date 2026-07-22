import { supabase } from "./supabase";
import { GENEROS_PELICULAS } from "./tmdbGenres";

/**
 * El año del Recap actualmente disponible (el más reciente cuyo 24/12 ya
 * pasó), pero SOLO dentro de una ventana razonable después de esa fecha
 * (hasta el 15/1 siguiente) — pasado eso, no se ofrece más hasta el próximo
 * 24/12 (no tendría sentido mostrar "tu año" en julio).
 */
export function recapYearDisponible(fechaRef: Date = new Date()): number | null {
  const anio = fechaRef.getFullYear();
  const candidatos = [anio, anio - 1];
  for (const y of candidatos) {
    const inicio = new Date(y, 11, 24); // 24/12 de ese año
    const fin = new Date(y + 1, 0, 16); // hasta el 15/1 del año siguiente, inclusive
    if (fechaRef >= inicio && fechaRef < fin) return y;
  }
  return null;
}

export interface EstadoRecap {
  yearDisponible: number | null;
  debeAutoAbrir: boolean; // primera vez que se ve este año, se abre solo
  debeMostrarBanner: boolean; // ya se cerró una vez, pero pasaron menos de 15 días
}

export function calcularEstadoRecap(perfil: { recap_year_shown?: number | null; recap_dismissed_at?: string | null }): EstadoRecap {
  const yearDisponible = recapYearDisponible();
  if (!yearDisponible) return { yearDisponible: null, debeAutoAbrir: false, debeMostrarBanner: false };

  const yaVisto = perfil.recap_year_shown === yearDisponible;
  if (!yaVisto) return { yearDisponible, debeAutoAbrir: true, debeMostrarBanner: false };

  const dismissedAt = perfil.recap_dismissed_at ? new Date(perfil.recap_dismissed_at).getTime() : 0;
  const diasDesdeQueSeCerro = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
  return { yearDisponible, debeAutoAbrir: false, debeMostrarBanner: diasDesdeQueSeCerro < 15 };
}

export async function marcarRecapVisto(userId: string, year: number) {
  await supabase.from("profiles").update({ recap_year_shown: year, recap_dismissed_at: new Date().toISOString() }).eq("id", userId);
}

export interface RecapTitulo {
  tmdb_id: number;
  nombre: string;
  poster_path: string | null;
}

export interface RecapEpisodio {
  series_tmdb_id: number;
  season_number: number;
  episode_number: number;
  nombre_serie: string;
  nombre_episodio: string | null;
  poster_path: string | null;
}

export interface DatosRecap {
  year: number;
  horasPeliculas: number;
  horasSeries: number;
  topPeliculas: RecapTitulo[];
  topSeries: RecapTitulo[];
  topGeneros: string[];
  topEpisodios: RecapEpisodio[];
}

/** Calcula el Recap del usuario para el período [24/12 del año anterior, 24/12 de `year`]. */
export async function calcularRecap(userId: string, year: number): Promise<DatosRecap> {
  const desde = new Date(year - 1, 11, 24).toISOString();
  const hasta = new Date(year, 11, 24).toISOString();

  const [
    { data: peliculasVistas },
    { data: seriesAgregadas },
    { data: episodiosVistos },
    { data: favoritas },
    { data: misPosts },
    { data: misComentarios },
  ] = await Promise.all([
    supabase
      .from("user_movies")
      .select("movie_tmdb_id, rating, times_watched, first_watched_at, movies_cache(title, poster_path, genre_ids, runtime_minutes)")
      .eq("user_id", userId)
      .eq("watched", true)
      .gte("first_watched_at", desde)
      .lt("first_watched_at", hasta),
    supabase.from("user_series").select("series_tmdb_id, rating, series_cache(name, poster_path)").eq("user_id", userId),
    supabase
      .from("user_episodes_watched")
      .select("series_tmdb_id, season_number, episode_number, rating, times_watched, watched_at, episodes_cache(name, runtime_minutes), series_cache(name, poster_path)")
      .eq("user_id", userId)
      .gte("watched_at", desde)
      .lt("watched_at", hasta),
    supabase.from("user_favorites").select("item_type, tmdb_id").eq("user_id", userId),
    supabase.from("posts").select("item_type, tmdb_id, season_number, episode_number").eq("user_id", userId).gte("created_at", desde).lt("created_at", hasta),
    supabase.from("comentarios").select("target_type, target_id").eq("user_id", userId).gte("created_at", desde).lt("created_at", hasta),
  ]);

  const favMovies = new Set((favoritas ?? []).filter((f: any) => f.item_type === "movie").map((f: any) => f.tmdb_id));
  const favSeries = new Set((favoritas ?? []).filter((f: any) => f.item_type === "series").map((f: any) => f.tmdb_id));

  // Interacciones (posts + comentarios) por película/serie/capítulo.
  const interaccionesMovie: Record<number, number> = {};
  const interaccionesSerie: Record<number, number> = {};
  const interaccionesEpisodio: Record<string, number> = {};
  (misPosts ?? []).forEach((p: any) => {
    if (p.item_type === "movie" && p.tmdb_id) interaccionesMovie[p.tmdb_id] = (interaccionesMovie[p.tmdb_id] ?? 0) + 1;
    else if (p.item_type === "series" && p.tmdb_id) interaccionesSerie[p.tmdb_id] = (interaccionesSerie[p.tmdb_id] ?? 0) + 1;
    else if (p.item_type === "episode" && p.tmdb_id) {
      interaccionesSerie[p.tmdb_id] = (interaccionesSerie[p.tmdb_id] ?? 0) + 1;
      interaccionesEpisodio[`${p.tmdb_id}:${p.season_number}:${p.episode_number}`] = (interaccionesEpisodio[`${p.tmdb_id}:${p.season_number}:${p.episode_number}`] ?? 0) + 1;
    }
  });
  (misComentarios ?? []).forEach((c: any) => {
    if (c.target_type === "movie") interaccionesMovie[Number(c.target_id)] = (interaccionesMovie[Number(c.target_id)] ?? 0) + 1;
    else if (c.target_type === "series") interaccionesSerie[Number(c.target_id)] = (interaccionesSerie[Number(c.target_id)] ?? 0) + 1;
    else if (c.target_type === "episode") {
      const [sId, sNum, eNum] = String(c.target_id).split(":");
      interaccionesSerie[Number(sId)] = (interaccionesSerie[Number(sId)] ?? 0) + 1;
      interaccionesEpisodio[`${sId}:${sNum}:${eNum}`] = (interaccionesEpisodio[`${sId}:${sNum}:${eNum}`] ?? 0) + 1;
    }
  });

  // ---------- Películas ----------
  let horasPeliculas = 0;
  const generoConteo: Record<number, number> = {};
  const peliculasConScore = (peliculasVistas ?? []).map((p: any) => {
    const runtime = p.movies_cache?.runtime_minutes ?? 0;
    horasPeliculas += (runtime * (p.times_watched ?? 1)) / 60;
    (p.movies_cache?.genre_ids ?? []).forEach((g: number) => (generoConteo[g] = (generoConteo[g] ?? 0) + 1));
    const esFav = favMovies.has(p.movie_tmdb_id);
    const score = (p.times_watched ?? 1) * 10 + (p.rating ?? 0) * 8 + (interaccionesMovie[p.movie_tmdb_id] ?? 0) * 5 + (esFav ? 30 : 0);
    return { tmdb_id: p.movie_tmdb_id, nombre: p.movies_cache?.title ?? "—", poster_path: p.movies_cache?.poster_path ?? null, score };
  });
  peliculasConScore.sort((a, b) => b.score - a.score);
  const topPeliculas = peliculasConScore.slice(0, 5).map((p) => ({ tmdb_id: p.tmdb_id, nombre: p.nombre, poster_path: p.poster_path }));

  const topGeneros = Object.entries(generoConteo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => GENEROS_PELICULAS[Number(id)])
    .filter(Boolean);

  // ---------- Series (a partir de los capítulos vistos en el período) ----------
  let horasSeries = 0;
  const minutosPorSerie: Record<number, number> = {};
  const nombreSerie: Record<number, string> = {};
  const posterSerie: Record<number, string | null> = {};
  (episodiosVistos ?? []).forEach((e: any) => {
    const runtime = e.episodes_cache?.runtime_minutes ?? 0;
    const minutos = runtime * (e.times_watched ?? 1);
    horasSeries += minutos / 60;
    minutosPorSerie[e.series_tmdb_id] = (minutosPorSerie[e.series_tmdb_id] ?? 0) + minutos;
    nombreSerie[e.series_tmdb_id] = e.series_cache?.name ?? "—";
    posterSerie[e.series_tmdb_id] = e.series_cache?.poster_path ?? null;
  });
  const ratingPorSerie: Record<number, number> = {};
  (seriesAgregadas ?? []).forEach((s: any) => {
    if (s.rating) ratingPorSerie[s.series_tmdb_id] = s.rating;
  });
  const seriesConScore = Object.keys(minutosPorSerie).map((idStr) => {
    const id = Number(idStr);
    const esFav = favSeries.has(id);
    const score = minutosPorSerie[id] * 0.3 + (ratingPorSerie[id] ?? 0) * 8 + (interaccionesSerie[id] ?? 0) * 5 + (esFav ? 30 : 0);
    return { tmdb_id: id, nombre: nombreSerie[id], poster_path: posterSerie[id], score };
  });
  seriesConScore.sort((a, b) => b.score - a.score);
  const topSeries = seriesConScore.slice(0, 5).map((s) => ({ tmdb_id: s.tmdb_id, nombre: s.nombre, poster_path: s.poster_path }));

  // ---------- Top 3 capítulos ----------
  const episodiosConScore = (episodiosVistos ?? []).map((e: any) => {
    const clave = `${e.series_tmdb_id}:${e.season_number}:${e.episode_number}`;
    const score = (e.times_watched ?? 1) * 10 + (e.rating ?? 0) * 8 + (interaccionesEpisodio[clave] ?? 0) * 5;
    return {
      series_tmdb_id: e.series_tmdb_id,
      season_number: e.season_number,
      episode_number: e.episode_number,
      nombre_serie: e.series_cache?.name ?? "—",
      nombre_episodio: e.episodes_cache?.name ?? null,
      poster_path: e.series_cache?.poster_path ?? null,
      score,
    };
  });
  episodiosConScore.sort((a, b) => b.score - a.score);
  const topEpisodios = episodiosConScore.slice(0, 3).map((e) => ({
    series_tmdb_id: e.series_tmdb_id,
    season_number: e.season_number,
    episode_number: e.episode_number,
    nombre_serie: e.nombre_serie,
    nombre_episodio: e.nombre_episodio,
    poster_path: e.poster_path,
  }));

  return {
    year,
    horasPeliculas: Math.round(horasPeliculas),
    horasSeries: Math.round(horasSeries),
    topPeliculas,
    topSeries,
    topGeneros,
    topEpisodios,
  };
}
