import { supabase } from "./supabase";

export type TargetReportable = "comment" | "group" | "user" | "shared_title" | "post" | "list";

export async function reportar(params: {
  reporterId: string;
  targetType: TargetReportable;
  targetId: string;
  reason: string;
  details?: string | null;
}) {
  const { error } = await supabase.from("reports").insert({
    reporter_id: params.reporterId,
    target_type: params.targetType,
    target_id: params.targetId,
    reason: params.reason,
    details: params.details?.trim() || null,
  });
  if (error) throw error;
}

export async function bloquearUsuario(blockerId: string, blockedId: string) {
  const { error } = await supabase.from("blocks").insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error) throw error;

  // Cortamos cualquier relación existente entre los dos, en cualquier dirección.
  await supabase.from("follows").delete().eq("follower_id", blockedId).eq("followee_id", blockerId);
  await supabase.from("follows").delete().eq("follower_id", blockerId).eq("followee_id", blockedId);
  await supabase.from("follow_requests").delete().eq("requester_id", blockedId).eq("target_id", blockerId);
  await supabase.from("follow_requests").delete().eq("requester_id", blockerId).eq("target_id", blockedId);
}

export async function desbloquearUsuario(blockerId: string, blockedId: string) {
  await supabase.from("blocks").delete().eq("blocker_id", blockerId).eq("blocked_id", blockedId);
}

export async function usuariosBloqueados(blockerId: string): Promise<string[]> {
  const { data } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", blockerId);
  return (data ?? []).map((b) => b.blocked_id);
}

export interface ReporteEnriquecido {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reporter_id: string;
  reporter_username: string | null;
  reportado_id: string | null;
  reportado_username: string | null;
  contenido: string | null;
}

/** Le agrega a una tanda de reportes crudos: quién es el "reportado" (según el tipo) y qué contenido mostrar, todo en un puñado de consultas en tanda. */
export async function enriquecerReportes(filas: any[]): Promise<ReporteEnriquecido[]> {
  if (filas.length === 0) return [];
  const idsComment = filas.filter((r) => r.target_type === "comment").map((r) => r.target_id);
  const idsPost = filas.filter((r) => r.target_type === "post").map((r) => r.target_id);
  const idsGroup = filas.filter((r) => r.target_type === "group").map((r) => r.target_id);
  const idsList = filas.filter((r) => r.target_type === "list").map((r) => r.target_id);

  const [{ data: comentarios }, { data: posts }, { data: grupos }, { data: listas }] = await Promise.all([
    idsComment.length ? supabase.from("comentarios").select("id, content, user_id").in("id", idsComment) : Promise.resolve({ data: [] as any[] }),
    idsPost.length ? supabase.from("posts").select("id, content, user_id").in("id", idsPost) : Promise.resolve({ data: [] as any[] }),
    idsGroup.length ? supabase.from("groups").select("id, name, creator_id").in("id", idsGroup) : Promise.resolve({ data: [] as any[] }),
    idsList.length ? supabase.from("lists").select("id, title, user_id").in("id", idsList) : Promise.resolve({ data: [] as any[] }),
  ]);
  const comentarioMap = new Map((comentarios ?? []).map((c: any) => [c.id, c]));
  const postMap = new Map((posts ?? []).map((p: any) => [p.id, p]));
  const grupoMap = new Map((grupos ?? []).map((g: any) => [g.id, g]));
  const listaMap = new Map((listas ?? []).map((l: any) => [l.id, l]));

  const previos: { reportadoId: string | null; contenido: string | null }[] = filas.map((r) => {
    if (r.target_type === "user") return { reportadoId: r.target_id, contenido: null };
    if (r.target_type === "comment") {
      const c = comentarioMap.get(r.target_id);
      return { reportadoId: c?.user_id ?? null, contenido: c ? c.content : "(comentario ya borrado)" };
    }
    if (r.target_type === "post") {
      const p = postMap.get(r.target_id);
      return { reportadoId: p?.user_id ?? null, contenido: p ? p.content : "(post ya borrado)" };
    }
    if (r.target_type === "group") {
      const g = grupoMap.get(r.target_id);
      return { reportadoId: g?.creator_id ?? null, contenido: g ? `Grupo: ${g.name}` : "(grupo ya borrado)" };
    }
    if (r.target_type === "list") {
      const l = listaMap.get(r.target_id);
      return { reportadoId: l?.user_id ?? null, contenido: l ? `Lista: ${l.title}` : "(lista ya borrada)" };
    }
    return { reportadoId: null, contenido: null };
  });

  const idsUsuarios = [...new Set([...filas.map((r) => r.reporter_id), ...previos.map((p) => p.reportadoId).filter(Boolean)])] as string[];
  const { data: perfiles } = idsUsuarios.length ? await supabase.from("profiles").select("id, username").in("id", idsUsuarios) : { data: [] as any[] };
  const usernameMap = new Map((perfiles ?? []).map((p: any) => [p.id, p.username]));

  return filas.map((r, i) => ({
    ...r,
    reporter_username: usernameMap.get(r.reporter_id) ?? null,
    reportado_id: previos[i].reportadoId,
    reportado_username: previos[i].reportadoId ? usernameMap.get(previos[i].reportadoId!) ?? null : null,
    contenido: previos[i].contenido,
  }));
}

/** Denuncias que hizo un usuario, de más nueva a más vieja. */
export async function denunciasHechasPor(userId: string): Promise<ReporteEnriquecido[]> {
  const { data } = await supabase.from("reports").select("*").eq("reporter_id", userId).order("created_at", { ascending: false });
  return enriquecerReportes(data ?? []);
}

/**
 * Denuncias que recibió un usuario, de más nueva a más vieja. Como
 * "reports" no guarda directamente "a quién" salvo cuando target_type es
 * 'user', para comentarios/posts/grupos/listas hay que resolverlo primero
 * y filtrar acá — por eso se pide una tanda generosa y se filtra después.
 */
export async function denunciasRecibidasPor(userId: string): Promise<ReporteEnriquecido[]> {
  const { data } = await supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(2000);
  const enriquecidas = await enriquecerReportes(data ?? []);
  return enriquecidas.filter((r) => r.reportado_id === userId);
}
