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
// El content_language "crudo" del usuario y si tiene activado "mostrar en tu
// idioma" — se guardan aparte de currentLanguage (que ya viene resuelto,
// mezclando los dos) porque el título traducido entre paréntesis necesita
// saber CUÁL de los dos idiomas es el "principal" y cuál el "secundario"
// para mostrar, no solo el resultado final ya combinado.
let currentContentLanguage = "en-US";
let currentMostrarEnPropio = true;

export function setTmdbLanguage(lang: string) {
  currentLanguage = lang;
}

/** Guarda el idioma de títulos elegido por el usuario y si tiene activado "mostrar en tu idioma" — y resuelve currentLanguage a partir de los dos, como ya se hacía antes. */
export function setIdiomaTitulos(contentLanguage: string, mostrarEnPropio: boolean) {
  currentContentLanguage = contentLanguage;
  currentMostrarEnPropio = mostrarEnPropio;
  currentLanguage = mostrarEnPropio ? contentLanguage : "en-US";
}

export function getContentLanguageCruda() {
  return currentContentLanguage;
}

export function getMostrarEnPropio() {
  return currentMostrarEnPropio;
}

export function getTmdbLanguage() {
  return currentLanguage;
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
export function getSeriesDetails(tmdbId: number, idiomaForzado?: string) {
  return tmdbFetch<any>(`/tv/${tmdbId}`, {}, idiomaForzado);
  // trae: name, overview, poster_path, status ('Ended'|'Canceled'|'Returning Series'), number_of_episodes, seasons[]
}

/** El id de IMDb de una serie no viene en el detalle normal de TMDB, hay que pedirlo aparte. */
export function getSeriesExternalIds(tmdbId: number) {
  return tmdbFetch<any>(`/tv/${tmdbId}/external_ids`);
}

export function getEpisodeExternalIds(seriesTmdbId: number, seasonNumber: number, episodeNumber: number) {
  return tmdbFetch<any>(`/tv/${seriesTmdbId}/season/${seasonNumber}/episode/${episodeNumber}/external_ids`);
}

export function getSeasonEpisodes(tmdbId: number, seasonNumber: number, idiomaForzado?: string) {
  return tmdbFetch<any>(`/tv/${tmdbId}/season/${seasonNumber}`, {}, idiomaForzado);
}

/**
 * Busca la sinopsis en el idioma configurado por quien mira la ficha,
 * pidiéndosela directo a TMDB (no depende de lo que haya quedado guardado
 * en el caché compartido, que puede estar en el idioma de quien lo haya
 * sincronizado por última vez). Solo se usa en la ficha de detalle —un
 * título a la vez—, no en listas, por eso el costo de pedidos es bajo.
 *
 * Si el idioma preferido es español latino (es-419) y TMDB no tiene una
 * sinopsis propia ahí, se prueba con español de España antes de
 * rendirse (mismo idioma base, mejor que nada). El resto de los idiomas
 * piden directo el suyo, sin cascada. Si no se encuentra nada, devuelve
 * null — se sigue mostrando lo que hubiera, y queda el botón "Traducir"
 * como respaldo.
 */
export async function obtenerOverviewLocalizado(
  tipo: "series" | "movie" | "episode",
  tmdbId: number,
  idiomaPreferido: string,
  seasonNumber?: number,
  episodeNumber?: number
): Promise<string | null> {
  async function pedir(idioma: string): Promise<string | null> {
    try {
      if (tipo === "episode" && seasonNumber != null && episodeNumber != null) {
        const temporada = await getSeasonEpisodes(tmdbId, seasonNumber, idioma);
        const ep = (temporada?.episodes ?? []).find((e: any) => e.episode_number === episodeNumber);
        return ep?.overview || null;
      }
      const detalle = tipo === "movie" ? await getMovieDetails(tmdbId, idioma) : await getSeriesDetails(tmdbId, idioma);
      return detalle?.overview || null;
    } catch (e) {
      console.error(`No se pudo pedir la sinopsis en ${idioma}:`, e);
      return null;
    }
  }

  const enIdiomaPreferido = await pedir(idiomaPreferido);
  if (enIdiomaPreferido) return enIdiomaPreferido;

  if (idiomaPreferido === "es-419") {
    return pedir("es-ES");
  }
  return null;
}

export function getTrendingSeries(page = 1) {
  return tmdbFetch<any>(`/trending/tv/week`, { page: String(page) });
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
export function getMovieDetails(tmdbId: number, idiomaForzado?: string) {
  return tmdbFetch<any>(`/movie/${tmdbId}`, {}, idiomaForzado);
  // trae: title, overview, poster_path, runtime, release_date
}

export function getTrendingMovies(page = 1) {
  return tmdbFetch<any>(`/trending/movie/week`, { page: String(page) });
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
export function searchSeries(query: string, idioma = "en-US") {
  return tmdbFetch<any>(`/search/tv`, { query }, idioma);
}

export function searchMovies(query: string, idioma = "en-US") {
  return tmdbFetch<any>(`/search/movie`, { query }, idioma);
}

/** Busca personas (actores/actrices, directores/as) por nombre. */
export function searchPerson(query: string) {
  return tmdbFetch<any>(`/search/person`, { query }, "en-US");
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
// IMPORTANTE: /videos filtra los resultados por el parámetro "language" —
// si no le pedimos explícitamente varios idiomas con include_video_language,
// solo trae los del idioma que la app tenga configurado en ese momento (por
// ejemplo, si "Mostrar en tu idioma" está apagado, terminaba trayendo SOLO
// tráilers en inglés, para cualquier título, sin importar qué otros
// idiomas tuviera disponibles TMDB).
export function getSeriesVideos(tmdbId: number) {
  return tmdbFetch<any>(`/tv/${tmdbId}/videos`, { include_video_language: "en,es,it,pt,null" }, "en-US");
}

export function getMovieVideos(tmdbId: number) {
  return tmdbFetch<any>(`/movie/${tmdbId}/videos`, { include_video_language: "en,es,it,pt,null" }, "en-US");
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

export interface TrailerIdioma {
  idioma: "en" | "es" | "it" | "pt";
  key: string;
  name: string;
}

/**
 * De todos los tráilers/teasers que tiene cargados TMDB para el título,
 * arma un tráiler por cada uno de los 4 idiomas que nos interesan (los
 * que efectivamente tenga disponibles — no todos los títulos tienen los
 * 4). Para cada idioma, prioriza: oficial + tipo "Trailer" (por sobre
 * "Teaser") + el más nuevo si hay varios.
 */
export function agruparTrailersPorIdioma(videos: any): TrailerIdioma[] {
  const IDIOMAS: TrailerIdioma["idioma"][] = ["en", "es", "it", "pt"];
  const lista: any[] = videos?.results ?? [];
  const deYoutube = lista.filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"));

  const resultado: TrailerIdioma[] = [];
  for (const idioma of IDIOMAS) {
    const candidatos = deYoutube.filter((v) => v.iso_639_1 === idioma);
    if (candidatos.length === 0) continue;
    const ordenados = [...candidatos].sort((a, b) => {
      if (!!a.official !== !!b.official) return a.official ? -1 : 1;
      if ((a.type === "Trailer") !== (b.type === "Trailer")) return a.type === "Trailer" ? -1 : 1;
      return (b.published_at ?? "").localeCompare(a.published_at ?? "");
    });
    resultado.push({ idioma, key: ordenados[0].key, name: ordenados[0].name });
  }
  return resultado;
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
