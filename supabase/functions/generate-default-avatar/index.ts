// supabase/functions/generate-default-avatar/index.ts
//
// Genera un avatar por default (random entre bottts-neutral/critters/
// sprouts/moods de DiceBear) UNA SOLA VEZ, lo baja, y lo sube a nuestro
// propio Storage (bucket "avatars") — así, de ahí en más, la app lo sirve
// desde nuestra propia base, sin depender de pedirle la imagen a DiceBear
// en vivo cada vez que alguien abre una pantalla (que es lo que estaba
// dando fotos en negro: el límite de pedidos por segundo de DiceBear se
// comparte entre TODAS las apps del mundo que lo usan, no solo la
// nuestra, así que ni reintentando alcanzaba siempre).
//
// Dos modos:
//   - Un usuario puntual: { userId, username }
//   - Backfill (cuentas viejas que ya tienen un link de DiceBear
//     colgando en avatar_url en vez de un archivo propio): { backfill: true }
//
// Setup:
//   supabase functions deploy generate-default-avatar

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ESTILOS = ["bottts-neutral", "critters", "sprouts", "moods"];
const TOPE_BACKFILL_POR_LLAMADA = 150; // margen para no pasarse del tiempo máximo de la función

async function generarYSubir(supabase: any, userId: string, username: string): Promise<string | null> {
  const estilo = ESTILOS[Math.floor(Math.random() * ESTILOS.length)];
  const url = `https://api.dicebear.com/9.x/${estilo}/png?seed=${encodeURIComponent(username)}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`DiceBear respondió ${resp.status} para ${username}`);
    return null;
  }
  const bytes = new Uint8Array(await resp.arrayBuffer());

  const path = `defaults/${userId}.png`;
  const { error: upErr } = await supabase.storage.from("avatars").upload(path, bytes, { contentType: "image/png", upsert: true });
  if (upErr) {
    console.error(`No se pudo subir el avatar de ${userId}:`, upErr.message);
    return null;
  }

  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = `${pub.publicUrl}?v=${Date.now()}`; // cache-busting, por si ya había un archivo viejo en esa misma ruta
  const { error: updErr } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", userId);
  if (updErr) {
    console.error(`No se pudo actualizar avatar_url de ${userId}:`, updErr.message);
    return null;
  }
  return avatarUrl;
}

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));

    if (body.backfill) {
      const { data: pendientes, error } = await supabase
        .from("profiles")
        .select("id, username")
        .like("avatar_url", "https://api.dicebear.com/%")
        .limit(TOPE_BACKFILL_POR_LLAMADA);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

      let ok = 0;
      let fallidos = 0;
      for (const p of pendientes ?? []) {
        const resultado = await generarYSubir(supabase, p.id, p.username);
        if (resultado) ok++;
        else fallidos++;
      }
      return new Response(
        JSON.stringify({ procesados: (pendientes ?? []).length, ok, fallidos, quedan_mas: (pendientes ?? []).length === TOPE_BACKFILL_POR_LLAMADA }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const { userId, username } = body;
    if (!userId || !username) {
      return new Response(JSON.stringify({ error: "Faltan userId/username" }), { status: 400 });
    }
    const avatarUrl = await generarYSubir(supabase, userId, username);
    if (!avatarUrl) return new Response(JSON.stringify({ error: "No se pudo generar el avatar" }), { status: 500 });
    return new Response(JSON.stringify({ avatar_url: avatarUrl }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("generate-default-avatar error:", e);
    return new Response(JSON.stringify({ error: e.message ?? "Error inesperado" }), { status: 500 });
  }
});
