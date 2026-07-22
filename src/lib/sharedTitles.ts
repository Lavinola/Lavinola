import { supabase } from "./supabase";

export interface TituloCompartido {
  id: string;
  sender_id: string;
  sender_username: string | null;
  item_type: "series" | "movie";
  tmdb_id: number;
  note: string | null;
  created_at: string;
  read_at: string | null;
}

const LIMITE_NOTA = 200;

/**
 * Comparte un título con alguien que sigo o me sigue. No es chat libre: es un
 * mensaje estructurado (título + notita corta opcional), sin campo de texto
 * abierto y sin fotos — así queda cubierto en el punto de moderación del spec.
 */
export async function compartirTitulo(params: {
  senderId: string;
  receiverId: string;
  itemType: "series" | "movie";
  tmdbId: number;
  note?: string;
}) {
  const notaRecortada = params.note?.slice(0, LIMITE_NOTA) ?? null;
  const { error } = await supabase.from("shared_titles").insert({
    sender_id: params.senderId,
    receiver_id: params.receiverId,
    item_type: params.itemType,
    tmdb_id: params.tmdbId,
    note: notaRecortada,
  });
  if (error) throw error;
}

export async function bandejaRecibidos(userId: string): Promise<TituloCompartido[]> {
  const { data, error } = await supabase
    .from("shared_titles")
    .select("id, sender_id, item_type, tmdb_id, note, created_at, read_at, profiles!shared_titles_sender_id_fkey(username)")
    .eq("receiver_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    id: r.id,
    sender_id: r.sender_id,
    sender_username: r.profiles?.username ?? null,
    item_type: r.item_type,
    tmdb_id: r.tmdb_id,
    note: r.note,
    created_at: r.created_at,
    read_at: r.read_at,
  }));
}

export async function marcarLeido(id: string) {
  await supabase.from("shared_titles").update({ read_at: new Date().toISOString() }).eq("id", id);
}

export { LIMITE_NOTA };
