import { supabase } from "./supabase";

export type TargetType = "series" | "movie" | "episode";

/**
 * Las 12 reacciones de ánimo, en el mismo orden que se muestran en la UI
 * (2 filas de 6). Las imágenes son las caritas violetas ilustradas
 * (assets/moods/*.png, ya procesadas para tener transparencia real).
 */
export const MOODS: { key: string; imagen: any; label: string }[] = [
  { key: "feliz", imagen: require("../../assets/moods/feliz.png"), label: "Feliz" },
  { key: "entretenido", imagen: require("../../assets/moods/entretenido.png"), label: "Entretenido" },
  { key: "atrapado", imagen: require("../../assets/moods/atrapado.png"), label: "Atrapado" },
  { key: "conmovido", imagen: require("../../assets/moods/conmovido.png"), label: "Conmovido" },
  { key: "pensativo", imagen: require("../../assets/moods/pensativo.png"), label: "Pensativo" },
  { key: "impactado", imagen: require("../../assets/moods/impactado.png"), label: "Impactado" },
  { key: "triste", imagen: require("../../assets/moods/triste.png"), label: "Triste" },
  { key: "frustrado", imagen: require("../../assets/moods/frustrado.png"), label: "Enojado" },
  { key: "asustado", imagen: require("../../assets/moods/asustado.png"), label: "Asustado" },
  { key: "confuso", imagen: require("../../assets/moods/confuso.png"), label: "Confuso" },
  { key: "tenso", imagen: require("../../assets/moods/tenso.png"), label: "Tenso" },
  { key: "aburrido", imagen: require("../../assets/moods/aburrido.png"), label: "Aburrido" },
];

export interface MoodStats {
  misMoods: string[]; // hasta 2
  porcentajes: Record<string, number>; // key -> porcentaje 0-100 (sobre cantidad de PERSONAS, no de reacciones — como cada una puede elegir hasta 2, la suma puede superar el 100%)
  total: number; // cantidad de personas distintas que reaccionaron
}

const MAX_MOODS_POR_PERSONA = 2;

export async function getMoodStats(targetType: TargetType, targetId: string, userId: string | null): Promise<MoodStats> {
  const { data } = await supabase.from("title_mood_reactions").select("user_id, mood").eq("target_type", targetType).eq("target_id", targetId);
  const filas = data ?? [];
  const usuariosUnicos = new Set(filas.map((f: any) => f.user_id));
  const total = usuariosUnicos.size;
  const conteos: Record<string, number> = {};
  filas.forEach((f: any) => {
    conteos[f.mood] = (conteos[f.mood] ?? 0) + 1;
  });
  const porcentajes: Record<string, number> = {};
  MOODS.forEach((m) => {
    porcentajes[m.key] = total > 0 ? Math.round(((conteos[m.key] ?? 0) / total) * 100) : 0;
  });
  const misMoods = userId ? filas.filter((f: any) => f.user_id === userId).map((f: any) => f.mood) : [];
  return { misMoods, porcentajes, total };
}

/**
 * Elegir un estado de ánimo — hasta 2 por persona por título:
 *  - Si ya la habías elegido, la saca (tocarla de nuevo la deselecciona).
 *  - Si no la habías elegido y todavía tenés lugar (menos de 2), la agrega.
 *  - Si ya tenés 2 elegidas y elegís una tercera distinta, se reemplaza
 *    la más vieja de las dos por la nueva — así siempre quedan como
 *    mucho 2, sin necesidad de que la persona saque una a mano primero.
 */
export async function elegirMood(userId: string, targetType: TargetType, targetId: string, mood: string) {
  const { data: existentes } = await supabase
    .from("title_mood_reactions")
    .select("mood, created_at")
    .eq("user_id", userId)
    .eq("target_type", targetType)
    .eq("target_id", targetId);
  const actuales = existentes ?? [];
  const yaElegida = actuales.some((f: any) => f.mood === mood);

  if (yaElegida) {
    const { error } = await supabase
      .from("title_mood_reactions")
      .delete()
      .eq("user_id", userId)
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .eq("mood", mood);
    if (error) throw error;
    return;
  }

  if (actuales.length >= MAX_MOODS_POR_PERSONA) {
    const masVieja = [...actuales].sort((a: any, b: any) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))[0];
    await supabase
      .from("title_mood_reactions")
      .delete()
      .eq("user_id", userId)
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .eq("mood", masVieja.mood);
  }

  const { error } = await supabase
    .from("title_mood_reactions")
    .insert({ user_id: userId, target_type: targetType, target_id: targetId, mood });
  if (error) throw error;
}
