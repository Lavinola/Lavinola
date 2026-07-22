import { supabase } from "./supabase";

export interface EstadoVisto {
  vista: boolean;
  watchedAt: string | null; // fecha de la vista más reciente
  firstWatchedAt: string | null; // fecha de la primera vez
  timesWatched: number;
}

// ---------- PELÍCULAS ----------

export async function getEstadoVistoPelicula(userId: string, tmdbId: number): Promise<EstadoVisto> {
  const { data } = await supabase
    .from("user_movies")
    .select("watched, watched_at, first_watched_at, times_watched")
    .eq("user_id", userId)
    .eq("movie_tmdb_id", tmdbId)
    .maybeSingle();
  return {
    vista: !!data?.watched,
    watchedAt: data?.watched_at ?? null,
    firstWatchedAt: data?.first_watched_at ?? null,
    timesWatched: data?.times_watched ?? 1,
  };
}

/** Marca/desmarca la película como vista (toggle simple, no cuenta como revisita). Si la película todavía no estaba en tu lista, la agrega de una. */
export async function toggleVistaPelicula(userId: string, tmdbId: number, nuevoValor: boolean) {
  const ahora = new Date().toISOString();

  if (!nuevoValor) {
    // Desmarcar: si no existe la fila, no hay nada que hacer. También
    // borramos la puntuación que le hayas puesto — si "no la viste", no
    // tiene sentido que siga contando en las estadísticas de esa película.
    const { error } = await supabase
      .from("user_movies")
      .update({ watched: false, watched_at: null, rating: null })
      .eq("user_id", userId)
      .eq("movie_tmdb_id", tmdbId);
    if (error) throw error;
    return;
  }

  const { data: existente } = await supabase.from("user_movies").select("first_watched_at").eq("user_id", userId).eq("movie_tmdb_id", tmdbId).maybeSingle();
  const { error } = await supabase.from("user_movies").upsert(
    {
      user_id: userId,
      movie_tmdb_id: tmdbId,
      watched: true,
      watched_at: ahora,
      first_watched_at: existente?.first_watched_at ?? ahora,
    },
    { onConflict: "user_id,movie_tmdb_id" }
  );
  if (error) throw error;
}

/** "Volvés a verla": suma una vista más y actualiza la fecha de la última vez, sin tocar la fecha original. */
export async function volverAVerPelicula(userId: string, tmdbId: number) {
  const { data } = await supabase.from("user_movies").select("times_watched").eq("user_id", userId).eq("movie_tmdb_id", tmdbId).maybeSingle();
  const { error } = await supabase
    .from("user_movies")
    .update({ watched: true, watched_at: new Date().toISOString(), times_watched: (data?.times_watched ?? 1) + 1 })
    .eq("user_id", userId)
    .eq("movie_tmdb_id", tmdbId);
  if (error) throw error;
}

/** Corrige a mano la fecha en la que viste la película por primera vez (no cuenta como revisita). */
export async function establecerFechaPrimeraVistaPelicula(userId: string, tmdbId: number, fechaISO: string) {
  const { error } = await supabase.from("user_movies").update({ first_watched_at: fechaISO }).eq("user_id", userId).eq("movie_tmdb_id", tmdbId);
  if (error) throw error;
}

/** Corrige a mano la fecha de la revisita más reciente (no toca la fecha original ni el contador). */
export async function establecerFechaUltimaVistaPelicula(userId: string, tmdbId: number, fechaISO: string) {
  const { error } = await supabase.from("user_movies").update({ watched_at: fechaISO }).eq("user_id", userId).eq("movie_tmdb_id", tmdbId);
  if (error) throw error;
}

/** Corrige a mano la fecha en la que viste el capítulo por primera vez (no cuenta como revisita). */
export async function establecerFechaPrimeraVistaEpisodio(userId: string, seriesTmdbId: number, season: number, episode: number, fechaISO: string) {
  const { error } = await supabase
    .from("user_episodes_watched")
    .update({ first_watched_at: fechaISO })
    .eq("user_id", userId)
    .eq("series_tmdb_id", seriesTmdbId)
    .eq("season_number", season)
    .eq("episode_number", episode);
  if (error) throw error;
}

/** Corrige a mano la fecha de la revisita más reciente de un capítulo (no toca la fecha original ni el contador). */
export async function establecerFechaUltimaVistaEpisodio(userId: string, seriesTmdbId: number, season: number, episode: number, fechaISO: string) {
  const { error } = await supabase
    .from("user_episodes_watched")
    .update({ watched_at: fechaISO })
    .eq("user_id", userId)
    .eq("series_tmdb_id", seriesTmdbId)
    .eq("season_number", season)
    .eq("episode_number", episode);
  if (error) throw error;
}

export async function getEstadoVistoEpisodio(userId: string, seriesTmdbId: number, season: number, episode: number): Promise<EstadoVisto> {
  const { data } = await supabase
    .from("user_episodes_watched")
    .select("watched_at, first_watched_at, times_watched")
    .eq("user_id", userId)
    .eq("series_tmdb_id", seriesTmdbId)
    .eq("season_number", season)
    .eq("episode_number", episode)
    .maybeSingle();
  return {
    vista: !!data,
    watchedAt: data?.watched_at ?? null,
    firstWatchedAt: data?.first_watched_at ?? null,
    timesWatched: data?.times_watched ?? 1,
  };
}

/** "Volvés a ver" un capítulo ya visto: suma una vista más y actualiza la fecha de la última vez. */
export async function volverAVerEpisodio(userId: string, seriesTmdbId: number, season: number, episode: number) {
  const { data } = await supabase
    .from("user_episodes_watched")
    .select("times_watched")
    .eq("user_id", userId)
    .eq("series_tmdb_id", seriesTmdbId)
    .eq("season_number", season)
    .eq("episode_number", episode)
    .maybeSingle();
  const { error } = await supabase
    .from("user_episodes_watched")
    .update({ watched_at: new Date().toISOString(), times_watched: (data?.times_watched ?? 1) + 1 })
    .eq("user_id", userId)
    .eq("series_tmdb_id", seriesTmdbId)
    .eq("season_number", season)
    .eq("episode_number", episode);
  if (error) throw error;

  await supabase.from("user_series").update({ last_watched_at: new Date().toISOString() }).eq("user_id", userId).eq("series_tmdb_id", seriesTmdbId);
}
