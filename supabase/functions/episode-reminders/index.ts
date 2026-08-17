// supabase/functions/episode-reminders/index.ts
//
// A diferencia de antes, esta versión corre CADA HORA (no una vez al
// día) — y en cada corrida, para cada usuario, chequea si en ESE
// momento son las 10am en SU zona horaria (la de su perfil, o la que le
// corresponde por default a su país si no la cambió a mano). Así, en vez
// de un horario fijo para todo el mundo, cada persona recibe el aviso a
// las 10am de su propio país.
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

serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const hoy = new Date().toISOString().slice(0, 10);
  let enviados = 0;

  // ---------- Episodios que se estrenan hoy ----------
  const { data: episodiosHoy } = await supabase
    .from("episodes_cache")
    .select("series_tmdb_id, name, season_number, episode_number, series_cache(name)")
    .eq("air_date", hoy);

  for (const ep of episodiosHoy ?? []) {
    const { data: seguidores } = await supabase.from("user_series").select("user_id").eq("series_tmdb_id", ep.series_tmdb_id).eq("in_watchlist", true);

    for (const s of seguidores ?? []) {
      const nombreSerie = (ep as any).series_cache?.name ?? "tu serie";
      const enviado = await mandarPushSiCorresponde(
        supabase,
        s.user_id,
        "Nuevo episodio hoy",
        `Hoy se estrena T${ep.season_number}E${ep.episode_number} de ${nombreSerie}`,
        { type: "episode_today", seriesTmdbId: ep.series_tmdb_id, season: ep.season_number, episode: ep.episode_number }
      );
      if (enviado) enviados++;
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
