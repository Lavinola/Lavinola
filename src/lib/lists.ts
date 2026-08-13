import { supabase } from "./supabase";
import { posterUrl } from "./tmdb";

export type VisibilidadLista = "private" | "followers" | "public";

export const ETIQUETAS_VISIBILIDAD: Record<VisibilidadLista, string> = {
  private: "Solo yo",
  followers: "Usuarios que te siguen",
  public: "Todos los usuarios",
};

export interface Lista {
  id: string;
  title: string;
  description: string | null;
  visibility: VisibilidadLista;
  cantidad: number;
  user_id?: string;
  autor_username?: string | null;
  autor_display_name?: string | null;
  seguidores?: number;
  portadas?: string[]; // poster_path de algunos títulos de la lista, para la previsualización
  silenciada?: boolean; // solo tiene sentido en "listas que sigo": si no te avisa cuando el creador agrega títulos
  mute_new_followers?: boolean; // solo tiene sentido en "mis listas": si no te avisa cuando alguien te empieza a seguir
  created_at?: string; // fecha de creación de la lista — para ordenar "mis listas"
  followed_at?: string; // fecha en la que empezaste a seguirla — para ordenar "listas que sigo"
  siguiendo?: boolean; // ¿el usuario que está mirando ya sigue esta lista?
}

/**
 * Completa cantidad de seguidores y tapas de previsualización para un lote
 * de listas — todo en un puñado de consultas en tanda (no una por lista).
 */
export async function enriquecerListas(listas: Lista[]): Promise<Lista[]> {
  if (listas.length === 0) return listas;
  const ids = listas.map((l) => l.id);

  const [{ data: follows }, { data: items }] = await Promise.all([
    supabase.from("list_follows").select("list_id").in("list_id", ids),
    supabase.from("list_items").select("list_id, item_type, tmdb_id").in("list_id", ids).order("added_at", { ascending: false }),
  ]);

  const seguidoresPorLista: Record<string, number> = {};
  (follows ?? []).forEach((f: any) => {
    seguidoresPorLista[f.list_id] = (seguidoresPorLista[f.list_id] ?? 0) + 1;
  });

  // Hasta 7 títulos por lista para la previsualización (ya vienen ordenados
  // por más recientes primero).
  const itemsPorLista: Record<string, { item_type: string; tmdb_id: number }[]> = {};
  (items ?? []).forEach((it: any) => {
    if (!itemsPorLista[it.list_id]) itemsPorLista[it.list_id] = [];
    if (itemsPorLista[it.list_id].length < 7) itemsPorLista[it.list_id].push(it);
  });

  const idsSeries = [...new Set(Object.values(itemsPorLista).flat().filter((i) => i.item_type === "series").map((i) => i.tmdb_id))];
  const idsMovies = [...new Set(Object.values(itemsPorLista).flat().filter((i) => i.item_type === "movie").map((i) => i.tmdb_id))];

  const [seriesCache, moviesCache] = await Promise.all([
    idsSeries.length > 0 ? supabase.from("series_cache").select("tmdb_id, poster_path").in("tmdb_id", idsSeries) : Promise.resolve({ data: [] }),
    idsMovies.length > 0 ? supabase.from("movies_cache").select("tmdb_id, poster_path").in("tmdb_id", idsMovies) : Promise.resolve({ data: [] }),
  ]);
  const posterSeries = new Map((seriesCache.data ?? []).map((r: any) => [r.tmdb_id, r.poster_path]));
  const posterMovies = new Map((moviesCache.data ?? []).map((r: any) => [r.tmdb_id, r.poster_path]));

  return listas.map((l) => ({
    ...l,
    seguidores: seguidoresPorLista[l.id] ?? 0,
    portadas: (itemsPorLista[l.id] ?? [])
      .map((it) => (it.item_type === "series" ? posterSeries.get(it.tmdb_id) : posterMovies.get(it.tmdb_id)))
      .filter((p): p is string => !!p),
  }));
}

export async function crearLista(userId: string, title: string, visibility: VisibilidadLista, description?: string | null) {
  const { data, error } = await supabase.from("lists").insert({ user_id: userId, title, visibility, description: description || null }).select().single();
  if (error) throw error;
  return data;
}

export async function cambiarVisibilidadLista(listId: string, visibility: VisibilidadLista) {
  const { error } = await supabase.from("lists").update({ visibility }).eq("id", listId);
  if (error) throw error;
}

export async function actualizarDescripcionLista(listId: string, description: string | null) {
  const { error } = await supabase.from("lists").update({ description }).eq("id", listId);
  if (error) throw error;
}

export async function borrarLista(listId: string) {
  const { error } = await supabase.from("lists").delete().eq("id", listId);
  if (error) throw error;
}

/** Las listas que creaste vos. */
export async function listarMisListas(userId: string): Promise<Lista[]> {
  const { data, error } = await supabase
    .from("lists")
    .select("id, title, description, visibility, mute_new_followers, created_at, list_items(count)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    id: l.id,
    title: l.title,
    description: l.description ?? null,
    visibility: l.visibility,
    cantidad: l.list_items?.[0]?.count ?? 0,
    mute_new_followers: l.mute_new_followers ?? false,
    created_at: l.created_at,
  }));
}

/** Las listas de otro usuario que la RLS te deja ver (públicas, o "seguidores" si lo seguís). */
export async function listarListasDeUsuario(targetUserId: string): Promise<Lista[]> {
  const { data, error } = await supabase
    .from("lists")
    .select("id, title, description, visibility, user_id, list_items(count)")
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((l: any) => ({ id: l.id, title: l.title, description: l.description ?? null, visibility: l.visibility, user_id: l.user_id, cantidad: l.list_items?.[0]?.count ?? 0 }));
}

/** Las listas de otra gente que decidiste seguir. */
export async function listarListasQueSigo(userId: string): Promise<Lista[]> {
  const { data, error } = await supabase
    .from("list_follows")
    .select("muted, created_at, lists!list_follows_list_id_fkey(id, title, description, visibility, user_id, list_items(count), profiles!lists_user_id_fkey(username, display_name))")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? [])
    .filter((r: any) => r.lists)
    .map((r: any) => ({
      id: r.lists.id,
      title: r.lists.title,
      description: r.lists.description ?? null,
      visibility: r.lists.visibility,
      user_id: r.lists.user_id,
      cantidad: r.lists.list_items?.[0]?.count ?? 0,
      autor_username: r.lists.profiles?.username ?? null,
      autor_display_name: r.lists.profiles?.display_name ?? null,
      silenciada: r.muted ?? false,
      followed_at: r.created_at,
    }));
}

/** Las listas de un usuario (las que la RLS te deja ver), ordenadas por cantidad de seguidores de mayor a menor, con tapas de previsualización ya resueltas. */
export async function listarListasDeUsuarioOrdenadasPorSeguidores(targetUserId: string): Promise<Lista[]> {
  const listas = await listarListasDeUsuario(targetUserId);
  const enriquecidas = await enriquecerListas(listas);
  return enriquecidas.sort((a, b) => (b.seguidores ?? 0) - (a.seguidores ?? 0));
}

export async function sigoLista(userId: string, listId: string): Promise<boolean> {
  const { data } = await supabase.from("list_follows").select("list_id").eq("user_id", userId).eq("list_id", listId).maybeSingle();
  return !!data;
}

export async function seguirLista(userId: string, listId: string) {
  const { error } = await supabase.from("list_follows").insert({ user_id: userId, list_id: listId });
  if (error) throw error;

  // Avisarle al dueño de la lista, salvo que la haya silenciado o que sea su propia lista.
  const { data: lista } = await supabase.from("lists").select("user_id, title, mute_new_followers").eq("id", listId).maybeSingle();
  if (lista && lista.user_id !== userId && !lista.mute_new_followers) {
    await supabase.from("notifications").insert({
      user_id: lista.user_id,
      type: "list_followed",
      actor_id: userId,
      target_type: "list",
      target_id: listId,
      message: lista.title,
    });
  }
}

export async function dejarDeSeguirLista(userId: string, listId: string) {
  await supabase.from("list_follows").delete().eq("user_id", userId).eq("list_id", listId);
}

/** Silenciar/des-silenciar una lista que seguís — si está silenciada, no te avisa cuando el creador agrega títulos. */
export async function silenciarListaSeguida(userId: string, listId: string, muted: boolean) {
  const { error } = await supabase.from("list_follows").update({ muted }).eq("user_id", userId).eq("list_id", listId);
  if (error) throw error;
}

/** Silenciar/des-silenciar los avisos de "alguien empezó a seguir tu lista", para una lista tuya. */
export async function silenciarNuevosSeguidoresLista(listId: string, mute: boolean) {
  const { error } = await supabase.from("lists").update({ mute_new_followers: mute }).eq("id", listId);
  if (error) throw error;
}

/**
 * Avisa a los seguidores NO silenciados de una lista que se agregaron
 * títulos nuevos. Si fue uno solo, dice cuál; si fueron varios, dice
 * "varios títulos" (para no mandar un aviso por cada uno si agregaste
 * varios de una).
 */
export async function notificarAgregadoALista(listId: string, itemsAgregados: { nombre: string }[]) {
  if (itemsAgregados.length === 0) return;

  const { data: lista } = await supabase.from("lists").select("user_id, title").eq("id", listId).maybeSingle();
  if (!lista) return;

  const { data: seguidores } = await supabase.from("list_follows").select("user_id").eq("list_id", listId).eq("muted", false);
  const destinatarios = (seguidores ?? []).map((s: any) => s.user_id).filter((uid: string) => uid !== lista.user_id);
  if (destinatarios.length === 0) return;

  const message =
    itemsAgregados.length === 1
      ? `UNO|||${itemsAgregados[0].nombre}|||${lista.title}`
      : `VARIOS|||${lista.title}`;

  await supabase.from("notifications").insert(
    destinatarios.map((uid: string) => ({
      user_id: uid,
      type: "list_item_added",
      actor_id: lista.user_id,
      target_type: "list",
      target_id: listId,
      message,
    }))
  );
}

/** Hasta 5 tapas de una lista (en el orden en que se agregaron), para mostrar una previsualización — usado en el chat al recomendar una lista. */
export async function obtenerPortadasDeLista(listId: string): Promise<(string | null)[]> {
  const { data: itemsRows } = await supabase
    .from("list_items")
    .select("item_type, tmdb_id")
    .eq("list_id", listId)
    .order("added_at", { ascending: true })
    .limit(5);
  const items = itemsRows ?? [];
  const idsSeries = items.filter((i) => i.item_type === "series").map((i) => i.tmdb_id);
  const idsMovies = items.filter((i) => i.item_type === "movie").map((i) => i.tmdb_id);
  const [{ data: series }, { data: movies }] = await Promise.all([
    idsSeries.length ? supabase.from("series_cache").select("tmdb_id, poster_path").in("tmdb_id", idsSeries) : Promise.resolve({ data: [] as any[] }),
    idsMovies.length ? supabase.from("movies_cache").select("tmdb_id, poster_path").in("tmdb_id", idsMovies) : Promise.resolve({ data: [] as any[] }),
  ]);
  const posterSerie: Record<number, string | null> = {};
  (series ?? []).forEach((s: any) => (posterSerie[s.tmdb_id] = s.poster_path));
  const posterMovie: Record<number, string | null> = {};
  (movies ?? []).forEach((m: any) => (posterMovie[m.tmdb_id] = m.poster_path));
  return items.map((it) => (it.item_type === "series" ? posterSerie[it.tmdb_id] ?? null : posterMovie[it.tmdb_id] ?? null));
}

/**
 * Todas las listas (de cualquier usuario) que incluyen este título — la
 * visibilidad ya la resuelve sola la política de RLS de `list_items`
 * (públicas, o de "solo seguidores" si vos seguís a quien la creó), así
 * que acá no hace falta filtrar nada de eso a mano.
 */
export async function listarListasQueContienenTitulo(
  itemType: "movie" | "series",
  tmdbId: number,
  viewerId: string | null
): Promise<Lista[]> {
  const { data, error } = await supabase
    .from("list_items")
    .select("lists!inner(id, title, description, visibility, user_id, created_at, profiles!lists_user_id_fkey(username, display_name))")
    .eq("item_type", itemType)
    .eq("tmdb_id", tmdbId);
  if (error) throw error;

  const listas: Lista[] = (data ?? [])
    .filter((r: any) => r.lists)
    .map((r: any) => ({
      id: r.lists.id,
      title: r.lists.title,
      description: r.lists.description ?? null,
      visibility: r.lists.visibility,
      cantidad: 0,
      user_id: r.lists.user_id,
      autor_username: r.lists.profiles?.username ?? null,
      autor_display_name: r.lists.profiles?.display_name ?? null,
      created_at: r.lists.created_at,
    }));

  const enriquecidas = await enriquecerListas(listas);

  // enriquecerListas no trae la cantidad TOTAL de títulos (solo las tapas
  // de previsualización, con tope de 7) — para el subtítulo hace falta el
  // número real completo.
  if (enriquecidas.length > 0) {
    const { data: conteos } = await supabase.from("list_items").select("list_id").in("list_id", enriquecidas.map((l) => l.id));
    const cantidadPorLista: Record<string, number> = {};
    (conteos ?? []).forEach((c: any) => {
      cantidadPorLista[c.list_id] = (cantidadPorLista[c.list_id] ?? 0) + 1;
    });
    enriquecidas.forEach((l) => (l.cantidad = cantidadPorLista[l.id] ?? 0));
  }

  if (!viewerId || enriquecidas.length === 0) return enriquecidas;

  const { data: siguiendo } = await supabase
    .from("list_follows")
    .select("list_id")
    .eq("user_id", viewerId)
    .in("list_id", enriquecidas.map((l) => l.id));
  const setSeguidas = new Set((siguiendo ?? []).map((s: any) => s.list_id));
  return enriquecidas.map((l) => ({ ...l, siguiendo: setSeguidas.has(l.id) }));
}
