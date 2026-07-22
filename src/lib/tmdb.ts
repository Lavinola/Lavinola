/**
 * Servicio TMDB.
 *
 * Atribución obligatoria en la UI (footer / pantalla "Acerca de"):
 * "This product uses the TMDB API but is not endorsed or certified by TMDB."
 * + logo de TMDB. Watch providers requiere ADEMÁS atribución a JustWatch.
 *
 * IMPORTANTE: antes de monetizar (ads o suscripción) hay que escribirle a TMDB
 * para el permiso de uso comercial. Ver spec_app_tracking_series.md.
 */

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_TOKEN = process.env.EXPO_PUBLIC_TMDB_READ_TOKEN;

// Idioma de los títulos: se toma directo de profiles.content_language
// (elegido en Ajustes > Títulos), por default en inglés como trae TMDB de
// fábrica. Ver setTmdbLanguage, llamado al iniciar sesión y al cambiarlo.
let currentLanguage = "es-419";

export function setTmdbLanguage(lang: string) {
  currentLanguage = lang;
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}, idiomaForzado?: string): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  const conIdioma = { language: idiomaForzado ?? currentLanguage, ...params };
  Object.entries(conIdioma).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`TMDB ${path} -> ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---------- Series ----------
export function getSeriesDetails(tmdbId: number) {
  return tmdbFetch<any>(`/tv/${tmdbId}`);
  // trae: name, overview, poster_path, status ('Ended'|'Canceled'|'Returning Series'), number_of_episodes, seasons[]
}

/** El id de IMDb de una serie no viene en el detalle normal de TMDB, hay que pedirlo aparte. */
export function getSeriesExternalIds(tmdbId: number) {
  return tmdbFetch<any>(`/tv/${tmdbId}/external_ids`);
}

export function getEpisodeExternalIds(seriesTmdbId: number, seasonNumber: number, episodeNumber: number) {
  return tmdbFetch<any>(`/tv/${seriesTmdbId}/season/${seasonNumber}/episode/${episodeNumber}/external_ids`);
}

export function getSeasonEpisodes(tmdbId: number, seasonNumber: number) {
  return tmdbFetch<any>(`/tv/${tmdbId}/season/${seasonNumber}`);
}

export function getTrendingSeries() {
  return tmdbFetch<any>(`/trending/tv/week`);
}

export function getPopularSeries() {
  return tmdbFetch<any>(`/tv/popular`);
}

export function discoverSeriesByGenres(genreIds: number[]) {
  return tmdbFetch<any>(`/discover/tv`, {
    with_genres: genreIds.join(","),
    sort_by: "popularity.desc",
  });
}

export function discoverMoviesByGenres(genreIds: number[]) {
  return tmdbFetch<any>(`/discover/movie`, {
    with_genres: genreIds.join(","),
    sort_by: "popularity.desc",
  });
}

/** Discover paginado de series, con género y estado opcionales (para la pantalla "Descubrir más"). */
export function discoverSeriesPaginado(params: {
  page: number;
  genreId?: number | null;
  status?: string | null;
  sortBy?: string;
  watchProviderIds?: number[];
  watchRegion?: string;
}) {
  return tmdbFetch<any>(`/discover/tv`, {
    page: String(params.page),
    sort_by: params.sortBy ?? "popularity.desc",
    ...(params.genreId ? { with_genres: String(params.genreId) } : {}),
    ...(params.status ? { with_status: params.status } : {}),
    ...(params.watchProviderIds && params.watchProviderIds.length > 0
      ? { with_watch_providers: params.watchProviderIds.join("|"), watch_region: params.watchRegion ?? "US" }
      : {}),
  });
}

/** Discover paginado de películas, con género y plataforma opcionales. */
export function discoverMoviesPaginado(params: {
  page: number;
  genreId?: number | null;
  sortBy?: string;
  watchProviderIds?: number[];
  watchRegion?: string;
}) {
  return tmdbFetch<any>(`/discover/movie`, {
    page: String(params.page),
    sort_by: params.sortBy ?? "popularity.desc",
    ...(params.genreId ? { with_genres: String(params.genreId) } : {}),
    ...(params.watchProviderIds && params.watchProviderIds.length > 0
      ? { with_watch_providers: params.watchProviderIds.join("|"), watch_region: params.watchRegion ?? "US" }
      : {}),
  });
}

/** Lista de plataformas de streaming disponibles en un país (para los chips del filtro). */
export interface GrupoPlataforma {
  clave: string; // identificador único del grupo (ej "netflix", "otras")
  label: string;
  logo_path: string | null;
  provider_ids: number[]; // todos los IDs de TMDB que caen bajo esta marca (ej varias variantes de Apple TV)
}

// Para no abrumar el filtro con decenas de plataformas chiquitas/regionales
// poco usadas, mostramos solo un puñado curado por país, agrupando además
// las variantes de una misma marca (TMDB a veces trae "Apple TV", "Apple TV
// Plus", etc. como IDs separados) bajo un solo botón. TMDB no tiene un
// endpoint de "cuánta gente usa cada plataforma", así que para el resto de
// los países usamos su propio orden de "display_priority" (ya viene
// ordenado por relevancia en cada país) como aproximación de popularidad.
const GRUPOS_ARGENTINA: { clave: string; label: string; claves: string[] }[] = [
  { clave: "netflix", label: "Netflix", claves: ["netflix"] },
  { clave: "hbomax", label: "HBO Max", claves: ["hbo max", "max"] },
  { clave: "primevideo", label: "Prime Video", claves: ["prime video", "amazon prime video"] },
  { clave: "disneyplus", label: "Disney+", claves: ["disney plus", "disney+"] },
  { clave: "appletv", label: "Apple TV", claves: ["apple tv"] },
  { clave: "paramountplus", label: "Paramount+", claves: ["paramount plus", "paramount+"] },
  { clave: "movistartv", label: "Movistar TV", claves: ["movistar"] },
  { clave: "clarovideo", label: "Claro video", claves: ["claro video"] },
  { clave: "dgo", label: "DGO", claves: ["dgo", "directv go"] },
  { clave: "googleplay", label: "Google Play Movies", claves: ["google play movies"] },
  { clave: "flow", label: "Flow", claves: ["flow"] },
];
const PLATAFORMAS_SIEMPRE_GLOBALES = ["netflix", "prime video", "amazon prime video", "hbo max", "max", "disney plus", "disney+", "apple tv"];
const MAX_PLATAFORMAS = 11;

function coincide(nombreProvider: string, listaClaves: string[]): boolean {
  const n = nombreProvider.toLowerCase();
  return listaClaves.some((clave) => n.includes(clave));
}

/** Normaliza el nombre de una plataforma a su "marca" base, para agrupar variantes (Apple TV, Apple TV Plus, etc). */
function marcaBase(nombre: string): string {
  return nombre
    .toLowerCase()
    .replace(/\(.*?\)/g, "") // saca "(Amazon Channel)", "(Argentina)", etc
    .replace(/\bplus\b|\+/g, "") // "Paramount Plus" y "Paramount+" -> misma marca
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Agrupa la lista cruda de TMDB por marca, para que una misma plataforma con varias variantes no aparezca repetida. */
function agruparPorMarca(providers: any[]): GrupoPlataforma[] {
  const porMarca = new Map<string, GrupoPlataforma>();
  for (const p of providers) {
    const marca = marcaBase(p.provider_name ?? "");
    if (!marca) continue;
    const existente = porMarca.get(marca);
    if (existente) {
      existente.provider_ids.push(p.provider_id);
    } else {
      porMarca.set(marca, {
        clave: marca,
        label: p.provider_name,
        logo_path: p.logo_path ?? null,
        provider_ids: [p.provider_id],
      });
    }
  }
  return [...porMarca.values()];
}

export async function getWatchProvidersDisponibles(tipo: "series" | "movie", watchRegion: string): Promise<GrupoPlataforma[]> {
  const path = tipo === "series" ? "/watch/providers/tv" : "/watch/providers/movie";
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("watch_region", watchRegion);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  // TMDB los devuelve ordenados por "display_priority" (relevancia por país),
  // que es justo el orden en el que conviene mostrarlos.
  const todas = ((data.results ?? []) as any[]).sort(
    (a, b) => (a.display_priorities?.[watchRegion] ?? 999) - (b.display_priorities?.[watchRegion] ?? 999)
  );

  const OTRAS: GrupoPlataforma = { clave: "otras", label: "Otras", logo_path: null, provider_ids: [] };

  if (watchRegion === "AR") {
    const grupos = agruparPorMarca(todas);
    const curadas: GrupoPlataforma[] = [];
    for (const g of GRUPOS_ARGENTINA) {
      const encontrado = grupos.find((gr) => coincide(gr.label, g.claves));
      if (encontrado) curadas.push({ ...encontrado, clave: g.clave, label: g.label });
    }
    return [...curadas, OTRAS];
  }

  const agrupadas = agruparPorMarca(todas);
  const siempre = agrupadas.filter((p) => coincide(p.label, PLATAFORMAS_SIEMPRE_GLOBALES));
  const yaIncluidos = new Set(siempre.map((p) => p.clave));
  const resto = agrupadas.filter((p) => !yaIncluidos.has(p.clave));
  const curadas = [...siempre, ...resto].slice(0, MAX_PLATAFORMAS);
  return [...curadas, OTRAS];
}

// ---------- Películas ----------
export function getMovieDetails(tmdbId: number) {
  return tmdbFetch<any>(`/movie/${tmdbId}`);
  // trae: title, overview, poster_path, runtime, release_date
}

export function getTrendingMovies() {
  return tmdbFetch<any>(`/trending/movie/week`);
}

export function getPopularMovies() {
  return tmdbFetch<any>(`/movie/popular`);
}

// ---------- Watch Providers (powered by JustWatch) ----------
// Requiere pasar watch_region con el país del perfil del usuario (ej "AR").
// No lleva idioma (son solo nombres de plataformas + logos).
export async function getSeriesWatchProviders(tmdbId: number, watchRegion: string) {
  const url = new URL(`${TMDB_BASE}/tv/${tmdbId}/watch/providers`);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, accept: "application/json" },
  });
  const data = await res.json();
  return data?.results?.[watchRegion] ?? null; // { flatrate: [...], rent: [...], buy: [...], link }
}

export async function getMovieWatchProviders(tmdbId: number, watchRegion: string) {
  const url = new URL(`${TMDB_BASE}/movie/${tmdbId}/watch/providers`);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, accept: "application/json" },
  });
  const data = await res.json();
  return data?.results?.[watchRegion] ?? null;
}

// ---------- Búsqueda (usada por el importador de TV Time para matching) ----------
export function searchSeries(query: string) {
  return tmdbFetch<any>(`/search/tv`, { query }, "en-US");
}

export function searchMovies(query: string) {
  return tmdbFetch<any>(`/search/movie`, { query }, "en-US");
}

export function multiSearch(query: string) {
  return tmdbFetch<any>(`/search/multi`, { query }, "en-US");
}

// ---------- Reparto / personas ----------
export function getSeriesCredits(tmdbId: number) {
  return tmdbFetch<any>(`/tv/${tmdbId}/credits`);
}

export function getMovieCredits(tmdbId: number) {
  return tmdbFetch<any>(`/movie/${tmdbId}/credits`);
}

// ---------- Reseñas de TMDB (solo lectura, no son de la comunidad de Lavinola) ----------
export function getMovieReviews(tmdbId: number, page = 1) {
  return tmdbFetch<any>(`/movie/${tmdbId}/reviews`, { page: String(page) }, "en-US");
}

export function getSeriesReviews(tmdbId: number, page = 1) {
  return tmdbFetch<any>(`/tv/${tmdbId}/reviews`, { page: String(page) }, "en-US");
}

// ---------- Videos (tráilers, teasers) ----------
export function getSeriesVideos(tmdbId: number) {
  return tmdbFetch<any>(`/tv/${tmdbId}/videos`);
}

export function getMovieVideos(tmdbId: number) {
  return tmdbFetch<any>(`/movie/${tmdbId}/videos`);
}

/** Busca en la respuesta de /videos el mejor tráiler de YouTube para mostrar (oficial y en español si hay, si no el que sea). */
export function elegirTrailer(videos: any, idioma?: string): { key: string; name: string } | null {
  const lista: any[] = videos?.results ?? [];
  const deYoutube = lista.filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"));
  if (deYoutube.length === 0) return null;
  const enIdioma = idioma ? deYoutube.filter((v) => v.iso_639_1 === idioma) : [];
  const oficial = (enIdioma.length ? enIdioma : deYoutube).find((v) => v.official) ?? (enIdioma.length ? enIdioma : deYoutube)[0];
  return { key: oficial.key, name: oficial.name };
}

// ---------- Recomendados / similares ----------
export function getSeriesRecommendations(tmdbId: number) {
  return tmdbFetch<any>(`/tv/${tmdbId}/recommendations`);
}

export function getMovieRecommendations(tmdbId: number) {
  return tmdbFetch<any>(`/movie/${tmdbId}/recommendations`);
}

// ---------- Clasificación por edad ----------
export async function getSeriesCertification(tmdbId: number, country: string): Promise<string | null> {
  const data = await tmdbFetchSinIdioma<any>(`/tv/${tmdbId}/content_ratings`);
  const resultados: any[] = data?.results ?? [];
  const delPais = resultados.find((r) => r.iso_3166_1 === country) ?? resultados.find((r) => r.iso_3166_1 === "US");
  return delPais?.rating || null;
}

export async function getMovieCertification(tmdbId: number, country: string): Promise<string | null> {
  const data = await tmdbFetchSinIdioma<any>(`/movie/${tmdbId}/release_dates`);
  const resultados: any[] = data?.results ?? [];
  const delPais = resultados.find((r) => r.iso_3166_1 === country) ?? resultados.find((r) => r.iso_3166_1 === "US");
  const conCertificacion = delPais?.release_dates?.find((rd: any) => rd.certification);
  return conCertificacion?.certification || null;
}

/** Normaliza distintos sistemas de clasificación (EEUU, TV Parental Guidelines, etc.) a un formato simple: "ATP" o "+N". */
const MAPA_CLASIFICACION: Record<string, string> = {
  G: "ATP",
  TV_G: "ATP",
  "TV-G": "ATP",
  TV_Y: "ATP",
  "TV-Y": "ATP",
  PG: "ATP",
  TV_PG: "ATP",
  "TV-PG": "ATP",
  TP: "ATP",
  ATP: "ATP",
  U: "ATP",
  "0": "ATP",
  TV_Y7: "+7",
  "TV-Y7": "+7",
  "7": "+7",
  "PG-13": "+13",
  PG13: "+13",
  TV_14: "+14",
  "TV-14": "+14",
  "12": "+12",
  "13": "+13",
  "14": "+14",
  "15": "+15",
  "16": "+16",
  R: "+17",
  "17": "+17",
  "18": "+18",
  "TV-MA": "+18",
  TV_MA: "+18",
  "NC-17": "+18",
  NC17: "+18",
};

export function normalizarClasificacion(raw: string | null): string | null {
  if (!raw) return null;
  const limpio = raw.trim().toUpperCase();
  if (MAPA_CLASIFICACION[limpio]) return MAPA_CLASIFICACION[limpio];
  // Ya viene en formato "+N" o "ATP" (como en Argentina) — se deja tal cual.
  if (/^\+?\d+$/.test(limpio)) return limpio.startsWith("+") ? limpio : `+${limpio}`;
  return raw;
}

export function getPersonDetails(personId: number) {
  return tmdbFetch<any>(`/person/${personId}`);
}

export function getPersonCombinedCredits(personId: number) {
  return tmdbFetch<any>(`/person/${personId}/combined_credits`);
}

// ---------- Imágenes alternativas (para "cambiar cartel/banner") ----------
// Sin idioma: queremos TODAS las imágenes disponibles, no solo las del idioma actual.
async function tmdbFetchSinIdioma<T>(path: string): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("include_image_language", "en,es,null");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TMDB ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export function getSeriesImages(tmdbId: number) {
  return tmdbFetchSinIdioma<any>(`/tv/${tmdbId}/images`);
}

export function getMovieImages(tmdbId: number) {
  return tmdbFetchSinIdioma<any>(`/movie/${tmdbId}/images`);
}

export function posterUrl(path: string | null, size: "w185" | "w342" | "w500" | "w780" | "original" = "w342") {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
