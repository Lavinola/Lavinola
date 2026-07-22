// supabase/functions/episode-reminders/index.ts
//
// Pensada para correr una vez por día (Supabase Cron / pg_cron). Busca
// episodios de `episodes_cache` que salen HOY y le manda un push a cada
// usuario que sigue esa serie y tiene push_token configurado.
//
// Setup:
//   1. supabase functions deploy episode-reminders
//   2. En el SQL Editor, programar con pg_cron (extensión ya viene en Supabase):
//
//   select cron.schedule(
//     'episode-reminders-diario',
//     '0 12 * * *', -- todos los días a las 12:00 UTC
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

serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: episodiosHoy } = await supabase
    .from("episodes_cache")
    .select("series_tmdb_id, name, season_number, episode_number, series_cache(name)")
    .eq("air_date", hoy);

  if (!episodiosHoy || episodiosHoy.length === 0) {
    return new Response(JSON.stringify({ enviados: 0 }), { status: 200 });
  }

  let enviados = 0;

  for (const ep of episodiosHoy) {
    const { data: seguidores } = await supabase
      .from("user_series")
      .select("user_id, profiles(push_token)")
      .eq("series_tmdb_id", ep.series_tmdb_id)
      .eq("in_watchlist", true);

    for (const s of seguidores ?? []) {
      const token = (s as any).profiles?.push_token;
      if (!token) continue;

      await supabase.functions.invoke("send-push", {
        body: {
          to: token,
          title: "Nuevo episodio hoy",
          body: `${(ep as any).series_cache?.name ?? "Tu serie"} — T${ep.season_number}E${ep.episode_number}`,
          data: { type: "episode_today", seriesTmdbId: ep.series_tmdb_id },
        },
      });
      enviados++;
    }
  }

  return new Response(JSON.stringify({ enviados }), { status: 200 });
});
