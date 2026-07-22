import { supabase } from "./supabase";

export type TargetType = "series" | "movie" | "episode";

/**
 * Las 12 reacciones de ánimo, en el mismo orden que se muestran en la UI
 * (2 filas de 6). Las imágenes son las caritas violetas ilustradas
 * (assets/moods/*.png, ya procesadas para tener transparencia real).
 */
export const MOODS: { key: string; imagen: any; label: string }[] = [
  { key: "impactado", imagen: require("../../assets/moods/impactado.png"), label: "Impactado" },
  { key: "frustrado", imagen: require("../../assets/moods/frustrado.png"), label: "Enojado" },
  { key: "triste", imagen: require("../../assets/moods/triste.png"), label: "Triste" },
  { key: "pensativo", imagen: require("../../assets/moods/pensativo.png"), label: "Pensativo" },
  { key: "conmovido", imagen: require("../../assets/moods/conmovido.png"), label: "Conmovido" },
  { key: "entretenido", imagen: require("../../assets/moods/entretenido.png"), label: "Entretenido" },
  { key: "asustado", imagen: require("../../assets/moods/asustado.png"), label: "Asustado" },
  { key: "aburrido", imagen: require("../../assets/moods/aburrido.png"), label: "Aburrido" },
  { key: "atrapado", imagen: require("../../assets/moods/atrapado.png"), label: "Atrapado" },
  { key: "feliz", imagen: require("../../assets/moods/feliz.png"), label: "Feliz" },
  { key: "confuso", imagen: require("../../assets/moods/confuso.png"), label: "Confuso" },
  { key: "tenso", imagen: require("../../assets/moods/tenso.png"), label: "Tenso" },
];

export interface MoodStats {
  miMood: string | null;
  porcentajes: Record<string, number>; // key -> porcentaje 0-100
  total: number;
}

export async function getMoodStats(targetType: TargetType, targetId: string, userId: string | null): Promise<MoodStats> {
  const { data } = await supabase.from("title_mood_reactions").select("user_id, mood").eq("target_type", targetType).eq("target_id", targetId);
  const filas = data ?? [];
  const conteos: Record<string, number> = {};
  filas.forEach((f: any) => {
    conteos[f.mood] = (conteos[f.mood] ?? 0) + 1;
  });
  const total = filas.length;
  const porcentajes: Record<string, number> = {};
  MOODS.forEach((m) => {
    porcentajes[m.key] = total > 0 ? Math.round(((conteos[m.key] ?? 0) / total) * 100) : 0;
  });
  const miFila = userId ? filas.find((f: any) => f.user_id === userId) : null;
  return { miMood: (miFila as any)?.mood ?? null, porcentajes, total };
}

export async function elegirMood(userId: string, targetType: TargetType, targetId: string, mood: string) {
  const { error } = await supabase
    .from("title_mood_reactions")
    .upsert({ user_id: userId, target_type: targetType, target_id: targetId, mood }, { onConflict: "user_id,target_type,target_id" });
  if (error) throw error;
}
