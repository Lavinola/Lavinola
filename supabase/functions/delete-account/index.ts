// supabase/functions/delete-account/index.ts
//
// Borra la cuenta del usuario que llama a esta función (verificado por su
// propio JWT, no se puede borrar la cuenta de otro). El borrado de
// auth.users requiere la service role key, por eso no se puede hacer
// directo desde el cliente — se necesita esta función intermedia.
//
// Setup: supabase functions deploy delete-account

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ ok: false, motivo: "Sin autenticación" }), { status: 401 });

    // Cliente con el JWT del usuario, solo para identificarlo de forma segura.
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ ok: false, motivo: "Token inválido" }), { status: 401 });
    }

    // Cliente admin (service role) para el borrado real.
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (error) throw error;

    // El resto de las tablas (profiles, user_series, comentarios, etc.) se
    // borran solas por los "on delete cascade" del schema.

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, motivo: "Error interno al borrar la cuenta." }), { status: 200 });
  }
});
