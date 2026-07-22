import { supabase } from "./supabase";
import { discoverSeriesPaginado, discoverMoviesPaginado, getWatchProvidersDisponibles, getSeriesWatchProviders, getMovieWatchProviders, GrupoPlataforma } from "./tmdb";
import { generosMasFrecuentes } from "./recommendations";

export type OrdenDescubrir = "recomendado" | "tendencias" | "mas_visto" | "visto_amigos" | "mas_añadido";
export type EstadoSerie = "todo" | "en_emision" | "finalizada";

export const ETIQUETAS_ORDEN: Record<OrdenDescubrir, string> = {
  recomendado: "Mejores recomendaciones para ti",
  tendencias: "Tendencias",
  mas_visto: "Lo más visto",
  visto_amigos: "Visto por amigos",
  mas_añadido: "Lo más añadido",
};

export interface ItemDescubrir {
  id: number;
  titulo: string;
  poster_path: string | null;
  anio: string | null;
  tipo: "series" | "movie";
  genero_ids: number[];
  total_seasons?: number | null;
  status?: string | null;
}

const POR_PAGINA = 20;

// TMDB with_status para /discover/tv — Returning Series: 0, Planned: 1,
// In Production: 2, Ended: 3, Canceled: 4, Pilot: 5.
function statusTmdbParam(estado?: EstadoSerie): string | null {
  if (estado === "en_emision") return "0|2";
  if (estado === "finalizada") return "3|4";
  return null;
}

function pasaEstadoCache(item: { status?: string | null }, estado?: EstadoSerie): boolean {
  if (!estado || estado === "todo") return true;
  if (estado === "en_emision") return item.status === "Returning Series" || item.status === "In Production" || item.status === "Planned";
  return item.status === "Ended" || item.status === "Canceled";
}

export async function idsYaAgregados(userId: string | null, tipo: "series" | "movie"): Promise<Set<number>> {
  if (!userId) return new Set();
  const tabla = tipo === "series" ? "user_series" : "user_movies";
  const columna = tipo === "series" ? "series_tmdb_id" : "movie_tmdb_id";
  const { data } = await supabase.from(tabla).select(columna).eq("user_id", userId);
  return new Set((data ?? []).map((r: any) => r[columna]));
}

/** Trae metadata (nombre/poster/año/temporadas/status) desde la caché para una lista de tmdb_ids, en el mismo orden. */
async function enriquecerDesdeCache(tipo: "series" | "movie", ids: number[]): Promise<ItemDescubrir[]> {
  if (ids.length === 0) return [];
  const tabla = tipo === "series" ? "series_cache" : "movies_cache";
  const { data } = await supabase.from(tabla).select("*").in("tmdb_id", ids);
  const porId: Record<number, any> = {};
  (data ?? []).forEach((r: any) => (porId[r.tmdb_id] = r));
  return ids
    .filter((id) => porId[id])
    .map((id) => {
      const r = porId[id];
      return {
        id,
        titulo: tipo === "series" ? r.name : r.title,
        poster_path: r.poster_path,
        anio: (tipo === "series" ? r.first_air_date : r.release_date)?.slice(0, 4) ?? null,
        tipo,
        genero_ids: r.genre_ids ?? [],
        total_seasons: r.total_seasons ?? null,
        status: r.status ?? null,
      };
    });
}

function mapearResultadoTmdb(tipo: "series" | "movie", r: any): ItemDescubrir {
  return {
    id: r.id,
    titulo: tipo === "series" ? r.name : r.title,
    poster_path: r.poster_path,
    anio: (tipo === "series" ? r.first_air_date : r.release_date)?.slice(0, 4) ?? null,
    tipo,
    genero_ids: r.genre_ids ?? [],
    total_seasons: null,
    status: null,
  };
}

/**
 * Convierte las claves de plataforma elegidas (ej "netflix", "otras") a los
 * IDs reales de TMDB, usando la lista curada ya agrupada por marca. "Otras"
 * es especial: no tiene IDs propios, significa "nada de lo que aparece como
 * opción curada" — se resuelve más abajo invirtiendo el chequeo.
 */
function resolverPlataformas(claves: string[] | undefined, grupos: GrupoPlataforma[]): { ids: number[]; esOtras: boolean; universoIds: number[] } {
  const universoIds = grupos.filter((g) => g.clave !== "otras").flatMap((g) => g.provider_ids);
  if (!claves || claves.length === 0) return { ids: [], esOtras: false, universoIds };
  if (claves.includes("otras")) return { ids: [], esOtras: true, universoIds };
  const ids = grupos.filter((g) => claves.includes(g.clave)).flatMap((g) => g.provider_ids);
  return { ids, esOtras: false, universoIds };
}

export async function descubrirPagina(opts: {
  tipo: "series" | "movie";
  orden: OrdenDescubrir;
  generoId?: number | null;
  estado?: EstadoSerie;
  plataformasClaves?: string[];
  todasLasPlataformas?: GrupoPlataforma[];
  watchRegion?: string;
  page: number;
  userId: string | null;
}): Promise<{ items: ItemDescubrir[]; hayMas: boolean }> {
  const { tipo, orden, generoId, estado, plataformasClaves, todasLasPlataformas, watchRegion, page, userId } = opts;
  const { ids: watchProviderIds, esOtras, universoIds } = resolverPlataformas(plataformasClaves, todasLasPlataformas ?? []);

  // Recomendado y Tendencias van directo a TMDB discover (soportan género,
  // plataforma y paginación nativos; el estado de series se manda como with_status).
  if (orden === "recomendado" || orden === "tendencias") {
    let generos: number[] = generoId ? [generoId] : [];
    if (orden === "recomendado" && generos.length === 0 && userId) {
      const tabla = tipo === "series" ? "user_series" : "user_movies";
      const columnaCache = tipo === "series" ? "series_cache(genre_ids)" : "movies_cache(genre_ids)";
      const { data } = await supabase.from(tabla).select(columnaCache).eq("user_id", userId);
      generos = await generosMasFrecuentes((data ?? []).map((r: any) => (tipo === "series" ? r.series_cache?.genre_ids : r.movies_cache?.genre_ids)));
    }

    const data =
      tipo === "series"
        ? await discoverSeriesPaginado({ page, genreId: generos[0] ?? null, status: tipo === "series" ? statusTmdbParam(estado) : null, watchProviderIds: esOtras ? undefined : watchProviderIds, watchRegion })
        : await discoverMoviesPaginado({ page, genreId: generos[0] ?? null, watchProviderIds: esOtras ? undefined : watchProviderIds, watchRegion });

    let resultados = (data.results ?? []).map((r: any) => mapearResultadoTmdb(tipo, r));

    // "Recomendado para vos" nunca debería repetirte algo que ya tenés — para
    // eso ya lo tenés en tu lista. "Tendencias" en cambio, en Descubre más, sí
    // puede mostrar títulos que ya agregaste (tiene sentido ver qué es
    // tendencia aunque ya lo hayas visto) — el tilde puesto se resuelve en la
    // pantalla, no acá.
    if (orden === "recomendado") {
      const yaAgregados = await idsYaAgregados(userId, tipo);
      resultados = resultados.filter((r: ItemDescubrir) => !yaAgregados.has(r.id));
    }

    // "Otras": TMDB no tiene forma de pedir "que NO esté en tal plataforma"
    // directo, así que pedimos sin filtrar y revisamos título por título acá.
    if (esOtras && resultados.length > 0) {
      const region = watchRegion ?? "US";
      const chequeos = await Promise.all(
        resultados.map(async (item: ItemDescubrir) => {
          const p = tipo === "series" ? await getSeriesWatchProviders(item.id, region) : await getMovieWatchProviders(item.id, region);
          const idsDisponibles = (p?.flatrate ?? []).map((prov: any) => prov.provider_id);
          return { item, esOtras: !idsDisponibles.some((id: number) => universoIds.includes(id)) };
        })
      );
      resultados = chequeos.filter((r) => r.esOtras).map((r) => r.item);
    }

    return { items: resultados, hayMas: page < (data.total_pages ?? 1) };
  }

  // Más visto / visto por amigos / más añadido: rankings propios de la app
  // (RPC agregado en Postgres), enriquecidos después con la caché de TMDB.
  let rpcNombre: string;
  let rpcParams: Record<string, any>;
  if (orden === "mas_visto") {
    rpcNombre = tipo === "series" ? "mas_vistas_series" : "mas_vistas_peliculas";
    rpcParams = { pagina: page, por_pagina: POR_PAGINA };
  } else if (orden === "visto_amigos") {
    rpcNombre = tipo === "series" ? "vistas_por_amigos_series" : "vistas_por_amigos_peliculas";
    rpcParams = { p_user_id: userId, pagina: page, por_pagina: POR_PAGINA };
  } else {
    rpcNombre = tipo === "series" ? "mas_agregadas_series" : "mas_agregadas_peliculas";
    rpcParams = { pagina: page, por_pagina: POR_PAGINA };
  }

  if (orden === "visto_amigos" && !userId) return { items: [], hayMas: false };

  const { data, error } = await supabase.rpc(rpcNombre, rpcParams);
  if (error) {
    console.error(`Error en ${rpcNombre}:`, error.message);
    return { items: [], hayMas: false };
  }

  const ids = (data ?? []).map((r: any) => r.tmdb_id);
  let items = await enriquecerDesdeCache(tipo, ids);

  const yaAgregados = await idsYaAgregados(userId, tipo);
  items = items.filter((i) => !yaAgregados.has(i.id));

  if (generoId) items = items.filter((i) => i.genero_ids.includes(generoId));
  if (tipo === "series") items = items.filter((i) => pasaEstadoCache(i, estado));

  if (watchProviderIds.length > 0 || esOtras) {
    const region = watchRegion ?? "US";
    const resultados = await Promise.all(
      items.map(async (item) => {
        const p = tipo === "series" ? await getSeriesWatchProviders(item.id, region) : await getMovieWatchProviders(item.id, region);
        const idsDisponibles = (p?.flatrate ?? []).map((prov: any) => prov.provider_id);
        const coincideCurada = idsDisponibles.some((id: number) => (esOtras ? universoIds : watchProviderIds).includes(id));
        return { item, pasa: esOtras ? !coincideCurada : coincideCurada };
      })
    );
    items = resultados.filter((r) => r.pasa).map((r) => r.item);
  }

  return { items, hayMas: (data ?? []).length === POR_PAGINA };
}
