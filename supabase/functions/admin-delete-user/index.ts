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

serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ ok: false, motivo: "Sin autenticación" }), { status: 401 });

    const { targetUserId } = await req.json();
    if (!targetUserId) return new Response(JSON.stringify({ ok: false, motivo: "Falta targetUserId" }), { status: 400 });

    const supabaseCaller = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await supabaseCaller.auth.getUser();
    if (!caller) return new Response(JSON.stringify({ ok: false, motivo: "Token inválido" }), { status: 401 });

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: callerProfile } = await supabaseAdmin.from("profiles").select("is_admin").eq("id", caller.id).single();
    if (!callerProfile?.is_admin) {
      return new Response(JSON.stringify({ ok: false, motivo: "No tenés permisos de admin." }), { status: 403 });
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, motivo: "Error interno al borrar la cuenta." }), { status: 200 });
  }
});
