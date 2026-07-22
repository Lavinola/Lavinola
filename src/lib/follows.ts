import { supabase } from "./supabase";

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
    .select("followee_id, profiles!follows_followee_id_fkey(id, username, avatar_url)")
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
  }));
}

/** Usuarios que siguen a userId (pantalla "Seguidores"). Igual que arriba, el botón refleja al viewer. */
export async function seguidoresDe(userId: string, viewerId: string | null): Promise<UsuarioBasico[]> {
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id, profiles!follows_follower_id_fkey(id, username, avatar_url)")
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
  }));
}
