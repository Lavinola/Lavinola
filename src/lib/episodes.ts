import { supabase } from "./supabase";
import { establecerFechaPrimeraVistaEpisodio, recalcularUltimaVistaSerie } from "./watchStatus";

export interface ProximoEpisodio {
  series_tmdb_id: number;
  season_number: number;
  episode_number: number;
  name: string | null;
}

/**
 * Devuelve el próximo episodio no visto de una serie para un usuario
 * (el primero en orden de temporada/episodio que no esté en user_episodes_watched
 * y que ya haya salido al aire, o el próximo a salir si no hay ninguno emitido sin ver).
 */
export async function getProximoEpisodio(
  userId: string,
  seriesTmdbId: number
): Promise<ProximoEpisodio | null> {
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: todos } = await supabase
    .from("episodes_cache")
    .select("series_tmdb_id, season_number, episode_number, name, air_date")
    .eq("series_tmdb_id", seriesTmdbId)
    .order("season_number", { ascending: true })
    .order("episode_number", { ascending: true });

  const { data: vistos } = await supabase
    .from("user_episodes_watched")
    .select("season_number, episode_number")
    .eq("user_id", userId)
    .eq("series_tmdb_id", seriesTmdbId);

  const vistosSet = new Set((vistos ?? []).map((v) => `${v.season_number}-${v.episode_number}`));

  const noVistosEmitidos = (todos ?? []).filter(
    (e) => !vistosSet.has(`${e.season_number}-${e.episode_number}`) && e.air_date && e.air_date <= hoy
  );

  return (noVistosEmitidos[0] as ProximoEpisodio) ?? null;
}

/** Marca un episodio como visto y actualiza last_watched_at en user_series (usado por los filtros de estado). */
export async function marcarEpisodioVisto(
  userId: string,
  seriesTmdbId: number,
  seasonNumber: number,
  episodeNumber: number
) {
  const ahora = new Date().toISOString();
  await supabase.from("episode_watch_events").insert({
    user_id: userId,
    series_tmdb_id: seriesTmdbId,
    season_number: seasonNumber,
    episode_number: episodeNumber,
    watched_at: ahora,
  });
  await supabase.from("user_episodes_watched").insert({
    user_id: userId,
    series_tmdb_id: seriesTmdbId,
    season_number: seasonNumber,
    episode_number: episodeNumber,
    watched_at: ahora,
    first_watched_at: ahora,
  });

  await supabase
    .from("user_series")
    .upsert({ user_id: userId, series_tmdb_id: seriesTmdbId, in_watchlist: true, last_watched_at: ahora }, { onConflict: "user_id,series_tmdb_id" });
}

export interface EpisodioConEstado {
  season_number: number;
  episode_number: number;
  name: string | null;
  air_date: string | null;
  still_path: string | null;
  visto: boolean;
}

/** Todos los episodios de una serie, agrupados por temporada, con si el usuario ya los vio. */
export async function listarEpisodiosPorTemporada(
  userId: string,
  seriesTmdbId: number
): Promise<Record<number, EpisodioConEstado[]>> {
  const { data: todos } = await supabase
    .from("episodes_cache")
    .select("season_number, episode_number, name, air_date, still_path")
    .eq("series_tmdb_id", seriesTmdbId)
    .order("season_number", { ascending: true })
    .order("episode_number", { ascending: true });

  const { data: vistos } = await supabase
    .from("user_episodes_watched")
    .select("season_number, episode_number")
    .eq("user_id", userId)
    .eq("series_tmdb_id", seriesTmdbId);

  const vistosSet = new Set((vistos ?? []).map((v) => `${v.season_number}-${v.episode_number}`));

  const agrupado: Record<number, EpisodioConEstado[]> = {};
  for (const ep of todos ?? []) {
    if (!agrupado[ep.season_number]) agrupado[ep.season_number] = [];
    agrupado[ep.season_number].push({
      ...ep,
      visto: vistosSet.has(`${ep.season_number}-${ep.episode_number}`),
    });
  }
  return agrupado;
}

/** Marca un episodio como visto, y devuelve los episodios anteriores no vistos (para preguntar si también se marcan). */
export async function episodiosAnterioresNoVistos(
  userId: string,
  seriesTmdbId: number,
  season: number,
  episode: number
): Promise<{ season_number: number; episode_number: number }[]> {
  const { data: todos } = await supabase
    .from("episodes_cache")
    .select("season_number, episode_number")
    .eq("series_tmdb_id", seriesTmdbId)
    .order("season_number", { ascending: true })
    .order("episode_number", { ascending: true });

  const { data: vistos } = await supabase
    .from("user_episodes_watched")
    .select("season_number, episode_number")
    .eq("user_id", userId)
    .eq("series_tmdb_id", seriesTmdbId);

  const vistosSet = new Set((vistos ?? []).map((v) => `${v.season_number}-${v.episode_number}`));

  const anteriores = (todos ?? []).filter((ep) => {
    const esAnterior = ep.season_number < season || (ep.season_number === season && ep.episode_number < episode);
    return esAnterior && !vistosSet.has(`${ep.season_number}-${ep.episode_number}`);
  });
  return anteriores;
}

export async function marcarVariosEpisodios(
  userId: string,
  seriesTmdbId: number,
  episodios: { season_number: number; episode_number: number }[]
) {
  const ahora = new Date().toISOString();
  if (episodios.length > 0) {
    const eventos = episodios.map((e) => ({
      user_id: userId,
      series_tmdb_id: seriesTmdbId,
      season_number: e.season_number,
      episode_number: e.episode_number,
      watched_at: ahora,
    }));
    await supabase.from("episode_watch_events").insert(eventos);
  }
  const filas = episodios.map((e) => ({
    user_id: userId,
    series_tmdb_id: seriesTmdbId,
    season_number: e.season_number,
    episode_number: e.episode_number,
    watched_at: ahora,
    first_watched_at: ahora,
  }));
  if (filas.length > 0) await supabase.from("user_episodes_watched").upsert(filas, { onConflict: "user_id,series_tmdb_id,season_number,episode_number" });
  await supabase
    .from("user_series")
    .upsert({ user_id: userId, series_tmdb_id: seriesTmdbId, in_watchlist: true, last_watched_at: ahora }, { onConflict: "user_id,series_tmdb_id" });
}

/** "Ví toda la serie": marca como vistos (recién ahora) todos los capítulos YA ESTRENADOS que todavía no estaban vistos. Los que todavía no salieron nunca se tocan (no se pueden marcar como vistos hasta su estreno), y los que ya estaban vistos quedan como estaban. */
export async function marcarTodaLaSerieVista(userId: string, seriesTmdbId: number) {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: todos } = await supabase.from("episodes_cache").select("season_number, episode_number, air_date").eq("series_tmdb_id", seriesTmdbId);
  const { data: vistos } = await supabase.from("user_episodes_watched").select("season_number, episode_number").eq("user_id", userId).eq("series_tmdb_id", seriesTmdbId);
  const vistosSet = new Set((vistos ?? []).map((v) => `${v.season_number}-${v.episode_number}`));
  const faltantes = (todos ?? []).filter((e) => e.air_date && e.air_date <= hoy && !vistosSet.has(`${e.season_number}-${e.episode_number}`));
  await marcarVariosEpisodios(userId, seriesTmdbId, faltantes);
}

/** Pone la fecha en la que viste (por primera vez) cada capítulo YA VISTO y YA ESTRENADO de la serie en su propio día de estreno — solo corrige la fecha, no marca como vistos los que todavía no lo estaban. */
export async function marcarTodaLaSerieVistaEnEstreno(userId: string, seriesTmdbId: number) {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: todos } = await supabase.from("episodes_cache").select("season_number, episode_number, air_date").eq("series_tmdb_id", seriesTmdbId);
  const { data: vistos } = await supabase.from("user_episodes_watched").select("season_number, episode_number").eq("user_id", userId).eq("series_tmdb_id", seriesTmdbId);
  const vistosSet = new Set((vistos ?? []).map((v) => `${v.season_number}-${v.episode_number}`));
  const conFecha = (todos ?? []).filter((e) => e.air_date && e.air_date <= hoy && vistosSet.has(`${e.season_number}-${e.episode_number}`));
  await Promise.all(
    conFecha.map((e) => establecerFechaPrimeraVistaEpisodio(userId, seriesTmdbId, e.season_number, e.episode_number, new Date(e.air_date).toISOString()))
  );
  await supabase.from("user_series").upsert({ user_id: userId, series_tmdb_id: seriesTmdbId, in_watchlist: true }, { onConflict: "user_id,series_tmdb_id" });
}

export async function desmarcarEpisodio(userId: string, seriesTmdbId: number, season: number, episode: number) {
  // "No visto, me equivoqué": borra también el historial de vistas de este
  // capítulo (no solo la fila rápida) — si no, al volver a marcarlo como
  // visto más adelante, las vistas viejas seguían ahí y aparecía como si
  // lo hubieras visto varias veces con fechas fantasma.
  await supabase.from("episode_watch_events").delete().eq("user_id", userId).eq("series_tmdb_id", seriesTmdbId).eq("season_number", season).eq("episode_number", episode);
  await supabase
    .from("user_episodes_watched")
    .delete()
    .eq("user_id", userId)
    .eq("series_tmdb_id", seriesTmdbId)
    .eq("season_number", season)
    .eq("episode_number", episode);
  await recalcularUltimaVistaSerie(userId, seriesTmdbId);
}
