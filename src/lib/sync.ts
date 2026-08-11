/**
 * Sincroniza datos de TMDB hacia las tablas *_cache de Supabase.
 * Se llama cuando un usuario agrega/abre un título por primera vez, o cuando
 * el cache está viejo (ver STALE_AFTER_HOURS). Así no pegamos a TMDB en cada
 * request de cada usuario (rate limits + latencia).
 *
 * IMPORTANTE: todos los upsert/insert de acá chequean el error devuelto por
 * Supabase y lo tiran (throw). Antes no se chequeaban, y una falla (por
 * ejemplo, una columna que falta porque no se corrió el último schema.sql)
 * quedaba en silencio: el título nunca se guardaba en el cache, pero el
 * código seguía como si nada, y recién explotaba después al intentar leer
 * ese título (pantalla en blanco, o el "+" que no queda guardado).
 */
import { supabase } from "./supabase";
import { getSeriesDetails, getSeasonEpisodes, getMovieDetails, getMovieCredits, getSeriesCredits, getTmdbLanguage } from "./tmdb";

const STALE_AFTER_HOURS = 24;

function isStale(syncedAt: string | null) {
  if (!syncedAt) return true;
  const horas = (Date.now() - new Date(syncedAt).getTime()) / (1000 * 60 * 60);
  return horas > STALE_AFTER_HOURS;
}

/** Trae (o refresca) una serie + todos sus episodios en series_cache/episodes_cache. */
export async function syncSeries(tmdbId: number): Promise<void> {
  const idiomaActual = getTmdbLanguage();
  const { data: existing } = await supabase
    .from("series_cache")
    .select("synced_at, total_seasons, first_air_date, total_episodes, cast_top, synced_language")
    .eq("tmdb_id", tmdbId)
    .maybeSingle();

  // Si el título en cache está en un idioma distinto al que tenés activo
  // ahora, lo tratamos como vencido — si no, cambiar el idioma no se
  // notaba hasta que pasaran las 24hs de rigor, aunque volvieras a entrar
  // varias veces.
  const idiomaDistinto = !!existing && (existing as any).synced_language !== idiomaActual;
  // Si el cache es reciente PERO le faltan campos que agregamos en una
  // versión más nueva del schema (series cacheadas hace tiempo, antes de
  // trackear total_seasons/first_air_date/cast_top), lo tratamos como si
  // estuviera vencido para que se autocomplete solo, sin esperar las 24hs
  // de rigor.
  const leFaltanCamposNuevos = existing && (!existing.total_seasons || !existing.first_air_date || !existing.cast_top);
  // Si la ficha existe y no está vencida, igual chequeamos que tenga
  // episodios cargados de verdad — una importación anterior interrumpida (de
  // antes de que la función se auto-relance sola) podía guardar la ficha de
  // la serie y cortarse justo antes de guardar sus episodios, dejando la
  // ficha "fresca" pero sin nada adentro para siempre.
  let leFaltanEpisodios = false;
  if (existing && !isStale(existing.synced_at) && !leFaltanCamposNuevos && !idiomaDistinto) {
    const { count } = await supabase.from("episodes_cache").select("*", { count: "exact", head: true }).eq("series_tmdb_id", tmdbId);
    // No solo "está vacío" — si quedó a medias (por ejemplo, una importación
    // vieja que se cortó justo después de guardar algunas temporadas pero no
    // todas) también hay que completarla. Dejamos un margen del 10% porque
    // total_episodes de TMDB puede incluir "especiales" (temporada 0) que a
    // propósito no guardamos, así que un conteo levemente menor es normal.
    const totalEsperado = (existing as any).total_episodes ?? 0;
    leFaltanEpisodios = !count || count === 0 || (totalEsperado > 0 && count < totalEsperado * 0.9);
  }
  if (existing && !isStale(existing.synced_at) && !leFaltanCamposNuevos && !leFaltanEpisodios && !idiomaDistinto) return;

  const details = await getSeriesDetails(tmdbId);

  let castTop: { id: number; name: string }[] = [];
  try {
    const credits = await getSeriesCredits(tmdbId);
    castTop = (credits.cast ?? []).slice(0, 10).map((c: any) => ({ id: c.id, name: c.name }));
  } catch (e) {
    console.error("syncSeries: no se pudieron traer los créditos:", e);
  }

  const { error: errorSerie } = await supabase.from("series_cache").upsert({
    tmdb_id: tmdbId,
    name: details.name,
    poster_path: details.poster_path,
    backdrop_path: details.backdrop_path,
    overview: details.overview,
    status: details.status,
    first_air_date: details.first_air_date || null,
    total_episodes: details.number_of_episodes ?? 0,
    total_seasons: details.number_of_seasons ?? 0,
    genre_ids: (details.genres ?? []).map((g: any) => g.id),
    networks: (details.networks ?? []).map((n: any) => n.name),
    seasons_meta: (details.seasons ?? [])
      .filter((s: any) => s.season_number > 0)
      .map((s: any) => ({ season_number: s.season_number, air_date: s.air_date || null, episode_count: s.episode_count ?? 0, name: s.name })),
    cast_top: castTop,
    synced_at: new Date().toISOString(),
    synced_language: idiomaActual,
  });
  if (errorSerie) {
    console.error("syncSeries: error al guardar en series_cache:", errorSerie.message, errorSerie);
    throw new Error(`No se pudo guardar la serie (${errorSerie.message}). Puede que falte correr el último schema.sql.`);
  }

  // Traemos episodios temporada por temporada (TMDB no da todos los episodios en el detalle)
  const seasons: any[] = details.seasons ?? [];
  const episodiosParaInsertar: any[] = [];

  for (const season of seasons) {
    if (season.season_number === 0) continue; // saltamos "especiales" por ahora
    if (!season.episode_count) continue; // temporada anunciada pero sin episodios cargados todavía en TMDB
    const seasonData = await getSeasonEpisodes(tmdbId, season.season_number);
    for (const ep of seasonData.episodes ?? []) {
      episodiosParaInsertar.push({
        series_tmdb_id: tmdbId,
        season_number: ep.season_number,
        episode_number: ep.episode_number,
        name: ep.name,
        overview: ep.overview || null,
        air_date: ep.air_date || null,
        still_path: ep.still_path || null,
        runtime_minutes: ep.runtime ?? details.episode_run_time?.[0] ?? null,
      });
    }
  }

  if (episodiosParaInsertar.length > 0) {
    const { error: errorEpisodios } = await supabase.from("episodes_cache").upsert(episodiosParaInsertar, {
      onConflict: "series_tmdb_id,season_number,episode_number",
    });
    if (errorEpisodios) {
      console.error("syncSeries: error al guardar episodes_cache:", errorEpisodios.message, errorEpisodios);
      throw new Error(`No se pudieron guardar los episodios (${errorEpisodios.message}).`);
    }
  }
}

/**
 * Refresco liviano: solo actualiza status/total_episodes/seasons_meta desde
 * TMDB, sin re-bajar la lista completa de episodios. Se usa en la pantalla
 * de "Ver a continuación" para detectar si a una serie que estabas al día
 * le salió una temporada nueva, sin pagar el costo de un syncSeries() completo.
 */
export async function refrescarMetaSerie(tmdbId: number): Promise<void> {
  try {
    const details = await getSeriesDetails(tmdbId);
    await supabase
      .from("series_cache")
      .update({
        status: details.status,
        first_air_date: details.first_air_date || null,
        total_episodes: details.number_of_episodes ?? 0,
        total_seasons: details.number_of_seasons ?? 0,
        seasons_meta: (details.seasons ?? [])
          .filter((s: any) => s.season_number > 0)
          .map((s: any) => ({ season_number: s.season_number, air_date: s.air_date || null, episode_count: s.episode_count ?? 0, name: s.name })),
      })
      .eq("tmdb_id", tmdbId);

    // Si la temporada nueva ya tiene episodios cargados en TMDB, los sumamos al cache.
    const seasons: any[] = details.seasons ?? [];
    const { data: existentes } = await supabase.from("episodes_cache").select("season_number").eq("series_tmdb_id", tmdbId);
    const temporadasConData = new Set((existentes ?? []).map((e: any) => e.season_number));
    const episodiosParaInsertar: any[] = [];
    for (const season of seasons) {
      if (season.season_number === 0 || !season.episode_count) continue;
      if (temporadasConData.has(season.season_number)) continue; // ya la tenemos, no hace falta pedirla de nuevo acá
      const seasonData = await getSeasonEpisodes(tmdbId, season.season_number);
      for (const ep of seasonData.episodes ?? []) {
        episodiosParaInsertar.push({
          series_tmdb_id: tmdbId,
          season_number: ep.season_number,
          episode_number: ep.episode_number,
          name: ep.name,
          overview: ep.overview || null,
          air_date: ep.air_date || null,
          still_path: ep.still_path || null,
          runtime_minutes: ep.runtime ?? details.episode_run_time?.[0] ?? null,
        });
      }
    }
    if (episodiosParaInsertar.length > 0) {
      await supabase.from("episodes_cache").upsert(episodiosParaInsertar, { onConflict: "series_tmdb_id,season_number,episode_number" });
    }
  } catch (e) {
    console.error("refrescarMetaSerie: no se pudo refrescar", tmdbId, e);
  }
}

/** Trae (o refresca) una película en movies_cache. */
export async function syncMovie(tmdbId: number): Promise<void> {
  const idiomaActual = getTmdbLanguage();
  const { data: existing } = await supabase
    .from("movies_cache")
    .select("synced_at, director, cast_top, synced_language")
    .eq("tmdb_id", tmdbId)
    .maybeSingle();

  // Igual que en syncSeries: si el cache es reciente pero le falta el
  // director o el elenco (películas cacheadas antes de que existiera esto),
  // se trata como vencido para que se autocomplete solo. Lo mismo si está
  // en un idioma distinto al que tenés activo ahora — si no, cambiar el
  // idioma no se notaba hasta que pasaran las 24hs de rigor.
  const leFaltanCamposNuevos = existing && (!existing.director || !existing.cast_top);
  const idiomaDistinto = !!existing && (existing as any).synced_language !== idiomaActual;
  if (existing && !isStale(existing.synced_at) && !leFaltanCamposNuevos && !idiomaDistinto) return;

  const details = await getMovieDetails(tmdbId);

  // Director + elenco principal — se guardan acá (no hace falta pedirlos de
  // nuevo cada vez) para poder calcular "actor que más se repite" y
  // "director favorito" en Estadísticas sin tener que consultar TMDB por
  // cada película del usuario cada vez que entra a esa pantalla.
  let director: string | null = null;
  let directorId: number | null = null;
  let castTop: { id: number; name: string }[] = [];
  try {
    const credits = await getMovieCredits(tmdbId);
    const directorCredit = credits.crew?.find((c: any) => c.job === "Director");
    director = directorCredit?.name ?? null;
    directorId = directorCredit?.id ?? null;
    castTop = (credits.cast ?? []).slice(0, 10).map((c: any) => ({ id: c.id, name: c.name }));
  } catch (e) {
    console.error("syncMovie: no se pudieron traer los créditos:", e);
  }

  const { error } = await supabase.from("movies_cache").upsert({
    tmdb_id: tmdbId,
    title: details.title,
    poster_path: details.poster_path,
    backdrop_path: details.backdrop_path,
    overview: details.overview,
    runtime_minutes: details.runtime ?? null,
    release_date: details.release_date || null,
    genre_ids: (details.genres ?? []).map((g: any) => g.id),
    director,
    director_id: directorId,
    cast_top: castTop,
    synced_at: new Date().toISOString(),
    synced_language: idiomaActual,
  });
  if (error) {
    console.error("syncMovie: error al guardar en movies_cache:", error.message, error);
    throw new Error(`No se pudo guardar la película (${error.message}). Puede que falte correr el último schema.sql.`);
  }
}

/** Agrega una serie a "seguir" del usuario actual (sincroniza cache primero). */
export async function seguirSerie(userId: string, tmdbId: number) {
  await syncSeries(tmdbId);
  const { error } = await supabase.from("user_series").upsert({
    user_id: userId,
    series_tmdb_id: tmdbId,
    in_watchlist: true,
  });
  if (error) {
    console.error("seguirSerie: error al guardar user_series:", error.message, error);
    throw new Error(`No se pudo agregar la serie a tu lista (${error.message}).`);
  }
}

/** Agrega una película a la lista de pendientes del usuario actual. */
export async function agregarPelicula(userId: string, tmdbId: number) {
  await syncMovie(tmdbId);
  const { error } = await supabase.from("user_movies").upsert({
    user_id: userId,
    movie_tmdb_id: tmdbId,
    watched: false,
  });
  if (error) {
    console.error("agregarPelicula: error al guardar user_movies:", error.message, error);
    throw new Error(`No se pudo agregar la película a tu lista (${error.message}).`);
  }
}

/** Saca una serie de "tus series": borra también todos los capítulos que hayas marcado como vistos (y el historial de vistas de cada uno). */
export async function eliminarSerieDeMisSeries(userId: string, tmdbId: number) {
  await supabase.from("episode_watch_events").delete().eq("user_id", userId).eq("series_tmdb_id", tmdbId);
  await supabase.from("user_episodes_watched").delete().eq("user_id", userId).eq("series_tmdb_id", tmdbId);
  const { error } = await supabase.from("user_series").delete().eq("user_id", userId).eq("series_tmdb_id", tmdbId);
  if (error) throw error;
}

/** Saca una película de "tus películas" (si la habías marcado como vista, se pierde ese estado). */
/** Saca una película de "tus películas" (se pierde también todo el historial de vistas, no solo el estado). */
export async function eliminarPeliculaDeMisPeliculas(userId: string, tmdbId: number) {
  await supabase.from("movie_watch_events").delete().eq("user_id", userId).eq("movie_tmdb_id", tmdbId);
  const { error } = await supabase.from("user_movies").delete().eq("user_id", userId).eq("movie_tmdb_id", tmdbId);
  if (error) throw error;
}
