import { supabase } from "./supabase";

export interface Notificacion {
  id: string;
  type: "like" | "reply" | "follow" | "follow_request" | "shared_title" | "group_muted" | "group_removed" | "group_message" | "group_join_request" | "list_item_added" | "list_followed";
  actor_id: string | null;
  actor_username: string | null;
  actor_avatar_url: string | null;
  target_type: string | null;
  target_id: string | null;
  read: boolean;
  message?: string | null;
  created_at: string;
  solicitud_status?: "pending" | "accepted" | "rejected" | null;
  ya_lo_sigo?: boolean;
  solicitudEnviada?: boolean;
}

export async function listarNotificaciones(userId: string): Promise<Notificacion[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, actor_id, target_type, target_id, read, message, created_at, profiles!notifications_actor_id_fkey(username, avatar_url)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const notis: Notificacion[] = (data ?? []).map((n: any) => ({
    id: n.id,
    type: n.type,
    actor_id: n.actor_id,
    actor_username: n.profiles?.username ?? null,
    actor_avatar_url: n.profiles?.avatar_url ?? null,
    target_type: n.target_type,
    target_id: n.target_id,
    read: n.read,
    message: n.message ?? null,
    created_at: n.created_at,
  }));

  const actorIdsFollowReq = [...new Set(notis.filter((n) => n.type === "follow_request" && n.actor_id).map((n) => n.actor_id as string))];
  if (actorIdsFollowReq.length > 0) {
    const [{ data: solicitudes }, { data: yaSigo }, { data: misSolicitudes }] = await Promise.all([
      supabase.from("follow_requests").select("requester_id, status").eq("target_id", userId).in("requester_id", actorIdsFollowReq),
      supabase.from("follows").select("followee_id").eq("follower_id", userId).in("followee_id", actorIdsFollowReq),
      supabase.from("follow_requests").select("target_id").eq("requester_id", userId).eq("status", "pending").in("target_id", actorIdsFollowReq),
    ]);
    const statusPorActor: Record<string, string> = {};
    (solicitudes ?? []).forEach((s: any) => (statusPorActor[s.requester_id] = s.status));
    const sigoSet = new Set((yaSigo ?? []).map((f: any) => f.followee_id));
    const miSolicitudSet = new Set((misSolicitudes ?? []).map((s: any) => s.target_id));
    for (const n of notis) {
      if (n.type === "follow_request" && n.actor_id) {
        n.solicitud_status = (statusPorActor[n.actor_id] as any) ?? null;
        n.ya_lo_sigo = sigoSet.has(n.actor_id);
        n.solicitudEnviada = miSolicitudSet.has(n.actor_id);
      }
    }
  }

  return notis;
}

export async function contarNoLeidas(userId: string): Promise<number> {
  const { count } = await supabase.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("read", false);
  return count ?? 0;
}

export async function marcarTodasLeidas(userId: string) {
  await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
}

/** Si entraste directo a un chat (sin pasar por la notificación), igual da por vistas las notificaciones de "te recomendó algo"/"te envió un mensaje" de ESE chat. */
export async function marcarNotificacionesDeChatComoLeidas(userId: string, chatId: string) {
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("target_type", "chat")
    .eq("target_id", chatId)
    .eq("read", false);
}

/** Igual que la de chat, pero para cuando entrás directo a un grupo sin pasar por la notificación. */
export async function marcarNotificacionesDeGrupoComoLeidas(userId: string, groupId: string) {
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("target_type", "group")
    .eq("target_id", groupId)
    .in("type", ["group_message", "group_muted", "group_removed"])
    .eq("read", false);
}

export function textoNotificacion(n: Notificacion, t: (s: string) => string = (s) => s): string {
  const nombre = n.actor_username ?? t("Alguien");
  switch (n.type) {
    case "like":
      return t("{nombre} le puso me gusta a tu comentario").replace("{nombre}", nombre);
    case "reply":
      return t("{nombre} respondió tu comentario").replace("{nombre}", nombre);
    case "follow":
      return t("{nombre} empezó a seguirte").replace("{nombre}", nombre);
    case "follow_request":
      return t("{nombre} quiere seguirte").replace("{nombre}", nombre);
    case "shared_title":
      if (n.message === "__MULTIPLE__") return t("{nombre} te envió mensajes").replace("{nombre}", nombre);
      return n.message
        ? t("{nombre} te recomendó {titulo}").replace("{nombre}", nombre).replace("{titulo}", n.message)
        : t("{nombre} te envió un mensaje").replace("{nombre}", nombre);
    case "group_muted":
      return n.message ? t("Fuiste silenciado en un grupo: {motivo}").replace("{motivo}", n.message) : t("Fuiste silenciado en un grupo");
    case "group_removed":
      return n.message ? t("Fuiste eliminado de un grupo: {motivo}").replace("{motivo}", n.message) : t("Fuiste eliminado de un grupo");
    case "group_message":
      return t("Hay comentarios nuevos en un grupo");
    case "group_join_request": {
      if (!n.message) return t("Alguien quiere unirse a tu grupo");
      const [quien, nombreGrupo] = n.message.split("|||");
      return quien === "VARIOS"
        ? t('Varios usuarios quieren unirse a "{grupo}"').replace("{grupo}", nombreGrupo ?? "")
        : t('{nombre} quiere unirse a "{grupo}"').replace("{nombre}", quien).replace("{grupo}", nombreGrupo ?? "");
    }
    case "list_item_added": {
      if (!n.message) return t("Hay títulos nuevos en una lista que seguís");
      const [tipo, tituloOLista, nombreLista] = n.message.split("|||");
      return tipo === "VARIOS"
        ? t('{nombre} agregó varios títulos a la lista "{lista}"').replace("{nombre}", nombre).replace("{lista}", tituloOLista ?? "")
        : t('{nombre} agregó {titulo} a la lista "{lista}"').replace("{nombre}", nombre).replace("{titulo}", tituloOLista ?? "").replace("{lista}", nombreLista ?? "");
    }
    case "list_followed":
      return t('{nombre} sigue tu lista "{lista}"').replace("{nombre}", nombre).replace("{lista}", n.message ?? "");
    default:
      return t("Tenés una notificación nueva");
  }
}
