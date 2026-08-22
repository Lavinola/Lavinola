import { supabase } from "./supabase";
import { Notificacion } from "./notificationsFeed";

/**
 * A dónde navegar según el target_type/target_id de un comentario (sirve
 * para "like" y "reply") — directo al hilo de comentarios, no a la
 * ficha. Si se pasa highlightCommentId, ese comentario puntual se
 * resalta y se muestra primero.
 */
async function navegarAComentario(targetType: string | null, targetId: string | null, navigation: any, highlightCommentId?: string | null) {
  if (!targetType || !targetId) return;

  if (targetType === "series" || targetType === "movie" || targetType === "episode" || targetType === "post") {
    navigation.navigate("Comentarios", { targetType, targetId, highlightCommentId: highlightCommentId ?? undefined });
  } else if (targetType === "group") {
    const { data } = await supabase.from("groups").select("name").eq("id", targetId).maybeSingle();
    navigation.navigate("DetalleGrupo", { groupId: targetId, groupName: data?.name ?? "Grupo", highlightCommentId: highlightCommentId ?? undefined });
  }
}

/**
 * Navega a lo que sea que una notificación puntual esté avisando — la
 * misma lógica sirve para cuando la tocás en la campanita, y para cuando
 * tocás la notificación push correspondiente (así las dos se comportan
 * siempre igual, en un solo lugar).
 */
export async function navegarSegunNotificacion(n: Notificacion, navigation: any) {
  if (n.type === "follow" || n.type === "follow_accepted") {
    if (n.actor_id) navigation.navigate("PerfilAjeno", { userId: n.actor_id });
    return;
  }

  if ((n.type === "group_muted" || n.type === "group_removed" || n.type === "group_message") && n.target_id) {
    const { data } = await supabase.from("groups").select("name").eq("id", n.target_id).maybeSingle();
    navigation.navigate("DetalleGrupo", { groupId: n.target_id, groupName: data?.name ?? "Grupo" });
    return;
  }

  if (n.type === "group_join_request") {
    navigation.navigate("AdminGrupos");
    return;
  }

  if (n.type === "shared_title" && n.target_id) {
    navigation.navigate("HiloActividad", { chatId: n.target_id, otroUsername: n.actor_username, otroUserId: n.actor_id });
    return;
  }

  if ((n.type === "list_item_added" || n.type === "list_followed") && n.target_id) {
    const { data } = await supabase.from("lists").select("title").eq("id", n.target_id).maybeSingle();
    navigation.navigate("DetalleLista", { listId: n.target_id, listTitle: data?.title ?? "Lista" });
    return;
  }

  if (n.type === "reply") {
    await navegarAComentario(n.target_type, n.target_id, navigation, n.comment_id);
    return;
  }

  if (n.type === "like" && n.target_type === "comment" && n.target_id) {
    const { data } = await supabase.from("comentarios").select("target_type, target_id").eq("id", n.target_id).maybeSingle();
    if (data) await navegarAComentario(data.target_type, data.target_id, navigation, n.comment_id ?? n.target_id);
    return;
  }

  if (n.type === "like" && n.target_type === "post" && n.target_id) {
    navigation.navigate("MisComentarios", { highlightPostId: n.target_id });
  }
}
