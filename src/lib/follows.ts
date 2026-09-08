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

/**
 * % de compatibilidad para una lista puntual de usuarios (no elige
 * candidatos ella misma, se le pasan) — se usa en las pantallas de
 * Siguiendo/Seguidores de tu propio perfil. Un solo viaje a la base sin
 * importar cuánta gente tengas en la lista.
 */
export async function obtenerCompatibilidadLote(userId: string, candidatoIds: string[]): Promise<Map<string, number>> {
  if (candidatoIds.length === 0) return new Map();
  const { data, error } = await supabase.rpc("calcular_compatibilidad_lote", { p_user_id: userId, p_candidatos: candidatoIds });
  if (error || !data) {
    console.error("Error calculando compatibilidad en lote:", error?.message);
    return new Map();
  }
  return new Map((data as any[]).map((r) => [r.id, r.compatibilidad]));
}

export interface UsuarioBasico {
  id: string;
  username: string | null;
  display_name?: string | null;
  avatar_url: string | null;
  siguiendo: boolean; // ¿el usuario actual lo sigue?
  solicitudPendiente?: boolean; // ¿le mandó una solicitud que todavía no le contestaron?
  followCreatedAt?: string; // cuándo se creó ESTE vínculo de follow (para ordenar "último agregado primero")
  compatibilidad?: number; // % de gustos en común (0-100) — solo viene poblado en la lista de "usuarios recomendados"
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
const CACHE_HORAS_RECOMENDADOS = 24;

/**
 * Calcula (en vivo, sin caché) hasta 10 candidatos con su % de
 * compatibilidad de gustos — es la parte pesada, por eso se guarda en
 * caché por separado en `listarUsuariosRecomendados` y NO se llama a
 * esto directo desde ningún lado más.
 *
 * Primero intenta la función de PostgreSQL (calcular_usuarios_recomendados,
 * hace todo en una sola consulta en vez de ~200 idas y vueltas por red).
 * Si por lo que sea falla (por ejemplo, si todavía no se corrió el
 * schema.sql actualizado en Supabase), cae en el cálculo de siempre en
 * JavaScript — más lento, pero no deja a nadie sin recomendaciones.
 */
async function calcularRecomendadosEnVivo(userId: string): Promise<{ id: string; compatibilidad: number }[]> {
  const { data, error } = await supabase.rpc("calcular_usuarios_recomendados", { p_user_id: userId });
  if (!error && data) {
    return (data as any[]).map((r) => ({ id: r.id, compatibilidad: r.compatibilidad }));
  }
  console.error("calcular_usuarios_recomendados (SQL) falló, usando el cálculo en JavaScript como respaldo:", error?.message);
  return calcularRecomendadosEnVivoJS(userId);
}

/** Versión en JavaScript (la original) — queda como respaldo si la función de PostgreSQL falla. */
async function calcularRecomendadosEnVivoJS(userId: string): Promise<{ id: string; compatibilidad: number }[]> {
  const [{ data: sigo }, { data: meSiguen }] = await Promise.all([
    supabase.from("follows").select("followee_id").eq("follower_id", userId),
    supabase.from("follows").select("follower_id").eq("followee_id", userId),
  ]);
  const sigoIds = (sigo ?? []).map((f: any) => f.followee_id);
  const seguidoresIds = (meSiguen ?? []).map((f: any) => f.follower_id);
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

  // Puntaje de orden: combina la señal social (normalizada a 0-100) con el
  // % de gustos en común, mitad y mitad — pero lo que se GUARDA/MUESTRA
  // como "compatibilidad" es el % de gustos solo, no este combinado.
  const maxSocial = Math.max(1, ...puntajeSocial.values());
  const puntajeOrden = new Map<string, number>();
  for (const id of poolCompat) {
    const social = ((puntajeSocial.get(id) ?? 0) / maxSocial) * 100;
    const compat = compatPorId.get(id) ?? 0;
    puntajeOrden.set(id, social * 0.5 + compat * 0.5);
  }

  let idsFinal = [...puntajeOrden.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

  // Si con todo esto no se llega a 10, se completa con los perfiles que
  // tienen más seguidores (en vez de los más recientes) — la idea es que
  // siempre haya 10 para mostrar, con la mejor opción disponible si no
  // hubo suficientes coincidencias reales. Estos no tienen % de
  // compatibilidad calculado (sería otras 8 consultas por cada uno sin
  // necesidad real) — quedan en 0.
  if (idsFinal.length < 10) {
    const { data: relleno } = await supabase.rpc("usuarios_mas_seguidos", {
      p_excluir: [...excluir, ...idsFinal],
      p_limite: 10 - idsFinal.length,
    });
    for (const r of relleno ?? []) {
      if (idsFinal.length >= 10) break;
      const id = (r as any).id as string;
      idsFinal.push(id);
      if (!compatPorId.has(id)) compatPorId.set(id, 0);
    }
  }

  idsFinal = idsFinal.slice(0, 10);
  return idsFinal.map((id) => ({ id, compatibilidad: Math.round(compatPorId.get(id) ?? 0) }));
}

/**
 * Usuarios recomendados con su % de compatibilidad. El cálculo pesado
 * (calcularRecomendadosEnVivo) se cachea 24hs en la tabla
 * recommended_users_cache — el estado de "Siguiendo"/"Solicitud
 * pendiente" y los datos de perfil (foto, nombre) se piden siempre en
 * vivo, nunca desde la caché, así el botón de Seguir nunca queda
 * desactualizado aunque la lista de candidatos sea de ayer.
 */
export async function listarUsuariosRecomendados(userId: string): Promise<UsuarioBasico[]> {
  const { data: cacheFila } = await supabase
    .from("recommended_users_cache")
    .select("candidatos, computed_at")
    .eq("user_id", userId)
    .maybeSingle();

  const cacheFresco = !!cacheFila && new Date(cacheFila.computed_at).getTime() > Date.now() - CACHE_HORAS_RECOMENDADOS * 60 * 60 * 1000;

  let candidatos: { id: string; compatibilidad: number }[];
  if (cacheFresco) {
    candidatos = cacheFila!.candidatos;
  } else {
    candidatos = await calcularRecomendadosEnVivo(userId);
    await supabase.from("recommended_users_cache").upsert({ user_id: userId, candidatos, computed_at: new Date().toISOString() });
  }

  if (candidatos.length === 0) return [];
  const ids = candidatos.map((c) => c.id);
  const excluirActual = new Set([userId]);

  const [{ data: perfiles }, { data: sigoAhora }, { data: solicitudesAhora }] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids),
    supabase.from("follows").select("followee_id").eq("follower_id", userId).in("followee_id", ids),
    supabase.from("follow_requests").select("target_id").eq("requester_id", userId).eq("status", "pending").in("target_id", ids),
  ]);
  const sigoAhoraSet = new Set((sigoAhora ?? []).map((f: any) => f.followee_id));
  const solicitudesAhoraSet = new Set((solicitudesAhora ?? []).map((s: any) => s.target_id));
  const compatPorId = new Map(candidatos.map((c) => [c.id, c.compatibilidad]));
  const perfilPorId = new Map((perfiles ?? []).map((p: any) => [p.id, p]));

  return ids
    .filter((id) => perfilPorId.has(id) && !sigoAhoraSet.has(id) && !excluirActual.has(id))
    .map((id) => {
      const p = perfilPorId.get(id);
      return {
        id,
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        siguiendo: false,
        solicitudPendiente: solicitudesAhoraSet.has(id),
        compatibilidad: compatPorId.get(id),
      };
    });
}
