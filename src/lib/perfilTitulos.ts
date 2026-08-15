import { supabase } from "./supabase";
import { fetchAllRows } from "./pagination";
import { computeSeriesStatus, SeriesStatusFilter } from "../types/index";

export type OrdenTitulosPerfil = "ultima_vista" | "alfabetico" | "fecha_lanzamiento" | "puntuacion";

export interface PeliculaPerfilItem {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  runtime_minutes: number | null;
  watched_at: string | null;
  rating: number | null;
}

export interface SeriePerfilItem {
  tmdb_id: number;
  name: string;
  poster_path: string | null;
  first_air_date: string | null;
  last_watched_at: string | null;
  rating: number | null;
  estado: SeriesStatusFilter;
  porcentaje: number;
  total_seasons: number;
}

function ordenar<T extends { rating: number | null }>(
  items: T[],
  orden: OrdenTitulosPerfil,
  ascendente: boolean,
  campoTitulo: (i: T) => string,
  campoFecha: (i: T) => string | null,
  campoUltimaVista: (i: T) => string | null
): T[] {
  const copia = [...items];
  copia.sort((a, b) => {
    let cmp = 0;
    if (orden === "alfabetico") cmp = campoTitulo(a).localeCompare(campoTitulo(b));
    else if (orden === "fecha_lanzamiento") cmp = (campoFecha(a) ?? "").localeCompare(campoFecha(b) ?? "");
    else if (orden === "puntuacion") cmp = (a.rating ?? 0) - (b.rating ?? 0);
    else cmp = (campoUltimaVista(a) ?? "").localeCompare(campoUltimaVista(b) ?? ""); // ultima_vista, el default
    return ascendente ? cmp : -cmp;
  });
  return copia;
}

/** Solo las películas que esa persona marcó como vistas — respeta la misma visibilidad de siempre (pública, o privada + la seguís). */
export async function listarPeliculasVistasDeUsuario(
  targetUserId: string,
  orden: OrdenTitulosPerfil,
  ascendente: boolean
): Promise<PeliculaPerfilItem[]> {
  const rows = await fetchAllRows((desde, hasta) =>
    supabase
      .from("user_movies")
      .select("movie_tmdb_id, watched_at, rating, movies_cache(title, poster_path, release_date, runtime_minutes)")
      .eq("user_id", targetUserId)
      .eq("watched", true)
      .range(desde, hasta)
  );
  const items: PeliculaPerfilItem[] = (rows ?? []).map((r: any) => ({
    tmdb_id: r.movie_tmdb_id,
    title: r.movies_cache?.title ?? "—",
    poster_path: r.movies_cache?.poster_path ?? null,
    release_date: r.movies_cache?.release_date ?? null,
    runtime_minutes: r.movies_cache?.runtime_minutes ?? null,
    watched_at: r.watched_at,
    rating: r.rating,
  }));
  return ordenar(
    items,
    orden,
    ascendente,
    (i) => i.title,
    (i) => i.release_date,
    (i) => i.watched_at
  );
}

/**
 * Solo las series terminadas, al día, o que está viendo — NO las que
 * todavía no empezó. Se calcula el estado igual que en "Mis series", en
 * base a los capítulos vistos reales de esa persona (no un campo caché
 * que puede quedar desactualizado).
 */
export async function listarSeriesEnCursoDeUsuario(
  targetUserId: string,
  orden: OrdenTitulosPerfil,
  ascendente: boolean
): Promise<SeriePerfilItem[]> {
  const rows = await fetchAllRows((desde, hasta) =>
    supabase
      .from("user_series")
      .select("series_tmdb_id, rating, series_cache(name, poster_path, first_air_date, status, total_episodes, total_seasons)")
      .eq("user_id", targetUserId)
      .range(desde, hasta)
  );
  const vistos = await fetchAllRows((desde, hasta) =>
    supabase.from("user_episodes_watched").select("series_tmdb_id, watched_at").eq("user_id", targetUserId).range(desde, hasta)
  );

  const conteoPorSerie: Record<number, number> = {};
  const ultimaVistaPorSerie: Record<number, string> = {};
  (vistos ?? []).forEach((v: any) => {
    conteoPorSerie[v.series_tmdb_id] = (conteoPorSerie[v.series_tmdb_id] ?? 0) + 1;
    if (v.watched_at && (!ultimaVistaPorSerie[v.series_tmdb_id] || v.watched_at > ultimaVistaPorSerie[v.series_tmdb_id])) {
      ultimaVistaPorSerie[v.series_tmdb_id] = v.watched_at;
    }
  });

  const resultado: SeriePerfilItem[] = [];
  for (const row of rows ?? []) {
    const cache: any = row.series_cache;
    const episodesWatched = conteoPorSerie[row.series_tmdb_id] ?? 0;
    const estado = computeSeriesStatus({
      episodesWatched,
      totalEpisodes: cache?.total_episodes ?? 0,
      tmdbStatus: cache?.status ?? "",
      lastWatchedAt: ultimaVistaPorSerie[row.series_tmdb_id] ?? null,
    });
    if (estado === "sin_comenzar") continue;

    resultado.push({
      tmdb_id: row.series_tmdb_id,
      name: cache?.name ?? "—",
      poster_path: cache?.poster_path ?? null,
      first_air_date: cache?.first_air_date ?? null,
      last_watched_at: ultimaVistaPorSerie[row.series_tmdb_id] ?? null,
      rating: (row as any).rating,
      estado,
      porcentaje: cache?.total_episodes > 0 ? Math.round((episodesWatched / cache.total_episodes) * 100) : 0,
      total_seasons: cache?.total_seasons ?? 0,
    });
  }

  return ordenar(
    resultado,
    orden,
    ascendente,
    (i) => i.name,
    (i) => i.first_air_date,
    (i) => i.last_watched_at
  );
}
