import { supabase } from "./supabase";

export interface EstadoVisto {
  vista: boolean;
  watchedAt: string | null; // fecha de la vista más reciente
  watchedAtYearOnly: boolean; // esa fecha ¿se guardó solo con el año (no se sabe el día exacto)?
  firstWatchedAt: string | null; // fecha de la primera vez
  firstWatchedAtYearOnly: boolean;
  timesWatched: number;
}

export interface EventoVisto {
  id: string;
  watchedAt: string;
  yearOnly: boolean; // true = se eligió "no sé la fecha exacta, elegir el año" — mostrar solo el año, no el día
}

/**
 * Calcula qué fecha guardar cuando el usuario elige "no sé la fecha
 * exacta, solo el año": si el título se estrenó ESE mismo año, se usa
 * la fecha real de estreno (tiene más sentido que forzar 1° de enero
 * sabiendo que salió, por ejemplo, en agosto) — para cualquier otro
 * caso, se usa el 1° de enero del año elegido. En ningún lado se
 * muestra ese día/mes de relleno — es solo la fecha interna que se usa
 * para poder ordenar, la UI siempre va a mostrar nomás el año cuando
 * yearOnly=true.
 */
export function fechaParaAñoElegido(año: number, fechaEstrenoISO: string | null): string {
  if (fechaEstrenoISO) {
    const añoEstreno = new Date(fechaEstrenoISO).getFullYear();
    if (añoEstreno === año) return new Date(fechaEstrenoISO).toISOString();
  }
  return new Date(año, 0, 1).toISOString();
}

// ---------- PELÍCULAS ----------

export async function getEstadoVistoPelicula(userId: string, tmdbId: number): Promise<EstadoVisto> {
  const { data } = await supabase
    .from("user_movies")
    .select("watched, watched_at, watched_at_year_only, first_watched_at, first_watched_at_year_only, times_watched")
    .eq("user_id", userId)
    .eq("movie_tmdb_id", tmdbId)
    .maybeSingle();
  return {
    vista: !!data?.watched,
    watchedAt: data?.watched_at ?? null,
    watchedAtYearOnly: !!data?.watched_at_year_only,
    firstWatchedAt: data?.first_watched_at ?? null,
    firstWatchedAtYearOnly: !!data?.first_watched_at_year_only,
    timesWatched: data?.times_watched ?? 1,
  };
}

/** Todas las veces que viste esta película, ordenadas de la más vieja a la más nueva. */
export async function listarEventosVistaPelicula(userId: string, tmdbId: number): Promise<EventoVisto[]> {
  const { data, error } = await supabase
    .from("movie_watch_events")
    .select("id, watched_at, year_only")
    .eq("user_id", userId)
    .eq("movie_tmdb_id", tmdbId)
    .order("watched_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((e: any) => ({ id: e.id, watchedAt: e.watched_at, yearOnly: !!e.year_only }));
}

/** Las columnas de user_movies (watched_at/first_watched_at/times_watched) son una caché rápida que usa el resto de la app — se recalculan solas a partir de los eventos reales cada vez que se agrega, edita o borra uno. */
async function recalcularCachePelicula(userId: string, tmdbId: number) {
  const eventos = await listarEventosVistaPelicula(userId, tmdbId);
  if (eventos.length === 0) {
    await supabase
      .from("user_movies")
      .update({
        watched: false,
        watched_at: null,
        watched_at_year_only: false,
        first_watched_at: null,
        first_watched_at_year_only: false,
        times_watched: 0,
      })
      .eq("user_id", userId)
      .eq("movie_tmdb_id", tmdbId);
    return;
  }
  await supabase
    .from("user_movies")
    .update({
      watched: true,
      first_watched_at: eventos[0].watchedAt,
      first_watched_at_year_only: eventos[0].yearOnly,
      watched_at: eventos[eventos.length - 1].watchedAt,
      watched_at_year_only: eventos[eventos.length - 1].yearOnly,
      times_watched: eventos.length,
    })
    .eq("user_id", userId)
    .eq("movie_tmdb_id", tmdbId);
}

/** Marca/desmarca la película como vista (toggle simple). Si la película todavía no estaba en tu lista, la agrega de una. */
export async function toggleVistaPelicula(userId: string, tmdbId: number, nuevoValor: boolean) {
  if (!nuevoValor) {
    // "No vista, me equivoqué": se borran todas las vistas registradas —
    // estás diciendo que en realidad nunca la viste. También borramos la
    // puntuación, que ya no tiene sentido si "no la viste".
    const { error: errorBorrar } = await supabase.from("movie_watch_events").delete().eq("user_id", userId).eq("movie_tmdb_id", tmdbId);
    if (errorBorrar) throw errorBorrar;
    const { error } = await supabase
      .from("user_movies")
      .update({ watched: false, watched_at: null, watched_at_year_only: false, first_watched_at: null, first_watched_at_year_only: false, times_watched: 0, rating: null })
      .eq("user_id", userId)
      .eq("movie_tmdb_id", tmdbId);
    if (error) throw error;
    return;
  }

  await supabase.from("user_movies").upsert({ user_id: userId, movie_tmdb_id: tmdbId }, { onConflict: "user_id,movie_tmdb_id", ignoreDuplicates: true });
  const { error } = await supabase.from("movie_watch_events").insert({ user_id: userId, movie_tmdb_id: tmdbId, watched_at: new Date().toISOString() });
  if (error) throw error;
  await recalcularCachePelicula(userId, tmdbId);
}

/** "Volvés a verla": agrega una vista más, con la fecha de ahora. */
export async function volverAVerPelicula(userId: string, tmdbId: number) {
  const { error } = await supabase.from("movie_watch_events").insert({ user_id: userId, movie_tmdb_id: tmdbId, watched_at: new Date().toISOString() });
  if (error) throw error;
  await recalcularCachePelicula(userId, tmdbId);
}

/** Agrega una vista puntual con una fecha elegida a mano (no la de ahora). */
export async function agregarEventoVistaPelicula(userId: string, tmdbId: number, fechaISO: string) {
  await supabase.from("user_movies").upsert({ user_id: userId, movie_tmdb_id: tmdbId }, { onConflict: "user_id,movie_tmdb_id", ignoreDuplicates: true });
  const { error } = await supabase.from("movie_watch_events").insert({ user_id: userId, movie_tmdb_id: tmdbId, watched_at: fechaISO });
  if (error) throw error;
  await recalcularCachePelicula(userId, tmdbId);
}

/** Agrega una vista puntual sabiendo solo el año (no el día exacto) — ver fechaParaAñoElegido para cómo se calcula la fecha real que se guarda. */
export async function agregarEventoVistaPeliculaSoloAño(userId: string, tmdbId: number, año: number, fechaEstrenoISO: string | null) {
  await supabase.from("user_movies").upsert({ user_id: userId, movie_tmdb_id: tmdbId }, { onConflict: "user_id,movie_tmdb_id", ignoreDuplicates: true });
  const { error } = await supabase
    .from("movie_watch_events")
    .insert({ user_id: userId, movie_tmdb_id: tmdbId, watched_at: fechaParaAñoElegido(año, fechaEstrenoISO), year_only: true });
  if (error) throw error;
  await recalcularCachePelicula(userId, tmdbId);
}

/** Corrige la fecha de una vista puntual ya registrada. */
export async function editarEventoVistaPelicula(userId: string, eventoId: string, tmdbId: number, fechaISO: string) {
  const { error } = await supabase.from("movie_watch_events").update({ watched_at: fechaISO, year_only: false }).eq("id", eventoId).eq("user_id", userId);
  if (error) throw error;
  await recalcularCachePelicula(userId, tmdbId);
}

/** Corrige una vista puntual ya registrada, dejándola con solo el año conocido. */
export async function editarEventoVistaPeliculaSoloAño(userId: string, eventoId: string, tmdbId: number, año: number, fechaEstrenoISO: string | null) {
  const { error } = await supabase
    .from("movie_watch_events")
    .update({ watched_at: fechaParaAñoElegido(año, fechaEstrenoISO), year_only: true })
    .eq("id", eventoId)
    .eq("user_id", userId);
  if (error) throw error;
  await recalcularCachePelicula(userId, tmdbId);
}

/** Borra una vista puntual (quedan las demás). */
export async function eliminarEventoVistaPelicula(userId: string, eventoId: string, tmdbId: number) {
  const { error } = await supabase.from("movie_watch_events").delete().eq("id", eventoId).eq("user_id", userId);
  if (error) throw error;
  await recalcularCachePelicula(userId, tmdbId);
}

/** Corrige a mano la fecha en la que viste la película por primera vez — edita la vista más vieja registrada (o la crea si todavía no había ninguna). */
export async function establecerFechaPrimeraVistaPelicula(userId: string, tmdbId: number, fechaISO: string) {
  const eventos = await listarEventosVistaPelicula(userId, tmdbId);
  if (eventos.length === 0) {
    await agregarEventoVistaPelicula(userId, tmdbId, fechaISO);
    return;
  }
  await editarEventoVistaPelicula(userId, eventos[0].id, tmdbId, fechaISO);
}

/** Igual que establecerFechaPrimeraVistaPelicula, pero sabiendo solo el año. */
export async function establecerFechaPrimeraVistaPeliculaSoloAño(userId: string, tmdbId: number, año: number, fechaEstrenoISO: string | null) {
  const eventos = await listarEventosVistaPelicula(userId, tmdbId);
  if (eventos.length === 0) {
    await agregarEventoVistaPeliculaSoloAño(userId, tmdbId, año, fechaEstrenoISO);
    return;
  }
  await editarEventoVistaPeliculaSoloAño(userId, eventos[0].id, tmdbId, año, fechaEstrenoISO);
}

/** Corrige a mano la fecha de la revisita más reciente — edita la vista más nueva registrada. */
export async function establecerFechaUltimaVistaPelicula(userId: string, tmdbId: number, fechaISO: string) {
  const eventos = await listarEventosVistaPelicula(userId, tmdbId);
  if (eventos.length === 0) {
    await agregarEventoVistaPelicula(userId, tmdbId, fechaISO);
    return;
  }
  await editarEventoVistaPelicula(userId, eventos[eventos.length - 1].id, tmdbId, fechaISO);
}

// ---------- CAPÍTULOS ----------

export async function getEstadoVistoEpisodio(userId: string, seriesTmdbId: number, season: number, episode: number): Promise<EstadoVisto> {
  const { data } = await supabase
    .from("user_episodes_watched")
    .select("watched_at, watched_at_year_only, first_watched_at, first_watched_at_year_only, times_watched")
    .eq("user_id", userId)
    .eq("series_tmdb_id", seriesTmdbId)
    .eq("season_number", season)
    .eq("episode_number", episode)
    .maybeSingle();
  return {
    vista: !!data,
    watchedAt: data?.watched_at ?? null,
    watchedAtYearOnly: !!data?.watched_at_year_only,
    firstWatchedAt: data?.first_watched_at ?? null,
    firstWatchedAtYearOnly: !!data?.first_watched_at_year_only,
    timesWatched: data?.times_watched ?? 1,
  };
}

/** Todas las veces que viste este capítulo, ordenadas de la más vieja a la más nueva. */
export async function listarEventosVistaEpisodio(userId: string, seriesTmdbId: number, season: number, episode: number): Promise<EventoVisto[]> {
  const { data, error } = await supabase
    .from("episode_watch_events")
    .select("id, watched_at, year_only")
    .eq("user_id", userId)
    .eq("series_tmdb_id", seriesTmdbId)
    .eq("season_number", season)
    .eq("episode_number", episode)
    .order("watched_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((e: any) => ({ id: e.id, watchedAt: e.watched_at, yearOnly: !!e.year_only }));
}

async function recalcularCacheEpisodio(userId: string, seriesTmdbId: number, season: number, episode: number) {
  const eventos = await listarEventosVistaEpisodio(userId, seriesTmdbId, season, episode);
  if (eventos.length === 0) {
    await supabase
      .from("user_episodes_watched")
      .delete()
      .eq("user_id", userId)
      .eq("series_tmdb_id", seriesTmdbId)
      .eq("season_number", season)
      .eq("episode_number", episode);
    await recalcularUltimaVistaSerie(userId, seriesTmdbId);
    return;
  }
  const { error: errorUpsert } = await supabase.from("user_episodes_watched").upsert(
    {
      user_id: userId,
      series_tmdb_id: seriesTmdbId,
      season_number: season,
      episode_number: episode,
      first_watched_at: eventos[0].watchedAt,
      first_watched_at_year_only: eventos[0].yearOnly,
      watched_at: eventos[eventos.length - 1].watchedAt,
      watched_at_year_only: eventos[eventos.length - 1].yearOnly,
      times_watched: eventos.length,
    },
    { onConflict: "user_id,series_tmdb_id,season_number,episode_number" }
  );
  if (errorUpsert) throw errorUpsert;
  // "La serie, última vez vista" tiene que ser el capítulo más reciente
  // de TODA la serie, no solo de este capítulo puntual — si no, corregir
  // (o volver a ver) un capítulo viejo podía pisar por error la fecha
  // real del capítulo que viste más recientemente.
  await recalcularUltimaVistaSerie(userId, seriesTmdbId);
}

export async function recalcularUltimaVistaSerie(userId: string, seriesTmdbId: number) {
  const { data: todosLosVistos } = await supabase
    .from("user_episodes_watched")
    .select("watched_at, watched_at_year_only")
    .eq("user_id", userId)
    .eq("series_tmdb_id", seriesTmdbId)
    .order("watched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  await supabase
    .from("user_series")
    .update({ last_watched_at: todosLosVistos?.watched_at ?? null, last_watched_at_year_only: !!todosLosVistos?.watched_at_year_only })
    .eq("user_id", userId)
    .eq("series_tmdb_id", seriesTmdbId);
}

/** "Volvés a ver" un capítulo ya visto: agrega una vista más, con la fecha de ahora. */
export async function volverAVerEpisodio(userId: string, seriesTmdbId: number, season: number, episode: number) {
  const { error } = await supabase
    .from("episode_watch_events")
    .insert({ user_id: userId, series_tmdb_id: seriesTmdbId, season_number: season, episode_number: episode, watched_at: new Date().toISOString() });
  if (error) throw error;
  await recalcularCacheEpisodio(userId, seriesTmdbId, season, episode);
}

/** Agrega una vista puntual de un capítulo con una fecha elegida a mano. */
export async function agregarEventoVistaEpisodio(userId: string, seriesTmdbId: number, season: number, episode: number, fechaISO: string) {
  const { error } = await supabase
    .from("episode_watch_events")
    .insert({ user_id: userId, series_tmdb_id: seriesTmdbId, season_number: season, episode_number: episode, watched_at: fechaISO });
  if (error) throw error;
  await recalcularCacheEpisodio(userId, seriesTmdbId, season, episode);
}

/** Agrega una vista puntual de un capítulo sabiendo solo el año. */
export async function agregarEventoVistaEpisodioSoloAño(
  userId: string,
  seriesTmdbId: number,
  season: number,
  episode: number,
  año: number,
  fechaEstrenoISO: string | null
) {
  const { error } = await supabase.from("episode_watch_events").insert({
    user_id: userId,
    series_tmdb_id: seriesTmdbId,
    season_number: season,
    episode_number: episode,
    watched_at: fechaParaAñoElegido(año, fechaEstrenoISO),
    year_only: true,
  });
  if (error) throw error;
  await recalcularCacheEpisodio(userId, seriesTmdbId, season, episode);
}

/** Corrige la fecha de una vista puntual de un capítulo ya registrada. */
export async function editarEventoVistaEpisodio(userId: string, eventoId: string, seriesTmdbId: number, season: number, episode: number, fechaISO: string) {
  const { error } = await supabase.from("episode_watch_events").update({ watched_at: fechaISO, year_only: false }).eq("id", eventoId).eq("user_id", userId);
  if (error) throw error;
  await recalcularCacheEpisodio(userId, seriesTmdbId, season, episode);
}

/** Corrige una vista puntual de un capítulo ya registrada, dejándola con solo el año conocido. */
export async function editarEventoVistaEpisodioSoloAño(
  userId: string,
  eventoId: string,
  seriesTmdbId: number,
  season: number,
  episode: number,
  año: number,
  fechaEstrenoISO: string | null
) {
  const { error } = await supabase
    .from("episode_watch_events")
    .update({ watched_at: fechaParaAñoElegido(año, fechaEstrenoISO), year_only: true })
    .eq("id", eventoId)
    .eq("user_id", userId);
  if (error) throw error;
  await recalcularCacheEpisodio(userId, seriesTmdbId, season, episode);
}

/** Borra una vista puntual de un capítulo (quedan las demás). */
export async function eliminarEventoVistaEpisodio(userId: string, eventoId: string, seriesTmdbId: number, season: number, episode: number) {
  const { error } = await supabase.from("episode_watch_events").delete().eq("id", eventoId).eq("user_id", userId);
  if (error) throw error;
  await recalcularCacheEpisodio(userId, seriesTmdbId, season, episode);
}

/** Corrige a mano la fecha en la que viste el capítulo por primera vez — edita la vista más vieja registrada (o la crea si todavía no había ninguna). */
export async function establecerFechaPrimeraVistaEpisodio(userId: string, seriesTmdbId: number, season: number, episode: number, fechaISO: string) {
  const eventos = await listarEventosVistaEpisodio(userId, seriesTmdbId, season, episode);
  if (eventos.length === 0) {
    await agregarEventoVistaEpisodio(userId, seriesTmdbId, season, episode, fechaISO);
    return;
  }
  await editarEventoVistaEpisodio(userId, eventos[0].id, seriesTmdbId, season, episode, fechaISO);
}

/** Igual que establecerFechaPrimeraVistaEpisodio, pero sabiendo solo el año. */
export async function establecerFechaPrimeraVistaEpisodioSoloAño(
  userId: string,
  seriesTmdbId: number,
  season: number,
  episode: number,
  año: number,
  fechaEstrenoISO: string | null
) {
  const eventos = await listarEventosVistaEpisodio(userId, seriesTmdbId, season, episode);
  if (eventos.length === 0) {
    await agregarEventoVistaEpisodioSoloAño(userId, seriesTmdbId, season, episode, año, fechaEstrenoISO);
    return;
  }
  await editarEventoVistaEpisodioSoloAño(userId, eventos[0].id, seriesTmdbId, season, episode, año, fechaEstrenoISO);
}

/** Corrige a mano la fecha de la revisita más reciente de un capítulo — edita la vista más nueva registrada. */
export async function establecerFechaUltimaVistaEpisodio(userId: string, seriesTmdbId: number, season: number, episode: number, fechaISO: string) {
  const eventos = await listarEventosVistaEpisodio(userId, seriesTmdbId, season, episode);
  if (eventos.length === 0) {
    await agregarEventoVistaEpisodio(userId, seriesTmdbId, season, episode, fechaISO);
    return;
  }
  await editarEventoVistaEpisodio(userId, eventos[eventos.length - 1].id, seriesTmdbId, season, episode, fechaISO);
}
