import { supabase } from "./supabase";

export type TipoItemEncuesta = "series" | "movie" | "episode";

export interface OpcionEncuesta {
  id: string;
  position: number;
  optionText: string | null;
  itemType: TipoItemEncuesta | null;
  tmdbId: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  votos: number;
  yoVote: boolean;
}

export interface Encuesta {
  id: string;
  groupId: string | null;
  userId: string;
  autorUsername: string | null;
  autorDisplayName: string | null;
  autorAvatarUrl: string | null;
  questionText: string | null;
  questionItemType: TipoItemEncuesta | null;
  questionTmdbId: number | null;
  questionSeasonNumber: number | null;
  questionEpisodeNumber: number | null;
  allowMultiple: boolean;
  createdAt: string;
  opciones: OpcionEncuesta[];
  reacciones: Record<string, number>;
  miReaccion: string | null;
  cantidadComentarios: number;
}

export interface OpcionNueva {
  text: string;
  itemType?: TipoItemEncuesta;
  tmdbId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
}

export async function crearEncuesta(params: {
  userId: string;
  groupId?: string;
  questionText: string;
  questionItemType?: TipoItemEncuesta;
  questionTmdbId?: number;
  questionSeasonNumber?: number;
  questionEpisodeNumber?: number;
  allowMultiple: boolean;
  opciones: OpcionNueva[];
}): Promise<string> {
  const { data: poll, error } = await supabase
    .from("polls")
    .insert({
      user_id: params.userId,
      group_id: params.groupId ?? null,
      question_text: params.questionText.trim() || null,
      question_item_type: params.questionItemType ?? null,
      question_tmdb_id: params.questionTmdbId ?? null,
      question_season_number: params.questionSeasonNumber ?? null,
      question_episode_number: params.questionEpisodeNumber ?? null,
      allow_multiple: params.allowMultiple,
    })
    .select("id")
    .single();
  if (error) throw error;

  const filas = params.opciones.map((o, i) => ({
    poll_id: poll.id,
    position: i,
    option_text: o.text.trim() || null,
    item_type: o.itemType ?? null,
    tmdb_id: o.tmdbId ?? null,
    season_number: o.seasonNumber ?? null,
    episode_number: o.episodeNumber ?? null,
  }));
  const { error: errorOpciones } = await supabase.from("poll_options").insert(filas);
  if (errorOpciones) throw errorOpciones;

  return poll.id;
}

export async function cargarEncuestasDeGrupo(groupId: string, userId: string | null): Promise<Encuesta[]> {
  const { data: pollsData, error } = await supabase
    .from("polls")
    .select(
      "id, group_id, user_id, question_text, question_item_type, question_tmdb_id, question_season_number, question_episode_number, allow_multiple, created_at, profiles!polls_user_id_fkey(username, avatar_url, display_name)"
    )
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ensamblarEncuestas(pollsData ?? [], userId);
}

const SELECT_POLL =
  "id, group_id, user_id, question_text, question_item_type, question_tmdb_id, question_season_number, question_episode_number, allow_multiple, created_at, profiles!polls_user_id_fkey(username, avatar_url, display_name)";

/** Tus propias encuestas publicadas directo al Lobby (no las de dentro de un grupo). `limite` opcional: sin especificar trae todas. */
export async function listarMisEncuestasDeLobby(userId: string, before?: string | null, limite?: number): Promise<Encuesta[]> {
  let query = supabase.from("polls").select(SELECT_POLL).is("group_id", null).eq("user_id", userId).order("created_at", { ascending: false });
  if (limite) query = query.limit(limite);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw error;
  return ensamblarEncuestas(data ?? [], userId);
}

/** Encuestas del Lobby de gente que seguís (no las tuyas). */
export async function listarEncuestasDeLobbySiguiendo(userId: string, before?: string | null): Promise<Encuesta[]> {
  const { data: sigo } = await supabase.from("follows").select("followee_id").eq("follower_id", userId);
  const ids = (sigo ?? []).map((f: any) => f.followee_id);
  if (ids.length === 0) return [];
  let query = supabase.from("polls").select(SELECT_POLL).is("group_id", null).in("user_id", ids).order("created_at", { ascending: false }).limit(20);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw error;
  return ensamblarEncuestas(data ?? [], userId);
}

/** Encuestas del Lobby para el feed "Para ti" (todas las que la RLS deja ver: públicas o de gente que seguís). */
export async function listarEncuestasDeLobbyParaTi(userId: string | null, before?: string | null): Promise<Encuesta[]> {
  let query = supabase.from("polls").select(SELECT_POLL).is("group_id", null).order("created_at", { ascending: false }).limit(20);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw error;
  return ensamblarEncuestas(data ?? [], userId);
}

async function ensamblarEncuestas(pollsData: any[], userId: string | null): Promise<Encuesta[]> {
  if (!pollsData || pollsData.length === 0) return [];

  const pollIds = pollsData.map((p: any) => p.id);
  const [{ data: opcionesData }, { data: reaccionesData }, { data: comentariosData }] = await Promise.all([
    supabase.from("poll_options").select("id, poll_id, position, option_text, item_type, tmdb_id, season_number, episode_number").in("poll_id", pollIds).order("position", { ascending: true }),
    supabase.from("poll_reactions").select("poll_id, user_id, emoji").in("poll_id", pollIds),
    supabase.from("comentarios").select("target_id").eq("target_type", "poll").in("target_id", pollIds),
  ]);

  const reaccionesPorPoll: Record<string, Record<string, number>> = {};
  const miReaccionPorPoll: Record<string, string> = {};
  (reaccionesData ?? []).forEach((r: any) => {
    if (!reaccionesPorPoll[r.poll_id]) reaccionesPorPoll[r.poll_id] = {};
    reaccionesPorPoll[r.poll_id][r.emoji] = (reaccionesPorPoll[r.poll_id][r.emoji] ?? 0) + 1;
    if (userId && r.user_id === userId) miReaccionPorPoll[r.poll_id] = r.emoji;
  });

  const comentariosPorPoll: Record<string, number> = {};
  (comentariosData ?? []).forEach((c: any) => {
    comentariosPorPoll[c.target_id] = (comentariosPorPoll[c.target_id] ?? 0) + 1;
  });

  const optionIds = (opcionesData ?? []).map((o: any) => o.id);
  const { data: votesData } = optionIds.length
    ? await supabase.from("poll_votes").select("option_id, user_id").in("option_id", optionIds)
    : { data: [] as any[] };

  const votosPorOpcion: Record<string, number> = {};
  const yoVotePorOpcion: Record<string, boolean> = {};
  (votesData ?? []).forEach((v: any) => {
    votosPorOpcion[v.option_id] = (votosPorOpcion[v.option_id] ?? 0) + 1;
    if (userId && v.user_id === userId) yoVotePorOpcion[v.option_id] = true;
  });

  const opcionesPorPoll: Record<string, OpcionEncuesta[]> = {};
  (opcionesData ?? []).forEach((o: any) => {
    if (!opcionesPorPoll[o.poll_id]) opcionesPorPoll[o.poll_id] = [];
    opcionesPorPoll[o.poll_id].push({
      id: o.id,
      position: o.position,
      optionText: o.option_text,
      itemType: o.item_type,
      tmdbId: o.tmdb_id,
      seasonNumber: o.season_number,
      episodeNumber: o.episode_number,
      votos: votosPorOpcion[o.id] ?? 0,
      yoVote: !!yoVotePorOpcion[o.id],
    });
  });

  return pollsData.map((p: any) => ({
    id: p.id,
    groupId: p.group_id,
    userId: p.user_id,
    autorUsername: p.profiles?.username ?? null,
    autorDisplayName: p.profiles?.display_name ?? null,
    autorAvatarUrl: p.profiles?.avatar_url ?? null,
    questionText: p.question_text,
    questionItemType: p.question_item_type,
    questionTmdbId: p.question_tmdb_id,
    questionSeasonNumber: p.question_season_number,
    questionEpisodeNumber: p.question_episode_number,
    allowMultiple: p.allow_multiple,
    createdAt: p.created_at,
    opciones: (opcionesPorPoll[p.id] ?? []).sort((a, b) => a.position - b.position),
    reacciones: reaccionesPorPoll[p.id] ?? {},
    miReaccion: miReaccionPorPoll[p.id] ?? null,
    cantidadComentarios: comentariosPorPoll[p.id] ?? 0,
  }));
}

/**
 * Votar una opción. Si ya la habías votado, se saca tu voto (tocar de
 * nuevo destilda). Si la encuesta NO permite varias respuestas, antes de
 * agregar el voto nuevo se sacan tus votos anteriores en esta encuesta.
 */
export async function votarOpcion(pollId: string, optionId: string, userId: string, allowMultiple: boolean, yaVotadoAqui: boolean) {
  if (yaVotadoAqui) {
    const { error } = await supabase.from("poll_votes").delete().eq("option_id", optionId).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  if (!allowMultiple) {
    const { data: opciones } = await supabase.from("poll_options").select("id").eq("poll_id", pollId);
    const ids = (opciones ?? []).map((o: any) => o.id);
    if (ids.length) await supabase.from("poll_votes").delete().in("option_id", ids).eq("user_id", userId);
  }
  const { error } = await supabase.from("poll_votes").insert({ poll_id: pollId, option_id: optionId, user_id: userId });
  if (error) throw error;
}

export interface VotanteDeOpcion {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
}

export async function listarVotantesDeOpcion(optionId: string, offset: number, limit: number): Promise<VotanteDeOpcion[]> {
  const { data, error } = await supabase
    .from("poll_votes")
    .select("user_id, created_at, profiles!poll_votes_user_id_fkey(username, avatar_url)")
    .eq("option_id", optionId)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data ?? []).map((v: any) => ({ user_id: v.user_id, username: v.profiles?.username ?? null, avatar_url: v.profiles?.avatar_url ?? null }));
}

export async function eliminarEncuesta(pollId: string) {
  const { error } = await supabase.from("polls").delete().eq("id", pollId);
  if (error) throw error;
}

export async function listarReaccionesDeEncuesta(pollId: string): Promise<import("./comments").ReaccionConAutor[]> {
  const { data, error } = await supabase
    .from("poll_reactions")
    .select("user_id, emoji, created_at, profiles!poll_reactions_user_id_fkey(username, avatar_url)")
    .eq("poll_id", pollId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ user_id: r.user_id, username: r.profiles?.username ?? null, avatar_url: r.profiles?.avatar_url ?? null, emoji: r.emoji }));
}

export async function reaccionarEncuesta(userId: string, pollId: string, emoji: string) {
  const { error } = await supabase.from("poll_reactions").upsert({ user_id: userId, poll_id: pollId, emoji }, { onConflict: "user_id,poll_id" });
  if (error) throw error;
}

export async function quitarReaccionEncuesta(userId: string, pollId: string) {
  await supabase.from("poll_reactions").delete().eq("user_id", userId).eq("poll_id", pollId);
}
