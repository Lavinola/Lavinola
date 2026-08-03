import { supabase } from "./supabase";
import { fetchAllRows } from "./pagination";
import {
  getMovieWatchProviders,
  getSeriesWatchProviders,
  discoverMoviesPaginado,
  discoverSeriesPaginado,
  getTrendingMovies,
  getTrendingSeries,
} from "./tmdb";

export interface CandidatoQueVemos {
  tmdbId: number;
  nombre: string;
  poster_path: string | null;
  anio: string | null;
  genero_ids: number[];
}

export interface ResultadoQueVemos {
  tmdbId: number;
  tipo: "movie" | "series";
  nombre: string;
  poster_path: string | null;
  anio: string | null;
}

// No tiene sentido chequear plataforma de disponibilidad de decenas de
// candidatos uno por uno (son llamadas a la API por cada uno) — con esto
// alcanza de sobra para elegir bien sin demorar una eternidad.
const TOPE_CHEQUEOS_PLATAFORMA = 25;

/** Todo lo que un usuario tiene pendiente: películas no vistas, o series en su lista pero sin ningún capítulo visto todavía ("sin comenzar"). */
async function pendientesDeUsuario(userId: string, tipo: "movie" | "series"): Promise<Map<number, CandidatoQueVemos>> {
  const resultado = new Map<number, CandidatoQueVemos>();

  if (tipo === "movie") {
    const filas = await fetchAllRows<any>((desde, hasta) =>
      supabase
        .from("user_movies")
        .select("movie_tmdb_id, movies_cache(title, poster_path, release_date, genre_ids)")
        .eq("user_id", userId)
        .eq("watched", false)
        .range(desde, hasta)
    );
    for (const f of filas) {
      if (!f.movies_cache) continue;
      resultado.set(f.movie_tmdb_id, {
        tmdbId: f.movie_tmdb_id,
        nombre: f.movies_cache.title,
        poster_path: f.movies_cache.poster_path,
        anio: f.movies_cache.release_date ? f.movies_cache.release_date.slice(0, 4) : null,
        genero_ids: f.movies_cache.genre_ids ?? [],
      });
    }
  } else {
    const [seguidas, episodiosVistos] = await Promise.all([
      fetchAllRows<any>((desde, hasta) =>
        supabase
          .from("user_series")
          .select("series_tmdb_id, series_cache(name, poster_path, first_air_date, genre_ids)")
          .eq("user_id", userId)
          .range(desde, hasta)
      ),
      fetchAllRows<any>((desde, hasta) => supabase.from("user_episodes_watched").select("series_tmdb_id").eq("user_id", userId).range(desde, hasta)),
    ]);
    const idsConAlgoVisto = new Set(episodiosVistos.map((e: any) => e.series_tmdb_id));
    for (const f of seguidas) {
      if (!f.series_cache || idsConAlgoVisto.has(f.series_tmdb_id)) continue; // ya empezada, no es "sin comenzar"
      resultado.set(f.series_tmdb_id, {
        tmdbId: f.series_tmdb_id,
        nombre: f.series_cache.name,
        poster_path: f.series_cache.poster_path,
        anio: f.series_cache.first_air_date ? f.series_cache.first_air_date.slice(0, 4) : null,
        genero_ids: f.series_cache.genre_ids ?? [],
      });
    }
  }
  return resultado;
}

function cumpleGenero(candidato: { genero_ids: number[] }, generos: number[]): boolean {
  if (generos.length === 0) return true;
  return candidato.genero_ids.some((g) => generos.includes(g));
}

/** Chequea, de a poco (con tope), cuáles de estos ids están disponibles en alguna de las plataformas elegidas. Sin plataformas elegidas, pasan todos. */
async function filtrarPorPlataforma(
  ids: number[],
  tipo: "movie" | "series",
  plataformas: number[],
  watchRegion: string
): Promise<Set<number>> {
  if (plataformas.length === 0) return new Set(ids);
  const aChequear = ids.slice(0, TOPE_CHEQUEOS_PLATAFORMA);
  const resultados = await Promise.all(
    aChequear.map(async (id) => {
      try {
        const p = tipo === "series" ? await getSeriesWatchProviders(id, watchRegion) : await getMovieWatchProviders(id, watchRegion);
        const disponibles = [...(p?.flatrate ?? []), ...(p?.rent ?? []), ...(p?.buy ?? [])].map((prov: any) => prov.provider_id);
        return { id, pasa: disponibles.some((pid: number) => plataformas.includes(pid)) };
      } catch {
        return { id, pasa: false };
      }
    })
  );
  return new Set(resultados.filter((r) => r.pasa).map((r) => r.id));
}

function elegirAlAzar<T>(lista: T[]): T {
  return lista[Math.floor(Math.random() * lista.length)];
}

/** Qué tmdb_ids ya recomendó la app en este chat (con "¿Qué vemos?") en las últimas 24hs — para no repetir. */
async function obtenerRecomendadosUltimas24hs(chatId: string): Promise<Set<number>> {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from("chat_messages").select("tmdb_id").eq("chat_id", chatId).eq("es_que_vemos", true).gte("created_at", desde);
  return new Set((data ?? []).map((r: any) => r.tmdb_id).filter((id: number | null): id is number => id != null));
}

/** A partir de un grupo de candidatos, arma los 2-3 géneros más frecuentes (para el respaldo "lo más parecido"). */
function generosMasFrecuentesDe(candidatos: CandidatoQueVemos[]): number[] {
  const conteo: Record<number, number> = {};
  for (const c of candidatos) for (const g of c.genero_ids) conteo[g] = (conteo[g] ?? 0) + 1;
  return Object.entries(conteo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => Number(id));
}

/** Último recurso: lo más parecido en género a un pool de candidatos, disponible en las plataformas elegidas (si hay), excluyendo lo que cualquiera de los dos ya tiene. */
async function buscarParecido(
  poolParaGeneros: CandidatoQueVemos[],
  tipo: "movie" | "series",
  plataformas: number[],
  watchRegion: string,
  idsAExcluir: Set<number>
): Promise<ResultadoQueVemos | null> {
  const generos = generosMasFrecuentesDe(poolParaGeneros);
  if (generos.length === 0) return null;
  const data =
    tipo === "series"
      ? await discoverSeriesPaginado({ page: 1, genreId: generos[0], watchProviderIds: plataformas.length > 0 ? plataformas : undefined, watchRegion })
      : await discoverMoviesPaginado({ page: 1, genreId: generos[0], watchProviderIds: plataformas.length > 0 ? plataformas : undefined, watchRegion });
  const opciones = (data.results ?? []).filter((r: any) => !idsAExcluir.has(r.id));
  if (opciones.length === 0) return null;
  const elegido = elegirAlAzar(opciones.slice(0, 10));
  return mapResultado(elegido, tipo);
}

/** Última red de contención: lo más en tendencia que cumpla los filtros (o, si ni eso hay, tendencia a secas) — siempre tiene que dar algo. */
async function buscarTendenciaConFiltros(
  tipo: "movie" | "series",
  generos: number[],
  plataformas: number[],
  watchRegion: string,
  idsAExcluir: Set<number>
): Promise<ResultadoQueVemos | null> {
  const data =
    tipo === "series"
      ? await discoverSeriesPaginado({ page: 1, genreId: generos[0] ?? null, watchProviderIds: plataformas.length > 0 ? plataformas : undefined, watchRegion })
      : await discoverMoviesPaginado({ page: 1, genreId: generos[0] ?? null, watchProviderIds: plataformas.length > 0 ? plataformas : undefined, watchRegion });
  let opciones = (data.results ?? []).filter((r: any) => !idsAExcluir.has(r.id));
  if (opciones.length === 0) {
    // Ni con filtros hay nada — vamos a tendencia lisa y llana, tiene que dar algo sí o sí.
    const trend = tipo === "series" ? await getTrendingSeries() : await getTrendingMovies();
    opciones = (trend.results ?? []).filter((r: any) => !idsAExcluir.has(r.id));
  }
  if (opciones.length === 0) return null;
  const elegido = elegirAlAzar(opciones.slice(0, 10));
  return mapResultado(elegido, tipo);
}

function mapResultado(r: any, tipo: "movie" | "series"): ResultadoQueVemos {
  return {
    tmdbId: r.id,
    tipo,
    nombre: tipo === "series" ? r.name : r.title,
    poster_path: r.poster_path,
    anio: (tipo === "series" ? r.first_air_date : r.release_date)?.slice(0, 4) ?? null,
  };
}

/** Qué tmdb_ids ya recomendó la app en este GRUPO (con "¿Qué vemos?") en las últimas 24hs — para no repetir. */
async function obtenerRecomendadosUltimas24hsGrupo(groupId: string): Promise<Set<number>> {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("comentarios")
    .select("shared_tmdb_id")
    .eq("group_id", groupId)
    .eq("es_que_vemos", true)
    .gte("created_at", desde);
  return new Set((data ?? []).map((r: any) => r.shared_tmdb_id).filter((id: number | null): id is number => id != null));
}

/**
 * Como elegirQueVemos, pero para un grupo entero en vez de dos personas —
 * mira lo pendiente de TODOS los miembros. El "compartido" acá no exige
 * que sea pendiente para TODOS (con grupos grandes, casi nunca pasaría),
 * sino que prioriza lo que más miembros tengan pendiente en común.
 */
export async function elegirQueVemosGrupo(
  groupId: string,
  miembroIds: string[],
  tipo: "movie" | "series",
  generos: number[],
  plataformas: number[],
  watchRegion: string
): Promise<ResultadoQueVemos | null> {
  const [pendientesPorMiembro, recomendadosUltimas24hs] = await Promise.all([
    Promise.all(miembroIds.map((id) => pendientesDeUsuario(id, tipo))),
    obtenerRecomendadosUltimas24hsGrupo(groupId),
  ]);

  // Cuenta en cuántos miembros distintos está pendiente cada título.
  const conteoPorId = new Map<number, { candidato: CandidatoQueVemos; veces: number }>();
  for (const pendientes of pendientesPorMiembro) {
    for (const [id, candidato] of pendientes) {
      if (recomendadosUltimas24hs.has(id)) continue;
      const actual = conteoPorId.get(id);
      if (actual) actual.veces++;
      else conteoPorId.set(id, { candidato, veces: 1 });
    }
  }

  const todosLosIds = new Set(conteoPorId.keys());
  const idsExcluir = new Set([...todosLosIds, ...recomendadosUltimas24hs]);

  async function elegirDeEsePool(candidatos: CandidatoQueVemos[]): Promise<ResultadoQueVemos | null> {
    const porGenero = candidatos.filter((c) => cumpleGenero(c, generos));
    if (porGenero.length > 0) {
      const idsQuePasanPlataforma = await filtrarPorPlataforma(
        porGenero.map((c) => c.tmdbId),
        tipo,
        plataformas,
        watchRegion
      );
      const finales = porGenero.filter((c) => idsQuePasanPlataforma.has(c.tmdbId));
      if (finales.length > 0) {
        const elegido = elegirAlAzar(finales);
        return { tmdbId: elegido.tmdbId, tipo, nombre: elegido.nombre, poster_path: elegido.poster_path, anio: elegido.anio };
      }
    }
    return buscarParecido(candidatos, tipo, plataformas, watchRegion, idsExcluir);
  }

  // TIER 1: lo que esté pendiente para la MAYOR cantidad de miembros primero (2 o más, si hay), bajando de a un escalón hasta encontrar algo.
  const maxVeces = Math.max(0, ...[...conteoPorId.values()].map((v) => v.veces));
  for (let minimo = Math.max(maxVeces, 2); minimo >= 2; minimo--) {
    const compartidos = [...conteoPorId.values()].filter((v) => v.veces >= minimo).map((v) => v.candidato);
    if (compartidos.length === 0) continue;
    const resultado = await elegirDeEsePool(compartidos);
    if (resultado) return resultado;
  }

  // TIER 2: pendiente de CUALQUIER miembro (uno solo alcanza).
  if (conteoPorId.size > 0) {
    const union = [...conteoPorId.values()].map((v) => v.candidato);
    const resultado = await elegirDeEsePool(union);
    if (resultado) return resultado;
  }

  // TIER 3: nadie tiene nada pendiente (o no encontramos nada parecido) — tendencia con los filtros, o tendencia a secas. Siempre devuelve algo.
  return buscarTendenciaConFiltros(tipo, generos, plataformas, watchRegion, idsExcluir);
}

export async function elegirQueVemos(
  chatId: string,
  userIdA: string,
  userIdB: string,
  tipo: "movie" | "series",
  generos: number[],
  plataformas: number[],
  watchRegion: string
): Promise<ResultadoQueVemos | null> {
  const [pendientesA, pendientesB, recomendadosUltimas24hs] = await Promise.all([
    pendientesDeUsuario(userIdA, tipo),
    pendientesDeUsuario(userIdB, tipo),
    obtenerRecomendadosUltimas24hs(chatId),
  ]);

  const idsA = new Set(pendientesA.keys());
  const idsB = new Set(pendientesB.keys());
  // Para los respaldos por "discover" (parecido / tendencia), ni tiene
  // sentido recomendar algo que ya tiene alguno de los dos, ni repetir algo
  // que la app ya recomendó en este mismo chat en las últimas 24hs.
  const idsExcluir = new Set([...idsA, ...idsB, ...recomendadosUltimas24hs]);

  const compartidos = [...pendientesA.values()].filter((c) => idsB.has(c.tmdbId) && !recomendadosUltimas24hs.has(c.tmdbId));

  // TIER 1: comparten pendiente, y cumple los filtros elegidos.
  if (compartidos.length > 0) {
    const porGenero = compartidos.filter((c) => cumpleGenero(c, generos));
    if (porGenero.length > 0) {
      const idsQuePasanPlataforma = await filtrarPorPlataforma(
        porGenero.map((c) => c.tmdbId),
        tipo,
        plataformas,
        watchRegion
      );
      const finales = porGenero.filter((c) => idsQuePasanPlataforma.has(c.tmdbId));
      if (finales.length > 0) {
        const elegido = elegirAlAzar(finales);
        return { tmdbId: elegido.tmdbId, tipo, nombre: elegido.nombre, poster_path: elegido.poster_path, anio: elegido.anio };
      }
    }
    // Comparten, pero ninguno cumple los filtros — buscamos lo más parecido en género, en esas plataformas.
    const parecido = await buscarParecido(compartidos, tipo, plataformas, watchRegion, idsExcluir);
    if (parecido) return parecido;
  }

  // TIER 2: no comparten nada pendiente — probamos con lo pendiente de CUALQUIERA de los dos, que cumpla filtros.
  const union = new Map<number, CandidatoQueVemos>([...pendientesA, ...pendientesB]);
  for (const id of recomendadosUltimas24hs) union.delete(id);
  if (union.size > 0) {
    const porGenero = [...union.values()].filter((c) => cumpleGenero(c, generos));
    if (porGenero.length > 0) {
      const idsQuePasanPlataforma = await filtrarPorPlataforma(
        porGenero.map((c) => c.tmdbId),
        tipo,
        plataformas,
        watchRegion
      );
      const finales = porGenero.filter((c) => idsQuePasanPlataforma.has(c.tmdbId));
      if (finales.length > 0) {
        const elegido = elegirAlAzar(finales);
        return { tmdbId: elegido.tmdbId, tipo, nombre: elegido.nombre, poster_path: elegido.poster_path, anio: elegido.anio };
      }
    }
    // Alguno tiene pendientes, pero ninguno cumple filtros — lo más parecido en género, en esas plataformas.
    const parecido = await buscarParecido([...union.values()], tipo, plataformas, watchRegion, idsExcluir);
    if (parecido) return parecido;
  }

  // TIER 4: ninguno de los dos tiene nada pendiente (o no encontramos nada parecido) — tendencia con los filtros, o tendencia a secas si ni así hay. Siempre devuelve algo.
  return buscarTendenciaConFiltros(tipo, generos, plataformas, watchRegion, idsExcluir);
}
