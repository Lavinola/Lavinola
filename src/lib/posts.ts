import { supabase } from "./supabase";
import { idsGuardadosDe } from "./savedItems";
import { moderarTexto } from "./moderation";

export interface ListaPreviewItem {
  item_type: "series" | "movie";
  tmdb_id: number;
  poster_path: string | null;
}

export interface Post {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  item_type: "series" | "movie" | "episode" | "list" | "recap" | "group";
  tmdb_id: number | null;
  season_number: number | null;
  episode_number: number | null;
  list_id: string | null;
  group_id: string | null;
  image_url: string | null;
  content: string;
  has_spoiler: boolean;
  created_at: string;
  es_comentario_de_titulo?: boolean; // true si nació como comentario desde la ficha de un título (no desde "compartir")
  mostrar_en_lobby?: boolean;
  // datos resueltos aparte (no vienen del select de posts)
  titulo_nombre?: string | null;
  episodio_nombre?: string | null;
  poster_path?: string | null;
  subtitulo?: string | null; // año / temporadas / "T1 - E3"
  reacciones?: Record<string, number>;
  mi_reaccion?: string | null;
  is_saved?: boolean;
  cantidad_comentarios?: number;
  lista_items?: ListaPreviewItem[]; // solo si item_type === "list"
  lista_items_total?: number;
  calificacion_autor?: number | null; // las estrellas que el AUTOR del post le puso a ese título/capítulo (si le puso)
}

export async function crearPost(params: {
  userId: string;
  itemType: "series" | "movie" | "episode";
  tmdbId: number;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  content: string;
  hasSpoiler: boolean;
}) {
  const { error } = await supabase.from("posts").insert({
    user_id: params.userId,
    item_type: params.itemType,
    tmdb_id: params.tmdbId,
    season_number: params.seasonNumber ?? null,
    episode_number: params.episodeNumber ?? null,
    content: params.content.trim(),
    has_spoiler: params.hasSpoiler,
  });
  if (error) throw error;
}

/** Cuando el autor confirma "sí, publicalo también en el Lobby" para un comentario de título ya creado. */
export async function marcarComentarioVisibleEnLobby(postId: string) {
  const { error } = await supabase.from("posts").update({ mostrar_en_lobby: true }).eq("id", postId);
  if (error) throw error;
}
/**
 * El comentario "principal" que se escribe desde la ficha de una
 * película/serie/capítulo — a diferencia de crearPost (que es el botón de
 * "compartir/publicar" de siempre), esto SIEMPRE queda visible para
 * cualquiera que entre a esa ficha (como antes funcionaban los
 * comentarios), y solo aparece navegando el feed general del Lobby si
 * `mostrarEnLobby` es true.
 */
export async function crearComentarioDeTitulo(params: {
  userId: string;
  itemType: "series" | "movie" | "episode";
  tmdbId: number;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  content: string;
  mostrarEnLobby: boolean;
}): Promise<string> {
  const texto = params.content.trim();
  if (!texto) throw new Error("Escribí algo para comentar.");

  const resultado = await moderarTexto(texto);
  if (!resultado.permitido) {
    throw new Error(resultado.motivo ?? "Este comentario no cumple las normas de la comunidad.");
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id: params.userId,
      item_type: params.itemType,
      tmdb_id: params.tmdbId,
      season_number: params.seasonNumber ?? null,
      episode_number: params.episodeNumber ?? null,
      content: texto,
      has_spoiler: false,
      es_comentario_de_titulo: true,
      mostrar_en_lobby: params.mostrarEnLobby,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Publicar una LISTA propia en el Lobby (no un título puntual). */
export async function crearPostDeLista(params: { userId: string; listId: string; content: string; hasSpoiler: boolean }) {
  const texto = params.content.trim();
  if (texto) {
    const resultado = await moderarTexto(texto);
    if (!resultado.permitido) {
      throw new Error(resultado.motivo ?? "Este mensaje no cumple las normas de la comunidad.");
    }
  }
  const { error } = await supabase.from("posts").insert({
    user_id: params.userId,
    item_type: "list",
    list_id: params.listId,
    content: texto,
    has_spoiler: params.hasSpoiler,
  });
  if (error) throw error;
}

/** Publicar un GRUPO propio en el Lobby (solo tiene sentido para grupos públicos — eso se controla del lado de la app, no acá). */
export async function crearPostDeGrupo(params: { userId: string; groupId: string; content: string; hasSpoiler: boolean }) {
  const texto = params.content.trim();
  if (texto) {
    const resultado = await moderarTexto(texto);
    if (!resultado.permitido) {
      throw new Error(resultado.motivo ?? "Este mensaje no cumple las normas de la comunidad.");
    }
  }
  const { error } = await supabase.from("posts").insert({
    user_id: params.userId,
    item_type: "group",
    group_id: params.groupId,
    content: texto,
    has_spoiler: params.hasSpoiler,
  });
  if (error) throw error;
}

/** Publicar la imagen del Lavinola Recap en el Lobby (con mensaje opcional). */
export async function crearPostRecap(params: { userId: string; imageUrl: string; content: string }) {
  const texto = params.content.trim();
  if (texto) {
    const resultado = await moderarTexto(texto);
    if (!resultado.permitido) {
      throw new Error(resultado.motivo ?? "Este mensaje no cumple las normas de la comunidad.");
    }
  }
  const { error } = await supabase.from("posts").insert({
    user_id: params.userId,
    item_type: "recap",
    image_url: params.imageUrl,
    content: texto,
    has_spoiler: false,
  });
  if (error) throw error;
}

async function resolverDatosDeTitulos(filas: any[], viewerId?: string | null): Promise<Post[]> {
  const seriesIds = [...new Set(filas.filter((f) => f.item_type === "series" || f.item_type === "episode").map((f) => f.tmdb_id))];
  const movieIds = [...new Set(filas.filter((f) => f.item_type === "movie").map((f) => f.tmdb_id))];
  const listIds = [...new Set(filas.filter((f) => f.item_type === "list").map((f) => f.list_id))];
  const groupIds = [...new Set(filas.filter((f) => f.item_type === "group").map((f) => f.group_id))];

  const [{ data: seriesRows }, { data: movieRows }, { data: episodiosRows }, { data: listasRows }, { data: gruposRows }] = await Promise.all([
    seriesIds.length ? supabase.from("series_cache").select("tmdb_id, name, poster_path, total_seasons").in("tmdb_id", seriesIds) : Promise.resolve({ data: [] as any[] }),
    movieIds.length ? supabase.from("movies_cache").select("tmdb_id, title, poster_path, release_date").in("tmdb_id", movieIds) : Promise.resolve({ data: [] as any[] }),
    seriesIds.length ? supabase.from("episodes_cache").select("series_tmdb_id, season_number, episode_number, name").in("series_tmdb_id", seriesIds) : Promise.resolve({ data: [] as any[] }),
    listIds.length ? supabase.from("lists").select("id, title").in("id", listIds) : Promise.resolve({ data: [] as any[] }),
    groupIds.length ? supabase.from("groups").select("id, name, photo_url").in("id", groupIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const series: Record<number, any> = {};
  (seriesRows ?? []).forEach((s: any) => (series[s.tmdb_id] = s));
  const movies: Record<number, any> = {};
  (movieRows ?? []).forEach((m: any) => (movies[m.tmdb_id] = m));
  const episodios: Record<string, any> = {};
  (episodiosRows ?? []).forEach((e: any) => (episodios[`${e.series_tmdb_id}:${e.season_number}:${e.episode_number}`] = e));
  const listas: Record<string, any> = {};
  (listasRows ?? []).forEach((l: any) => (listas[l.id] = l));
  const grupos: Record<string, any> = {};
  (gruposRows ?? []).forEach((g: any) => (grupos[g.id] = g));

  const guardadosSet = await idsGuardadosDe(
    viewerId ?? null,
    "post",
    filas.map((f) => f.id)
  );

  // Preview de portadas para los posts de listas (hasta 5, en el orden en que se agregaron).
  const listaItemsPorLista: Record<string, ListaPreviewItem[]> = {};
  const listaTotalPorLista: Record<string, number> = {};
  if (listIds.length) {
    const { data: itemsRows } = await supabase.from("list_items").select("list_id, item_type, tmdb_id").in("list_id", listIds).order("added_at", { ascending: true });
    const porLista: Record<string, any[]> = {};
    (itemsRows ?? []).forEach((it: any) => {
      if (!porLista[it.list_id]) porLista[it.list_id] = [];
      porLista[it.list_id].push(it);
    });
    const seriesIdsDeListas = [...new Set(Object.values(porLista).flat().filter((i: any) => i.item_type === "series").map((i: any) => i.tmdb_id))];
    const movieIdsDeListas = [...new Set(Object.values(porLista).flat().filter((i: any) => i.item_type === "movie").map((i: any) => i.tmdb_id))];
    const [{ data: seriesDeListas }, { data: moviesDeListas }] = await Promise.all([
      seriesIdsDeListas.length ? supabase.from("series_cache").select("tmdb_id, poster_path").in("tmdb_id", seriesIdsDeListas) : Promise.resolve({ data: [] as any[] }),
      movieIdsDeListas.length ? supabase.from("movies_cache").select("tmdb_id, poster_path").in("tmdb_id", movieIdsDeListas) : Promise.resolve({ data: [] as any[] }),
    ]);
    const posterSerie: Record<number, string | null> = {};
    (seriesDeListas ?? []).forEach((s: any) => (posterSerie[s.tmdb_id] = s.poster_path));
    const posterMovie: Record<number, string | null> = {};
    (moviesDeListas ?? []).forEach((m: any) => (posterMovie[m.tmdb_id] = m.poster_path));

    for (const listId of listIds) {
      const items = porLista[listId] ?? [];
      listaTotalPorLista[listId] = items.length;
      listaItemsPorLista[listId] = items.slice(0, 5).map((it: any) => ({
        item_type: it.item_type,
        tmdb_id: it.tmdb_id,
        poster_path: it.item_type === "series" ? posterSerie[it.tmdb_id] ?? null : posterMovie[it.tmdb_id] ?? null,
      }));
    }
  }

  const postIds = filas.map((f) => f.id);
  const movieFilas = filas.filter((f) => f.item_type === "movie");
  const serieFilas = filas.filter((f) => f.item_type === "series");
  const episodioFilas = filas.filter((f) => f.item_type === "episode");
  const [{ data: reacciones }, { data: comentarios }, { data: calMovies }, { data: calSeries }, { data: calEpisodios }, { data: customMovies }, { data: customSeries }] = await Promise.all([
    postIds.length ? supabase.from("post_reactions").select("post_id, user_id, emoji").in("post_id", postIds) : Promise.resolve({ data: [] as any[] }),
    postIds.length ? supabase.from("comentarios").select("target_id").eq("target_type", "post").in("target_id", postIds).is("parent_comment_id", null) : Promise.resolve({ data: [] as any[] }),
    movieFilas.length
      ? supabase
          .from("user_movies")
          .select("user_id, movie_tmdb_id, rating")
          .in("user_id", [...new Set(movieFilas.map((f) => f.user_id))])
          .in("movie_tmdb_id", [...new Set(movieFilas.map((f) => f.tmdb_id))])
          .not("rating", "is", null)
      : Promise.resolve({ data: [] as any[] }),
    serieFilas.length
      ? supabase
          .from("user_series")
          .select("user_id, series_tmdb_id, rating")
          .in("user_id", [...new Set(serieFilas.map((f) => f.user_id))])
          .in("series_tmdb_id", [...new Set(serieFilas.map((f) => f.tmdb_id))])
          .not("rating", "is", null)
      : Promise.resolve({ data: [] as any[] }),
    episodioFilas.length
      ? supabase
          .from("user_episodes_watched")
          .select("user_id, series_tmdb_id, season_number, episode_number, rating")
          .in("user_id", [...new Set(episodioFilas.map((f) => f.user_id))])
          .in("series_tmdb_id", [...new Set(episodioFilas.map((f) => f.tmdb_id))])
          .not("rating", "is", null)
      : Promise.resolve({ data: [] as any[] }),
    movieFilas.length
      ? supabase
          .from("user_movies")
          .select("user_id, movie_tmdb_id, custom_poster_path")
          .in("user_id", [...new Set(movieFilas.map((f) => f.user_id))])
          .in("movie_tmdb_id", [...new Set(movieFilas.map((f) => f.tmdb_id))])
          .not("custom_poster_path", "is", null)
      : Promise.resolve({ data: [] as any[] }),
    seriesIds.length
      ? supabase
          .from("user_series")
          .select("user_id, series_tmdb_id, custom_poster_path")
          .in("user_id", [...new Set(filas.filter((f) => f.item_type === "series" || f.item_type === "episode").map((f) => f.user_id))])
          .in("series_tmdb_id", seriesIds)
          .not("custom_poster_path", "is", null)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const customPosterMovie: Record<string, string> = {};
  (customMovies ?? []).forEach((c: any) => (customPosterMovie[`${c.user_id}:${c.movie_tmdb_id}`] = c.custom_poster_path));
  const customPosterSerie: Record<string, string> = {};
  (customSeries ?? []).forEach((c: any) => (customPosterSerie[`${c.user_id}:${c.series_tmdb_id}`] = c.custom_poster_path));
  const calMoviePorClave: Record<string, number> = {};
  (calMovies ?? []).forEach((c: any) => (calMoviePorClave[`${c.user_id}:${c.movie_tmdb_id}`] = c.rating));
  const calSeriePorClave: Record<string, number> = {};
  (calSeries ?? []).forEach((c: any) => (calSeriePorClave[`${c.user_id}:${c.series_tmdb_id}`] = c.rating));
  const calEpisodioPorClave: Record<string, number> = {};
  (calEpisodios ?? []).forEach(
    (c: any) => (calEpisodioPorClave[`${c.user_id}:${c.series_tmdb_id}:${c.season_number}:${c.episode_number}`] = c.rating)
  );
  const reaccionesPorPost: Record<string, Record<string, number>> = {};
  const miReaccionPorPost: Record<string, string> = {};
  (reacciones ?? []).forEach((r: any) => {
    if (!reaccionesPorPost[r.post_id]) reaccionesPorPost[r.post_id] = {};
    reaccionesPorPost[r.post_id][r.emoji] = (reaccionesPorPost[r.post_id][r.emoji] ?? 0) + 1;
    if (viewerId && r.user_id === viewerId) miReaccionPorPost[r.post_id] = r.emoji;
  });
  const comentariosPorPost: Record<string, number> = {};
  (comentarios ?? []).forEach((c: any) => {
    comentariosPorPost[c.target_id] = (comentariosPorPost[c.target_id] ?? 0) + 1;
  });

  return filas.map((f) => {
    let titulo_nombre: string | null = null;
    let episodio_nombre: string | null = null;
    let poster_path: string | null = null;
    let subtitulo: string | null = null;

    if (f.item_type === "movie") {
      const m = movies[f.tmdb_id];
      titulo_nombre = m?.title ?? null;
      poster_path = customPosterMovie[`${f.user_id}:${f.tmdb_id}`] ?? m?.poster_path ?? null;
      subtitulo = m?.release_date ? String(m.release_date).slice(0, 4) : null;
    } else if (f.item_type === "series" || f.item_type === "episode") {
      const s = series[f.tmdb_id];
      titulo_nombre = s?.name ?? null;
      poster_path = customPosterSerie[`${f.user_id}:${f.tmdb_id}`] ?? s?.poster_path ?? null;
      if (f.item_type === "episode") {
        subtitulo = `T${f.season_number} - E${f.episode_number}`;
        episodio_nombre = episodios[`${f.tmdb_id}:${f.season_number}:${f.episode_number}`]?.name ?? null;
      } else {
        subtitulo = s?.total_seasons ? `${s.total_seasons} temporada${s.total_seasons === 1 ? "" : "s"}` : null;
      }
    } else if (f.item_type === "list") {
      titulo_nombre = listas[f.list_id]?.title ?? null;
    } else if (f.item_type === "group") {
      titulo_nombre = grupos[f.group_id]?.name ?? null;
      poster_path = grupos[f.group_id]?.photo_url ?? null;
    }

    return {
      id: f.id,
      user_id: f.user_id,
      username: f.profiles?.username ?? null,
      display_name: f.profiles?.display_name ?? null,
      avatar_url: f.profiles?.avatar_url ?? null,
      item_type: f.item_type,
      tmdb_id: f.tmdb_id,
      season_number: f.season_number,
      episode_number: f.episode_number,
      list_id: f.list_id ?? null,
      group_id: f.group_id ?? null,
      image_url: f.image_url ?? null,
      content: f.content,
      has_spoiler: f.has_spoiler,
      created_at: f.created_at,
      es_comentario_de_titulo: f.es_comentario_de_titulo ?? false,
      mostrar_en_lobby: f.mostrar_en_lobby ?? true,
      titulo_nombre,
      episodio_nombre,
      poster_path,
      subtitulo,
      reacciones: reaccionesPorPost[f.id] ?? {},
      mi_reaccion: miReaccionPorPost[f.id] ?? null,
      is_saved: guardadosSet.has(f.id),
      cantidad_comentarios: comentariosPorPost[f.id] ?? 0,
      lista_items: f.item_type === "list" ? listaItemsPorLista[f.list_id] ?? [] : undefined,
      lista_items_total: f.item_type === "list" ? listaTotalPorLista[f.list_id] ?? 0 : undefined,
      calificacion_autor:
        f.item_type === "movie"
          ? calMoviePorClave[`${f.user_id}:${f.tmdb_id}`] ?? null
          : f.item_type === "series"
          ? calSeriePorClave[`${f.user_id}:${f.tmdb_id}`] ?? null
          : f.item_type === "episode"
          ? calEpisodioPorClave[`${f.user_id}:${f.tmdb_id}:${f.season_number}:${f.episode_number}`] ?? null
          : null,
    };
  });
}

const SELECT_POST =
  "id, user_id, item_type, tmdb_id, season_number, episode_number, list_id, group_id, image_url, content, has_spoiler, created_at, es_comentario_de_titulo, mostrar_en_lobby, profiles!posts_user_id_fkey(username, avatar_url, display_name)";

/** Un lote puntual de posts por id (para "guardados", donde no importa el orden natural del feed). */
export async function obtenerPostsPorIds(ids: string[], viewerId?: string | null): Promise<Post[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("posts").select(SELECT_POST).in("id", ids);
  if (error) throw error;
  return resolverDatosDeTitulos(data ?? [], viewerId);
}

/**
 * `limite` es opcional: sin especificarlo, trae TODOS tus posts (lo que
 * necesita MyCommentsScreen, que puede tener que saltar a un post viejo
 * desde una notificación). CommunityScreen sí pide de a 20 con paginación.
 */
export async function listarMisPosts(userId: string, before?: string | null, limite?: number): Promise<Post[]> {
  let query = supabase.from("posts").select(SELECT_POST).eq("user_id", userId).eq("mostrar_en_lobby", true).order("created_at", { ascending: false });
  if (limite) query = query.limit(limite);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw error;
  return resolverDatosDeTitulos(data ?? [], userId);
}

/** "Siguiendo": solo posts de gente que seguís (no los tuyos). */
export async function listarPostsSiguiendo(userId: string, before?: string | null): Promise<Post[]> {
  const { data: sigo } = await supabase.from("follows").select("followee_id").eq("follower_id", userId);
  const ids = (sigo ?? []).map((f: any) => f.followee_id);
  if (ids.length === 0) return [];
  const { autoresAExcluir, postsAExcluir } = await obtenerDescartes(userId);
  let query = supabase.from("posts").select(SELECT_POST).in("user_id", ids).eq("mostrar_en_lobby", true).order("created_at", { ascending: false }).limit(20);
  if (before) query = query.lt("created_at", before);
  if (autoresAExcluir.length) query = query.not("user_id", "in", `(${autoresAExcluir.join(",")})`);
  if (postsAExcluir.length) query = query.not("id", "in", `(${postsAExcluir.join(",")})`);
  const { data, error } = await query;
  if (error) throw error;
  return resolverDatosDeTitulos(data ?? [], userId);
}

async function obtenerDescartes(userId: string): Promise<{ autoresAExcluir: string[]; postsAExcluir: string[] }> {
  const { data } = await supabase.from("post_dismissed").select("post_id, author_id").eq("user_id", userId);
  const postsAExcluir = (data ?? []).map((d: any) => d.post_id);
  // Si descartaste 2 o más posts de la misma persona, dejamos de mostrarte sus posts directamente.
  const conteoPorAutor: Record<string, number> = {};
  (data ?? []).forEach((d: any) => {
    if (d.author_id) conteoPorAutor[d.author_id] = (conteoPorAutor[d.author_id] ?? 0) + 1;
  });
  const autoresAExcluir = Object.keys(conteoPorAutor).filter((a) => conteoPorAutor[a] >= 2);
  return { autoresAExcluir, postsAExcluir };
}

/** Descarta un post ("No me interesa"): lo oculta ya y es una señal para tu algoritmo de "Para ti". */
export async function marcarPostNoInteresa(userId: string, postId: string, authorId: string) {
  const { error } = await supabase.from("post_dismissed").insert({ user_id: userId, post_id: postId, author_id: authorId });
  if (error) throw error;
}

/**
 * "Para ti": v1 simple — todo lo que la RLS te deja ver (tuyo, de gente que
 * seguís, y de cuentas públicas), ordenado por fecha, con paginación
 * (mandá el "created_at" del último post que ya tenés para pedir la
 * siguiente tanda). Más adelante se puede afinar con un algoritmo real.
 */
export async function listarPostsParaTi(viewerId?: string | null, before?: string | null): Promise<Post[]> {
  let query = supabase.from("posts").select(SELECT_POST).eq("mostrar_en_lobby", true).order("created_at", { ascending: false }).limit(20);
  if (before) query = query.lt("created_at", before);
  if (viewerId) {
    const { autoresAExcluir, postsAExcluir } = await obtenerDescartes(viewerId);
    if (autoresAExcluir.length) query = query.not("user_id", "in", `(${autoresAExcluir.join(",")})`);
    if (postsAExcluir.length) query = query.not("id", "in", `(${postsAExcluir.join(",")})`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return resolverDatosDeTitulos(data ?? [], viewerId);
}

/** Posts hechos sobre un título puntual (para mostrarlos junto a los comentarios de esa ficha). */
export async function listarPostsDeTitulo(
  itemType: "series" | "movie" | "episode",
  tmdbId: number,
  seasonNumber?: number,
  episodeNumber?: number,
  viewerId?: string | null
): Promise<Post[]> {
  let query = supabase.from("posts").select(SELECT_POST).eq("item_type", itemType).eq("tmdb_id", tmdbId);
  if (itemType === "episode") {
    query = query.eq("season_number", seasonNumber ?? -1).eq("episode_number", episodeNumber ?? -1);
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return resolverDatosDeTitulos(data ?? [], viewerId);
}

export async function contarPostsDeTitulo(itemType: "series" | "movie" | "episode", tmdbId: number, seasonNumber?: number, episodeNumber?: number): Promise<number> {
  let query = supabase.from("posts").select("*", { count: "exact", head: true }).eq("item_type", itemType).eq("tmdb_id", tmdbId);
  if (itemType === "episode") {
    query = query.eq("season_number", seasonNumber ?? -1).eq("episode_number", episodeNumber ?? -1);
  }
  const { count } = await query;
  return count ?? 0;
}

export interface ReaccionConAutor {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  emoji: string;
}

export async function listarReaccionesDePost(postId: string): Promise<ReaccionConAutor[]> {
  const { data, error } = await supabase
    .from("post_reactions")
    .select("user_id, emoji, created_at, profiles!post_reactions_user_id_fkey(username, avatar_url)")
    .eq("post_id", postId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    user_id: r.user_id,
    username: r.profiles?.username ?? null,
    avatar_url: r.profiles?.avatar_url ?? null,
    emoji: r.emoji,
  }));
}

export async function reaccionarPost(userId: string, postId: string, emoji: string) {
  const { error } = await supabase.from("post_reactions").upsert({ user_id: userId, post_id: postId, emoji }, { onConflict: "user_id,post_id" });
  if (error) throw error;
}

export async function quitarReaccionPost(userId: string, postId: string) {
  await supabase.from("post_reactions").delete().eq("user_id", userId).eq("post_id", postId);
}

export async function eliminarPost(postId: string) {
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) throw error;
}
