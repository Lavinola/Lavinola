// supabase/functions/admin-delete-user/index.ts
//
// Borra la cuenta de OTRO usuario — solo si quien llama es admin. Distinta
// de delete-account (que solo te deja borrar tu propia cuenta).
//
// Setup: supabase functions deploy admin-delete-user

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
    if (!authHeader) return jsonResponse({ ok: false, motivo: "Sin autenticación" }, 401);

    const { targetUserId } = await req.json();
    if (!targetUserId) return jsonResponse({ ok: false, motivo: "Falta targetUserId" }, 400);

    const supabaseCaller = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await supabaseCaller.auth.getUser();
    if (!caller) return jsonResponse({ ok: false, motivo: "Token inválido" }, 401);

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: callerProfile } = await supabaseAdmin.from("profiles").select("is_admin").eq("id", caller.id).single();
    if (!callerProfile?.is_admin) {
      return jsonResponse({ ok: false, motivo: "No tenés permisos de admin." }, 403);
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (error) throw error;

    return jsonResponse({ ok: true }, 200);
  } catch (e) {
    console.error(e);
    return jsonResponse({ ok: false, motivo: "Error interno al borrar la cuenta." }, 200);
  }
});
