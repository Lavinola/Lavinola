import { supabase } from "./supabase";
import { fetchAllRows } from "./pagination";
import { computeSeriesStatus, SeriesStatusFilter, DIAS_SIN_COMENZAR_EN_VER_A_CONTINUACION } from "../types";
import { refrescarMetaSerie } from "./sync";

export interface SerieListado {
  tmdb_id: number;
  name: string;
  poster_path: string | null;
  estado: SeriesStatusFilter;
  next_episode_label: string | null;
  next_episode_season: number | null;
  next_episode_number: number | null;
  next_episode_name: string | null;
  last_watched_at: string | null;
  episodios_restantes: number;
  temporada_nueva: boolean;
  total_seasons: number;
  anio: string | null;
  primera_fecha: string | null; // fecha completa (no solo el año) del primer capítulo, para ordenar por fecha de lanzamiento con precisión
  rating: number | null;
  genre_ids: number[];
  added_at: string;
  primer_capitulo_season: number | null; // solo para "sin_comenzar": el capítulo 1, salga o no — para mostrar qué se viene
  primer_capitulo_number: number | null;
  primer_capitulo_nombre: string | null;
  primer_capitulo_fecha: string | null;
}

export interface EventoHistorial {
  series_tmdb_id: number;
  series_name: string;
  poster_path: string | null;
  season_number: number;
  episode_number: number;
  episode_name: string | null;
  watched_at: string;
}

export interface ProgresoSerie {
  estado: SeriesStatusFilter;
  porcentaje: number; // 0-100, solo relevante cuando estado es "viendo" o "abandonada"
}

/**
 * Versión liviana de listarSeriesConEstado, para pintar la barrita de
 * progreso bajo cada cartel (grillas del Perfil): no calcula el próximo
 * capítulo, así que es más rápida cuando solo hace falta el estado.
 */
export async function progresoDeSeries(userId: string): Promise<Record<number, ProgresoSerie>> {
  const rows = await fetchAllRows((desde, hasta) =>
    supabase
      .from("user_series")
      .select("series_tmdb_id, last_watched_at, series_cache(status, total_episodes)")
      .eq("user_id", userId)
      .range(desde, hasta)
  );

  // Antes esto hacía un COUNT por serie (una consulta por cada una — con
  // muchas series, cientos de idas y vueltas a la base). Ahora traemos TODOS
  // los episodios vistos del usuario en una sola tanda paginada, y contamos
  // acá mismo, agrupando por serie.
  const vistos = await fetchAllRows((desde, hasta) =>
    supabase.from("user_episodes_watched").select("series_tmdb_id, watched_at").eq("user_id", userId).range(desde, hasta)
  );
  const conteoPorSerie: Record<number, number> = {};
  // Igual que en listarSeriesConEstado: calculamos acá la fecha real del
  // capítulo más reciente que viste, no la tomamos del campo caché de
  // user_series (que algunos caminos viejos podían dejar desactualizado)
  // — si no, una serie podía clasificarse mal como "abandonada" (o nunca
  // pasar a estarlo) según qué tan al día estuviera ese campo.
  const ultimaVistaPorSerie: Record<number, string> = {};
  (vistos ?? []).forEach((v: any) => {
    conteoPorSerie[v.series_tmdb_id] = (conteoPorSerie[v.series_tmdb_id] ?? 0) + 1;
    if (v.watched_at && (!ultimaVistaPorSerie[v.series_tmdb_id] || v.watched_at > ultimaVistaPorSerie[v.series_tmdb_id])) {
      ultimaVistaPorSerie[v.series_tmdb_id] = v.watched_at;
    }
  });

  const resultado: Record<number, ProgresoSerie> = {};
  for (const row of rows ?? []) {
    const cache: any = row.series_cache;
    const episodesWatched = conteoPorSerie[row.series_tmdb_id] ?? 0;
    const totalEpisodes = cache?.total_episodes ?? 0;

    const estado = computeSeriesStatus({
      episodesWatched,
      totalEpisodes,
      tmdbStatus: cache?.status ?? "",
      lastWatchedAt: ultimaVistaPorSerie[row.series_tmdb_id] ?? row.last_watched_at,
    });

    resultado[row.series_tmdb_id] = {
      estado,
      porcentaje: totalEpisodes > 0 ? Math.min(100, Math.round((episodesWatched / totalEpisodes) * 100)) : 0,
    };
  }
  return resultado;
}
export async function listarSeriesConEstado(userId: string): Promise<SerieListado[]> {
  const rows = await fetchAllRows((desde, hasta) =>
    supabase
      .from("user_series")
      .select("series_tmdb_id, last_watched_at, custom_poster_path, rating, created_at, series_cache(*)")
      .eq("user_id", userId)
      .range(desde, hasta)
  );

  // ---- Todo lo que antes eran consultas "una por serie" ahora se trae en
  // un puñado de tandas paginadas, y el resto se calcula acá en memoria. Con
  // 150-200 series (algo común después de importar de TV Time), esto pasa
  // de cientos de idas y vueltas a la base a un puñado — es la diferencia
  // entre esperar decenas de segundos y menos de dos. ----

  // 1) Todos los episodios vistos del usuario, de una — reemplaza el COUNT
  // por serie de antes.
  const vistos = await fetchAllRows((desde, hasta) =>
    supabase.from("user_episodes_watched").select("series_tmdb_id, season_number, episode_number, watched_at").eq("user_id", userId).range(desde, hasta)
  );
  const vistosPorSerie = new Map<number, Set<string>>();
  // "Última vez vista" calculada de una, acá, directo de los capítulos
  // vistos reales — no del campo last_watched_at de user_series, que
  // algunos caminos viejos (como importar de TV Time) podían dejar sin
  // actualizar, dando un orden incorrecto.
  const ultimaVistaPorSerie = new Map<number, string>();
  (vistos ?? []).forEach((v: any) => {
    if (!vistosPorSerie.has(v.series_tmdb_id)) vistosPorSerie.set(v.series_tmdb_id, new Set());
    vistosPorSerie.get(v.series_tmdb_id)!.add(`${v.season_number}-${v.episode_number}`);
    if (v.watched_at && (!ultimaVistaPorSerie.has(v.series_tmdb_id) || v.watched_at > ultimaVistaPorSerie.get(v.series_tmdb_id)!)) {
      ultimaVistaPorSerie.set(v.series_tmdb_id, v.watched_at);
    }
  });
  const conteos: Record<number, number> = {};
  vistosPorSerie.forEach((set, id) => (conteos[id] = set.size));

  const candidatasARefrescar: number[] = [];
  for (const row of rows ?? []) {
    const cache: any = row.series_cache;
    const count = conteos[row.series_tmdb_id] ?? 0;
    const completa = (cache?.total_episodes ?? 0) > 0 && count >= (cache?.total_episodes ?? 0);
    if (completa && cache?.status === "Returning Series") candidatasARefrescar.push(row.series_tmdb_id);
  }
  if (candidatasARefrescar.length > 0) {
    await Promise.all(candidatasARefrescar.map((id) => refrescarMetaSerie(id)));
    const { data: actualizadas } = await supabase.from("series_cache").select("*").in("tmdb_id", candidatasARefrescar);
    const porId: Record<number, any> = {};
    (actualizadas ?? []).forEach((s: any) => (porId[s.tmdb_id] = s));
    for (const row of rows ?? []) {
      if (porId[row.series_tmdb_id]) (row as any).series_cache = porId[row.series_tmdb_id];
    }
  }

  // 2) Qué series necesitan "próximo capítulo" — antes esto disparaba 2
  // consultas por serie (getProximoEpisodio). Ahora traemos TODOS los
  // episodios de TODAS esas series de una sola vez (en tandas de a 150 ids,
  // para no mandar una URL gigante) y resolvemos el "próximo" en memoria.
  //
  // A quién le chequeamos: a cualquiera que todavía esté en emisión (puede
  // tener un capítulo nuevo en cualquier momento), a cualquiera con algo ya
  // visto (puede tener más para ver), y a las recién agregadas sin empezar
  // (para poder mostrar el episodio 1). Ojo: NO nos guiamos por el "estado"
  // ya calculado con total_episodes — ese total puede estar desactualizado
  // si salió un capítulo nuevo hace poco y todavía no se sincronizó, y
  // confiar en él hacía que series con capítulos nuevos de verdad quedaran
  // mal clasificadas como "al día" sin siquiera chequear.
  const necesitanProximo: number[] = (rows ?? []).map((row) => row.series_tmdb_id);

  const episodiosPorSerie = new Map<number, { season_number: number; episode_number: number; name: string | null; air_date: string | null }[]>();
  const TAMAÑO_LOTE = 150;
  for (let i = 0; i < necesitanProximo.length; i += TAMAÑO_LOTE) {
    const lote = necesitanProximo.slice(i, i + TAMAÑO_LOTE);
    const episodiosLote = await fetchAllRows((desde, hasta) =>
      supabase
        .from("episodes_cache")
        .select("series_tmdb_id, season_number, episode_number, name, air_date")
        .in("series_tmdb_id", lote)
        .order("season_number", { ascending: true })
        .order("episode_number", { ascending: true })
        .range(desde, hasta)
    );
    (episodiosLote ?? []).forEach((e: any) => {
      if (!episodiosPorSerie.has(e.series_tmdb_id)) episodiosPorSerie.set(e.series_tmdb_id, []);
      episodiosPorSerie.get(e.series_tmdb_id)!.push(e);
    });
  }

  const hoy = new Date().toISOString().slice(0, 10);
  function proximoEpisodioDe(seriesTmdbId: number) {
    const todos = episodiosPorSerie.get(seriesTmdbId) ?? [];
    const vistosSet = vistosPorSerie.get(seriesTmdbId) ?? new Set<string>();
    // Solo capítulos que YA salieron y no viste — si lo próximo que falta es
    // un capítulo que todavía no se estrenó, no cuenta como "para ver
    // ahora": no tiene que aparecer en Ver a continuación hasta que salga.
    const noVistosEmitidos = todos.filter((e) => !vistosSet.has(`${e.season_number}-${e.episode_number}`) && e.air_date && e.air_date <= hoy);
    return noVistosEmitidos[0] ?? null;
  }

  const resultado: SerieListado[] = [];
  for (const row of rows ?? []) {
    const cache: any = row.series_cache;
    const count = conteos[row.series_tmdb_id] ?? 0;

    let estado = computeSeriesStatus({
      episodesWatched: count,
      totalEpisodes: cache?.total_episodes ?? 0,
      tmdbStatus: cache?.status ?? "",
      lastWatchedAt: ultimaVistaPorSerie.get(row.series_tmdb_id) ?? row.last_watched_at,
    });

    let nextLabel: string | null = null;
    let nextSeason: number | null = null;
    let nextNumber: number | null = null;
    let nextName: string | null = null;
    const proximo = proximoEpisodioDe(row.series_tmdb_id);
    if (proximo) {
      nextLabel = `T${proximo.season_number} - E${proximo.episode_number}${proximo.name ? `: ${proximo.name}` : ""}`;
      nextSeason = proximo.season_number;
      nextNumber = proximo.episode_number;
      nextName = proximo.name ?? null;
    }

    // Corrección importante: "totalEpisodes" (de TMDB) puede incluir un
    // capítulo de una temporada nueva que YA se anunció pero todavía no
    // salió — eso hacía que el conteo total-vs-vistos nunca diera "completo"
    // y la serie quedara marcada "viendo" para siempre, aunque en los
    // hechos estés al día con todo lo que se puede ver ahora mismo. Usamos
    // el próximo capítulo REAL (que ya tiene en cuenta la fecha de estreno)
    // como la fuente de verdad: si no hay nada para ver todavía, es "al
    // día", no "viendo" — recién pasa a "viendo" cuando ese capítulo sale.
    if ((estado === "viendo" || estado === "abandonada") && !proximo && count > 0) {
      estado = "al_dia";
    }

    // Serie recién agregada (o que todavía no habías empezado) pero que YA
    // tiene al menos un capítulo estrenado y sin ver — tiene que aparecer
    // en "Ver a continuación" para invitarte a arrancarla, no quedarse
    // escondida en "Sin comenzar" hasta que la busques ahí. Esto cubre
    // tanto el estreno del primer capítulo de una serie nueva, como
    // cualquier serie que agregaste antes de que saliera nada.
    //
    // Pero esto dura 15 días desde que salió el primer capítulo: si en ese
    // tiempo no viste nada, se considera que no te "enganchó" y vuelve a
    // "Sin comenzar" (no se queda en Ver a continuación para siempre). Ni
    // bien ves un capítulo, la serie ya cuenta como "empezada" — ahí pasa a
    // regirse por el umbral de 30 días de siempre (abandonada), no por este.
    if (estado === "sin_comenzar" && proximo) {
      const diasDisponible = cache?.first_air_date ? (Date.now() - new Date(cache.first_air_date).getTime()) / (1000 * 60 * 60 * 24) : 0;
      if (diasDisponible <= DIAS_SIN_COMENZAR_EN_VER_A_CONTINUACION) {
        estado = "viendo";
      }
    }

    // "Temporada nueva": lo próximo para ver es el estreno de una temporada
    // (episodio 1) que no sea la primera — o sea, veías todo y te salió una
    // temporada nueva, no que recién empezás la serie de cero.
    const temporadaNueva = nextNumber === 1 && (nextSeason ?? 0) > 1 && count > 0;

    // Para "sin_comenzar": el capítulo 1 (haya salido o no) — así se puede
    // mostrar qué se viene, aunque todavía no tenga fecha real o nombre.
    const todosLosEpisodios = episodiosPorSerie.get(row.series_tmdb_id) ?? [];
    const primerCapitulo = todosLosEpisodios[0] ?? null;

    resultado.push({
      tmdb_id: row.series_tmdb_id,
      name: cache?.name ?? "—",
      poster_path: (row as any).custom_poster_path ?? cache?.poster_path ?? null,
      estado,
      next_episode_label: nextLabel,
      next_episode_name: nextName,
      next_episode_season: nextSeason,
      next_episode_number: nextNumber,
      last_watched_at: ultimaVistaPorSerie.get(row.series_tmdb_id) ?? row.last_watched_at,
      episodios_restantes: Math.max(0, (cache?.total_episodes ?? 0) - count),
      temporada_nueva: temporadaNueva,
      total_seasons: cache?.total_seasons ?? 0,
      anio: cache?.first_air_date ? String(cache.first_air_date).slice(0, 4) : null,
      primera_fecha: cache?.first_air_date ?? null,
      rating: (row as any).rating ?? null,
      genre_ids: cache?.genre_ids ?? [],
      added_at: row.created_at,
      primer_capitulo_season: primerCapitulo?.season_number ?? null,
      primer_capitulo_number: primerCapitulo?.episode_number ?? null,
      primer_capitulo_nombre: primerCapitulo?.name ?? null,
      primer_capitulo_fecha: primerCapitulo?.air_date ?? null,
    });
  }
  return resultado;
}

/** Últimos episodios marcados como vistos, de cualquier serie, para el historial. */
export async function historialReciente(userId: string, limite = 20): Promise<EventoHistorial[]> {
  const { data, error } = await supabase
    .from("user_episodes_watched")
    .select("series_tmdb_id, season_number, episode_number, watched_at, series_cache(name, poster_path)")
    .eq("user_id", userId)
    .order("watched_at", { ascending: false })
    .limit(limite);
  if (error) throw error;

  const seriesIds = [...new Set((data ?? []).map((r: any) => r.series_tmdb_id))];
  const nombresPorEpisodio = new Map<string, string | null>();
  if (seriesIds.length > 0) {
    const { data: episodios } = await supabase.from("episodes_cache").select("series_tmdb_id, season_number, episode_number, name").in("series_tmdb_id", seriesIds);
    (episodios ?? []).forEach((e: any) => {
      nombresPorEpisodio.set(`${e.series_tmdb_id}-${e.season_number}-${e.episode_number}`, e.name ?? null);
    });
  }

  return (data ?? []).map((r: any) => ({
    series_tmdb_id: r.series_tmdb_id,
    series_name: r.series_cache?.name ?? "—",
    poster_path: r.series_cache?.poster_path ?? null,
    season_number: r.season_number,
    episode_number: r.episode_number,
    episode_name: nombresPorEpisodio.get(`${r.series_tmdb_id}-${r.season_number}-${r.episode_number}`) ?? null,
    watched_at: r.watched_at,
  }));
}
