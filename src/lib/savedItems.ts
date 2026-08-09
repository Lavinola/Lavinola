import { supabase } from "./supabase";

export type TipoGuardable = "post" | "comment";

export async function guardarItem(userId: string, targetType: TipoGuardable, targetId: string) {
  const { error } = await supabase.from("saved_items").insert({ user_id: userId, target_type: targetType, target_id: targetId });
  if (error) throw error;
}

export async function quitarGuardado(userId: string, targetType: TipoGuardable, targetId: string) {
  const { error } = await supabase.from("saved_items").delete().eq("user_id", userId).eq("target_type", targetType).eq("target_id", targetId);
  if (error) throw error;
}

/** Para marcar en bloque, sobre una tanda de posts o comentarios, cuáles ya tenés guardados (evita 1 consulta por fila). */
export async function idsGuardadosDe(userId: string | null, targetType: TipoGuardable, ids: string[]): Promise<Set<string>> {
  if (!userId || ids.length === 0) return new Set();
  const { data } = await supabase.from("saved_items").select("target_id").eq("user_id", userId).eq("target_type", targetType).in("target_id", ids);
  return new Set((data ?? []).map((r: any) => r.target_id));
}

export interface ItemGuardado {
  savedId: string;
  savedAt: string;
  kind: TipoGuardable;
  post?: import("./posts").Post;
  comentario?: import("./comments").Comentario;
}

/** Todo lo que guardaste (posts y comentarios mezclados), lo más reciente guardado primero. */
export async function listarGuardados(userId: string): Promise<ItemGuardado[]> {
  const { data: guardados, error } = await supabase
    .from("saved_items")
    .select("id, target_type, target_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!guardados || guardados.length === 0) return [];

  const postIds = guardados.filter((g) => g.target_type === "post").map((g) => g.target_id);
  const commentIds = guardados.filter((g) => g.target_type === "comment").map((g) => g.target_id);

  const { obtenerPostsPorIds } = await import("./posts");
  const { obtenerComentariosPorIds } = await import("./comments");

  const [posts, comentarios] = await Promise.all([
    postIds.length ? obtenerPostsPorIds(postIds, userId) : Promise.resolve([]),
    commentIds.length ? obtenerComentariosPorIds(commentIds, userId) : Promise.resolve([]),
  ]);
  const postsPorId = new Map(posts.map((p) => [p.id, p]));
  const comentariosPorId = new Map(comentarios.map((c) => [c.id, c]));

  return guardados
    .map((g): ItemGuardado | null => {
      if (g.target_type === "post") {
        const post = postsPorId.get(g.target_id);
        if (!post) return null; // se borró el post original
        return { savedId: g.id, savedAt: g.created_at, kind: "post", post };
      }
      const comentario = comentariosPorId.get(g.target_id);
      if (!comentario) return null; // se borró el comentario original
      return { savedId: g.id, savedAt: g.created_at, kind: "comment", comentario };
    })
    .filter((x): x is ItemGuardado => x !== null);
}
