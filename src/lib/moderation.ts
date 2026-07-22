/**
 * Moderación de texto (capas 1 y 2 del spec: filtro automático + detección de
 * patrones de spam/venta ilegal).
 *
 * Estrategia en dos pasos:
 *  1. Chequeo local instantáneo con regex (spam/venta ilegal) — no necesita
 *     red, corre siempre.
 *  2. Si el chequeo local pasa, se llama a la Edge Function `moderate-text`
 *     (Google Perspective API) para el scoring de toxicidad. Si la función
 *     no está disponible (sin key configurada, sin red), el texto se deja
 *     pasar igual (fail-open) — el filtro local + el sistema de reportes
 *     siguen cubriendo el caso.
 *
 * No incluye ninguna restricción de idioma: el spec descartó esa idea
 * explícitamente porque no filtra intención, solo excluye población real.
 */
import { supabase } from "./supabase";

// Patrones típicos de venta/spam (teléfonos, links externos, frases de venta)
const PATRONES_SPAM: RegExp[] = [
  /\b\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}\b/, // números de teléfono
  /https?:\/\/\S+/i, // links externos
  /wa\.me\/\S+/i, // links directos de WhatsApp
  /\bwhatsapp\b/i,
  /consultar\s+precio/i,
  /\bpromo(cion)?\b.*\bdescuento\b/i,
];

export interface ResultadoModeracion {
  permitido: boolean;
  motivo?: string;
}

function chequeoLocalSpam(texto: string): ResultadoModeracion {
  for (const patron of PATRONES_SPAM) {
    if (patron.test(texto)) {
      return { permitido: false, motivo: "Esto parece spam o venta de algo — no está permitido acá." };
    }
  }
  return { permitido: true };
}

/** Moderación completa: regex local + Perspective API (Edge Function), con fail-open. */
export async function moderarTexto(texto: string): Promise<ResultadoModeracion> {
  const local = chequeoLocalSpam(texto);
  if (!local.permitido) return local;

  try {
    const { data, error } = await supabase.functions.invoke("moderate-text", { body: { text: texto } });
    if (error || !data) return { permitido: true }; // fail-open: no tumba el posteo por un error de infra
    return data as ResultadoModeracion;
  } catch {
    return { permitido: true };
  }
}

// ---------- Rate limiting ----------
// El chequeo efectivo ahora vive en Postgres (triggers `enforce_comment_rate_limit`
// y `enforce_share_rate_limit` en schema.sql) — así no se puede bypassear desde
// el cliente. Estas constantes quedan acá solo para mostrar mensajes claros en
// la UI antes de intentar postear.
export const LIMITE_POSTS_CUENTA_NUEVA = 5; // por hora
export const DIAS_CUENTA_NUEVA = 3;

export function esCuentaNueva(createdAt: string): boolean {
  const dias = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return dias < DIAS_CUENTA_NUEVA;
}
