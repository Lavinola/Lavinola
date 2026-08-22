import { supabase } from "./supabase";

export interface Notificacion {
  id: string;
  type: "like" | "reply" | "follow" | "follow_request" | "follow_accepted" | "shared_title" | "group_muted" | "group_removed" | "group_message" | "group_join_request" | "list_item_added" | "list_followed";
  actor_id: string | null;
  actor_username: string | null;
  actor_display_name: string | null;
  actor_avatar_url: string | null;
  target_type: string | null;
  target_id: string | null;
  comment_id: string | null;
  read: boolean;
  message?: string | null;
  created_at: string;
  solicitud_status?: "pending" | "accepted" | "rejected" | null;
  ya_lo_sigo?: boolean;
  solicitudEnviada?: boolean;
  // Si esta notificación representa VARIAS juntas (ej: 5 likes al mismo
  // comentario) — acá van los demás actores, además del principal (que ya
  // está en actor_username/actor_display_name). Ver agruparNotificaciones.
  actoresAgrupados?: { id: string | null; nombre: string }[];
  idsAgrupados?: string[];
}

export async function listarNotificaciones(userId: string): Promise<Notificacion[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, actor_id, target_type, target_id, comment_id, read, message, created_at, profiles!notifications_actor_id_fkey(username, avatar_url, display_name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const notis: Notificacion[] = (data ?? []).map((n: any) => ({
    id: n.id,
    type: n.type,
    actor_id: n.actor_id,
    actor_username: n.profiles?.username ?? null,
    actor_display_name: n.profiles?.display_name ?? null,
    actor_avatar_url: n.profiles?.avatar_url ?? null,
    target_type: n.target_type,
    target_id: n.target_id,
    comment_id: n.comment_id ?? null,
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

  return agruparNotificaciones(notis);
}

/** Trae una sola notificación por su id — la usa el toque de una notificación push, para navegar exactamente igual que si la hubieras tocado en la campanita. */
export async function obtenerNotificacion(notificationId: string): Promise<Notificacion | null> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, actor_id, target_type, target_id, comment_id, read, message, created_at, profiles!notifications_actor_id_fkey(username, avatar_url, display_name)")
    .eq("id", notificationId)
    .maybeSingle();
  if (error || !data) return null;
  const n: any = data;
  return {
    id: n.id,
    type: n.type,
    actor_id: n.actor_id,
    actor_username: n.profiles?.username ?? null,
    actor_display_name: n.profiles?.display_name ?? null,
    actor_avatar_url: n.profiles?.avatar_url ?? null,
    target_type: n.target_type,
    target_id: n.target_id,
    comment_id: n.comment_id ?? null,
    read: n.read,
    message: n.message ?? null,
    created_at: n.created_at,
  };
}

/**
 * Junta notificaciones de "like"/"follow" consecutivas (en el orden en que
 * ya vienen, de la más nueva a la más vieja) que apunten a lo mismo — así
 * "Juan reaccionó a tu comentario", "María reaccionó a tu comentario" y
 * "Pedro reaccionó a tu comentario" (si pasaron una cerca de la otra) se
 * ven como una sola fila: "Juan y 2 personas más reaccionaron a tu
 * comentario", en vez de una línea por cada una — así se siente la app
 * cuando tiene más uso real, en vez de sentirse "spameada".
 *
 * Deliberadamente NO se agrupan las respuestas ("reply") ni las
 * recomendaciones — cada una tiene contenido propio que vale la pena ver
 * por separado, a diferencia de un like o un follow, que es más "ruido"
 * cuando se repiten.
 */
function agruparNotificaciones(notis: Notificacion[]): Notificacion[] {
  const AGRUPABLES = new Set(["like", "follow"]);
  const resultado: Notificacion[] = [];
  let i = 0;
  while (i < notis.length) {
    const actual = notis[i];
    if (!AGRUPABLES.has(actual.type)) {
      resultado.push(actual);
      i++;
      continue;
    }
    let j = i + 1;
    while (
      j < notis.length &&
      notis[j].type === actual.type &&
      notis[j].target_type === actual.target_type &&
      notis[j].target_id === actual.target_id &&
      notis[j].comment_id === actual.comment_id
    ) {
      j++;
    }
    const grupo = notis.slice(i, j);
    if (grupo.length === 1) {
      resultado.push(actual);
    } else {
      resultado.push({
        ...actual, // la más nueva del grupo (created_at, avatar del actor principal, etc.)
        read: grupo.every((g) => g.read),
        actoresAgrupados: grupo.slice(1).map((g) => ({ id: g.actor_id, nombre: g.actor_display_name?.trim() || g.actor_username || "Alguien" })),
        idsAgrupados: grupo.map((g) => g.id),
      });
    }
    i = j;
  }
  return resultado;
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
  const nombre = n.actor_display_name?.trim() || n.actor_username || t("Alguien");
  const cantidadExtra = n.actoresAgrupados?.length ?? 0;
  switch (n.type) {
    case "like":
      if (cantidadExtra > 0) {
        return n.target_type === "post"
          ? t("{nombre} y {n} más reaccionaron a tu publicación").replace("{nombre}", nombre).replace("{n}", String(cantidadExtra))
          : t("{nombre} y {n} más reaccionaron a tu comentario").replace("{nombre}", nombre).replace("{n}", String(cantidadExtra));
      }
      return n.target_type === "post"
        ? t("{nombre} reaccionó a tu publicación").replace("{nombre}", nombre)
        : t("{nombre} reaccionó a tu comentario").replace("{nombre}", nombre);
    case "reply":
      return t("{nombre} respondió tu comentario").replace("{nombre}", nombre);
    case "follow":
      if (cantidadExtra > 0) {
        return t("{nombre} y {n} personas más empezaron a seguirte").replace("{nombre}", nombre).replace("{n}", String(cantidadExtra));
      }
      return t("{nombre} empezó a seguirte").replace("{nombre}", nombre);
    case "follow_request":
      return t("{nombre} quiere seguirte").replace("{nombre}", nombre);
    case "follow_accepted":
      return t("{nombre} aceptó tu solicitud de seguimiento").replace("{nombre}", nombre);
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
