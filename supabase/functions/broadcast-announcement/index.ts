// supabase/functions/broadcast-announcement/index.ts
//
// Manda un push a TODOS los usuarios con push_token guardado. Se llama
// después de insertar la fila en `announcements` (el mensaje en sí ya queda
// visible in-app para todos vía esa tabla, esto es solo para avisar por
// push a quienes tengan la app cerrada).
//
// Setup: supabase functions deploy broadcast-announcement

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Necesario para que la webapp pueda invocar esta función desde el navegador.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    if (!authHeader) return jsonResponse({ ok: false }, 401);

    const { message } = await req.json();
    if (!message) return jsonResponse({ ok: false, motivo: "Falta el mensaje" }, 400);

    const supabaseCaller = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await supabaseCaller.auth.getUser();
    if (!caller) return jsonResponse({ ok: false }, 401);

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: callerProfile } = await supabaseAdmin.from("profiles").select("is_admin").eq("id", caller.id).single();
    if (!callerProfile?.is_admin) {
      return jsonResponse({ ok: false, motivo: "No tenés permisos de admin." }, 403);
    }

    const { data: destinatarios } = await supabaseAdmin.from("profiles").select("push_token").not("push_token", "is", null);

    // Expo permite mandar hasta 100 notificaciones por request — las agrupamos en tandas.
    const tokens = (destinatarios ?? []).map((d) => d.push_token).filter(Boolean);
    const tandas: string[][] = [];
    for (let i = 0; i < tokens.length; i += 100) tandas.push(tokens.slice(i, i + 100));

    for (const tanda of tandas) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(
          tanda.map((to) => ({ to, title: "Lavinola", body: message, sound: "default" }))
        ),
      });
    }

    return jsonResponse({ ok: true, enviados: tokens.length }, 200);
  } catch (e) {
    console.error(e);
    return jsonResponse({ ok: false, motivo: "Error interno." }, 200);
  }
});
