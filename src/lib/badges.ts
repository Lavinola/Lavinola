import { supabase } from "./supabase";

export interface NivelInsignia {
  nivel: number; // 1 a 10
  nombre: string;
  puntos: number; // puntos necesarios para llegar a este nivel
}

// Mismo orden que se armó a mano con el usuario — cualquier cambio acá
// tiene que reflejar lo que ya se decidió, no un ajuste improvisado.
export const NIVELES_INSIGNIAS: NivelInsignia[] = [
  { nivel: 1, nombre: "Principiante", puntos: 15 },
  { nivel: 2, nombre: "Aficionado", puntos: 200 },
  { nivel: 3, nombre: "Fan", puntos: 465 },
  { nivel: 4, nombre: "Maratonista", puntos: 1000 },
  { nivel: 5, nombre: "Coleccionista", puntos: 1800 },
  { nivel: 6, nombre: "Erudito", puntos: 3000 },
  { nivel: 7, nombre: "Cinéfilo", puntos: 4600 },
  { nivel: 8, nombre: "Crítico", puntos: 6400 },
  { nivel: 9, nombre: "Experto", puntos: 8000 },
  { nivel: 10, nombre: "Leyenda", puntos: 10000 },
];

/** Trae los puntos de actividad de un usuario (los calcula la base, no hace falta traer todas las filas). */
export async function obtenerPuntosInsignias(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("calcular_puntos_insignias", { p_user_id: userId });
  if (error) throw error;
  return data ?? 0;
}

/** El nivel más alto ya alcanzado con esa cantidad de puntos (null si todavía no llegó ni al nivel 1). */
export function nivelAlcanzado(puntos: number): NivelInsignia | null {
  let actual: NivelInsignia | null = null;
  for (const n of NIVELES_INSIGNIAS) {
    if (puntos >= n.puntos) actual = n;
    else break;
  }
  return actual;
}

/** El próximo nivel todavía no alcanzado (null si ya está en el nivel 10, el máximo). */
export function proximoNivel(puntos: number): NivelInsignia | null {
  return NIVELES_INSIGNIAS.find((n) => puntos < n.puntos) ?? null;
}

/**
 * Compara el nivel actual del usuario contra el último que ya vio en la
 * animación de "subiste de nivel", y si subió, actualiza el registro y
 * devuelve el nuevo nivel (para que quien llama muestre la animación).
 * Si no subió, devuelve null y no toca nada.
 *
 * Cubre los 3 casos de una sola vez: progreso normal viendo cosas de a
 * poco, puntos "de antes" (alguien que ya usaba la app antes de que
 * existiera esto), y saltos grandes por un import masivo de TV Time.
 */
export async function chequearSubidaDeNivel(userId: string): Promise<NivelInsignia | null> {
  const [puntos, { data: perfil }] = await Promise.all([
    obtenerPuntosInsignias(userId),
    supabase.from("profiles").select("ultimo_nivel_insignia_visto").eq("id", userId).single(),
  ]);
  const nivelActual = nivelAlcanzado(puntos);
  const ultimoVisto = perfil?.ultimo_nivel_insignia_visto ?? 0;

  if (!nivelActual || nivelActual.nivel <= ultimoVisto) return null;

  await supabase.from("profiles").update({ ultimo_nivel_insignia_visto: nivelActual.nivel }).eq("id", userId);
  return nivelActual;
}
