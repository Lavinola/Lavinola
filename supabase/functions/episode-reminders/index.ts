// supabase/functions/episode-reminders/index.ts
//
// Corre CADA HORA (no una vez al día) — y en cada corrida, para cada
// usuario, chequea si en ESE momento son las 10am en SU zona horaria (la
// de su perfil, o la que le corresponde por default a su país si no la
// cambió a mano). Así, en vez de un horario fijo para todo el mundo,
// cada persona recibe el aviso a las 10am de su propio país.
//
// Si varios capítulos de la MISMA temporada de una serie salen el mismo
// día (típico de estrenos "temporada completa" de streaming), se manda
// UN solo aviso de temporada en vez de uno por capítulo — se detecta
// comparando cuántos capítulos de esa temporada salen hoy contra el
// total de capítulos que tiene esa temporada (guardado en
// series_cache.seasons_meta).
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
//   (requiere las extensiones pg_cron y pg_net habilitadas en el proyecto)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

async function mandarPushSiCorresponde(supabase: any, userId: string, titulo: string, cuerpo: string, data: Record<string, any>) {
  const { data: perfil } = await supabase
    .from("profiles")
    .select("push_token, notify_new_releases, timezone, country")
    .eq("id", userId)
    .maybeSingle();
  if (!perfil?.push_token) return false;
  if (perfil.notify_new_releases === false) return false; // respeta el interruptor de Ajustes

  const tz = perfil.timezone || zonaPorDefecto(perfil.country);
  if (!esLas10amEn(tz)) return false; // no es la hora de esta persona todavía

  await supabase.functions.invoke("send-push", {
    body: { to: perfil.push_token, title: titulo, body: cuerpo, data },
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

serve(async (_req) => {
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

    // Solo se manda el aviso de "temporada completa" cuando de verdad salen
    // TODOS los capítulos de esa temporada hoy — no alcanza con que salgan
    // varios. Si salen 2 o más pero no son todos, se juntan en un solo
    // aviso listando qué capítulos son. Si sale uno solo, el aviso de
    // siempre con ese capítulo puntual.
    const esTemporadaCompleta = grupo.totalTemporada > 0 && grupo.episodios.length >= grupo.totalTemporada;

    for (const s of seguidores ?? []) {
      if (esTemporadaCompleta) {
        const enviado = await mandarPushSiCorresponde(
          supabase,
          s.user_id,
          "Nueva temporada hoy",
          `Hoy se estrena la temporada ${grupo.season} de ${grupo.nombreSerie}`,
          { type: "season_today", seriesTmdbId: grupo.seriesTmdbId, season: grupo.season }
        );
        if (enviado) enviados++;
      } else if (grupo.episodios.length > 1) {
        const enviado = await mandarPushSiCorresponde(
          supabase,
          s.user_id,
          "Nuevos episodios hoy",
          `Hoy se estrenan los capítulos ${listarNumerosNatural(grupo.episodios)} de ${grupo.nombreSerie}`,
          { type: "episodes_today", seriesTmdbId: grupo.seriesTmdbId, season: grupo.season, episodes: grupo.episodios }
        );
        if (enviado) enviados++;
      } else {
        for (const numEp of grupo.episodios) {
          const enviado = await mandarPushSiCorresponde(
            supabase,
            s.user_id,
            "Nuevo episodio hoy",
            `Hoy se estrena T${grupo.season} - E${numEp} de ${grupo.nombreSerie}`,
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

    for (const p of pendientes ?? []) {
      const enviado = await mandarPushSiCorresponde(supabase, p.user_id, "Nuevo estreno hoy", `Hoy se estrena ${peli.title}`, {
        type: "movie_today",
        movieTmdbId: peli.tmdb_id,
      });
      if (enviado) enviados++;
    }
  }

  return new Response(JSON.stringify({ enviados }), { status: 200 });
});
