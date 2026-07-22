import { supabase } from "./supabase";

/**
 * True si, después de marcar un capítulo, la serie quedó 100% vista Y ya no
 * van a salir más temporadas (status Ended/Canceled en TMDB) — el momento
 * exacto en el que festejamos con papelitos.
 */
export async function serieRecienCompletada(userId: string, seriesTmdbId: number): Promise<boolean> {
  const { data: serie } = await supabase.from("series_cache").select("status").eq("tmdb_id", seriesTmdbId).maybeSingle();
  if (!serie?.status) return false;
  // Si puede seguir saliendo contenido, no es "terminaste la serie para siempre".
  if (serie.status === "Returning Series" || serie.status === "In Production" || serie.status === "Planned" || serie.status === "Pilot") {
    return false;
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const { data: episodios } = await supabase.from("episodes_cache").select("season_number, episode_number, air_date").eq("series_tmdb_id", seriesTmdbId);
  const emitidos = (episodios ?? []).filter((e: any) => e.air_date && e.air_date <= hoy);
  if (emitidos.length === 0) return false;

  const { data: vistos } = await supabase
    .from("user_episodes_watched")
    .select("season_number, episode_number")
    .eq("user_id", userId)
    .eq("series_tmdb_id", seriesTmdbId);
  const vistosSet = new Set((vistos ?? []).map((v: any) => `${v.season_number}:${v.episode_number}`));

  return emitidos.every((e: any) => vistosSet.has(`${e.season_number}:${e.episode_number}`));
}
