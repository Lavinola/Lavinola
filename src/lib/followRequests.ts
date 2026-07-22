import { supabase } from "./supabase";

/**
 * Sigue a alguien respetando la privacidad: si el perfil de destino es
 * privado, en vez de crear el follow directo se crea (o RE-crea) una
 * solicitud pendiente que el otro tiene que aceptar.
 *
 * OJO: usa upsert, no insert. Por qué: follow_requests tiene un unique
 * (requester_id, target_id) — si alguna vez hubo una solicitud entre este
 * par (aunque haya sido rechazada, o aceptada y después dejaste de
 * seguirlo), un insert común fallaba por "duplicate" y quedaba silenciado,
 * pero la fila vieja se quedaba con status 'rejected'/'accepted' en vez de
 * volver a 'pending' — entonces la solicitud "nueva" nunca aparecía en la
 * lista de Solicitudes del otro, y acá mismo el botón volvía a mostrar
 * "Seguir" en la próxima visita porque tengoSolicitudPendiente no la veía.
 */
export async function seguirRespetandoPrivacidad(followerId: string, targetId: string): Promise<"seguido" | "solicitado"> {
  const { data: perfilDestino } = await supabase.from("profiles").select("is_private").eq("id", targetId).single();

  if (perfilDestino?.is_private) {
    const { error } = await supabase
      .from("follow_requests")
      .upsert(
        { requester_id: followerId, target_id: targetId, status: "pending", created_at: new Date().toISOString() },
        { onConflict: "requester_id,target_id" }
      );
    if (error) throw error;
    return "solicitado";
  }

  const { error } = await supabase.from("follows").insert({ follower_id: followerId, followee_id: targetId });
  if (error) throw error;
  return "seguido";
}

export async function tengoSolicitudPendiente(requesterId: string, targetId: string): Promise<boolean> {
  const { data } = await supabase
    .from("follow_requests")
    .select("id")
    .eq("requester_id", requesterId)
    .eq("target_id", targetId)
    .eq("status", "pending")
    .maybeSingle();
  return !!data;
}

export interface SolicitudPendiente {
  id: string;
  requester_id: string;
  requester_username: string | null;
  created_at: string;
}

export async function listarSolicitudesPendientes(userId: string): Promise<SolicitudPendiente[]> {
  const { data, error } = await supabase
    .from("follow_requests")
    .select("id, requester_id, created_at, profiles!follow_requests_requester_id_fkey(username)")
    .eq("target_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    requester_id: r.requester_id,
    requester_username: r.profiles?.username ?? null,
    created_at: r.created_at,
  }));
}

export async function aceptarSolicitud(solicitud: SolicitudPendiente, targetId: string) {
  const { error } = await supabase.rpc("aceptar_solicitud_seguimiento", { p_requester_id: solicitud.requester_id });
  if (error) throw error;
}

export async function rechazarSolicitud(solicitudId: string) {
  await supabase.from("follow_requests").update({ status: "rejected" }).eq("id", solicitudId);
}

/** Igual que aceptarSolicitud/rechazarSolicitud, pero identificando la solicitud por el par requester+target en vez de su id de fila (útil desde Notificaciones). */
export async function aceptarSolicitudPorUsuarios(requesterId: string, targetId: string) {
  const { error } = await supabase.rpc("aceptar_solicitud_seguimiento", { p_requester_id: requesterId });
  if (error) throw error;
}

export async function rechazarSolicitudPorUsuarios(requesterId: string, targetId: string) {
  await supabase.from("follow_requests").update({ status: "rejected" }).eq("requester_id", requesterId).eq("target_id", targetId);
}
