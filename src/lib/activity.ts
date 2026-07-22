import { supabase } from "./supabase";

export interface ActividadItem {
  id: string;
  sender_id: string;
  receiver_id: string;
  otro_username: string | null;
  soyEmisor: boolean;
  item_type: "series" | "movie";
  tmdb_id: number;
  titulo_nombre: string | null;
  note: string | null;
  created_at: string;
  ultima_actividad: string;
  ultimo_mensaje_de_otro: boolean;
  no_leido: boolean;
}

export interface RespuestaHilo {
  id: string;
  sender_id: string;
  sender_username: string | null;
  content: string;
  gif_url: string | null;
  created_at: string;
}

/** Combina lo que el usuario mandó y lo que le mandaron, como una bandeja única, ordenada por la última actividad REAL del hilo (incluyendo respuestas, no solo cuándo se compartió). */
export async function listarActividad(userId: string): Promise<ActividadItem[]> {
  const { data, error } = await supabase
    .from("shared_titles")
    .select(
      "id, sender_id, receiver_id, item_type, tmdb_id, note, created_at, read_at, sender:profiles!shared_titles_sender_id_fkey(username), receiver:profiles!shared_titles_receiver_id_fkey(username)"
    )
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const ids = (data ?? []).map((r: any) => r.id);
  const { data: replies } = ids.length
    ? await supabase.from("shared_title_replies").select("shared_title_id, sender_id, created_at").in("shared_title_id", ids).order("created_at", { ascending: true })
    : { data: [] as any[] };

  const ultimaRespuestaPorHilo: Record<string, { sender_id: string; created_at: string }> = {};
  for (const r of replies ?? []) {
    ultimaRespuestaPorHilo[r.shared_title_id] = { sender_id: r.sender_id, created_at: r.created_at };
  }

  const seriesIds = [...new Set((data ?? []).filter((r: any) => r.item_type === "series").map((r: any) => r.tmdb_id))];
  const movieIds = [...new Set((data ?? []).filter((r: any) => r.item_type === "movie").map((r: any) => r.tmdb_id))];
  const [{ data: seriesRows }, { data: movieRows }] = await Promise.all([
    seriesIds.length ? supabase.from("series_cache").select("tmdb_id, name").in("tmdb_id", seriesIds) : Promise.resolve({ data: [] as any[] }),
    movieIds.length ? supabase.from("movies_cache").select("tmdb_id, title").in("tmdb_id", movieIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const nombreSerie: Record<number, string> = {};
  (seriesRows ?? []).forEach((s: any) => (nombreSerie[s.tmdb_id] = s.name));
  const nombrePelicula: Record<number, string> = {};
  (movieRows ?? []).forEach((m: any) => (nombrePelicula[m.tmdb_id] = m.title));

  const resultado: ActividadItem[] = (data ?? []).map((r: any) => {
    const soyEmisor = r.sender_id === userId;
    const ultimaRespuesta = ultimaRespuestaPorHilo[r.id];
    const ultimaActividad = ultimaRespuesta && ultimaRespuesta.created_at > r.created_at ? ultimaRespuesta.created_at : r.created_at;
    const ultimoMensajeDeOtro = ultimaRespuesta ? ultimaRespuesta.sender_id !== userId : !soyEmisor;
    const noLeido = ultimoMensajeDeOtro && (!r.read_at || r.read_at < ultimaActividad);

    return {
      id: r.id,
      sender_id: r.sender_id,
      receiver_id: r.receiver_id,
      otro_username: (soyEmisor ? r.receiver?.username : r.sender?.username) ?? null,
      soyEmisor,
      item_type: r.item_type,
      tmdb_id: r.tmdb_id,
      titulo_nombre: r.item_type === "series" ? nombreSerie[r.tmdb_id] ?? null : nombrePelicula[r.tmdb_id] ?? null,
      note: r.note,
      created_at: r.created_at,
      ultima_actividad: ultimaActividad,
      ultimo_mensaje_de_otro: ultimoMensajeDeOtro,
      no_leido: noLeido,
    };
  });

  resultado.sort((a, b) => b.ultima_actividad.localeCompare(a.ultima_actividad));
  return resultado;
}

/** Marca el hilo como leído (se llama al abrir la conversación). */
export async function marcarHiloLeido(sharedTitleId: string) {
  await supabase.from("shared_titles").update({ read_at: new Date().toISOString() }).eq("id", sharedTitleId);
}

export interface DatosSharedTitle {
  tmdbId: number;
  tipo: "series" | "movie";
  otroUsername: string | null;
  note: string | null;
  senderId: string;
  senderUsername: string | null;
  createdAt: string;
}

/** Trae tmdb_id/tipo/con quién es la charla — para cuando solo tenemos el ID (ej: desde una notificación). */
export async function getDatosSharedTitle(sharedTitleId: string, miUserId: string): Promise<DatosSharedTitle | null> {
  const { data, error } = await supabase
    .from("shared_titles")
    .select(
      "tmdb_id, item_type, sender_id, receiver_id, note, created_at, sender:profiles!shared_titles_sender_id_fkey(username), receiver:profiles!shared_titles_receiver_id_fkey(username)"
    )
    .eq("id", sharedTitleId)
    .maybeSingle();
  if (error || !data) return null;

  const soyEmisor = data.sender_id === miUserId;
  const otro: any = soyEmisor ? data.receiver : data.sender;

  return {
    tmdbId: data.tmdb_id,
    tipo: data.item_type,
    otroUsername: otro?.username ?? null,
    note: data.note,
    senderId: data.sender_id,
    senderUsername: (data.sender as any)?.username ?? null,
    createdAt: data.created_at,
  };
}

export async function cargarHilo(sharedTitleId: string): Promise<RespuestaHilo[]> {
  const { data, error } = await supabase
    .from("shared_title_replies")
    .select("id, sender_id, content, gif_url, created_at, profiles!shared_title_replies_sender_id_fkey(username)")
    .eq("shared_title_id", sharedTitleId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    id: r.id,
    sender_id: r.sender_id,
    sender_username: r.profiles?.username ?? null,
    content: r.content,
    gif_url: r.gif_url ?? null,
    created_at: r.created_at,
  }));
}

export async function responder(sharedTitleId: string, senderId: string, content: string, gifUrl?: string | null) {
  const { error } = await supabase
    .from("shared_title_replies")
    .insert({ shared_title_id: sharedTitleId, sender_id: senderId, content: content.slice(0, 500), gif_url: gifUrl || null });
  if (error) throw error;
}
