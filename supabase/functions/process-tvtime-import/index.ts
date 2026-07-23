// supabase/functions/process-tvtime-import/index.ts
//
// Dos fases, las dos corren enteras del lado del servidor (para que sigan
// solas aunque cierres la app o se vaya a segundo plano):
//
//  FASE 1 — buscar: recibe los títulos agrupados del archivo de TV Time (ya
//  parseados y agrupados por el cliente) y busca cada uno contra TMDB,
//  puntuando la mejor coincidencia. Guarda todo en `resultados`.
//
//  FASE 2 — aplicar: una vez que el usuario confirmó todo (los automáticos +
//  los que resolvió a mano), recibe esa lista final y la aplica de verdad —
//  crea/actualiza las fichas de películas/series y marca todo como visto.
//
// IMPORTANTE — por qué está armada así: las Edge Functions de Supabase
// tienen un límite duro de tiempo de vida (150 segundos en el plan gratis,
// 400 en el pago) que Supabase corta a la fuerza, incluso usando
// EdgeRuntime.waitUntil — esto NO extiende ese límite. Con archivos grandes,
// una sola ejecución no alcanza para terminar todo. La solución: la función
// controla su propio tiempo transcurrido, y si se está por acabar el margen
// seguro, se vuelve a invocar A SÍ MISMA (pidiendo seguir el mismo trabajo
// desde donde quedó) antes de terminar — así se encadena sola, tantas veces
// como haga falta, hasta terminar el trabajo completo.
//
// Setup:
//   supabase functions deploy process-tvtime-import
//   supabase secrets set TMDB_READ_TOKEN=el_mismo_token_que_usa_la_app

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Necesario para que la webapp pueda invocar esta función desde el navegador
// (el celular no tiene este problema, ahí no aplica CORS). Mismo patrón que
// fetch-rss.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TMDB_TOKEN = Deno.env.get("TMDB_READ_TOKEN")!;
const TMDB_BASE = "https://api.themoviedb.org/3";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/process-tvtime-import`;

const UMBRAL_CONFIANZA = 0.72;
// Si el mejor candidato y el segundo mejor quedan muy cerca en puntaje, es
// señal de que hay varios títulos parecidos de verdad (mismo nombre, años
// distintos) y no que uno sea claramente el correcto — en ese caso, aunque
// el primero supere el umbral de confianza, preferimos preguntarle al
// usuario en vez de arriesgarnos a elegir mal.
const MARGEN_AMBIGUEDAD = 0.08;
const MAX_CANDIDATOS = 5;
const MAX_RESULTADOS_A_EVALUAR = 20;
// Cortamos el trabajo bastante antes del límite real de Supabase (150s en
// free), para tener margen de sobra para guardar el progreso y relanzarnos
// antes de que nos maten a la fuerza a mitad de una operación.
const PRESUPUESTO_MS = 100_000;

interface RegistroImportado {
  tipo: "series" | "movie";
  nombreOriginal: string;
  temporada?: number;
  episodio?: number;
  fechaVisto?: string;
}

interface Grupo {
  nombreOriginal: string;
  tipo: "series" | "movie";
  registros: RegistroImportado[];
  tvdbId?: string; // solo series
  añoLanzamiento?: number; // solo películas
}

interface CandidatoMatch {
  tmdb_id: number;
  titulo: string;
  tituloOriginal?: string | null; // título en el idioma original (inglés la mayoría de las veces) — se muestra como principal en la pantalla de elegir
  poster_path: string | null;
  score: number;
  scoreTexto?: number; // puntaje de texto puro, antes de ajustar por año — para distinguir "mismo nombre exacto" de "se parece un poco"
  esNombreExacto?: boolean; // ni una letra de más ni de menos (normalizado) — distinto de "se parece mucho" (ej. "X" vs "X: subtítulo")
  año?: number;
}

interface ResultadoMatch {
  nombreOriginal: string;
  tipo: "series" | "movie";
  registros: RegistroImportado[];
  mejorCandidato: CandidatoMatch | null;
  confiado: boolean;
  candidatos: CandidatoMatch[];
}

interface Confirmado {
  resultado: ResultadoMatch;
  tmdbIdElegido: number;
}

// ---------------------------------------------------------------------
// FASE 1 — matching contra TMDB
// ---------------------------------------------------------------------

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function similitud(a: string, b: string): number {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const wa = na.split(" ").filter(Boolean);
  const wb = nb.split(" ").filter(Boolean);
  const setA = new Set(wa);
  const setB = new Set(wb);
  const interseccion = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  const jaccard = union === 0 ? 0 : interseccion / union;

  const contiene = na.includes(nb) || nb.includes(na) ? 0.35 : 0;

  const masCorta = wa.length <= wb.length ? setA : setB;
  const masLarga = wa.length <= wb.length ? setB : setA;
  const cubiertas = masCorta.size === 0 ? 0 : [...masCorta].filter((w) => masLarga.has(w)).length / masCorta.size;

  return Math.min(1, jaccard * 0.5 + cubiertas * 0.4 + contiene);
}

async function tmdbFetch(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${TMDB_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, accept: "application/json" },
  });
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(`TMDB (${res.status}) en ${path}: ${cuerpo}`);
  }
  return res.json();
}

async function buscarTmdb(query: string, tipo: "series" | "movie", idioma = "en-US"): Promise<any[]> {
  const path = tipo === "series" ? "/search/tv" : "/search/movie";
  try {
    const data = await tmdbFetch(path, { query, language: idioma });
    return data.results ?? [];
  } catch (e) {
    console.error(`buscarTmdb falló para "${query}" [${tipo}] (${idioma}):`, e);
    return [];
  }
}

async function buscarCandidatos(nombre: string, tipo: "series" | "movie", añoEsperado?: number, idiomaUsuario = "es-419"): Promise<CandidatoMatch[]> {
  async function evaluarEnIdioma(query: string, idioma: string): Promise<any[]> {
    return (await buscarTmdb(query, tipo, idioma)).slice(0, MAX_RESULTADOS_A_EVALUAR);
  }

  function puntuar(items: { en?: any; es?: any }[]): CandidatoMatch[] {
    return items.map(({ en, es }) => {
      const r = en ?? es; // el que tengamos, para los datos que no cambian según idioma (id, poster, fecha)
      const fechaStr = tipo === "series" ? r.first_air_date : r.release_date;
      const año = fechaStr ? Number(String(fechaStr).slice(0, 4)) : undefined;
      const tituloIngles: string | undefined = en ? (tipo === "series" ? en.name : en.title) : undefined;
      const tituloEspañol: string | undefined = es ? (tipo === "series" ? es.name : es.title) : undefined;
      const tituloOriginal: string | undefined = tipo === "series" ? r.original_name : r.original_title;
      // Mostramos como principal el título en inglés (o el original si no
      // tenemos el de inglés) y, si el traducido al español es distinto,
      // se muestra al lado entre paréntesis.
      const tituloPrincipal = tituloIngles ?? tituloOriginal ?? tituloEspañol ?? "";
      const tituloTraducido = tituloEspañol && normalizar(tituloEspañol) !== normalizar(tituloPrincipal) ? tituloEspañol : null;

      // Para puntuar, comparamos contra TODos los nombres que tengamos de
      // este título (inglés, español, original) y nos quedamos con el
      // mejor — así "Druk" matchea aunque el título principal que se
      // termine mostrando sea "Another Round".
      const candidatosDeTexto = [tituloIngles, tituloEspañol, tituloOriginal].filter(Boolean) as string[];
      const scoreTexto = Math.max(0, ...candidatosDeTexto.map((c) => similitud(nombre, c)));
      const esNombreExacto = candidatosDeTexto.some((c) => normalizar(nombre) === normalizar(c));

      // OJO: acá NO tapamos en 1 todavía — un candidato exacto por texto ya
      // arranca en 1, y si lo tapáramos acá, el bonus/penalización por año
      // nunca podría desempatar entre dos candidatos que son AMBOS exactos
      // por texto (es justo el caso real de "dos películas con el mismo
      // nombre, años distintos" que necesitamos poder distinguir). El tope
      // de 1 se aplica más abajo, solo para decidir si supera el umbral de
      // confianza — para orden y desempate se usa sin tapar.
      let scoreSinTapar = scoreTexto;
      if (añoEsperado && año) {
        const diferencia = Math.abs(año - añoEsperado);
        if (diferencia === 0) scoreSinTapar += 0.25;
        else if (diferencia === 1) scoreSinTapar += 0.1;
        else if (diferencia > 3) scoreSinTapar -= 0.3;
      }
      return {
        tmdb_id: r.id,
        titulo: tituloPrincipal,
        tituloOriginal: tituloTraducido, // reutilizamos este campo para el texto entre paréntesis que se muestra en la pantalla
        poster_path: r.poster_path ?? null,
        score: Math.max(0, Math.min(1, scoreSinTapar)),
        scoreOrden: scoreSinTapar, // sin tapar, solo para ordenar/desempatar
        scoreTexto,
        esNombreExacto,
        año,
      } as CandidatoMatch & { scoreOrden: number };
    });
  }

  async function evaluar(query: string): Promise<CandidatoMatch[]> {
    // Buscamos en inglés (como veníamos haciendo) y también en el idioma
    // que el usuario tiene elegido en la app — TV Time a veces trae el
    // título tal cual lo viste vos (en tu idioma), y TMDB a veces solo
    // tiene ese título bien indexado en su idioma original o en el tuyo, no
    // en inglés. Juntamos los resultados de las dos búsquedas antes de
    // puntuar, guardando los dos títulos por separado (para poder mostrar
    // "Original (Traducido)" después, en TU idioma).
    const esIngles = idiomaUsuario.toLowerCase().startsWith("en");
    const [enIngles, enIdiomaUsuario] = await Promise.all([
      evaluarEnIdioma(query, "en-US"),
      esIngles ? Promise.resolve([]) : evaluarEnIdioma(query, idiomaUsuario),
    ]);
    const combinados = new Map<number, { en?: any; es?: any }>();
    enIngles.forEach((r) => combinados.set(r.id, { ...combinados.get(r.id), en: r }));
    enIdiomaUsuario.forEach((r) => combinados.set(r.id, { ...combinados.get(r.id), es: r }));

    return puntuar([...combinados.values()])
      .sort((a: any, b: any) => b.scoreOrden - a.scoreOrden)
      .slice(0, MAX_CANDIDATOS);
  }

  let candidatos = await evaluar(nombre);
  if (candidatos.length === 0 || candidatos[0].score < UMBRAL_CONFIANZA) {
    const nombreLimpio = normalizar(nombre);
    if (nombreLimpio && nombreLimpio !== nombre.toLowerCase().trim()) {
      const candidatosAlt = await evaluar(nombreLimpio);
      if (candidatosAlt.length > 0 && (candidatos.length === 0 || candidatosAlt[0].score > candidatos[0].score)) {
        candidatos = candidatosAlt;
      }
    }
  }
  return candidatos;
}

/**
 * TV Time usa TheTVDB como id interno de cada serie (columna "s_id" en su
 * export) — TMDB tiene un endpoint que resuelve eso directo, sin tener que
 * adivinar por nombre. Cuando funciona, es 100% preciso (no es una
 * aproximación como la búsqueda por texto), así que si lo tenemos lo usamos
 * primero y nos salteamos la búsqueda por nombre por completo.
 */
async function buscarPorTvdbId(tvdbId: string): Promise<CandidatoMatch | null> {
  try {
    const data = await tmdbFetch(`/find/${tvdbId}`, { external_source: "tvdb_id" });
    const resultado = (data.tv_results ?? [])[0];
    if (!resultado) return null;
    return {
      tmdb_id: resultado.id,
      titulo: resultado.name,
      poster_path: resultado.poster_path ?? null,
      score: 1, // id exacto, no es una aproximación por texto
      año: resultado.first_air_date ? Number(String(resultado.first_air_date).slice(0, 4)) : undefined,
    };
  } catch (e) {
    console.error(`buscarPorTvdbId falló para ${tvdbId}:`, e);
    return null;
  }
}

async function procesarJob(jobId: string) {
  const inicio = Date.now();
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const { data: job, error } = await admin.from("tvtime_import_jobs").select("*").eq("id", jobId).single();
    if (error || !job) throw new Error("No se encontró el trabajo de importación.");
    if (job.status !== "procesando") return; // ya está listo o en error, no hay nada que retomar

    const grupos: Grupo[] = job.grupos;
    const resultados: any[] = Array.isArray(job.resultados) ? [...job.resultados] : [];
    const desde: number = job.procesados ?? 0;
    const idiomaUsuario: string = job.idioma_usuario ?? "es-419";

    for (let i = desde; i < grupos.length; i++) {
      if (Date.now() - inicio > PRESUPUESTO_MS) {
        await admin.from("tvtime_import_jobs").update({ procesados: i, resultados, updated_at: new Date().toISOString() }).eq("id", jobId);
        await relanzarse({ continuar_job_id: jobId });
        return;
      }

      const grupo = grupos[i];
      let candidatos: CandidatoMatch[] = [];
      try {
        if (grupo.tipo === "series" && grupo.tvdbId) {
          const directo = await buscarPorTvdbId(grupo.tvdbId);
          // El id de TheTVDB puede ser el correcto, pero la propia base de
          // TMDB (editada por su comunidad) a veces tiene ese id externo mal
          // cruzado con una ficha que no es — pasó de verdad con una serie
          // real durante las pruebas. Por eso no confiamos ciegamente:
          // chequeamos que el nombre resuelto se parezca al menos un poco al
          // nombre que puso TV Time antes de darlo por bueno.
          if (directo && similitud(grupo.nombreOriginal, directo.titulo) >= 0.4) {
            candidatos = [directo];
          }
        }
        if (candidatos.length === 0) {
          candidatos = await buscarCandidatos(grupo.nombreOriginal, grupo.tipo, grupo.añoLanzamiento, idiomaUsuario);
        }
      } catch (e) {
        console.error(`Error buscando "${grupo.nombreOriginal}":`, e);
      }
      const mejor = candidatos[0] ?? null;
      // Ambiguo de verdad: hay MÁS DE UN candidato con el nombre EXACTO (ni
      // una letra de más ni de menos) — ahí sí no hay forma de saber cuál es
      // sin preguntar. Si solo uno es exacto (aunque otros se "parezcan"
      // por contener el nombre adentro, tipo "X" vs "X: Subtítulo"), ese
      // exacto gana siempre, no hace falta preguntar. No aplica cuando vino
      // directo por TVDB id.
      const exactos = candidatos.filter((c) => c.esNombreExacto).sort((a: any, b: any) => (b.scoreOrden ?? b.score) - (a.scoreOrden ?? a.score));
      const esAmbiguo =
        !(grupo.tipo === "series" && grupo.tvdbId && candidatos.length === 1 && candidatos[0]?.score === 1) &&
        exactos.length >= 2 &&
        ((exactos[0] as any).scoreOrden ?? exactos[0].score) - ((exactos[1] as any).scoreOrden ?? exactos[1].score) < MARGEN_AMBIGUEDAD;
      resultados.push({
        nombreOriginal: grupo.nombreOriginal,
        tipo: grupo.tipo,
        registros: grupo.registros,
        mejorCandidato: mejor,
        confiado: !!mejor && mejor.score >= UMBRAL_CONFIANZA && !esAmbiguo,
        candidatos,
      });

      if (i % 3 === 0 || i === grupos.length - 1) {
        await admin.from("tvtime_import_jobs").update({ procesados: i + 1, resultados, updated_at: new Date().toISOString() }).eq("id", jobId);
      }
    }

    await admin
      .from("tvtime_import_jobs")
      .update({ status: "listo", procesados: grupos.length, resultados, updated_at: new Date().toISOString() })
      .eq("id", jobId);
  } catch (e: any) {
    console.error("Error procesando job de importación:", e);
    await admin
      .from("tvtime_import_jobs")
      .update({ status: "error", error_msg: String(e?.message ?? e), updated_at: new Date().toISOString() })
      .eq("id", jobId);
  }
}

// ---------------------------------------------------------------------
// FASE 2 — aplicar los confirmados (crear fichas + marcar como visto)
// ---------------------------------------------------------------------

const STALE_AFTER_HOURS = 24;
function isStale(syncedAt: string | null) {
  if (!syncedAt) return true;
  const horas = (Date.now() - new Date(syncedAt).getTime()) / (1000 * 60 * 60);
  return horas > STALE_AFTER_HOURS;
}

/** Igual que syncSeries del cliente: trae (o refresca) una serie + todos sus episodios. */
async function syncSeriesEdge(admin: any, tmdbId: number): Promise<void> {
  const { data: existing } = await admin.from("series_cache").select("synced_at, total_seasons, first_air_date, total_episodes").eq("tmdb_id", tmdbId).maybeSingle();

  const leFaltanCamposNuevos = existing && (!existing.total_seasons || !existing.first_air_date);
  let leFaltanEpisodios = false;
  if (existing && !isStale(existing.synced_at) && !leFaltanCamposNuevos) {
    const { count } = await admin.from("episodes_cache").select("*", { count: "exact", head: true }).eq("series_tmdb_id", tmdbId);
    const totalEsperado = (existing as any).total_episodes ?? 0;
    leFaltanEpisodios = !count || count === 0 || (totalEsperado > 0 && count < totalEsperado * 0.9);
  }
  if (existing && !isStale(existing.synced_at) && !leFaltanCamposNuevos && !leFaltanEpisodios) return;

  const details = await tmdbFetch(`/tv/${tmdbId}`);

  const { error: errorSerie } = await admin.from("series_cache").upsert({
    tmdb_id: tmdbId,
    name: details.name,
    poster_path: details.poster_path,
    backdrop_path: details.backdrop_path,
    overview: details.overview,
    status: details.status,
    first_air_date: details.first_air_date || null,
    total_episodes: details.number_of_episodes ?? 0,
    total_seasons: details.number_of_seasons ?? 0,
    genre_ids: (details.genres ?? []).map((g: any) => g.id),
    networks: (details.networks ?? []).map((n: any) => n.name),
    seasons_meta: (details.seasons ?? [])
      .filter((s: any) => s.season_number > 0)
      .map((s: any) => ({ season_number: s.season_number, air_date: s.air_date || null, episode_count: s.episode_count ?? 0, name: s.name })),
    synced_at: new Date().toISOString(),
  });
  if (errorSerie) throw new Error(`No se pudo guardar la serie (${errorSerie.message}).`);

  const seasons: any[] = details.seasons ?? [];
  const episodiosParaInsertar: any[] = [];
  for (const season of seasons) {
    if (season.season_number === 0 || !season.episode_count) continue;
    const seasonData = await tmdbFetch(`/tv/${tmdbId}/season/${season.season_number}`);
    for (const ep of seasonData.episodes ?? []) {
      episodiosParaInsertar.push({
        series_tmdb_id: tmdbId,
        season_number: ep.season_number,
        episode_number: ep.episode_number,
        name: ep.name,
        overview: ep.overview || null,
        air_date: ep.air_date || null,
        still_path: ep.still_path || null,
        runtime_minutes: ep.runtime ?? details.episode_run_time?.[0] ?? null,
      });
    }
  }
  if (episodiosParaInsertar.length > 0) {
    const { error: errorEpisodios } = await admin
      .from("episodes_cache")
      .upsert(episodiosParaInsertar, { onConflict: "series_tmdb_id,season_number,episode_number" });
    if (errorEpisodios) throw new Error(`No se pudieron guardar los episodios (${errorEpisodios.message}).`);
  }
}

/** Igual que syncMovie del cliente. */
async function syncMovieEdge(admin: any, tmdbId: number): Promise<void> {
  const { data: existing } = await admin.from("movies_cache").select("synced_at").eq("tmdb_id", tmdbId).maybeSingle();
  if (existing && !isStale(existing.synced_at)) return;

  const details = await tmdbFetch(`/movie/${tmdbId}`);
  const { error } = await admin.from("movies_cache").upsert({
    tmdb_id: tmdbId,
    title: details.title,
    poster_path: details.poster_path,
    backdrop_path: details.backdrop_path,
    overview: details.overview,
    runtime_minutes: details.runtime ?? null,
    release_date: details.release_date || null,
    genre_ids: (details.genres ?? []).map((g: any) => g.id),
    synced_at: new Date().toISOString(),
  });
  if (error) throw new Error(`No se pudo guardar la película (${error.message}).`);
}

/** Igual que aplicarMatch del cliente, con el mismo arreglo de "no perder toda la serie por un episodio que no matchea". Devuelve cuántos episodios se omitieron por no existir en el catálogo. */
async function aplicarMatchEdge(
  admin: any,
  userId: string,
  resultado: ResultadoMatch,
  tmdbIdElegido: number
): Promise<{ omitidosCount: number; omitidosDetalle: string[] }> {
  if (resultado.tipo === "series") {
    await syncSeriesEdge(admin, tmdbIdElegido);
    await admin.from("user_series").upsert({
      user_id: userId,
      series_tmdb_id: tmdbIdElegido,
      in_watchlist: true,
      last_watched_at: new Date().toISOString(),
    });

    const episodiosPedidos = resultado.registros.filter((r) => r.temporada != null && r.episodio != null);
    const { data: existentesEnCache } = await admin.from("episodes_cache").select("season_number, episode_number").eq("series_tmdb_id", tmdbIdElegido);
    const existentesSet = new Set((existentesEnCache ?? []).map((e: any) => `${e.season_number}-${e.episode_number}`));

    const pedidosFaltantes = episodiosPedidos.filter((r) => !existentesSet.has(`${r.temporada}-${r.episodio}`));
    const episodios = episodiosPedidos
      .filter((r) => existentesSet.has(`${r.temporada}-${r.episodio}`))
      .map((r) => ({
        user_id: userId,
        series_tmdb_id: tmdbIdElegido,
        season_number: r.temporada,
        episode_number: r.episodio,
        watched_at: r.fechaVisto ?? new Date().toISOString(),
      }));

    if (episodios.length > 0) {
      const { error } = await admin.from("user_episodes_watched").upsert(episodios, { onConflict: "user_id,series_tmdb_id,season_number,episode_number" });
      if (error) throw error;
    }
    // Un renglón por serie afectada (no uno por capítulo, para no hacer una
    // lista eterna) — con el rango de temporadas/capítulos que faltaron.
    const omitidosDetalle =
      pedidosFaltantes.length > 0
        ? [`${resultado.nombreOriginal}: ${pedidosFaltantes.map((r) => `T${r.temporada}E${r.episodio}`).join(", ")}`]
        : [];
    return { omitidosCount: pedidosFaltantes.length, omitidosDetalle };
  } else {
    await syncMovieEdge(admin, tmdbIdElegido);
    const { error } = await admin.from("user_movies").upsert({
      user_id: userId,
      movie_tmdb_id: tmdbIdElegido,
      watched: true,
      watched_at: resultado.registros[0]?.fechaVisto ?? new Date().toISOString(),
    });
    if (error) throw error;
    return { omitidosCount: 0, omitidosDetalle: [] };
  }
}

async function aplicarJob(jobId: string) {
  const inicio = Date.now();
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const { data: job, error } = await admin.from("tvtime_import_jobs").select("*").eq("id", jobId).single();
    if (error || !job) throw new Error("No se encontró el trabajo de importación.");
    if (job.status !== "aplicando") return; // ya terminó o no corresponde retomar

    const confirmados: Confirmado[] = job.confirmados;
    const desde: number = job.aplicados ?? 0;
    let episodiosOmitidos: number = job.episodios_omitidos ?? 0;
    let omitidosDetalle: string[] = Array.isArray(job.episodios_omitidos_detalle) ? [...job.episodios_omitidos_detalle] : [];

    for (let i = desde; i < confirmados.length; i++) {
      if (Date.now() - inicio > PRESUPUESTO_MS) {
        await admin
          .from("tvtime_import_jobs")
          .update({ aplicados: i, episodios_omitidos: episodiosOmitidos, episodios_omitidos_detalle: omitidosDetalle, updated_at: new Date().toISOString() })
          .eq("id", jobId);
        await relanzarse({ continuar_aplicar_job_id: jobId });
        return;
      }

      const { resultado, tmdbIdElegido } = confirmados[i];
      try {
        const { omitidosCount, omitidosDetalle: detalle } = await aplicarMatchEdge(admin, job.user_id, resultado, tmdbIdElegido);
        episodiosOmitidos += omitidosCount;
        omitidosDetalle = [...omitidosDetalle, ...detalle];
      } catch (e) {
        // Un título puntual que falla no debería frenar el resto de la
        // importación — lo dejamos loggeado y seguimos con los demás.
        console.error(`No se pudo aplicar "${resultado.nombreOriginal}":`, e);
      }

      if (i % 3 === 0 || i === confirmados.length - 1) {
        await admin
          .from("tvtime_import_jobs")
          .update({ aplicados: i + 1, episodios_omitidos: episodiosOmitidos, episodios_omitidos_detalle: omitidosDetalle, updated_at: new Date().toISOString() })
          .eq("id", jobId);
      }
    }

    await admin
      .from("tvtime_import_jobs")
      .update({
        status: "aplicando_listo",
        aplicados: confirmados.length,
        episodios_omitidos: episodiosOmitidos,
        episodios_omitidos_detalle: omitidosDetalle,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  } catch (e: any) {
    console.error("Error aplicando job de importación:", e);
    await admin
      .from("tvtime_import_jobs")
      .update({ status: "aplicando_error", error_msg: String(e?.message ?? e), updated_at: new Date().toISOString() })
      .eq("id", jobId);
  }
}

// ---------------------------------------------------------------------
// Infra común
// ---------------------------------------------------------------------

/** Le pide a una nueva instancia de esta misma función que retome este trabajo — esperamos a que el pedido salga de verdad antes de terminar. */
async function relanzarse(body: Record<string, string>) {
  try {
    await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("Error al relanzarse para seguir el import:", e);
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ ok: false, motivo: "Sin autenticación" }, 401);

    const body = await req.json().catch(() => ({}));
    const esLlamadaInterna = authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;

    // Continuar fase 1 (buscar) — de la propia función relanzándose, o del
    // cliente como red de seguridad si ese relanzamiento no llegó a salir.
    if (body?.continuar_job_id) {
      if (!esLlamadaInterna) {
        const permiso = await validarDueño(authHeader, body.continuar_job_id);
        if (!permiso.ok) return jsonResponse(permiso, 401);
      }
      // @ts-ignore: EdgeRuntime es global en el runtime de Supabase/Deno Deploy.
      EdgeRuntime.waitUntil(procesarJob(body.continuar_job_id));
      return jsonResponse({ ok: true }, 200);
    }

    // Continuar fase 2 (aplicar) — mismo esquema.
    if (body?.continuar_aplicar_job_id) {
      if (!esLlamadaInterna) {
        const permiso = await validarDueño(authHeader, body.continuar_aplicar_job_id);
        if (!permiso.ok) return jsonResponse(permiso, 401);
      }
      // @ts-ignore
      EdgeRuntime.waitUntil(aplicarJob(body.continuar_aplicar_job_id));
      return jsonResponse({ ok: true }, 200);
    }

    // Arrancar fase 2 (aplicar) — el usuario ya confirmó todo, mandamos la
    // lista final para aplicarla del lado del servidor.
    if (body?.aplicar_job_id) {
      const permiso = await validarDueño(authHeader, body.aplicar_job_id);
      if (!permiso.ok) return jsonResponse(permiso, 401);
      const confirmados = body.confirmados;
      if (!Array.isArray(confirmados)) return jsonResponse({ ok: false, motivo: "Falta la lista de confirmados." }, 400);

      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await admin
        .from("tvtime_import_jobs")
        .update({ status: "aplicando", confirmados, aplicados: 0, total_aplicar: confirmados.length, updated_at: new Date().toISOString() })
        .eq("id", body.aplicar_job_id);

      // @ts-ignore
      EdgeRuntime.waitUntil(aplicarJob(body.aplicar_job_id));
      return jsonResponse({ ok: true }, 200);
    }

    // Arrancar fase 1 (buscar) — pedido normal desde la pantalla de importar.
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();
    if (userError || !user) return jsonResponse({ ok: false, motivo: "Token inválido" }, 401);

    const { grupos, idiomaUsuario } = body;
    if (!Array.isArray(grupos) || grupos.length === 0) {
      return jsonResponse({ ok: false, motivo: "No hay títulos para procesar." }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: job, error: insertError } = await admin
      .from("tvtime_import_jobs")
      .insert({ user_id: user.id, grupos, total: grupos.length, status: "procesando", idioma_usuario: idiomaUsuario || "es-419" })
      .select("id")
      .single();
    if (insertError || !job) throw insertError ?? new Error("No se pudo crear el trabajo.");

    // @ts-ignore
    EdgeRuntime.waitUntil(procesarJob(job.id));

    return jsonResponse({ ok: true, job_id: job.id }, 200);
  } catch (e: any) {
    console.error(e);
    return jsonResponse({ ok: false, motivo: `Error interno al iniciar la importación: ${String(e?.message ?? e)}` }, 200);
  }
});

/** Confirma que quien llama es un usuario real y dueño de ese job puntual (no cualquiera puede "continuar" el trabajo de otro). */
async function validarDueño(authHeader: string, jobId: string): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();
  if (userError || !user) return { ok: false, motivo: "Token inválido" };

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: job } = await admin.from("tvtime_import_jobs").select("user_id").eq("id", jobId).maybeSingle();
  if (!job || job.user_id !== user.id) return { ok: false, motivo: "No autorizado" };
  return { ok: true };
}
