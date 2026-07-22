import { supabase } from "./supabase";
import { TargetType } from "./moods";

export interface CastVoteStats {
  miVoto: number | null; // actor_tmdb_id
  porcentajes: Record<number, number>; // actor_tmdb_id -> porcentaje 0-100
  total: number;
}

export async function getCastVoteStats(targetType: TargetType, targetId: string, userId: string | null): Promise<CastVoteStats> {
  const { data } = await supabase
    .from("title_favorite_cast")
    .select("user_id, actor_tmdb_id")
    .eq("target_type", targetType)
    .eq("target_id", targetId);
  const filas = data ?? [];
  const conteos: Record<number, number> = {};
  filas.forEach((f: any) => {
    conteos[f.actor_tmdb_id] = (conteos[f.actor_tmdb_id] ?? 0) + 1;
  });
  const total = filas.length;
  const porcentajes: Record<number, number> = {};
  Object.keys(conteos).forEach((id) => {
    porcentajes[Number(id)] = total > 0 ? Math.round((conteos[Number(id)] / total) * 100) : 0;
  });
  const miFila = userId ? filas.find((f: any) => f.user_id === userId) : null;
  return { miVoto: (miFila as any)?.actor_tmdb_id ?? null, porcentajes, total };
}

export async function votarActor(
  userId: string,
  targetType: TargetType,
  targetId: string,
  actorTmdbId: number,
  actorName: string
) {
  const { error } = await supabase
    .from("title_favorite_cast")
    .upsert(
      { user_id: userId, target_type: targetType, target_id: targetId, actor_tmdb_id: actorTmdbId, actor_name: actorName },
      { onConflict: "user_id,target_type,target_id" }
    );
  if (error) throw error;
}
