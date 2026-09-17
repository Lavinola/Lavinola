// supabase/functions/episode-reminders/index.ts
//
// Corre CADA HORA (no una vez al día) — y en cada corrida, para cada
// usuario, chequea si en ESE momento son las 10am en SU zona horaria (la
// de su perfil, o la que le corresponde por default a su país si no la
// cambió a mano). Así, en vez de un horario fijo para todo el mundo,
// cada persona recibe el aviso a las 10am de su propio país.
//
// Según cuántos capítulos de la MISMA temporada de una serie salen el
// mismo día:
//   - 1 solo capítulo -> "Hoy se estrena T3 - E5 de [Serie]"
//   - Varios, pero no todos los de la temporada -> "Hoy se estrenan los
//     capítulos 5, 6 y 7 de [Serie]"
//   - TODOS los de la temporada -> "Hoy se estrena la temporada 3 de
//     [Serie]" (se compara contra el total real de esa temporada,
//     guardado en series_cache.seasons_meta — no alcanza con que salgan
//     "varios", tienen que ser todos)
//
// Cuando se sabe dónde ("en el cine" o en qué plataforma) se agrega al
// final del aviso — pero SOLO si está confirmado para el país de esa
// persona puntual. Si no se sabe, el aviso queda como antes, sin ese dato.
//
// IMPORTANTE — sobre la hora del estreno en sí: ni TMDB ni ninguna fuente
// gratuita nos dan la hora exacta en que se estrena algo (solo el día) —
// por eso esto avisa "hoy se estrena", no "en tal horario". El
// capítulo/película se habilita para marcar como visto a las 00:00 UTC
// del día de estreno (ver TitleDetailScreen/EpisodeDetailScreen) — no
// hay forma de saber con certeza cuándo está disponible de verdad en
// cada plataforma.
//
// Setup:
//   1. supabase functions deploy episode-reminders
//   2. En el SQL Editor, programar con pg_cron (extensión ya viene en Supabase):
//
//   select cron.schedule(
//     'episode-reminders-cada-hora',
//     '0 * * * *', -- todas las horas, en punto
//     $$
//     select net.http_post(
//       url := 'https://TU_PROYECTO.supabase.co/functions/v1/episode-reminders',
//       headers := jsonb_build_object('Authorization', 'Bearer TU_SERVICE_ROLE_KEY')
//     );
//     $$
//   );
//
//   (requiere las extensiones pg_cron y pg_net habilitadas en el proyecto,
//   y el secreto TMDB_READ_TOKEN: supabase secrets set TMDB_READ_TOKEN=...)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TMDB_TOKEN = Deno.env.get("TMDB_READ_TOKEN")!;
const TMDB_BASE = "https://api.themoviedb.org/3";

// Mismo mapeo que src/lib/timezones.ts (país -> zona horaria por default)
// — se duplica acá porque esta función corre en Deno, aparte del código
// de la app. Si se agrega/cambia algo allá, conviene reflejarlo acá
// también.
const PAIS_A_TIMEZONE_DEFAULT: Record<string, string> = {
  AR: "America/Argentina/Buenos_Aires", MX: "America/Mexico_City", ES: "Europe/Madrid",
  US: "America/New_York", BR: "America/Sao_Paulo", CO: "America/Bogota", CL: "America/Santiago",
  PE: "America/Lima", UY: "America/Montevideo", PY: "America/Asuncion", BO: "America/La_Paz",
  VE: "America/Caracas", EC: "America/Guayaquil", CR: "America/Costa_Rica", GT: "America/Guatemala",
  HN: "America/Tegucigalpa", NI: "America/Managua", SV: "America/El_Salvador", PA: "America/Panama",
  DO: "America/Santo_Domingo", CU: "America/Havana", GB: "Europe/London", FR: "Europe/Paris",
  DE: "Europe/Berlin", IT: "Europe/Rome", PT: "Europe/Lisbon", CA: "America/Toronto",
  AU: "Australia/Sydney", JP: "Asia/Tokyo", CN: "Asia/Shanghai", IN: "Asia/Kolkata",
};

function zonaPorDefecto(codigoPais: string | null): string {
  return (codigoPais && PAIS_A_TIMEZONE_DEFAULT[codigoPais]) || "UTC";
}

/** ¿Son las 10am (dentro de esta hora en curso) en la zona horaria dada? */
function esLas10amEn(timezone: string): boolean {
  try {
    const horaLocal = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(new Date());
    return Number(horaLocal) === 10;
  } catch {
    return false; // zona horaria inválida/desconocida — mejor no mandar que romper
  }
}

/** Elige el texto según el idioma que la persona tenga elegido en la app (mismo criterio que el resto de la app: en/pt/it si empieza así, español para cualquier otro caso incluido es-ES/es-419). */
function elegirIdioma(textos: Record<string, string>, contentLanguage: string | null | undefined): string {
  const idioma = contentLanguage ?? "";
  const codigo = idioma.startsWith("en") ? "en" : idioma.startsWith("pt") ? "pt" : idioma.startsWith("it") ? "it" : "es";
  return textos[codigo] ?? textos.es;
}

async function mandarPushSiCorresponde(supabaseClient: any, userId: string, titulos: Record<string, string>, cuerpos: Record<string, string>, data: Record<string, any>, paisYaConsultado?: string | null) {
  const { data: perfil } = await supabaseClient
    .from("profiles")
    .select("push_token, notify_new_releases, timezone, country, content_language")
    .eq("id", userId)
    .maybeSingle();
  if (!perfil?.push_token) return false;
  if (perfil.notify_new_releases === false) return false; // respeta el interruptor de Ajustes

  const tz = perfil.timezone || zonaPorDefecto(perfil.country);
  if (!esLas10amEn(tz)) return false; // no es la hora de esta persona todavía

  await supabaseClient.functions.invoke("send-push", {
    body: {
      to: perfil.push_token,
      title: elegirIdioma(titulos, perfil.content_language),
      body: elegirIdioma(cuerpos, perfil.content_language),
      data,
    },
  });
  return true;
}

/** [5] -> "5" | [5,6] -> "5 y 6" | [5,6,7] -> "5, 6 y 7" */
function listarNumerosNatural(numeros: number[]): string {
  const ordenados = [...numeros].sort((a, b) => a - b);
  if (ordenados.length === 1) return String(ordenados[0]);
  const todosMenosUltimo = ordenados.slice(0, -1).join(", ");
  const ultimo = ordenados[ordenados.length - 1];
  return `${todosMenosUltimo} y ${ultimo}`;
}

// Mismo par de renombres que en src/lib/tmdb.ts (normalizarNombrePlataforma)
// — se duplica acá porque esta función corre en Deno, aparte del código
// de la app.
function normalizarPlataforma(nombre: string, region: string): string {
  if (nombre === "Disney Plus") return "Disney+";
  if (nombre === "Amazon Prime Video") return "Prime Video";
  if (nombre === "Peacock" && region !== "US") return "Universal+";
  return nombre;
}

/**
 * Para el aviso de "hoy se estrena tal película": movies_cache.release_date
 * es una fecha GENÉRICA elegida por TMDB (muchas veces la de EE.UU.), no
 * necesariamente la de estreno confirmada para cada país. Sin este chequeo,
 * alguien en Argentina podía recibir "hoy se estrena" un día que en
 * realidad se estrena en EE.UU. y todavía no hay fecha confirmada acá.
 *
 * Devuelve un mapa país -> { tipo, fecha } (cine = la más temprana entre
 * "cine limitado" y "cine amplio"; si no hay cine, digital; si no, físico),
 * o null si no se pudo consultar TMDB.
 */
async function obtenerInfoEstrenoPorPais(tmdbId: number): Promise<Map<string, { tipo: "cine" | "digital" | "fisico" | null; fecha: string | null }> | null> {
  try {
    const res = await fetch(`${TMDB_BASE}/movie/${tmdbId}/release_dates`, {
      headers: { Authorization: `Bearer ${TMDB_TOKEN}`, accept: "application/json" },
    });
    const data = await res.json();
    const resultados: any[] = data?.results ?? [];
    const mapa = new Map<string, { tipo: "cine" | "digital" | "fisico" | null; fecha: string | null }>();
    for (const r of resultados) {
      const fechas: any[] = r.release_dates ?? [];
      const masTemprana = (tipos: number[]) => {
        const candidatas = fechas.filter((f: any) => tipos.includes(f.type)).map((f: any) => String(f.release_date).slice(0, 10));
        return candidatas.length > 0 ? candidatas.sort()[0] : null;
      };
      const fechaCine = masTemprana([2, 3]);
      if (fechaCine) {
        mapa.set(r.iso_3166_1, { tipo: "cine", fecha: fechaCine });
        continue;
      }
      const fechaDigital = masTemprana([4]);
      if (fechaDigital) {
        mapa.set(r.iso_3166_1, { tipo: "digital", fecha: fechaDigital });
        continue;
      }
      const fechaFisica = masTemprana([5]);
      mapa.set(r.iso_3166_1, fechaFisica ? { tipo: "fisico", fecha: fechaFisica } : { tipo: null, fecha: null });
    }
    return mapa;
  } catch (e) {
    console.error("No se pudo consultar release_dates en TMDB para", tmdbId, e);
    return null;
  }
}

/**
 * Plataformas en streaming (flatrate) por país, para una película o serie
 * — para poder agregar "en Netflix" (o la que corresponda) al aviso de
 * estreno digital. Una sola consulta a TMDB por título (no una por
 * usuario): la respuesta ya trae todos los países juntos.
 */
async function obtenerFlatratePorPais(tipoTmdb: "movie" | "tv", tmdbId: number): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  try {
    const res = await fetch(`${TMDB_BASE}/${tipoTmdb}/${tmdbId}/watch/providers`, {
      headers: { Authorization: `Bearer ${TMDB_TOKEN}`, accept: "application/json" },
    });
    const data = await res.json();
    for (const [pais, info] of Object.entries<any>(data?.results ?? {})) {
      const nombres = (info?.flatrate ?? []).map((p: any) => normalizarPlataforma(p.provider_name, pais));
      mapa.set(pais, nombres);
    }
  } catch (e) {
    console.error("No se pudo consultar watch/providers en TMDB para", tipoTmdb, tmdbId, e);
  }
  return mapa;
}

/** " en Netflix" / " en el cine" / "" (si no hay nada confirmado) — ya armado en los 4 idiomas. */
function sufijoDondeVerlo(tipo: "cine" | "digital" | "fisico" | null, plataformas: string[] | undefined): Record<string, string> {
  if (tipo === "cine") {
    return { es: " en el cine", en: " in theaters", pt: " no cinema", it: " al cinema" };
  }
  if (tipo === "digital" && plataformas && plataformas.length > 0) {
    const nombre = plataformas[0];
    return { es: ` en ${nombre}`, en: ` on ${nombre}`, pt: ` no ${nombre}`, it: ` su ${nombre}` };
  }
  return { es: "", en: "", pt: "", it: "" };
}

serve(async (req) => {
  // El cron ya está configurado (ver instrucciones arriba) para mandar
  // este header — sin verificarlo acá, cualquiera podía disparar esto a
  // mano las veces que quisiera, mandando avisos duplicados a usuarios reales.
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    return new Response("No autorizado", { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const hoy = new Date().toISOString().slice(0, 10);
  let enviados = 0;

  // ---------- Episodios que se estrenan hoy ----------
  const { data: episodiosHoy } = await supabase
    .from("episodes_cache")
    .select("series_tmdb_id, name, season_number, episode_number, series_cache(name, seasons_meta)")
    .eq("air_date", hoy);

  // Agrupamos por (serie, temporada) para poder detectar "sale la
  // temporada completa hoy" en vez de mandar un aviso por cada capítulo.
  const grupos = new Map<string, { seriesTmdbId: number; season: number; nombreSerie: string; episodios: number[]; totalTemporada: number }>();
  for (const ep of episodiosHoy ?? []) {
    const clave = `${ep.series_tmdb_id}-${ep.season_number}`;
    if (!grupos.has(clave)) {
      const seasonsMeta = (ep as any).series_cache?.seasons_meta ?? [];
      const metaTemporada = seasonsMeta.find((s: any) => s.season_number === ep.season_number);
      grupos.set(clave, {
        seriesTmdbId: ep.series_tmdb_id,
        season: ep.season_number,
        nombreSerie: (ep as any).series_cache?.name ?? "tu serie",
        episodios: [],
        totalTemporada: metaTemporada?.episode_count ?? 0,
      });
    }
    grupos.get(clave)!.episodios.push(ep.episode_number);
  }

  for (const grupo of grupos.values()) {
    const { data: seguidores } = await supabase.from("user_series").select("user_id").eq("series_tmdb_id", grupo.seriesTmdbId).eq("in_watchlist", true);
    if (!seguidores || seguidores.length === 0) continue;

    // Una sola consulta a TMDB por serie (no por usuario) — de acá sacamos
    // la plataforma de streaming según el país de cada seguidor.
    const flatratePorPais = await obtenerFlatratePorPais("tv", grupo.seriesTmdbId);

    // Solo se manda el aviso de "temporada completa" cuando de verdad salen
    // TODOS los capítulos de esa temporada hoy — no alcanza con que salgan
    // varios. Si salen 2 o más pero no son todos, se juntan en un solo
    // aviso listando qué capítulos son. Si sale uno solo, el aviso de
    // siempre con ese capítulo puntual.
    const esTemporadaCompleta = grupo.totalTemporada > 0 && grupo.episodios.length >= grupo.totalTemporada;

    for (const s of seguidores) {
      const { data: perfil } = await supabase.from("profiles").select("country").eq("id", s.user_id).maybeSingle();
      const plataformasDeSuPais = perfil?.country ? flatratePorPais.get(perfil.country) : undefined;
      const sufijo = sufijoDondeVerlo(plataformasDeSuPais && plataformasDeSuPais.length > 0 ? "digital" : null, plataformasDeSuPais);

      if (esTemporadaCompleta) {
        const enviado = await mandarPushSiCorresponde(
          supabase,
          s.user_id,
          { es: "Nueva temporada hoy", en: "New season today", pt: "Nova temporada hoje", it: "Nuova stagione oggi" },
          {
            es: `Hoy se estrena la temporada ${grupo.season} de ${grupo.nombreSerie}${sufijo.es}`,
            en: `Season ${grupo.season} of ${grupo.nombreSerie} premieres today${sufijo.en}`,
            pt: `Hoje estreia a temporada ${grupo.season} de ${grupo.nombreSerie}${sufijo.pt}`,
            it: `Oggi esce la stagione ${grupo.season} di ${grupo.nombreSerie}${sufijo.it}`,
          },
          { type: "season_today", seriesTmdbId: grupo.seriesTmdbId, season: grupo.season }
        );
        if (enviado) enviados++;
      } else if (grupo.episodios.length > 1) {
        const enviado = await mandarPushSiCorresponde(
          supabase,
          s.user_id,
          { es: "Nuevos episodios hoy", en: "New episodes today", pt: "Novos episódios hoje", it: "Nuovi episodi oggi" },
          {
            es: `Hoy se estrenan los capítulos ${listarNumerosNatural(grupo.episodios)} de ${grupo.nombreSerie}${sufijo.es}`,
            en: `Episodes ${listarNumerosNatural(grupo.episodios)} of ${grupo.nombreSerie} premiere today${sufijo.en}`,
            pt: `Hoje estreiam os episódios ${listarNumerosNatural(grupo.episodios)} de ${grupo.nombreSerie}${sufijo.pt}`,
            it: `Oggi escono gli episodi ${listarNumerosNatural(grupo.episodios)} di ${grupo.nombreSerie}${sufijo.it}`,
          },
          { type: "episodes_today", seriesTmdbId: grupo.seriesTmdbId, season: grupo.season, episodes: grupo.episodios }
        );
        if (enviado) enviados++;
      } else {
        for (const numEp of grupo.episodios) {
          const enviado = await mandarPushSiCorresponde(
            supabase,
            s.user_id,
            { es: "Nuevo episodio hoy", en: "New episode today", pt: "Novo episódio hoje", it: "Nuovo episodio oggi" },
            {
              es: `Hoy se estrena T${grupo.season} - E${numEp} de ${grupo.nombreSerie}${sufijo.es}`,
              en: `S${grupo.season} - E${numEp} of ${grupo.nombreSerie} premieres today${sufijo.en}`,
              pt: `Hoje estreia T${grupo.season} - E${numEp} de ${grupo.nombreSerie}${sufijo.pt}`,
              it: `Oggi esce S${grupo.season} - E${numEp} di ${grupo.nombreSerie}${sufijo.it}`,
            },
            { type: "episode_today", seriesTmdbId: grupo.seriesTmdbId, season: grupo.season, episode: numEp }
          );
          if (enviado) enviados++;
        }
      }
    }
  }

  // ---------- Películas que se estrenan hoy, y están en pendientes de alguien ----------
  const { data: peliculasHoy } = await supabase.from("movies_cache").select("tmdb_id, title").eq("release_date", hoy);

  for (const peli of peliculasHoy ?? []) {
    const { data: pendientes } = await supabase.from("user_movies").select("user_id").eq("movie_tmdb_id", peli.tmdb_id).eq("watched", false);
    if (!pendientes || pendientes.length === 0) continue;

    // Antes de avisarle a nadie, confirmamos con TMDB si hoy es de verdad
    // el estreno para CADA país — no alcanza con que la fecha genérica de
    // movies_cache diga hoy (esa puede ser la de otro país). Si no se pudo
    // consultar TMDB, no le avisamos a nadie con esta película antes que
    // arriesgarnos a un "hoy se estrena" falso.
    const infoPorPais = await obtenerInfoEstrenoPorPais(peli.tmdb_id);
    if (!infoPorPais) continue;

    // Solo hace falta consultar la plataforma si al menos alguien va a
    // recibir un aviso de estreno digital hoy en su país.
    let flatratePorPais: Map<string, string[]> | null = null;

    for (const p of pendientes) {
      const { data: perfil } = await supabase.from("profiles").select("country").eq("id", p.user_id).maybeSingle();
      const infoDeSuPais = perfil?.country ? infoPorPais.get(perfil.country) : null;
      if (!infoDeSuPais || infoDeSuPais.fecha !== hoy) continue; // no hay estreno confirmado HOY para el país de esta persona

      let plataformasDeSuPais: string[] | undefined;
      if (infoDeSuPais.tipo === "digital") {
        if (!flatratePorPais) flatratePorPais = await obtenerFlatratePorPais("movie", peli.tmdb_id);
        plataformasDeSuPais = perfil?.country ? flatratePorPais.get(perfil.country) : undefined;
      }
      const sufijo = sufijoDondeVerlo(infoDeSuPais.tipo, plataformasDeSuPais);

      const enviado = await mandarPushSiCorresponde(
        supabase,
        p.user_id,
        { es: "Nuevo estreno hoy", en: "New release today", pt: "Nova estreia hoje", it: "Nuova uscita oggi" },
        {
          es: `Hoy se estrena ${peli.title}${sufijo.es}`,
          en: `${peli.title} premieres today${sufijo.en}`,
          pt: `Hoje estreia ${peli.title}${sufijo.pt}`,
          it: `Oggi esce ${peli.title}${sufijo.it}`,
        },
        {
          type: "movie_today",
          movieTmdbId: peli.tmdb_id,
        }
      );
      if (enviado) enviados++;
    }
  }

  return new Response(JSON.stringify({ enviados }), { status: 200 });
});
