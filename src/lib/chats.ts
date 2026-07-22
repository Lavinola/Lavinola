import { supabase } from "./supabase";

export interface ChatResumen {
  chatId: string;
  otroUserId: string;
  otroUsername: string | null;
  otroAvatarUrl: string | null;
  ultimoMensaje: string | null; // vista previa (texto, o "Te recomendó Fulano" si es un título)
  ultimoMensajeFecha: string | null;
  noLeidos: number;
  silenciado: boolean;
  bloqueado: boolean;
}

export interface MensajeChat {
  id: string;
  sender_id: string;
  kind: "text" | "shared_title";
  content: string | null;
  gif_url: string | null;
  item_type: "series" | "movie" | null;
  tmdb_id: number | null;
  season_number: number | null;
  episode_number: number | null;
  shared_group_id: string | null;
  shared_list_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted: boolean;
  reacciones: Record<string, number>;
  mi_reaccion: string | null;
}

export async function obtenerOCrearChat(otroUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc("obtener_o_crear_chat", { otro_usuario: otroUserId });
  if (error) throw error;
  return data as string;
}

/** Lista de chats del usuario, uno por persona, con el último mensaje y cuántos sin leer — para la pantalla de Chats. */
export async function listarChats(userId: string, t: (s: string) => string = (s) => s): Promise<ChatResumen[]> {
  const { data: chats, error } = await supabase
    .from("chats")
    .select("id, user_a, user_b, profiles_a:profiles!chats_user_a_fkey(id,username,avatar_url), profiles_b:profiles!chats_user_b_fkey(id,username,avatar_url)")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);
  if (error) throw error;
  if (!chats || chats.length === 0) return [];

  const chatIds = chats.map((c: any) => c.id);
  const [{ data: mensajes }, { data: lecturas }, { data: estados }, { data: bloqueos }] = await Promise.all([
    supabase.from("chat_messages").select("chat_id, sender_id, kind, content, item_type, created_at").in("chat_id", chatIds).order("created_at", { ascending: true }),
    supabase.from("chat_reads").select("chat_id, last_read_at").eq("user_id", userId),
    supabase.from("chat_user_state").select("chat_id, silenced_until, silenced_forever, cleared_at, hidden_at").eq("user_id", userId).in("chat_id", chatIds),
    supabase.from("chat_blocks").select("chat_id").in("chat_id", chatIds),
  ]);

  const lecturaPorChat: Record<string, string> = {};
  (lecturas ?? []).forEach((l: any) => (lecturaPorChat[l.chat_id] = l.last_read_at));

  const estadoPorChat: Record<string, any> = {};
  (estados ?? []).forEach((e: any) => (estadoPorChat[e.chat_id] = e));

  const bloqueadoSet = new Set((bloqueos ?? []).map((b: any) => b.chat_id));

  const mensajesPorChat: Record<string, any[]> = {};
  (mensajes ?? []).forEach((m: any) => {
    if (!mensajesPorChat[m.chat_id]) mensajesPorChat[m.chat_id] = [];
    mensajesPorChat[m.chat_id].push(m);
  });

  const resultado: ChatResumen[] = [];
  for (const c of chats as any[]) {
    const estado = estadoPorChat[c.id];
    // "Eliminar chat" oculta de la lista salvo que haya un mensaje nuevo posterior al momento de ocultarlo.
    let msjs = mensajesPorChat[c.id] ?? [];
    if (estado?.cleared_at) msjs = msjs.filter((m) => m.created_at > estado.cleared_at);
    if (estado?.hidden_at) {
      const hayNuevos = (mensajesPorChat[c.id] ?? []).some((m) => m.created_at > estado.hidden_at);
      if (!hayNuevos) continue;
    }

    const soyA = c.user_a === userId;
    const otro: any = soyA ? c.profiles_b : c.profiles_a;
    const ultimo = msjs[msjs.length - 1];
    const lecturaAt = lecturaPorChat[c.id];
    const noLeidos = msjs.filter((m) => m.sender_id !== userId && (!lecturaAt || m.created_at > lecturaAt)).length;
    const silenciado = !!estado && (estado.silenced_forever || (estado.silenced_until && new Date(estado.silenced_until).getTime() > Date.now()));

    resultado.push({
      chatId: c.id,
      otroUserId: otro?.id,
      otroUsername: otro?.username ?? null,
      otroAvatarUrl: otro?.avatar_url ?? null,
      ultimoMensaje: ultimo
        ? ultimo.kind === "shared_title"
          ? ultimo.sender_id === userId
            ? t("Recomendaste un título")
            : t("Te recomendó un título")
          : ultimo.sender_id === userId
          ? t("Enviaste un mensaje")
          : t("Te envió un mensaje")
        : null,
      ultimoMensajeFecha: ultimo?.created_at ?? null,
      noLeidos,
      silenciado,
      bloqueado: bloqueadoSet.has(c.id),
    });
  }

  resultado.sort((a, b) => (b.ultimoMensajeFecha ?? "").localeCompare(a.ultimoMensajeFecha ?? ""));
  return resultado;
}

/** Cuántos chats tienen al menos un mensaje sin leer (para el badge del botón "Chats"). */
export async function contarChatsConNoLeidos(userId: string): Promise<number> {
  const chats = await listarChats(userId);
  return chats.filter((c) => c.noLeidos > 0).length;
}

export async function cargarMensajesChat(chatId: string, userId?: string): Promise<MensajeChat[]> {
  let query = supabase
    .from("chat_messages")
    .select(
      "id, sender_id, kind, content, gif_url, item_type, tmdb_id, season_number, episode_number, shared_group_id, shared_list_id, created_at, edited_at, deleted"
    )
    .eq("chat_id", chatId);

  if (userId) {
    const { data: estado } = await supabase.from("chat_user_state").select("cleared_at").eq("chat_id", chatId).eq("user_id", userId).maybeSingle();
    if (estado?.cleared_at) query = query.gt("created_at", estado.cleared_at);
  }

  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;
  const mensajes = (data ?? []) as MensajeChat[];
  if (mensajes.length === 0) return [];

  const ids = mensajes.map((m) => m.id);
  const { data: reacciones } = await supabase.from("chat_message_reactions").select("message_id, user_id, emoji").in("message_id", ids);
  const porMensaje: Record<string, { conteo: Record<string, number>; mia: string | null }> = {};
  (reacciones ?? []).forEach((r: any) => {
    if (!porMensaje[r.message_id]) porMensaje[r.message_id] = { conteo: {}, mia: null };
    porMensaje[r.message_id].conteo[r.emoji] = (porMensaje[r.message_id].conteo[r.emoji] ?? 0) + 1;
    if (userId && r.user_id === userId) porMensaje[r.message_id].mia = r.emoji;
  });

  return mensajes.map((m) => ({
    ...m,
    reacciones: porMensaje[m.id]?.conteo ?? {},
    mi_reaccion: porMensaje[m.id]?.mia ?? null,
  }));
}

/** Reaccionar a un mensaje de chat (una reacción por usuario por mensaje; reaccionar de nuevo con otra carita la reemplaza). */
export async function reaccionarMensajeChat(mensajeId: string, userId: string, emoji: string) {
  const { error } = await supabase.from("chat_message_reactions").upsert({ message_id: mensajeId, user_id: userId, emoji }, { onConflict: "message_id,user_id" });
  if (error) throw error;
}

export async function quitarReaccionMensajeChat(mensajeId: string, userId: string) {
  await supabase.from("chat_message_reactions").delete().eq("message_id", mensajeId).eq("user_id", userId);
}

/** Editar un mensaje propio de texto — la política de la base ya rechaza esto pasada 1 hora de enviado. */
export async function editarMensajeChat(mensajeId: string, contenidoNuevo: string) {
  const { error } = await supabase
    .from("chat_messages")
    .update({ content: contenidoNuevo.slice(0, 500), edited_at: new Date().toISOString() })
    .eq("id", mensajeId);
  if (error) throw error;
}

/** Borrado suave: no se pierde la fila, se marca como eliminado y se limpia el contenido/gif. */
export async function eliminarMensajeChat(mensajeId: string) {
  const { error } = await supabase.from("chat_messages").update({ content: null, gif_url: null, deleted: true }).eq("id", mensajeId);
  if (error) throw error;
}

/** Desde cuándo leyó el OTRO usuario este chat (para las tildes de leído). */
export async function obtenerUltimaLecturaDelOtro(chatId: string, otroUserId: string): Promise<string | null> {
  const { data } = await supabase.from("chat_reads").select("last_read_at").eq("chat_id", chatId).eq("user_id", otroUserId).maybeSingle();
  return data?.last_read_at ?? null;
}

export async function enviarMensajeTexto(chatId: string, senderId: string, content: string, gifUrl?: string | null) {
  const { error } = await supabase.from("chat_messages").insert({
    chat_id: chatId,
    sender_id: senderId,
    kind: "text",
    content: content.slice(0, 500),
    gif_url: gifUrl || null,
  });
  if (error) throw error;
}

export async function enviarRecomendacionAUsuario(
  chatId: string,
  senderId: string,
  itemType: "series" | "movie" | "episode",
  tmdbId: number,
  nota?: string | null,
  seasonNumber?: number | null,
  episodeNumber?: number | null
) {
  const { error } = await supabase.from("chat_messages").insert({
    chat_id: chatId,
    sender_id: senderId,
    kind: "shared_title",
    content: nota?.trim() || null,
    item_type: itemType === "episode" ? "series" : itemType,
    tmdb_id: tmdbId,
    season_number: itemType === "episode" ? seasonNumber ?? null : null,
    episode_number: itemType === "episode" ? episodeNumber ?? null : null,
  });
  if (error) throw error;
}

export async function enviarRecomendacionDeGrupoAUsuario(chatId: string, senderId: string, groupId: string, nota?: string | null) {
  const { error } = await supabase.from("chat_messages").insert({
    chat_id: chatId,
    sender_id: senderId,
    kind: "shared_title",
    content: nota?.trim() || null,
    shared_group_id: groupId,
  });
  if (error) throw error;
}

export async function enviarRecomendacionDeListaAUsuario(chatId: string, senderId: string, listId: string, nota?: string | null) {
  const { error } = await supabase.from("chat_messages").insert({
    chat_id: chatId,
    sender_id: senderId,
    kind: "shared_title",
    content: nota?.trim() || null,
    shared_list_id: listId,
  });
  if (error) throw error;
}

export async function marcarChatLeido(chatId: string, userId: string) {
  await supabase.from("chat_reads").upsert({ chat_id: chatId, user_id: userId, last_read_at: new Date().toISOString() }, { onConflict: "chat_id,user_id" });
}

// ---------- Gestión del chat: silenciar / vaciar / eliminar / bloquear ----------

export async function silenciarChat(userId: string, chatId: string, duracion: "1dia" | "1semana" | "siempre") {
  const hasta =
    duracion === "1dia"
      ? new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
      : duracion === "1semana"
      ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString()
      : null;
  const { error } = await supabase
    .from("chat_user_state")
    .upsert({ user_id: userId, chat_id: chatId, silenced_until: hasta, silenced_forever: duracion === "siempre" }, { onConflict: "user_id,chat_id" });
  if (error) throw error;
}

export async function quitarSilencioChat(userId: string, chatId: string) {
  await supabase.from("chat_user_state").update({ silenced_until: null, silenced_forever: false }).eq("user_id", userId).eq("chat_id", chatId);
}

export async function vaciarChat(userId: string, chatId: string) {
  const ahora = new Date().toISOString();
  const { error } = await supabase.from("chat_user_state").upsert({ user_id: userId, chat_id: chatId, cleared_at: ahora }, { onConflict: "user_id,chat_id" });
  if (error) throw error;
}

export async function eliminarChat(userId: string, chatId: string) {
  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from("chat_user_state")
    .upsert({ user_id: userId, chat_id: chatId, cleared_at: ahora, hidden_at: ahora }, { onConflict: "user_id,chat_id" });
  if (error) throw error;
}

export async function bloquearChat(userId: string, chatId: string) {
  const { error } = await supabase.from("chat_blocks").insert({ chat_id: chatId, blocked_by: userId });
  if (error) throw error;
  // Se oculta de la lista de chats, pero SIN vaciar contenido — si se desbloquea, todo sigue ahí.
  await supabase.from("chat_user_state").upsert({ user_id: userId, chat_id: chatId, hidden_at: new Date().toISOString() }, { onConflict: "user_id,chat_id" });
}

export async function desbloquearChat(userId: string, chatId: string) {
  await supabase.from("chat_blocks").delete().eq("chat_id", chatId);
  await supabase.from("chat_user_state").update({ hidden_at: null }).eq("user_id", userId).eq("chat_id", chatId);
}

export async function estaChatBloqueado(chatId: string): Promise<boolean> {
  const { data } = await supabase.from("chat_blocks").select("chat_id").eq("chat_id", chatId).maybeSingle();
  return !!data;
}
