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
// No tiene sentido backfillear miles de títulos de una sola vez (tardaría
// una eternidad la primera vez) — con esto alcanza para ir completando de a
// poco en cada visita a Estadísticas, sin demorar demasiado la pantalla.
const TOPE_BACKFILL = 40;
const CONCURRENCIA_BACKFILL = 8;

async function enLotes<T, R>(items: T[], concurrencia: number, tarea: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = [];
  for (let i = 0; i < items.length; i += concurrencia) {
    resultados.push(...(await Promise.all(items.slice(i, i + concurrencia).map(tarea))));
  }
  return resultados;
}

/** Trae y guarda SOLO el director + elenco de una película (no toda su ficha) — más liviano que syncMovie para este caso puntual, y devuelve el dato directo, sin necesitar un segundo viaje a la base para volver a leerlo. */
async function backfillDirectorYElencoPelicula(tmdbId: number): Promise<{ director: string | null; cast_top: { id: number; name: string }[] }> {
  const { getMovieCredits } = await import("./tmdb");
  const credits = await getMovieCredits(tmdbId);
  const director = credits.crew?.find((c: any) => c.job === "Director")?.name ?? null;
  const cast_top = (credits.cast ?? []).slice(0, 10).map((c: any) => ({ id: c.id, name: c.name }));
  await supabase.from("movies_cache").update({ director, cast_top }).eq("tmdb_id", tmdbId);
  return { director, cast_top };
}

/** Trae y guarda SOLO el elenco de una serie — mismo criterio que la de arriba. */
async function backfillElencoSerie(tmdbId: number): Promise<{ cast_top: { id: number; name: string }[] }> {
  const { getSeriesCredits } = await import("./tmdb");
  const credits = await getSeriesCredits(tmdbId);
  const cast_top = (credits.cast ?? []).slice(0, 10).map((c: any) => ({ id: c.id, name: c.name }));
  await supabase.from("series_cache").update({ cast_top }).eq("tmdb_id", tmdbId);
  return { cast_top };
}

export async function getFavoritosDeElenco(userId: string): Promise<FavoritosDeElenco> {
  try {
    const [peliculas, series] = await Promise.all([
      fetchAllRows<any>((d, h) =>
        supabase.from("user_movies").select("movie_tmdb_id, movies_cache(director, cast_top)").eq("user_id", userId).eq("watched", true).range(d, h)
      ),
      fetchAllRows<any>((d, h) => supabase.from("user_series").select("series_tmdb_id, series_cache(cast_top)").eq("user_id", userId).range(d, h)),
    ]);
    console.log(`[favoritosDeElenco] películas vistas: ${peliculas.length}, series seguidas: ${series.length}`);

    // Backfill: hasta la última actualización, el director/elenco solo se
    // guardaba cuando volvías a entrar a esa película/serie puntual — así
    // que alguien con cientos de títulos vistos de antes puede tener casi
    // todo sin completar todavía. Acá se completa lo que falte (con tope,
    // para no demorar la pantalla una eternidad de una sola vez — con
    // varias visitas se va completando todo). El resultado de cada backfill
    // se usa directo (sin volver a consultar la base), para tener menos
    // pasos donde algo se pueda romper.
    const peliculasSinDatos = peliculas.filter((p: any) => !p.movies_cache?.director && !(p.movies_cache?.cast_top?.length > 0)).slice(0, TOPE_BACKFILL);
    const seriesSinDatos = series.filter((s: any) => !(s.series_cache?.cast_top?.length > 0)).slice(0, TOPE_BACKFILL);
    console.log(`[favoritosDeElenco] les falta director/elenco: ${peliculasSinDatos.length} películas, ${seriesSinDatos.length} series (de un tope de ${TOPE_BACKFILL} por visita)`);

    const resultadosPeliculas = await enLotes(peliculasSinDatos, CONCURRENCIA_BACKFILL, async (p: any) => {
      try {
        return { id: p.movie_tmdb_id, datos: await backfillDirectorYElencoPelicula(p.movie_tmdb_id) };
      } catch (e) {
        console.error(`No se pudo completar el director/elenco de la película ${p.movie_tmdb_id}:`, e);
        return null;
      }
    });
    const resultadosSeries = await enLotes(seriesSinDatos, CONCURRENCIA_BACKFILL, async (s: any) => {
      try {
        return { id: s.series_tmdb_id, datos: await backfillElencoSerie(s.series_tmdb_id) };
      } catch (e) {
        console.error(`No se pudo completar el elenco de la serie ${s.series_tmdb_id}:`, e);
        return null;
      }
    });
    console.log(
      `[favoritosDeElenco] backfill terminado: ${resultadosPeliculas.filter((r) => r).length}/${peliculasSinDatos.length} películas ok, ${resultadosSeries.filter((r) => r).length}/${seriesSinDatos.length} series ok`
    );

    const mapaPeliculas = new Map(resultadosPeliculas.filter((r): r is NonNullable<typeof r> => !!r).map((r) => [r.id, r.datos]));
    const mapaSeries = new Map(resultadosSeries.filter((r): r is NonNullable<typeof r> => !!r).map((r) => [r.id, r.datos]));

    const conteoActores: Record<string, number> = {};
    const conteoDirectores: Record<string, number> = {};

    for (const p of peliculas) {
      const cache = mapaPeliculas.get(p.movie_tmdb_id) ?? (p as any).movies_cache;
      if (!cache) continue;
      if (cache.director) conteoDirectores[cache.director] = (conteoDirectores[cache.director] ?? 0) + 1;
      for (const actor of cache.cast_top ?? []) conteoActores[actor.name] = (conteoActores[actor.name] ?? 0) + 1;
    }
    for (const s of series) {
      const cache = mapaSeries.get(s.series_tmdb_id) ?? (s as any).series_cache;
      if (!cache) continue;
      for (const actor of cache.cast_top ?? []) conteoActores[actor.name] = (conteoActores[actor.name] ?? 0) + 1;
    }

    const actorTop = Object.entries(conteoActores).sort((a, b) => b[1] - a[1])[0];
    const directorTop = Object.entries(conteoDirectores).sort((a, b) => b[1] - a[1])[0];
    console.log(
      `[favoritosDeElenco] top actor: ${actorTop ? `${actorTop[0]} (${actorTop[1]})` : "ninguno"} — top director: ${directorTop ? `${directorTop[0]} (${directorTop[1]})` : "ninguno"} — ${Object.keys(conteoActores).length} actores distintos, ${Object.keys(conteoDirectores).length} directores distintos en total`
    );

    return {
      actorFavorito: actorTop && actorTop[1] >= 2 ? { nombre: actorTop[0], cantidad: actorTop[1] } : null,
      directorFavorito: directorTop && directorTop[1] >= 2 ? { nombre: directorTop[0], cantidad: directorTop[1] } : null,
    };
  } catch (e) {
    // Si algo se cae en el medio (una consulta, el backfill, lo que sea),
    // mejor devolver "no hay dato" que dejar la promesa colgada.
    console.error("Error al calcular actor/director favorito:", e);
    return { actorFavorito: null, directorFavorito: null };
  }
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
