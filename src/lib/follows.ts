import { supabase } from "./supabase";
import { calcularCompatibilidad } from "./favorites";

/** Usuarios con seguimiento mutuo (los seguís Y te siguen) — para elegir a quién recomendarle algo. */
export async function usuariosMutuos(userId: string): Promise<UsuarioBasico[]> {
  const [{ data: sigo }, { data: meSiguen }] = await Promise.all([
    supabase.from("follows").select("followee_id").eq("follower_id", userId),
    supabase.from("follows").select("follower_id").eq("followee_id", userId),
  ]);
  const sigoSet = new Set((sigo ?? []).map((f: any) => f.followee_id));
  const meSiguenSet = new Set((meSiguen ?? []).map((f: any) => f.follower_id));
  const mutuosIds = [...sigoSet].filter((id) => meSiguenSet.has(id));
  if (mutuosIds.length === 0) return [];

  const { data: perfiles } = await supabase.from("profiles").select("id, username, avatar_url").in("id", mutuosIds);
  return (perfiles ?? []).map((p: any) => ({ id: p.id, username: p.username, avatar_url: p.avatar_url, siguiendo: true }));
}

export interface UsuarioBasico {
  id: string;
  username: string | null;
  avatar_url: string | null;
  siguiendo: boolean; // ¿el usuario actual lo sigue?
  solicitudPendiente?: boolean; // ¿le mandó una solicitud que todavía no le contestaron?
  followCreatedAt?: string; // cuándo se creó ESTE vínculo de follow (para ordenar "último agregado primero")
}

/** Sigue a otro usuario (unidireccional, no requiere reciprocidad). */
export async function seguirUsuario(followerId: string, followeeId: string) {
  if (followerId === followeeId) return; // no te podés seguir a vos mismo
  const { error } = await supabase.from("follows").insert({ follower_id: followerId, followee_id: followeeId });
  if (error) throw error;
}

export async function dejarDeSeguir(followerId: string, followeeId: string) {
  await supabase.from("follows").delete().eq("follower_id", followerId).eq("followee_id", followeeId);
}

/** Busca usuarios por username, marcando si el usuario actual ya los sigue. */
export async function buscarUsuarios(query: string, currentUserId: string | null): Promise<UsuarioBasico[]> {
  const { data: perfiles, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .ilike("username", `%${query}%`)
    .limit(20);
  if (error) throw error;

  let siguiendoSet = new Set<string>();
  let solicitudesSet = new Set<string>();
  if (currentUserId) {
    const [{ data: follows }, { data: solicitudes }] = await Promise.all([
      supabase.from("follows").select("followee_id").eq("follower_id", currentUserId),
      supabase.from("follow_requests").select("target_id").eq("requester_id", currentUserId).eq("status", "pending"),
    ]);
    siguiendoSet = new Set((follows ?? []).map((f) => f.followee_id));
    solicitudesSet = new Set((solicitudes ?? []).map((s: any) => s.target_id));
  }

  return (perfiles ?? [])
    .filter((p) => p.id !== currentUserId)
    .map((p) => ({
      id: p.id,
      username: p.username,
      avatar_url: p.avatar_url,
      siguiendo: siguiendoSet.has(p.id),
      solicitudPendiente: solicitudesSet.has(p.id),
    }));
}

/** Usuarios que sigue userId (para elegir destinatario al "compartir título", o para la pantalla "Siguiendo"). El estado del botón (siguiendo/solicitud) es siempre relativo a quien está mirando (viewerId), no al dueño de la lista. */
export async function usuariosQueSigo(userId: string, viewerId: string | null = userId): Promise<UsuarioBasico[]> {
  const { data, error } = await supabase
    .from("follows")
    .select("followee_id, created_at, profiles!follows_followee_id_fkey(id, username, avatar_url)")
    .eq("follower_id", userId);
  if (error) throw error;

  let siguiendoSet = new Set<string>();
  let solicitudesSet = new Set<string>();
  if (viewerId) {
    const [{ data: follows }, { data: solicitudes }] = await Promise.all([
      supabase.from("follows").select("followee_id").eq("follower_id", viewerId),
      supabase.from("follow_requests").select("target_id").eq("requester_id", viewerId).eq("status", "pending"),
    ]);
    siguiendoSet = new Set((follows ?? []).map((f) => f.followee_id));
    solicitudesSet = new Set((solicitudes ?? []).map((s: any) => s.target_id));
  }

  return (data ?? []).map((f: any) => ({
    id: f.profiles.id,
    username: f.profiles.username,
    avatar_url: f.profiles.avatar_url,
    siguiendo: viewerId === userId ? true : siguiendoSet.has(f.profiles.id),
    solicitudPendiente: solicitudesSet.has(f.profiles.id),
    followCreatedAt: f.created_at,
  }));
}

/** Usuarios que siguen a userId (pantalla "Seguidores"). Igual que arriba, el botón refleja al viewer. */
export async function seguidoresDe(userId: string, viewerId: string | null): Promise<UsuarioBasico[]> {
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id, created_at, profiles!follows_follower_id_fkey(id, username, avatar_url)")
    .eq("followee_id", userId);
  if (error) throw error;

  let siguiendoSet = new Set<string>();
  let solicitudesSet = new Set<string>();
  if (viewerId) {
    const [{ data: follows }, { data: solicitudes }] = await Promise.all([
      supabase.from("follows").select("followee_id").eq("follower_id", viewerId),
      supabase.from("follow_requests").select("target_id").eq("requester_id", viewerId).eq("status", "pending"),
    ]);
    siguiendoSet = new Set((follows ?? []).map((f) => f.followee_id));
    solicitudesSet = new Set((solicitudes ?? []).map((s: any) => s.target_id));
  }

  return (data ?? []).map((f: any) => ({
    id: f.profiles.id,
    username: f.profiles.username,
    avatar_url: f.profiles.avatar_url,
    siguiendo: siguiendoSet.has(f.profiles.id),
    solicitudPendiente: solicitudesSet.has(f.profiles.id),
    followCreatedAt: f.created_at,
  }));
}

/**
 * Usuarios que le podrían interesar, para mostrar en el buscador global
 * antes de que escriba nada. Combina dos señales, sin explicarle al usuario
 * cuál aplicó en cada caso:
 *  1) Gente que sigue quienes él sigue (segundo grado), priorizado por
 *     cuántos de sus follows tienen en común.
 *  2) Compatibilidad de gustos alta (favoritos, vistos y calificaciones en
 *     común), sobre un puñado acotado de perfiles — calcularCompatibilidad
 *     hace varias consultas por par, así que no conviene correrla sobre
 *     todos los usuarios de la base, solo sobre una muestra chica.
 * Nunca incluye a quien ya sigue, ni a sí mismo.
 */
export async function listarUsuariosRecomendados(userId: string): Promise<UsuarioBasico[]> {
  const [{ data: sigo }, { data: solicitudes }] = await Promise.all([
    supabase.from("follows").select("followee_id").eq("follower_id", userId),
    supabase.from("follow_requests").select("target_id").eq("requester_id", userId).eq("status", "pending"),
  ]);
  const sigoIds = (sigo ?? []).map((f: any) => f.followee_id);
  const sigoSet = new Set(sigoIds);
  const solicitudesSet = new Set((solicitudes ?? []).map((s: any) => s.target_id));
  const excluir = new Set([userId, ...sigoIds]);

  const pesoPorId = new Map<string, number>();

  // Segundo grado: a quién sigue la gente que yo sigo.
  if (sigoIds.length > 0) {
    const { data: segundoGrado } = await supabase.from("follows").select("followee_id").in("follower_id", sigoIds);
    const conteo: Record<string, number> = {};
    (segundoGrado ?? []).forEach((f: any) => {
      if (excluir.has(f.followee_id)) return;
      conteo[f.followee_id] = (conteo[f.followee_id] ?? 0) + 1;
    });
    Object.entries(conteo)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .forEach(([id, veces]) => pesoPorId.set(id, 1000 + veces)); // prioridad alta sobre compatibilidad
  }

  // Compatibilidad de gustos, sobre una muestra chica de perfiles (evita decenas de consultas pesadas).
  const { data: candidatosPerfil } = await supabase
    .from("profiles")
    .select("id")
    .neq("id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  const candidatosIds = (candidatosPerfil ?? [])
    .map((p: any) => p.id as string)
    .filter((id: string) => !excluir.has(id) && !pesoPorId.has(id))
    .slice(0, 12);

  if (candidatosIds.length > 0) {
    const compatibilidades = await Promise.all(
      candidatosIds.map(async (id) => ({ id, score: await calcularCompatibilidad(userId, id) }))
    );
    compatibilidades
      .filter((c) => (c.score ?? 0) >= 40)
      .forEach((c) => pesoPorId.set(c.id, c.score ?? 0));
  }

  if (pesoPorId.size === 0) return [];

  const idsFinal = [...pesoPorId.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id]) => id);

  const { data: perfiles } = await supabase.from("profiles").select("id, username, avatar_url").in("id", idsFinal);
  const perfilPorId = new Map((perfiles ?? []).map((p: any) => [p.id, p]));

  return idsFinal
    .filter((id) => perfilPorId.has(id))
    .map((id) => {
      const p = perfilPorId.get(id);
      return {
        id,
        username: p.username,
        avatar_url: p.avatar_url,
        siguiendo: sigoSet.has(id),
        solicitudPendiente: solicitudesSet.has(id),
      };
    });
}
