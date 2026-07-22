import { supabase } from "./supabase";
import { moderarTexto } from "./moderation";

export type OrdenComentarios = "nuevo" | "viejo" | "mas_respuestas";

export interface Comentario {
  id: string;
  parent_comment_id: string | null;
  user_id: string;
  content: string;
  gif_url: string | null;
  reply_count: number;
  created_at: string;
  likes_count: number;
  reacciones: Record<string, number>;
  mi_reaccion: string | null;
  autor_username: string | null;
  autor_avatar_url: string | null;
  shared_item_type: "series" | "movie" | null;
  shared_tmdb_id: number | null;
  shared_group_id: string | null;
  shared_list_id: string | null;
  shared_season_number: number | null;
  shared_episode_number: number | null;
}

const NIVEL_COLAPSO = 4; // a partir de este nivel de anidamiento, la UI colapsa en "ver N respuestas más"

/**
 * Trae los comentarios de primer nivel de un target (episodio/película/serie/grupo).
 * Las respuestas se piden aparte con `cargarRespuestas` cuando el usuario las abre,
 * para no traer el árbol entero de una.
 */
export async function contarComentarios(targetType: string, targetId: string): Promise<number> {
  const { count } = await supabase
    .from("comentarios")
    .select("*", { count: "exact", head: true })
    .eq("target_type", targetType)
    .eq("target_id", targetId);
  return count ?? 0;
}

export async function cargarComentariosRaiz(
  targetType: "series" | "movie" | "episode" | "group",
  targetId: string,
  orden: OrdenComentarios = "nuevo",
  userId?: string | null
): Promise<Comentario[]> {
  let query = supabase
    .from("comentarios")
    .select("id, parent_comment_id, user_id, content, gif_url, reply_count, created_at, shared_item_type, shared_tmdb_id, shared_group_id, shared_list_id, shared_season_number, shared_episode_number, profiles!comentarios_user_id_fkey(username, avatar_url)")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .is("parent_comment_id", null);

  if (orden === "nuevo") query = query.order("created_at", { ascending: false });
  else if (orden === "viejo") query = query.order("created_at", { ascending: true });
  else query = query.order("reply_count", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  return await conLikes(data ?? [], userId);
}

/** Trae las respuestas directas de un comentario (para el "ver 12 respuestas más"). */
export async function cargarRespuestas(parentCommentId: string, userId?: string | null): Promise<Comentario[]> {
  const { data, error } = await supabase
    .from("comentarios")
    .select("id, parent_comment_id, user_id, content, gif_url, reply_count, created_at, shared_item_type, shared_tmdb_id, shared_group_id, shared_list_id, shared_season_number, shared_episode_number, profiles!comentarios_user_id_fkey(username, avatar_url)")
    .eq("parent_comment_id", parentCommentId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return await conLikes(data ?? [], userId);
}

async function conLikes(filas: any[], userId?: string | null): Promise<Comentario[]> {
  if (filas.length === 0) return [];
  const ids = filas.map((f) => f.id);
  const { data: likes } = await supabase.from("likes_comentario").select("comment_id, emoji, user_id").in("comment_id", ids);

  const reaccionesPorComentario: Record<string, Record<string, number>> = {};
  const miReaccionPorComentario: Record<string, string> = {};
  (likes ?? []).forEach((l: any) => {
    const emoji = l.emoji ?? "❤️";
    if (!reaccionesPorComentario[l.comment_id]) reaccionesPorComentario[l.comment_id] = {};
    reaccionesPorComentario[l.comment_id][emoji] = (reaccionesPorComentario[l.comment_id][emoji] ?? 0) + 1;
    if (userId && l.user_id === userId) miReaccionPorComentario[l.comment_id] = emoji;
  });

  return filas.map((f) => {
    const reacciones = reaccionesPorComentario[f.id] ?? {};
    const totalReacciones = Object.values(reacciones).reduce((a, b) => a + b, 0);
    return {
      id: f.id,
      parent_comment_id: f.parent_comment_id,
      user_id: f.user_id,
      content: f.content,
      gif_url: f.gif_url ?? null,
      reply_count: f.reply_count,
      created_at: f.created_at,
      likes_count: totalReacciones,
      reacciones,
      mi_reaccion: miReaccionPorComentario[f.id] ?? null,
      autor_username: f.profiles?.username ?? null,
      autor_avatar_url: f.profiles?.avatar_url ?? null,
      shared_item_type: f.shared_item_type ?? null,
      shared_tmdb_id: f.shared_tmdb_id ?? null,
      shared_group_id: f.shared_group_id ?? null,
      shared_list_id: f.shared_list_id ?? null,
      shared_season_number: f.shared_season_number ?? null,
      shared_episode_number: f.shared_episode_number ?? null,
    };
  });
}

/**
 * Postea un comentario. Pasa por el filtro de moderación de texto antes de
 * insertar (ver moderation.ts) — si lo rechaza, tira error con el motivo.
 */
/** Recomienda una película/serie, o un grupo, dentro de un grupo — se muestra como un comentario especial con la tapa y el nombre de lo recomendado. */
export async function recomendarEnGrupo(params: {
  userId: string;
  groupId: string;
  nota?: string | null;
  itemType?: "series" | "movie" | "episode";
  tmdbId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  recomendarGroupId?: string;
  recomendarListaId?: string;
}) {
  if (params.nota?.trim()) {
    const resultado = await moderarTexto(params.nota);
    if (!resultado.permitido) {
      throw new Error(resultado.motivo ?? "Este mensaje no cumple las normas de la comunidad.");
    }
  }

  const { error } = await supabase.from("comentarios").insert({
    user_id: params.userId,
    target_type: "group",
    target_id: params.groupId,
    group_id: params.groupId,
    content: params.nota?.trim() || "",
    shared_item_type: params.itemType === "episode" ? "series" : params.itemType ?? null,
    shared_tmdb_id: params.tmdbId ?? null,
    shared_season_number: params.itemType === "episode" ? params.seasonNumber ?? null : null,
    shared_episode_number: params.itemType === "episode" ? params.episodeNumber ?? null : null,
    shared_group_id: params.recomendarGroupId ?? null,
    shared_list_id: params.recomendarListaId ?? null,
  });
  if (error) throw error;
}

export async function postearComentario(params: {
  userId: string;
  targetType: "series" | "movie" | "episode" | "group";
  targetId: string;
  groupId?: string;
  content: string;
  gifUrl?: string | null;
  parentCommentId?: string;
}) {
  if (!params.content.trim() && !params.gifUrl) {
    throw new Error("Escribí algo o elegí un GIF.");
  }

  // El filtro de texto no aplica si el comentario es solo un GIF (no hay texto que moderar).
  if (params.content.trim()) {
    const resultado = await moderarTexto(params.content);
    if (!resultado.permitido) {
      throw new Error(resultado.motivo ?? "Este comentario no cumple las normas de la comunidad.");
    }
  }

  const { error } = await supabase.from("comentarios").insert({
    user_id: params.userId,
    target_type: params.targetType,
    target_id: params.targetId,
    group_id: params.groupId ?? null,
    content: params.content,
    gif_url: params.gifUrl ?? null,
    parent_comment_id: params.parentCommentId ?? null,
  });
  if (error) throw error;
}

/** Reacciona con un emoji. Si ya tenías esa reacción, la saca. Si tenías otra, la reemplaza. */
export async function eliminarComentario(comentarioId: string) {
  const { error } = await supabase.from("comentarios").delete().eq("id", comentarioId);
  if (error) throw error;
}

export async function reaccionar(userId: string, commentId: string, emoji: string, reaccionActual: string | null) {
  if (reaccionActual === emoji) {
    await supabase.from("likes_comentario").delete().eq("user_id", userId).eq("comment_id", commentId);
  } else {
    await supabase.from("likes_comentario").upsert({ user_id: userId, comment_id: commentId, emoji });
  }
}

export interface ComentarioPropio {
  id: string;
  content: string;
  gif_url: string | null;
  created_at: string;
  target_type: "series" | "movie" | "episode" | "group";
  target_id: string;
  group_id: string | null;
}

/** Todos los comentarios que hizo un usuario (para "Mis comentarios" en el perfil). */
export async function misComentarios(userId: string): Promise<ComentarioPropio[]> {
  const { data, error } = await supabase
    .from("comentarios")
    .select("id, content, gif_url, created_at, target_type, target_id, group_id")
    .eq("user_id", userId)
    .in("target_type", ["series", "movie", "episode"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ComentarioPropio[];
}

/** Arma el texto "En «Título»" / "En el grupo «Nombre»" para mostrar dónde se hizo cada comentario. */
export async function resolverLugares(comentarios: ComentarioPropio[], t: (s: string) => string = (s) => s): Promise<Record<string, string>> {
  const lugares: Record<string, string> = {};

  const seriesIds = new Set<number>();
  const movieIds = new Set<number>();
  const episodeSeriesIds = new Set<number>();
  const groupIds = new Set<string>();

  for (const c of comentarios) {
    if (c.target_type === "series") seriesIds.add(Number(c.target_id));
    else if (c.target_type === "movie") movieIds.add(Number(c.target_id));
    else if (c.target_type === "episode") episodeSeriesIds.add(Number(c.target_id.split(":")[0]));
    else if (c.target_type === "group" && c.group_id) groupIds.add(c.group_id);
  }

  const [seriesRows, movieRows, episodeSeriesRows, groupRows] = await Promise.all([
    seriesIds.size ? supabase.from("series_cache").select("tmdb_id, name").in("tmdb_id", Array.from(seriesIds)) : Promise.resolve({ data: [] as any[] }),
    movieIds.size ? supabase.from("movies_cache").select("tmdb_id, title").in("tmdb_id", Array.from(movieIds)) : Promise.resolve({ data: [] as any[] }),
    episodeSeriesIds.size ? supabase.from("series_cache").select("tmdb_id, name").in("tmdb_id", Array.from(episodeSeriesIds)) : Promise.resolve({ data: [] as any[] }),
    groupIds.size ? supabase.from("groups").select("id, name").in("id", Array.from(groupIds)) : Promise.resolve({ data: [] as any[] }),
  ]);

  const nombreSerie: Record<number, string> = {};
  (seriesRows.data ?? []).forEach((s: any) => (nombreSerie[s.tmdb_id] = s.name));
  (episodeSeriesRows.data ?? []).forEach((s: any) => (nombreSerie[s.tmdb_id] = s.name));
  const nombrePelicula: Record<number, string> = {};
  (movieRows.data ?? []).forEach((m: any) => (nombrePelicula[m.tmdb_id] = m.title));
  const nombreGrupo: Record<string, string> = {};
  (groupRows.data ?? []).forEach((g: any) => (nombreGrupo[g.id] = g.name));

  for (const c of comentarios) {
    if (c.target_type === "series") {
      lugares[c.id] = t("En «{n}»").replace("{n}", nombreSerie[Number(c.target_id)] ?? t("una serie"));
    } else if (c.target_type === "movie") {
      lugares[c.id] = t("En «{n}»").replace("{n}", nombrePelicula[Number(c.target_id)] ?? t("una película"));
    } else if (c.target_type === "episode") {
      const [seriesTmdbId, season, episode] = c.target_id.split(":");
      lugares[c.id] = `${t("En «{n}»").replace("{n}", nombreSerie[Number(seriesTmdbId)] ?? t("una serie"))} — T${season}E${episode}`;
    } else if (c.target_type === "group") {
      lugares[c.id] = t("En el grupo «{n}»").replace("{n}", c.group_id ? nombreGrupo[c.group_id] ?? t("un grupo") : t("un grupo"));
    }
  }

  return lugares;
}

export { NIVEL_COLAPSO };
