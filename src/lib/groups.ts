import { supabase } from "./supabase";

export interface Grupo {
  id: string;
  name: string;
  photo_url: string | null;
  banner_url: string | null;
  description: string | null;
  creator_id: string | null;
  miembros: number;
  soyMiembro: boolean;
  created_at: string;
  comments_suspended_until: string | null;
  visibility: "public" | "private";
  ultimoMensaje?: string | null;
}

export type OrdenGrupos = "popularidad" | "alfabetico" | "fecha" | "ultimo_mensaje";

export async function crearGrupo(params: {
  creatorId: string;
  name: string;
  description: string | null;
  photoUrl: string | null;
  bannerUrl: string | null;
  photoSource: "tmdb" | "unsplash" | "upload";
  visibility?: "public" | "private";
}) {
  const { data, error } = await supabase
    .from("groups")
    .insert({
      creator_id: params.creatorId,
      name: params.name,
      description: params.description,
      photo_url: params.photoUrl,
      banner_url: params.bannerUrl,
      photo_source: params.photoSource,
      visibility: params.visibility ?? "public",
    })
    .select()
    .single();
  if (error) throw error;

  // El creador se une automáticamente
  await supabase.from("group_members").insert({ group_id: data.id, user_id: params.creatorId });
  return data;
}

function mapGrupo(g: any, userId: string | null): Grupo {
  return {
    id: g.id,
    name: g.name,
    photo_url: g.photo_url,
    banner_url: g.banner_url,
    description: g.description,
    creator_id: g.creator_id,
    miembros: g.group_members?.length ?? 0,
    soyMiembro: !!userId && g.group_members?.some((m: any) => m.user_id === userId),
    created_at: g.created_at,
    comments_suspended_until: g.comments_suspended_until,
    visibility: g.visibility ?? "public",
  };
}

const SELECT_GRUPO =
  "id, name, photo_url, banner_url, description, creator_id, created_at, comments_suspended_until, visibility, group_members(user_id)";

/** Todos los grupos existentes, con orden elegible. */
export async function listarGrupos(userId: string | null, orden: OrdenGrupos = "fecha", ascendente = false): Promise<Grupo[]> {
  const { data: grupos, error } = await supabase.from("groups").select(SELECT_GRUPO);
  if (error) throw error;

  let resultado = (grupos ?? []).map((g: any) => mapGrupo(g, userId));
  resultado = ordenarGrupos(resultado, orden, ascendente);
  return resultado;
}

/** Solo los grupos en los que el usuario está unido (sean de él o no). */
export async function listarMisGrupos(userId: string, orden: OrdenGrupos = "fecha", ascendente = false): Promise<Grupo[]> {
  const { data: miembroDe } = await supabase.from("group_members").select("group_id").eq("user_id", userId);
  const ids = (miembroDe ?? []).map((m: any) => m.group_id);
  if (ids.length === 0) return [];

  const { data: grupos, error } = await supabase.from("groups").select(SELECT_GRUPO).in("id", ids);
  if (error) throw error;

  let resultado = (grupos ?? []).map((g: any) => mapGrupo(g, userId));

  if (orden === "ultimo_mensaje") {
    const { data: comentarios } = await supabase
      .from("comentarios")
      .select("group_id, created_at")
      .eq("target_type", "group")
      .in("group_id", ids)
      .order("created_at", { ascending: false });
    const ultimoPorGrupo: Record<string, string> = {};
    (comentarios ?? []).forEach((c: any) => {
      if (!ultimoPorGrupo[c.group_id]) ultimoPorGrupo[c.group_id] = c.created_at;
    });
    resultado = resultado.map((g) => ({ ...g, ultimoMensaje: ultimoPorGrupo[g.id] ?? null }));
  }

  resultado = ordenarGrupos(resultado, orden, ascendente);
  return resultado;
}

/** Solo los grupos creados por el usuario (para el panel de administración). */
export async function listarGruposCreadosPor(userId: string): Promise<Grupo[]> {
  const { data: grupos, error } = await supabase.from("groups").select(SELECT_GRUPO).eq("creator_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return (grupos ?? []).map((g: any) => mapGrupo(g, userId));
}

function ordenarGrupos(lista: Grupo[], orden: OrdenGrupos, ascendente: boolean): Grupo[] {
  const ordenado = [...lista].sort((a, b) => {
    let cmp = 0;
    if (orden === "popularidad") cmp = a.miembros - b.miembros;
    else if (orden === "alfabetico") cmp = a.name.localeCompare(b.name);
    else if (orden === "fecha") cmp = a.created_at.localeCompare(b.created_at);
    else if (orden === "ultimo_mensaje") {
      const fa = a.ultimoMensaje ?? a.created_at;
      const fb = b.ultimoMensaje ?? b.created_at;
      cmp = fa.localeCompare(fb);
    }
    return ascendente ? cmp : -cmp;
  });
  return ordenado;
}

export async function buscarGrupos(query: string, userId: string | null): Promise<Grupo[]> {
  const { data: grupos, error } = await supabase.from("groups").select(SELECT_GRUPO).ilike("name", `%${query}%`).limit(30);
  if (error) throw error;
  return (grupos ?? []).map((g: any) => mapGrupo(g, userId));
}

export async function unirseAGrupo(groupId: string, userId: string) {
  await supabase.from("group_members").insert({ group_id: groupId, user_id: userId });
}

export async function salirDeGrupo(groupId: string, userId: string) {
  await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId);
}

export async function eliminarGrupo(groupId: string) {
  const { error } = await supabase.from("groups").delete().eq("id", groupId);
  if (error) throw new Error(`No se pudo eliminar el grupo (${error.message}).`);
}

export async function suspenderComentariosGrupo(groupId: string, hasta: string | null) {
  const { error } = await supabase.from("groups").update({ comments_suspended_until: hasta }).eq("id", groupId);
  if (error) throw new Error(`No se pudo actualizar el grupo (${error.message}).`);
}

// ---------- Grupos privados: solicitudes de ingreso ----------

export interface SolicitudGrupo {
  id: string;
  group_id: string;
  group_name: string;
  requester_id: string;
  requester_username: string | null;
  created_at: string;
}

export async function solicitarUnirseAGrupo(groupId: string, userId: string) {
  const { error } = await supabase.from("group_join_requests").upsert(
    { group_id: groupId, requester_id: userId, status: "pending", created_at: new Date().toISOString() },
    { onConflict: "group_id,requester_id" }
  );
  if (error) throw error;

  // Le avisamos al creador del grupo — una sola notificación por grupo, no
  // una por cada persona que pide entrar (si no, se le llena la campanita).
  try {
    const [{ data: grupo }, { data: solicitante }, { count: pendientes }] = await Promise.all([
      supabase.from("groups").select("name, creator_id").eq("id", groupId).maybeSingle(),
      supabase.from("profiles").select("username").eq("id", userId).maybeSingle(),
      supabase.from("group_join_requests").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("status", "pending"),
    ]);
    if (!grupo?.creator_id || grupo.creator_id === userId) return;

    const esVarios = (pendientes ?? 0) > 1;
    const mensaje = `${esVarios ? "VARIOS" : solicitante?.username ?? "Alguien"}|||${grupo.name}`;

    const { data: existente } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", grupo.creator_id)
      .eq("type", "group_join_request")
      .eq("target_id", groupId)
      .eq("read", false)
      .maybeSingle();

    if (existente) {
      await supabase.from("notifications").update({ message: mensaje, actor_id: userId, created_at: new Date().toISOString() }).eq("id", existente.id);
    } else {
      await supabase.from("notifications").insert({
        user_id: grupo.creator_id,
        type: "group_join_request",
        actor_id: userId,
        target_type: "group",
        target_id: groupId,
        message: mensaje,
      });
    }
  } catch (e) {
    console.error("Error al notificar solicitud de grupo:", e);
  }
}

export async function tengoSolicitudGrupoPendiente(groupId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("group_join_requests")
    .select("id")
    .eq("group_id", groupId)
    .eq("requester_id", userId)
    .eq("status", "pending")
    .maybeSingle();
  return !!data;
}

/** Solicitudes pendientes de TODOS los grupos que el usuario creó (para el panel de admin). */
export async function listarSolicitudesDeMisGrupos(userId: string): Promise<SolicitudGrupo[]> {
  const { data: misGrupos } = await supabase.from("groups").select("id").eq("creator_id", userId);
  const groupIds = (misGrupos ?? []).map((g: any) => g.id);
  if (groupIds.length === 0) return [];

  const { data, error } = await supabase
    .from("group_join_requests")
    .select("id, group_id, requester_id, created_at, groups(name), profiles!group_join_requests_requester_id_fkey(username)")
    .in("group_id", groupIds)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    id: r.id,
    group_id: r.group_id,
    group_name: r.groups?.name ?? "Grupo",
    requester_id: r.requester_id,
    requester_username: r.profiles?.username ?? null,
    created_at: r.created_at,
  }));
}

export async function aceptarSolicitudGrupo(requestId: string) {
  const { error } = await supabase.rpc("aceptar_solicitud_grupo", { p_request_id: requestId });
  if (error) throw error;
}

export async function rechazarSolicitudGrupo(requestId: string) {
  const { error } = await supabase.from("group_join_requests").update({ status: "rejected" }).eq("id", requestId);
  if (error) throw error;
}

export async function idsGruposDondeEstoyBaneado(userId: string): Promise<Set<string>> {
  const { data } = await supabase.from("group_bans").select("group_id").eq("user_id", userId);
  return new Set((data ?? []).map((r: any) => r.group_id));
}

export async function silenciarGrupo(userId: string, groupId: string, duracion: "1dia" | "1semana" | "siempre") {
  const hasta =
    duracion === "1dia"
      ? new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
      : duracion === "1semana"
      ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString()
      : null;
  const { error } = await supabase
    .from("group_silenced")
    .upsert({ user_id: userId, group_id: groupId, silenced_until: hasta, silenced_forever: duracion === "siempre" }, { onConflict: "user_id,group_id" });
  if (error) throw error;
}

export async function quitarSilencioGrupoLista(userId: string, groupId: string) {
  await supabase.from("group_silenced").delete().eq("user_id", userId).eq("group_id", groupId);
}

export async function idsGruposSilenciados(userId: string): Promise<Set<string>> {
  const { data } = await supabase.from("group_silenced").select("group_id, silenced_until, silenced_forever").eq("user_id", userId);
  const vigentes = (data ?? []).filter((s: any) => s.silenced_forever || (s.silenced_until && new Date(s.silenced_until).getTime() > Date.now()));
  return new Set(vigentes.map((s: any) => s.group_id));
}

export async function miEstadoEnGrupo(groupId: string, userId: string): Promise<{ baneado: boolean; silenciado: boolean }> {
  const [{ data: ban }, { data: mute }] = await Promise.all([
    supabase.from("group_bans").select("group_id").eq("group_id", groupId).eq("user_id", userId).maybeSingle(),
    supabase.from("group_mutes").select("muted_until").eq("group_id", groupId).eq("user_id", userId).maybeSingle(),
  ]);
  const silenciadoVigente = !!mute && (!mute.muted_until || new Date(mute.muted_until).getTime() > Date.now());
  return { baneado: !!ban, silenciado: silenciadoVigente };
}

// ---------- Lecturas de grupo (para el "circulito" de comentarios nuevos) ----------

export async function marcarGrupoLeido(groupId: string, userId: string) {
  await supabase.from("group_reads").upsert({ group_id: groupId, user_id: userId, last_read_at: new Date().toISOString() }, { onConflict: "group_id,user_id" });
}

/** Cuántos comentarios nuevos (de otros) hay en cada grupo desde la última vez que lo leíste. */
export async function contarComentariosNuevosPorGrupo(userId: string, groupIds: string[]): Promise<Record<string, number>> {
  if (groupIds.length === 0) return {};
  const [{ data: lecturas }, { data: comentarios }] = await Promise.all([
    supabase.from("group_reads").select("group_id, last_read_at").eq("user_id", userId).in("group_id", groupIds),
    supabase.from("comentarios").select("group_id, user_id, created_at").eq("target_type", "group").in("group_id", groupIds),
  ]);
  const lecturaPorGrupo: Record<string, string> = {};
  (lecturas ?? []).forEach((l: any) => (lecturaPorGrupo[l.group_id] = l.last_read_at));

  const conteo: Record<string, number> = {};
  for (const c of comentarios ?? []) {
    if (c.user_id === userId) continue;
    const lecturaAt = lecturaPorGrupo[c.group_id];
    if (!lecturaAt || c.created_at > lecturaAt) {
      conteo[c.group_id] = (conteo[c.group_id] ?? 0) + 1;
    }
  }
  return conteo;
}

/** Cuántos de MIS grupos tienen al menos un comentario nuevo sin leer (para el circulito del botón "Mis grupos"). */
export async function contarMisGruposConNoLeidos(userId: string): Promise<number> {
  const misGrupos = await listarMisGrupos(userId);
  const conteo = await contarComentariosNuevosPorGrupo(userId, misGrupos.map((g) => g.id));
  return Object.keys(conteo).filter((id) => conteo[id] > 0).length;
}
