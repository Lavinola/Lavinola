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
  display_name?: string | null;
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
    .select("followee_id, created_at, profiles!follows_followee_id_fkey(id, username, avatar_url, display_name)")
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
    display_name: f.profiles.display_name,
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
    .select("follower_id, created_at, profiles!follows_follower_id_fkey(id, username, avatar_url, display_name)")
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
    display_name: f.profiles.display_name,
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
/**
 * Recomienda siempre (hasta) 10 usuarios, combinando tres señales:
 * - Siguiendo en común: gente que sigue a las mismas cuentas que yo sigo.
 * - Seguidores en común: gente que mis propios seguidores también siguen.
 * - % de gustos en común (calcularCompatibilidad).
 * No se expone en ningún lado el motivo de cada recomendación — a
 * propósito, para que la lista se vea simple, sin justificaciones.
 */
export async function listarUsuariosRecomendados(userId: string): Promise<UsuarioBasico[]> {
  const [{ data: sigo }, { data: meSiguen }, { data: solicitudes }] = await Promise.all([
    supabase.from("follows").select("followee_id").eq("follower_id", userId),
    supabase.from("follows").select("follower_id").eq("followee_id", userId),
    supabase.from("follow_requests").select("target_id").eq("requester_id", userId).eq("status", "pending"),
  ]);
  const sigoIds = (sigo ?? []).map((f: any) => f.followee_id);
  const seguidoresIds = (meSiguen ?? []).map((f: any) => f.follower_id);
  const sigoSet = new Set(sigoIds);
  const solicitudesSet = new Set((solicitudes ?? []).map((s: any) => s.target_id));
  const excluir = new Set([userId, ...sigoIds]);

  const puntajeSocial = new Map<string, number>();

  // Siguiendo en común: quién sigue a las mismas cuentas que yo.
  if (sigoIds.length > 0) {
    const { data } = await supabase.from("follows").select("follower_id").in("followee_id", sigoIds);
    (data ?? []).forEach((f: any) => {
      if (excluir.has(f.follower_id)) return;
      puntajeSocial.set(f.follower_id, (puntajeSocial.get(f.follower_id) ?? 0) + 1);
    });
  }

  // Seguidores en común: a quién siguen mis propios seguidores.
  if (seguidoresIds.length > 0) {
    const { data } = await supabase.from("follows").select("followee_id").in("follower_id", seguidoresIds);
    (data ?? []).forEach((f: any) => {
      if (excluir.has(f.followee_id)) return;
      puntajeSocial.set(f.followee_id, (puntajeSocial.get(f.followee_id) ?? 0) + 1);
    });
  }

  const candidatosSociales = [...puntajeSocial.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id]) => id);

  // Para calcular % de gustos hace falta un puñado de candidatos — si la
  // parte social no alcanzó a juntar suficientes, se completa con
  // perfiles recientes.
  let poolCompat = candidatosSociales;
  if (poolCompat.length < 15) {
    const { data: candidatosPerfil } = await supabase
      .from("profiles")
      .select("id")
      .neq("id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    const extra = (candidatosPerfil ?? [])
      .map((p: any) => p.id as string)
      .filter((id: string) => !excluir.has(id) && !poolCompat.includes(id));
    poolCompat = [...poolCompat, ...extra].slice(0, 25);
  }

  const compatibilidades = await Promise.all(poolCompat.map(async (id) => ({ id, compat: (await calcularCompatibilidad(userId, id)) ?? 0 })));
  const compatPorId = new Map(compatibilidades.map((c) => [c.id, c.compat]));

  // Puntaje final: combina la señal social (normalizada a 0-100) con el %
  // de gustos en común, mitad y mitad.
  const maxSocial = Math.max(1, ...puntajeSocial.values());
  const puntajeFinal = new Map<string, number>();
  for (const id of poolCompat) {
    const social = ((puntajeSocial.get(id) ?? 0) / maxSocial) * 100;
    const compat = compatPorId.get(id) ?? 0;
    puntajeFinal.set(id, social * 0.5 + compat * 0.5);
  }

  let idsFinal = [...puntajeFinal.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

  // Si con todo esto no se llega a 10, se completa con los perfiles que
  // tienen más seguidores (en vez de los más recientes) — la idea es que
  // siempre haya 10 para mostrar, con la mejor opción disponible si no
  // hubo suficientes coincidencias reales.
  if (idsFinal.length < 10) {
    const { data: relleno } = await supabase.rpc("usuarios_mas_seguidos", {
      p_excluir: [...excluir, ...idsFinal],
      p_limite: 10 - idsFinal.length,
    });
    for (const r of relleno ?? []) {
      if (idsFinal.length >= 10) break;
      idsFinal.push((r as any).id as string);
    }
  }

  idsFinal = idsFinal.slice(0, 10);
  if (idsFinal.length === 0) return [];

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
