export type SeriesStatusFilter =
  | "terminada"
  | "al_dia"
  | "sin_comenzar"
  | "viendo"
  | "abandonada";

// Umbral fijo para MVP (ver spec). A futuro: configurable por usuario.
export const ABANDONADA_UMBRAL_DIAS = 60; // 2 meses

export interface Profile {
  id: string;
  username: string | null;
  country: string | null; // ISO code, usado como watch_region
  avatar_url: string | null;
}

export interface SeriesCache {
  tmdb_id: number;
  name: string;
  poster_path: string | null;
  overview: string | null;
  status: "Ended" | "Canceled" | "Returning Series" | string;
  total_episodes: number;
}

export interface MovieCache {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  overview: string | null;
  runtime_minutes: number | null;
  release_date: string | null;
}

export interface UserSeries {
  user_id: string;
  series_tmdb_id: number;
  in_watchlist: boolean;
  last_watched_at: string | null;
}

export interface UserMovie {
  user_id: string;
  movie_tmdb_id: number;
  watched: boolean;
  watched_at: string | null;
}

/**
 * Calcula el estado derivado de una serie según las reglas del spec:
 * - terminada: 100% visto + status Ended/Canceled
 * - al_dia: 100% visto + status Returning Series
 * - sin_comenzar: 0 episodios vistos
 * - viendo: parcial + actividad hace < 2 meses
 * - abandonada: parcial + actividad hace > 2 meses
 */
export function computeSeriesStatus(params: {
  episodesWatched: number;
  totalEpisodes: number;
  tmdbStatus: string;
  lastWatchedAt: string | null;
}): SeriesStatusFilter {
  const { episodesWatched, totalEpisodes, tmdbStatus, lastWatchedAt } = params;

  if (episodesWatched === 0) return "sin_comenzar";

  const completa = totalEpisodes > 0 && episodesWatched >= totalEpisodes;
  if (completa) {
    return tmdbStatus === "Returning Series" ? "al_dia" : "terminada";
  }

  const diasDesdeUltimaActividad = lastWatchedAt
    ? (Date.now() - new Date(lastWatchedAt).getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;

  return diasDesdeUltimaActividad > ABANDONADA_UMBRAL_DIAS ? "abandonada" : "viendo";
}
