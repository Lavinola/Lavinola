// supabase/functions/fetch-rss/index.ts
//
// Trae el contenido de un feed RSS del lado del servidor y lo devuelve tal
// cual (el XML crudo, sin tocar nada) — hace falta específicamente para la
// versión web: un navegador no te deja pedirle datos directo a otro sitio
// que no te autorizó (CORS), pero desde acá (un servidor) no hay ese
// problema. En el celular esto no hace falta — ahí se sigue pidiendo
// directo, ya andaba bien.
//
// Uso: GET /fetch-rss?url=https%3A%2F%2Fvariety.com%2Ffeed%2F
//
// Setup:
//   supabase functions deploy fetch-rss

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return new Response(JSON.stringify({ error: "Falta el parámetro url" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; LavinolaBot/1.0)" } });
    const texto = await res.text();
    return new Response(texto, {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/xml; charset=utf-8" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
