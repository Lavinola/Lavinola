import { supabase } from "./supabase";
import { fetchAllRows } from "./pagination";
import { getPerfil, getStatsSociales, getCoverPosterPath, PerfilCompleto, StatsSociales } from "./profile";
import { listarFavoritos, Favorito } from "./favorites";
import { listarListasDeUsuarioOrdenadasPorSeguidores, Lista } from "./lists";
import { progresoDeSeries, ProgresoSerie } from "./seriesList";

export interface ItemMiniPerfil {
  tmdb_id: number;
  nombre: string;
  poster_path: string | null;
}

export interface StatsPerfil {
  minutosSeriesVistas: number;
  capitulosVistos: number;
  minutosPeliculasVistas: number;
  peliculasVistas: number;
}

export interface DatosPerfilPropio {
  perfil: PerfilCompleto | null;
  coverPath: string | null;
  social: StatsSociales | null;
  favoritos: Favorito[];
  listas: Lista[];
  misSeries: ItemMiniPerfil[];
  progreso: Record<number, ProgresoSerie>;
  misPeliculas: ItemMiniPerfil[];
  stats: StatsPerfil;
}

/**
 * Junta todas las consultas pesadas del Perfil propio (las mismas ~9 que
 * antes se pedían todas juntas dentro de ProfileScreen) en un solo lugar,
 * para poder dispararlas en segundo plano apenas se abre la app — así,
 * cuando el usuario entra de verdad a la pestaña Perfil, los datos ya
 * están (o casi) listos en vez de tener que esperar a que arranquen.
 */
export async function cargarDatosPerfilPropio(userId: string): Promise<DatosPerfilPropio> {
  const [p, soc, favs, listasOrdenadas, seriesRows, progresoSeries, movieRows, episodiosVistos, peliculasVistas] = await Promise.all([
    getPerfil(userId),
    getStatsSociales(userId),
    listarFavoritos(userId),
    listarListasDeUsuarioOrdenadasPorSeguidores(userId),
    fetchAllRows<any>((desde, hasta) =>
      supabase
        .from("user_series")
        .select("series_tmdb_id, custom_poster_path, series_cache(name, poster_path)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(desde, hasta)
    ),
    progresoDeSeries(userId),
    fetchAllRows<any>((desde, hasta) =>
      supabase
        .from("user_movies")
        .select("movie_tmdb_id, custom_poster_path, movies_cache(title, poster_path)")
        .eq("user_id", userId)
        .order("added_at", { ascending: false })
        .range(desde, hasta)
    ),
    fetchAllRows<any>((desde, hasta) =>
      supabase
        .from("user_episodes_watched")
        .select("times_watched, episodes_cache(runtime_minutes)")
        .eq("user_id", userId)
        .range(desde, hasta)
    ),
    fetchAllRows<any>((desde, hasta) =>
      supabase
        .from("user_movies")
        .select("times_watched, movies_cache(runtime_minutes)")
        .eq("user_id", userId)
        .eq("watched", true)
        .range(desde, hasta)
    ),
  ]);

  const coverPath = p ? await getCoverPosterPath(p) : null;

  return {
    perfil: p,
    coverPath,
    social: soc,
    favoritos: favs,
    listas: listasOrdenadas,
    misSeries: (seriesRows ?? []).map((r: any) => ({
      tmdb_id: r.series_tmdb_id,
      nombre: r.series_cache?.name ?? "—",
      poster_path: r.custom_poster_path ?? r.series_cache?.poster_path ?? null,
    })),
    progreso: progresoSeries,
    misPeliculas: (movieRows ?? []).map((r: any) => ({
      tmdb_id: r.movie_tmdb_id,
      nombre: r.movies_cache?.title ?? "—",
      poster_path: r.custom_poster_path ?? r.movies_cache?.poster_path ?? null,
    })),
    // Las revisitas suman: si volviste a ver algo, cuenta de nuevo en el total.
    stats: {
      minutosSeriesVistas: (episodiosVistos ?? []).reduce((acc: number, e: any) => acc + (e.episodes_cache?.runtime_minutes ?? 0) * (e.times_watched ?? 1), 0),
      capitulosVistos: (episodiosVistos ?? []).reduce((acc: number, e: any) => acc + (e.times_watched ?? 1), 0),
      minutosPeliculasVistas: (peliculasVistas ?? []).reduce((acc: number, p2: any) => acc + (p2.movies_cache?.runtime_minutes ?? 0) * (p2.times_watched ?? 1), 0),
      peliculasVistas: (peliculasVistas ?? []).reduce((acc: number, p2: any) => acc + (p2.times_watched ?? 1), 0),
    },
  };
}

// Caché simple en memoria (dura mientras la app esté abierta) — se
// dispara sola en segundo plano apenas arranca la app (ver navigation),
// para que la pestaña Perfil pueda pintar al toque en vez de esperar.
let cache: DatosPerfilPropio | null = null;
let cachePromise: Promise<DatosPerfilPropio> | null = null;
let cacheUserId: string | null = null;

/** Dispara la carga en segundo plano — no hace falta esperarla, solo llamarla. */
export function precargarPerfilPropio(userId: string) {
  if (cacheUserId === userId && (cache || cachePromise)) return; // ya está lista o en camino para este usuario
  cacheUserId = userId;
  cache = null;
  cachePromise = cargarDatosPerfilPropio(userId)
    .then((r) => {
      cache = r;
      return r;
    })
    .catch((e) => {
      console.error("Error precargando el Perfil:", e);
      cachePromise = null;
      throw e;
    });
}

/** Lo que ya esté listo AHORA MISMO, sin esperar nada — null si todavía no terminó de bajar. */
export function cacheSincronicaPerfilPropio(userId: string): DatosPerfilPropio | null {
  return cacheUserId === userId ? cache : null;
}

/** Usa lo que ya esté precargado (o lo que esté en camino) — si por algún motivo no se había disparado antes, lo dispara ahora. */
export async function obtenerPerfilPropio(userId: string): Promise<DatosPerfilPropio> {
  if (cacheUserId === userId && cache) return cache;
  if (cacheUserId !== userId || !cachePromise) precargarPerfilPropio(userId);
  return await cachePromise!;
}

/** Guarda datos recién pedidos (más frescos que el caché) para que la próxima visita al Perfil salga de acá directamente. */
export function actualizarCachePerfilPropio(userId: string, datos: DatosPerfilPropio) {
  cacheUserId = userId;
  cache = datos;
}

/** Al desloguearse, para no arrastrar datos de otra cuenta. */
export function limpiarCachePerfilPropio() {
  cache = null;
  cachePromise = null;
  cacheUserId = null;
}
