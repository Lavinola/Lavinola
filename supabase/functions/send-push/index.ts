// supabase/functions/send-push/index.ts
//
// Envía una push notification a un push_token de Expo. La usan las otras
// funciones (notify-shared-title, episode-reminders) — no se llama directo
// desde la app.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    // Esta función NUNCA se llama directo desde la app — solo la usan
    // otras funciones nuestras (notify-shared-title, episode-reminders).
    // Sin este chequeo, cualquiera que encontrara la URL podía mandar
    // notificaciones push arbitrarias a cualquier token, haciéndose
    // pasar por Lavinola.
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
      return new Response(JSON.stringify({ ok: false, motivo: "No autorizado" }), { status: 401 });
    }

    const { to, title, body, data } = await req.json();
    if (!to || !title) {
      return new Response(JSON.stringify({ ok: false, motivo: "Faltan datos" }), { status: 400 });
    }

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ to, title, body, data: data ?? {}, sound: "default" }),
    });

    const resultado = await res.json();
    return new Response(JSON.stringify({ ok: res.ok, resultado }), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false }), { status: 200 });
  }
});
