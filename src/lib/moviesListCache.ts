import { supabase } from "./supabase";
import { fetchAllRows } from "./pagination";
import { promedioPuntuacionPeliculas } from "./stats";

export interface PeliculaRow {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  watched: boolean;
  release_date: string | null;
  runtime_minutes: number | null;
  added_at: string;
  genre_ids: number[];
}

export interface DatosPeliculas {
  watchRegion: string;
  movies: PeliculaRow[];
  puntuaciones: Record<number, number>;
}

export async function cargarDatosPeliculas(userId: string): Promise<DatosPeliculas> {
  const [perfilRes, data] = await Promise.all([
    supabase.from("profiles").select("country").eq("id", userId).maybeSingle(),
    fetchAllRows<any>((desde, hasta) =>
      supabase
        .from("user_movies")
        .select("watched, added_at, custom_poster_path, movies_cache(*)")
        .eq("user_id", userId)
        .order("added_at", { ascending: false })
        .range(desde, hasta)
    ),
  ]);

  const rows: PeliculaRow[] = (data ?? [])
    .filter((r: any) => r.movies_cache) // por si algún título no llegó a sincronizarse bien
    .map((r: any) => ({
      tmdb_id: r.movies_cache.tmdb_id,
      title: r.movies_cache.title,
      poster_path: r.custom_poster_path ?? r.movies_cache.poster_path,
      watched: r.watched,
      release_date: r.movies_cache.release_date,
      runtime_minutes: r.movies_cache.runtime_minutes,
      added_at: r.added_at,
      genre_ids: r.movies_cache.genre_ids ?? [],
    }));

  const puntuaciones = await promedioPuntuacionPeliculas(rows.map((r) => r.tmdb_id));

  return {
    watchRegion: (perfilRes.data as any)?.country ?? "AR",
    movies: rows,
    puntuaciones,
  };
}

// Caché simple en memoria (dura mientras la app esté abierta) — se
// dispara sola en segundo plano apenas arranca la app (ver navigation),
// para que "Películas pendientes" pueda pintar al toque en vez de esperar.
let cache: DatosPeliculas | null = null;
let cachePromise: Promise<DatosPeliculas> | null = null;
let cacheUserId: string | null = null;

/** Dispara la carga en segundo plano — no hace falta esperarla, solo llamarla. */
export function precargarPeliculas(userId: string) {
  if (cacheUserId === userId && (cache || cachePromise)) return; // ya está lista o en camino para este usuario
  cacheUserId = userId;
  cache = null;
  cachePromise = cargarDatosPeliculas(userId)
    .then((r) => {
      cache = r;
      return r;
    })
    .catch((e) => {
      console.error("Error precargando películas:", e);
      cachePromise = null;
      throw e;
    });
}

/** Lo que ya esté listo AHORA MISMO, sin esperar nada — null si todavía no terminó de bajar. */
export function cacheSincronicaPeliculas(userId: string): DatosPeliculas | null {
  return cacheUserId === userId ? cache : null;
}

/** Usa lo que ya esté precargado (o lo que esté en camino) — si por algún motivo no se había disparado antes, lo dispara ahora. */
export async function obtenerPeliculas(userId: string): Promise<DatosPeliculas> {
  if (cacheUserId === userId && cache) return cache;
  if (cacheUserId !== userId || !cachePromise) precargarPeliculas(userId);
  return await cachePromise!;
}

/** Guarda datos recién pedidos (más frescos que el caché) para que la próxima visita salga de acá directamente. */
export function actualizarCachePeliculas(userId: string, datos: DatosPeliculas) {
  cacheUserId = userId;
  cache = datos;
}

/** Al desloguearse, para no arrastrar películas de otra cuenta. */
export function limpiarCachePeliculas() {
  cache = null;
  cachePromise = null;
  cacheUserId = null;
}
