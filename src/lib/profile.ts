import { supabase } from "./supabase";

export interface PerfilCompleto {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  country: string | null;
  birth_year: number | null;
  gender: string | null;
  cover_type: "series" | "movie" | null;
  cover_tmdb_id: number | null;
  is_private: boolean;
  show_watched_movies: boolean;
  show_watched_series: boolean;
  show_favorite_movies: boolean;
  show_favorite_series: boolean;
  show_groups: boolean;
  show_comments: boolean;
  show_watch_time: boolean;
  is_premium?: boolean;
  username_placeholder?: boolean;
  vio_aviso_username?: boolean;
  favorite_quote?: string | null;
  recap_year_shown?: number | null;
  recap_dismissed_at?: string | null;
  social_instagram: string | null;
  social_twitter: string | null;
  social_tiktok: string | null;
  content_language: string;
  show_titles_in_own_language: boolean;
  notify_episode_timing: "none" | "10min" | "1hora" | "1dia";
  notify_likes: boolean;
  notify_replies: boolean;
  notify_follow_requests: boolean;
  notify_messages: boolean;
  notify_group_messages_private?: boolean;
  notify_group_messages_public?: boolean;
  is_admin?: boolean;
  is_moderator?: boolean;
}

export interface StatsSociales {
  siguiendo: number;
  seguidores: number;
  comentarios: number;
}

export async function getPerfil(userId: string): Promise<PerfilCompleto | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) {
    console.error("Error al traer el perfil:", error.message, error);
    // Auto-reparación: si es TU PROPIO perfil el que falta (código PGRST116 =
    // "0 rows"), lo creamos en el momento. Cubre cuentas viejas afectadas por
    // el bug de que el perfil no se creaba si faltaba confirmar el mail.
    if (error.code === "PGRST116") {
      const { data: sesion } = await supabase.auth.getUser();
      if (sesion.user?.id === userId) {
        const { data: creado, error: errorCrear } = await supabase
          .from("profiles")
          .insert({ id: userId })
          .select()
          .single();
        if (!errorCrear) return creado as PerfilCompleto;
        console.error("No se pudo auto-reparar el perfil:", errorCrear.message);
      }
    }
    return null;
  }
  return data as PerfilCompleto;
}

export async function actualizarPerfil(userId: string, cambios: Partial<PerfilCompleto>) {
  const { error } = await supabase.from("profiles").update(cambios).eq("id", userId);
  if (error) throw error;
}

export async function getStatsSociales(userId: string): Promise<StatsSociales> {
  const [{ count: siguiendo }, { count: seguidores }, { count: comentarios }, { count: posts }] = await Promise.all([
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("followee_id", userId),
    supabase.from("comentarios").select("*", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("posts").select("*", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  return { siguiendo: siguiendo ?? 0, seguidores: seguidores ?? 0, comentarios: (comentarios ?? 0) + (posts ?? 0) };
}

export async function setCoverPhoto(userId: string, tipo: "series" | "movie", tmdbId: number, backdropPath: string) {
  await actualizarPerfil(userId, { cover_type: tipo, cover_tmdb_id: tmdbId, cover_backdrop_path: backdropPath } as any);
}

/** Trae el banner elegido para la portada (si hay uno configurado). */
export async function getCoverPosterPath(perfil: PerfilCompleto): Promise<string | null> {
  if ((perfil as any).cover_backdrop_path) return (perfil as any).cover_backdrop_path;
  if (!perfil.cover_tmdb_id || !perfil.cover_type) return null;
  // Compatibilidad con portadas elegidas antes de este cambio (guardaban solo el título).
  const tabla = perfil.cover_type === "series" ? "series_cache" : "movies_cache";
  const { data } = await supabase.from(tabla).select("backdrop_path").eq("tmdb_id", perfil.cover_tmdb_id).maybeSingle();
  return data?.backdrop_path ?? null;
}

/**
 * Perfil público de OTRO usuario, respetando is_private (si es privado y no
 * lo seguís, solo se ve lo básico) y los switches granulares de qué mostrar.
 */
export async function getPerfilPublico(viewerId: string, targetId: string) {
  const perfil = await getPerfil(targetId);
  if (!perfil) return null;

  const { data: followRow } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", viewerId)
    .eq("followee_id", targetId)
    .maybeSingle();
  const loSigo = !!followRow || viewerId === targetId;

  const puedeVerActividad = viewerId === targetId || !perfil.is_private || loSigo;

  return { perfil, loSigo, puedeVerActividad };
}
