// supabase/functions/moderate-image/index.ts
//
// Recibe una imagen en base64, la sube a Supabase Storage (bucket
// "group-photos") y la manda a Google Cloud Vision SafeSearch. Si vuelve
// limpia, devuelve la URL pública; si no, borra el archivo y rechaza.
//
// Setup:
//   1. Creá un bucket público "group-photos" en Supabase Storage.
//   2. Habilitá la Cloud Vision API en Google Cloud Console y generá una API key.
//   3. supabase secrets set GOOGLE_VISION_API_KEY=tu_key
//   4. supabase functions deploy moderate-image

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const GOOGLE_VISION_API_KEY = Deno.env.get("GOOGLE_VISION_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Niveles de Cloud Vision: UNKNOWN, VERY_UNLIKELY, UNLIKELY, POSSIBLE, LIKELY, VERY_LIKELY
const NIVELES_RECHAZADOS = ["LIKELY", "VERY_LIKELY"];

serve(async (req) => {
  try {
    const { imageBase64, userId, groupNameSlug } = await req.json();
    if (!imageBase64 || !userId) {
      return new Response(JSON.stringify({ aprobado: false, motivo: "Faltan datos" }), { status: 400 });
    }

    if (!GOOGLE_VISION_API_KEY) {
      return new Response(
        JSON.stringify({ aprobado: false, motivo: "Moderación de imágenes no configurada en el servidor." }),
        { status: 200 }
      );
    }

    // 1. SafeSearch primero, antes de subir nada a Storage.
    const visionRes = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{ image: { content: imageBase64 }, features: [{ type: "SAFE_SEARCH_DETECTION" }] }],
      }),
    });

    if (!visionRes.ok) {
      console.error("Vision API error", await visionRes.text());
      return new Response(JSON.stringify({ aprobado: false, motivo: "No se pudo verificar la imagen." }), {
        status: 200,
      });
    }

    const visionData = await visionRes.json();
    const safe = visionData.responses?.[0]?.safeSearchAnnotation;
    const rechazada =
      !safe ||
      NIVELES_RECHAZADOS.includes(safe.adult) ||
      NIVELES_RECHAZADOS.includes(safe.violence) ||
      NIVELES_RECHAZADOS.includes(safe.racy);

    if (rechazada) {
      return new Response(
        JSON.stringify({ aprobado: false, motivo: "La imagen no pasó el filtro de contenido automático." }),
        { status: 200 }
      );
    }

    // 2. Si pasó, recién ahí la subimos a Storage.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const bytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
    const path = `${userId}/${groupNameSlug ?? "grupo"}-${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage.from("group-photos").upload(path, bytes, {
      contentType: "image/jpeg",
    });
    if (uploadError) throw uploadError;

    const { data: publicUrl } = supabase.storage.from("group-photos").getPublicUrl(path);

    return new Response(JSON.stringify({ aprobado: true, url: publicUrl.publicUrl }), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ aprobado: false, motivo: "Error interno al moderar la imagen." }), {
      status: 200,
    });
  }
});
