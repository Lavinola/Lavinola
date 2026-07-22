import { supabase } from "./supabase";

export type DuracionSuspension = "1dia" | "1semana" | "1mes" | "1anio" | "para_siempre";

function calcularFechaHasta(duracion: DuracionSuspension): string {
  const ahora = new Date();
  switch (duracion) {
    case "1dia":
      ahora.setDate(ahora.getDate() + 1);
      break;
    case "1semana":
      ahora.setDate(ahora.getDate() + 7);
      break;
    case "1mes":
      ahora.setMonth(ahora.getMonth() + 1);
      break;
    case "1anio":
      ahora.setFullYear(ahora.getFullYear() + 1);
      break;
    case "para_siempre":
      ahora.setFullYear(ahora.getFullYear() + 100); // "para siempre" en la práctica
      break;
  }
  return ahora.toISOString();
}

const ETIQUETAS_DURACION: Record<DuracionSuspension, string> = {
  "1dia": "1 día",
  "1semana": "1 semana",
  "1mes": "1 mes",
  "1anio": "1 año",
  para_siempre: "siempre",
};

export async function suspenderUsuario(targetId: string, duracion: DuracionSuspension, motivo: string, adminId?: string, mensajeOpcional?: string | null) {
  await supabase
    .from("profiles")
    .update({ suspended_until: calcularFechaHasta(duracion), suspension_reason: motivo || null })
    .eq("id", targetId);

  // Le avisamos por chat, con el formato pedido.
  if (adminId) {
    try {
      const { obtenerOCrearChat, enviarMensajeTexto } = await import("./chats");
      const chatId = await obtenerOCrearChat(targetId);
      let texto = `Admin ha suspendido tus comentarios por ${ETIQUETAS_DURACION[duracion]}.`;
      if (mensajeOpcional?.trim()) texto += `\nCausa: ${mensajeOpcional.trim()}`;
      await enviarMensajeTexto(chatId, adminId, texto);
    } catch (e) {
      console.error("No se pudo avisar por chat de la suspensión:", e);
    }
  }
}

export async function revocarSuspension(targetId: string) {
  await supabase.from("profiles").update({ suspended_until: null, suspension_reason: null }).eq("id", targetId);
}

export async function estaSuspendido(targetId: string): Promise<{ suspendido: boolean; hasta: string | null; motivo: string | null }> {
  const { data } = await supabase.from("profiles").select("suspended_until, suspension_reason").eq("id", targetId).single();
  const hasta = data?.suspended_until ?? null;
  return {
    suspendido: !!hasta && new Date(hasta).getTime() > Date.now(),
    hasta,
    motivo: data?.suspension_reason ?? null,
  };
}

export async function convertirEnModerador(targetId: string) {
  const { error } = await supabase.from("profiles").update({ is_moderator: true }).eq("id", targetId);
  if (error) throw error;
}

export async function quitarModerador(targetId: string) {
  const { error } = await supabase.from("profiles").update({ is_moderator: false }).eq("id", targetId);
  if (error) throw error;
}

// ---------- Moderación dentro de un grupo: silenciar / expulsar ----------

export interface MiembroGrupo {
  id: string;
  username: string | null;
  avatar_url: string | null;
  silenciado_hasta: string | null; // null = no silenciado; string = fecha; "para_siempre" se guarda como fecha muy lejana igual que suspender cuenta
}

export async function listarMiembrosParaModerar(groupId: string): Promise<MiembroGrupo[]> {
  const [{ data: miembros }, { data: mutes }] = await Promise.all([
    supabase.from("group_members").select("profiles!group_members_user_id_fkey(id, username, avatar_url)").eq("group_id", groupId),
    supabase.from("group_mutes").select("user_id, muted_until").eq("group_id", groupId),
  ]);
  const muteMap: Record<string, string | null> = {};
  (mutes ?? []).forEach((m: any) => {
    const vigente = !m.muted_until || new Date(m.muted_until).getTime() > Date.now();
    if (vigente) muteMap[m.user_id] = m.muted_until;
  });
  return (miembros ?? [])
    .map((r: any) => r.profiles)
    .filter(Boolean)
    .map((p: any) => ({ id: p.id, username: p.username, avatar_url: p.avatar_url, silenciado_hasta: muteMap[p.id] ?? null }));
}

function calcularFechaSilencio(duracion: "1dia" | "1semana" | "indefinido"): string | null {
  if (duracion === "indefinido") return null;
  const ahora = new Date();
  if (duracion === "1dia") ahora.setDate(ahora.getDate() + 1);
  else ahora.setDate(ahora.getDate() + 7);
  return ahora.toISOString();
}

export async function silenciarUsuarioGrupo(
  groupId: string,
  groupName: string,
  adminId: string,
  userId: string,
  duracion: "1dia" | "1semana" | "indefinido",
  motivo: string | null
) {
  const hasta = calcularFechaSilencio(duracion);
  const { error } = await supabase.from("group_mutes").upsert({ group_id: groupId, user_id: userId, muted_until: hasta, reason: motivo });
  if (error) throw error;
  await supabase.from("notifications").insert({
    user_id: userId,
    type: "group_muted",
    actor_id: adminId,
    target_type: "group",
    target_id: groupId,
    message: motivo || null,
  });
}

export async function quitarSilencioGrupo(groupId: string, userId: string) {
  await supabase.from("group_mutes").delete().eq("group_id", groupId).eq("user_id", userId);
}

export async function expulsarUsuarioDeGrupo(
  groupId: string,
  groupName: string,
  esPrivado: boolean,
  adminId: string,
  userId: string,
  motivo: string | null
) {
  await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId);
  // También le limpiamos cualquier solicitud vieja, así si es un grupo privado puede volver a pedir entrar de cero.
  await supabase.from("group_join_requests").delete().eq("group_id", groupId).eq("requester_id", userId);

  if (!esPrivado) {
    // Grupo público: queda bloqueado para siempre (puede seguir viéndolo, pero no unirse ni comentar).
    const { error } = await supabase.from("group_bans").insert({ group_id: groupId, user_id: userId, reason: motivo });
    if (error) throw error;
  }

  await supabase.from("notifications").insert({
    user_id: userId,
    type: "group_removed",
    actor_id: adminId,
    target_type: "group",
    target_id: groupId,
    message: motivo || null,
  });
}

/** Elimina la cuenta de OTRO usuario (requiere ser admin — lo valida la Edge Function). */
export async function eliminarUsuarioComoAdmin(targetUserId: string): Promise<{ ok: boolean; motivo?: string }> {
  const { data } = await supabase.functions.invoke("admin-delete-user", { body: { targetUserId } });
  return data ?? { ok: false, motivo: "Sin respuesta del servidor." };
}
