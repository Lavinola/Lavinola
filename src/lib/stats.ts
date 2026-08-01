import { supabase } from "./supabase";
import { fetchAllRows } from "./pagination";
import { GENEROS_SERIES, GENEROS_PELICULAS } from "./tmdbGenres";
import { listarSeriesConEstado } from "./seriesList";

export interface ConteoNombre {
  nombre: string;
  cantidad: number;
}

export interface EstadisticasSeries {
  tiempoTotalMinutos: number;
  episodiosVistosTotal: number;
  episodiosUltimos7Dias: number;
  seriesAnadidas: number;
  seriesEnProduccion: number;
  generosPopulares: ConteoNombre[];
  plataformasPopulares: ConteoNombre[];
  comentariosCantidad: number;
  comentariosEnCuantasSeries: number;
  meGustaConseguidos: number;
  episodiosPendientes: number;
  minutosEpisodiosPendientes: number;
  calificacionesVotadas: number;
  seriesTerminadas: number;
  seriesViendo: number;
  seriesSinComenzar: number;
}

export interface EstadisticasPeliculas {
  tiempoTotalMinutos: number;
  peliculasVistas: number;
  peliculasVistasUltimos7Dias: number;
  peliculasAnadidas: number;
  peliculasPendientes: number;
  minutosPeliculasPendientes: number;
  generosPopulares: ConteoNombre[];
  calificacionesVotadas: number;
  comentariosCantidad: number;
  comentariosEnCuantasPeliculas: number;
  meGustaConseguidos: number;
}

const HACE_7_DIAS = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

export interface ActividadMes {
  mes: string; // "YYYY-MM"
  etiqueta: string; // "Ene", "Feb", ... para mostrar
  cantidad: number;
}

const NOMBRES_MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function ultimos12Meses(): { clave: string; etiqueta: string }[] {
  const hoy = new Date();
  const meses: { clave: string; etiqueta: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    meses.push({ clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, etiqueta: NOMBRES_MES[d.getMonth()] });
  }
  return meses;
}

/** Cuántos capítulos vio el usuario por mes, en los últimos 12 meses. */
export async function getActividadMensualSeries(userId: string): Promise<ActividadMes[]> {
  const desde = new Date();
  desde.setMonth(desde.getMonth() - 11, 1);
  const filas = await fetchAllRows<any>((d, h) =>
    supabase.from("user_episodes_watched").select("watched_at").eq("user_id", userId).gte("watched_at", desde.toISOString()).range(d, h)
  );
  const conteo: Record<string, number> = {};
  for (const f of filas) {
    const clave = (f.watched_at ?? "").slice(0, 7);
    if (clave) conteo[clave] = (conteo[clave] ?? 0) + 1;
  }
  return ultimos12Meses().map((m) => ({ mes: m.clave, etiqueta: m.etiqueta, cantidad: conteo[m.clave] ?? 0 }));
}

/** Cuántas películas vio el usuario por mes, en los últimos 12 meses. */
export async function getActividadMensualPeliculas(userId: string): Promise<ActividadMes[]> {
  const desde = new Date();
  desde.setMonth(desde.getMonth() - 11, 1);
  const filas = await fetchAllRows<any>((d, h) =>
    supabase.from("user_movies").select("watched_at").eq("user_id", userId).eq("watched", true).gte("watched_at", desde.toISOString()).range(d, h)
  );
  const conteo: Record<string, number> = {};
  for (const f of filas) {
    const clave = (f.watched_at ?? "").slice(0, 7);
    if (clave) conteo[clave] = (conteo[clave] ?? 0) + 1;
  }
  return ultimos12Meses().map((m) => ({ mes: m.clave, etiqueta: m.etiqueta, cantidad: conteo[m.clave] ?? 0 }));
}

export interface FavoritosDeElenco {
  actorFavorito: ConteoNombre | null; // combina elenco de películas y series vistas
  directorFavorito: ConteoNombre | null; // solo películas — las series no tienen un único director
}

/** Actor/actriz y director que más se repiten entre lo que el usuario ya vio (usa el elenco guardado al sincronizar cada título — no pega contra TMDB acá). */
export async function getFavoritosDeElenco(userId: string): Promise<FavoritosDeElenco> {
  const [peliculas, series] = await Promise.all([
    fetchAllRows<any>((d, h) =>
      supabase.from("user_movies").select("movies_cache(director, cast_top)").eq("user_id", userId).eq("watched", true).range(d, h)
    ),
    fetchAllRows<any>((d, h) => supabase.from("user_series").select("series_cache(cast_top)").eq("user_id", userId).range(d, h)),
  ]);

  const conteoActores: Record<string, number> = {};
  const conteoDirectores: Record<string, number> = {};

  for (const p of peliculas) {
    const cache = (p as any).movies_cache;
    if (!cache) continue;
    if (cache.director) conteoDirectores[cache.director] = (conteoDirectores[cache.director] ?? 0) + 1;
    for (const actor of cache.cast_top ?? []) conteoActores[actor.name] = (conteoActores[actor.name] ?? 0) + 1;
  }
  for (const s of series) {
    const cache = (s as any).series_cache;
    if (!cache) continue;
    for (const actor of cache.cast_top ?? []) conteoActores[actor.name] = (conteoActores[actor.name] ?? 0) + 1;
  }

  const actorTop = Object.entries(conteoActores).sort((a, b) => b[1] - a[1])[0];
  const directorTop = Object.entries(conteoDirectores).sort((a, b) => b[1] - a[1])[0];

  return {
    actorFavorito: actorTop && actorTop[1] >= 2 ? { nombre: actorTop[0], cantidad: actorTop[1] } : null,
    directorFavorito: directorTop && directorTop[1] >= 2 ? { nombre: directorTop[0], cantidad: directorTop[1] } : null,
  };
}

export async function getEstadisticasSeries(userId: string): Promise<EstadisticasSeries> {
  const vistos = await fetchAllRows((desde, hasta) =>
    supabase
      .from("user_episodes_watched")
      .select("watched_at, episodes_cache(runtime_minutes)")
      .eq("user_id", userId)
      .range(desde, hasta)
  );

  const tiempoTotalMinutos = (vistos ?? []).reduce((acc: number, v: any) => acc + (v.episodes_cache?.runtime_minutes ?? 0), 0);
  const hace7 = HACE_7_DIAS();
  const episodiosUltimos7Dias = (vistos ?? []).filter((v: any) => v.watched_at >= hace7).length;

  const misSeries = await fetchAllRows((desde, hasta) =>
    supabase
      .from("user_series")
      .select("rating, watched_platform, series_cache(status, genre_ids, networks, total_episodes)")
      .eq("user_id", userId)
      .range(desde, hasta)
  );

  const seriesEnProduccion = (misSeries ?? []).filter((s: any) => s.series_cache?.status === "Returning Series").length;
  const calificacionesVotadas = (misSeries ?? []).filter((s: any) => s.rating != null).length;

  const generosCount: Record<number, number> = {};
  const dondeLoVisteCount: Record<string, number> = {};
  for (const s of misSeries ?? []) {
    for (const g of (s as any).series_cache?.genre_ids ?? []) generosCount[g] = (generosCount[g] ?? 0) + 1;
    if ((s as any).watched_platform) dondeLoVisteCount[(s as any).watched_platform] = (dondeLoVisteCount[(s as any).watched_platform] ?? 0) + 1;
  }
  const generosPopulares = Object.entries(generosCount)
    .map(([id, cantidad]) => ({ nombre: GENEROS_SERIES[Number(id)] ?? "Otro", cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 8);
  const plataformasPopulares = Object.entries(dondeLoVisteCount)
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 8);

  const { count: comentariosCantidad } = await supabase
    .from("comentarios")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("target_type", "series");
  const { data: comentariosSeries } = await supabase.from("comentarios").select("target_id").eq("user_id", userId).eq("target_type", "series");
  const comentariosEnCuantasSeries = new Set((comentariosSeries ?? []).map((c) => c.target_id)).size;

  const { data: misComentarioIds } = await supabase.from("comentarios").select("id").eq("user_id", userId).eq("target_type", "series");
  let meGustaConseguidos = 0;
  if (misComentarioIds && misComentarioIds.length > 0) {
    const { count } = await supabase
      .from("likes_comentario")
      .select("*", { count: "exact", head: true })
      .in("comment_id", misComentarioIds.map((c) => c.id));
    meGustaConseguidos = count ?? 0;
  }

  // Episodios pendientes: para cada serie seguida, cuántos episodios no vistos hay y su duración total.
  // Antes esto hacía 2 consultas POR SERIE seguida (uno por uno, en secuencia)
  // — con muchas series seguidas eso se sentía lento de verdad. Ahora se
  // traen TODOS los episodios de TODAS las series seguidas, y TODO lo visto
  // del usuario, en 2 consultas en total, y se cruza en memoria.
  let episodiosPendientes = 0;
  let minutosEpisodiosPendientes = 0;
  const seriesIds = await fetchAllRows<any>((desde, hasta) =>
    supabase.from("user_series").select("series_tmdb_id").eq("user_id", userId).range(desde, hasta)
  );
  const idsDeSeries = (seriesIds ?? []).map((r) => r.series_tmdb_id);
  if (idsDeSeries.length > 0) {
    const [todosLosEpisodios, todoLoVisto] = await Promise.all([
      fetchAllRows<any>((desde, hasta) =>
        supabase
          .from("episodes_cache")
          .select("series_tmdb_id, season_number, episode_number, runtime_minutes")
          .in("series_tmdb_id", idsDeSeries)
          .range(desde, hasta)
      ),
      fetchAllRows<any>((desde, hasta) =>
        supabase.from("user_episodes_watched").select("series_tmdb_id, season_number, episode_number").eq("user_id", userId).range(desde, hasta)
      ),
    ]);
    const vistosSet = new Set(todoLoVisto.map((v) => `${v.series_tmdb_id}-${v.season_number}-${v.episode_number}`));
    for (const ep of todosLosEpisodios) {
      if (!vistosSet.has(`${ep.series_tmdb_id}-${ep.season_number}-${ep.episode_number}`)) {
        episodiosPendientes++;
        minutosEpisodiosPendientes += ep.runtime_minutes ?? 0;
      }
    }
  }

  const listadoConEstado = await listarSeriesConEstado(userId);
  const seriesTerminadas = listadoConEstado.filter((s) => s.estado === "terminada").length;
  const seriesViendo = listadoConEstado.filter((s) => s.estado === "viendo" || s.estado === "al_dia").length;
  const seriesSinComenzar = listadoConEstado.filter((s) => s.estado === "sin_comenzar").length;

  return {
    tiempoTotalMinutos,
    episodiosVistosTotal: (vistos ?? []).length,
    episodiosUltimos7Dias,
    seriesAnadidas: (misSeries ?? []).length,
    seriesEnProduccion,
    generosPopulares,
    plataformasPopulares,
    comentariosCantidad: comentariosCantidad ?? 0,
    comentariosEnCuantasSeries,
    meGustaConseguidos,
    episodiosPendientes,
    minutosEpisodiosPendientes,
    calificacionesVotadas,
    seriesTerminadas,
    seriesViendo,
    seriesSinComenzar,
  };
}

export async function getEstadisticasPeliculas(userId: string): Promise<EstadisticasPeliculas> {
  const misPeliculas = await fetchAllRows((desde, hasta) =>
    supabase
      .from("user_movies")
      .select("watched, watched_at, rating, movies_cache(runtime_minutes, genre_ids)")
      .eq("user_id", userId)
      .range(desde, hasta)
  );

  const vistas = (misPeliculas ?? []).filter((p: any) => p.watched);
  const pendientes = (misPeliculas ?? []).filter((p: any) => !p.watched);
  const hace7 = HACE_7_DIAS();

  const tiempoTotalMinutos = vistas.reduce((acc: number, p: any) => acc + (p.movies_cache?.runtime_minutes ?? 0), 0);
  const minutosPeliculasPendientes = pendientes.reduce((acc: number, p: any) => acc + (p.movies_cache?.runtime_minutes ?? 0), 0);
  const peliculasVistasUltimos7Dias = vistas.filter((p: any) => p.watched_at && p.watched_at >= hace7).length;
  const calificacionesVotadas = (misPeliculas ?? []).filter((p: any) => p.rating != null).length;

  const generosCount: Record<number, number> = {};
  for (const p of misPeliculas ?? []) {
    for (const g of (p as any).movies_cache?.genre_ids ?? []) generosCount[g] = (generosCount[g] ?? 0) + 1;
  }
  const generosPopulares = Object.entries(generosCount)
    .map(([id, cantidad]) => ({ nombre: GENEROS_PELICULAS[Number(id)] ?? "Otro", cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 8);

  const { count: comentariosCantidad } = await supabase
    .from("comentarios")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("target_type", "movie");
  const { data: comentariosPeliculas } = await supabase.from("comentarios").select("target_id").eq("user_id", userId).eq("target_type", "movie");
  const comentariosEnCuantasPeliculas = new Set((comentariosPeliculas ?? []).map((c) => c.target_id)).size;

  const { data: misComentarioIds } = await supabase.from("comentarios").select("id").eq("user_id", userId).eq("target_type", "movie");
  let meGustaConseguidos = 0;
  if (misComentarioIds && misComentarioIds.length > 0) {
    const { count } = await supabase
      .from("likes_comentario")
      .select("*", { count: "exact", head: true })
      .in("comment_id", misComentarioIds.map((c) => c.id));
    meGustaConseguidos = count ?? 0;
  }

  return {
    tiempoTotalMinutos,
    peliculasVistas: vistas.length,
    peliculasVistasUltimos7Dias,
    peliculasAnadidas: (misPeliculas ?? []).length,
    peliculasPendientes: pendientes.length,
    minutosPeliculasPendientes,
    generosPopulares,
    calificacionesVotadas,
    comentariosCantidad: comentariosCantidad ?? 0,
    comentariosEnCuantasPeliculas,
    meGustaConseguidos,
  };
}

export interface PuestoRanking {
  userId: string;
  username: string | null;
  avatar_url: string | null;
  minutos: number;
  soyYo: boolean;
}

async function minutosSeriesDe(userId: string): Promise<number> {
  const data = await fetchAllRows((desde, hasta) =>
    supabase.from("user_episodes_watched").select("episodes_cache(runtime_minutes)").eq("user_id", userId).range(desde, hasta)
  );
  return (data ?? []).reduce((acc: number, v: any) => acc + (v.episodes_cache?.runtime_minutes ?? 0), 0);
}

async function minutosPeliculasDe(userId: string): Promise<number> {
  const data = await fetchAllRows((desde, hasta) =>
    supabase.from("user_movies").select("movies_cache(runtime_minutes)").eq("user_id", userId).eq("watched", true).range(desde, hasta)
  );
  return (data ?? []).reduce((acc: number, p: any) => acc + (p.movies_cache?.runtime_minutes ?? 0), 0);
}

async function rankingGenerico(userId: string, minutosDe: (uid: string) => Promise<number>): Promise<PuestoRanking[]> {
  const { data: siguiendo } = await supabase.from("follows").select("followee_id").eq("follower_id", userId);
  const ids = [userId, ...(siguiendo ?? []).map((f) => f.followee_id)];

  const { data: perfiles } = await supabase.from("profiles").select("id, username, avatar_url").in("id", ids);

  const resultado: PuestoRanking[] = [];
  for (const id of ids) {
    const minutos = await minutosDe(id);
    const perfil = (perfiles ?? []).find((p) => p.id === id);
    resultado.push({ userId: id, username: perfil?.username ?? null, avatar_url: perfil?.avatar_url ?? null, minutos, soyYo: id === userId });
  }
  return resultado.sort((a, b) => b.minutos - a.minutos);
}

export function getRankingTiempoSeries(userId: string) {
  return rankingGenerico(userId, minutosSeriesDe);
}

export function getRankingTiempoPeliculas(userId: string) {
  return rankingGenerico(userId, minutosPeliculasDe);
}

export function formatTiempo(minutos: number): { anios: number; meses: number; dias: number; horas: number } {
  const minutosPorHora = 60;
  const minutosPorDia = minutosPorHora * 24;
  const minutosPorMes = minutosPorDia * 30;
  const minutosPorAnio = minutosPorMes * 12;

  const anios = Math.floor(minutos / minutosPorAnio);
  const meses = Math.floor((minutos % minutosPorAnio) / minutosPorMes);
  const dias = Math.floor((minutos % minutosPorMes) / minutosPorDia);
  const horas = Math.floor((minutos % minutosPorDia) / minutosPorHora);

  return { anios, meses, dias, horas };
}

/** Promedio de puntuación de la comunidad (todos los usuarios) para un conjunto de películas. */
export async function promedioPuntuacionPeliculas(tmdbIds: number[]): Promise<Record<number, number>> {
  if (tmdbIds.length === 0) return {};
  const { data, error } = await supabase.rpc("promedio_puntuacion_peliculas", { p_tmdb_ids: tmdbIds });
  if (error) {
    console.error("Error al traer la puntuación Lavinola:", error.message);
    return {};
  }
  const resultado: Record<number, number> = {};
  (data ?? []).forEach((r: any) => (resultado[r.tmdb_id] = Number(r.promedio)));
  return resultado;
}
