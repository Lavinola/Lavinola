// supabase/functions/notify-shared-title/index.ts
//
// Se dispara automáticamente cuando alguien comparte un título (insert en
// `shared_titles`), vía un Supabase Database Webhook.
//
// Setup:
//   1. supabase functions deploy notify-shared-title
//   2. En el dashboard de Supabase: Database > Webhooks > Create a new hook
//        - Table: shared_titles
//        - Events: Insert
//        - Type: Supabase Edge Function
//        - Function: notify-shared-title
//
// El payload que manda un Database Webhook trae `record` con la fila nueva.
//
// IMPORTANTE — paso extra necesario después de este cambio: al crear (o
// editar) el webhook en el panel de Supabase (Database > Webhooks), hay
// que agregarle un HTTP Header:
//   Authorization: Bearer <tu SUPABASE_SERVICE_ROLE_KEY>
// Sin ese header, el webhook va a dejar de poder llamar a esta función
// (la va a rechazar con 401) — es la forma de confirmar que el pedido
// realmente viene de Supabase y no de cualquiera que encuentre la URL.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    // Sin este chequeo, cualquiera que encontrara la URL podía mandar un
    // payload falso ("record": {sender_id, receiver_id: CUALQUIERA}) y
    // hacer que le llegara una notificación push a cualquier usuario. El
    // webhook de Supabase que dispara esto hay que configurarlo (en el
    // panel, al crearlo) para que mande este mismo header — si no, deja
    // de funcionar. Ver instrucciones al final de este archivo.
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
      return new Response("No autorizado", { status: 401 });
    }

    const payload = await req.json();
    const record = payload.record;
    if (!record) return new Response("ok", { status: 200 });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const [{ data: sender }, { data: receiver }] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", record.sender_id).single(),
      supabase.from("profiles").select("push_token").eq("id", record.receiver_id).single(),
    ]);

    if (!receiver?.push_token) return new Response("sin token", { status: 200 });

    await supabase.functions.invoke("send-push", {
      body: {
        to: receiver.push_token,
        title: "Lavinola",
        body: `${sender?.username ?? "Alguien"} te recomendó algo para ver`,
        data: { type: "shared_title", sharedTitleId: record.id },
      },
    });

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 200 });
  }
});
