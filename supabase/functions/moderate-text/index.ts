// supabase/functions/moderate-text/index.ts
//
// Modera un texto contra Google Perspective API (toxicidad/spam) antes de
// publicarlo. Se llama desde moderation.ts en la app, así la API key de
// Perspective nunca queda expuesta en el cliente.
//
// Setup:
//   1. Conseguí una key gratis: https://developers.perspectiveapi.com/s/docs-get-started
//   2. supabase secrets set PERSPECTIVE_API_KEY=tu_key
//   3. supabase functions deploy moderate-text
//
// Umbral: por default rechazamos si TOXICITY o SEVERE_TOXICITY superan 0.8.
// Es un punto de partida conservador — ajustalo según lo que veas en los
// reportes reales una vez en producción.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const PERSPECTIVE_API_KEY = Deno.env.get("PERSPECTIVE_API_KEY");
const UMBRAL_TOXICIDAD = 0.8;

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
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return jsonResponse({ permitido: false, motivo: "Texto vacío" }, 400);
    }

    if (!PERSPECTIVE_API_KEY) {
      // Sin key configurada, no bloqueamos (dejamos que el filtro local de
      // regex en el cliente sea la única capa) — pero lo dejamos loggeado.
      console.warn("PERSPECTIVE_API_KEY no configurada, se omite el chequeo de toxicidad.");
      return jsonResponse({ permitido: true }, 200);
    }

    const res = await fetch(
      `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${PERSPECTIVE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: { text },
          languages: ["es", "en"], // sin restringir a "idiomas occidentales" — spec descartó esa idea
          requestedAttributes: { TOXICITY: {}, SEVERE_TOXICITY: {} },
        }),
      }
    );

    if (!res.ok) {
      console.error("Perspective API error", await res.text());
      return jsonResponse({ permitido: true }, 200); // fail-open, no tumba el posteo por un error de red
    }

    const data = await res.json();
    const toxicity = data.attributeScores?.TOXICITY?.summaryScore?.value ?? 0;
    const severeToxicity = data.attributeScores?.SEVERE_TOXICITY?.summaryScore?.value ?? 0;

    const permitido = toxicity < UMBRAL_TOXICIDAD && severeToxicity < UMBRAL_TOXICIDAD;

    return jsonResponse(
      {
        permitido,
        motivo: permitido ? undefined : "El texto parece tóxico o agresivo — revisalo antes de publicar.",
        scores: { toxicity, severeToxicity },
      },
      200
    );
  } catch (e) {
    console.error(e);
    return jsonResponse({ permitido: true }, 200); // fail-open
  }
});
