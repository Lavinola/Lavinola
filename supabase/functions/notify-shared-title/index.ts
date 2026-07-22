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

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
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
