import { supabase } from "./supabase";

export async function enviarSugerencia(userId: string, content: string) {
  const { error } = await supabase.from("suggestions").insert({ user_id: userId, content: content.slice(0, 1000) });
  if (error) throw error;
}

export interface Sugerencia {
  id: string;
  user_id: string;
  autor_username: string | null;
  content: string;
  status: string;
  admin_reply: string | null;
  admin_reply_at: string | null;
  created_at: string;
}

export async function listarSugerencias(): Promise<Sugerencia[]> {
  const { data, error } = await supabase
    .from("suggestions")
    .select("id, user_id, content, status, admin_reply, admin_reply_at, created_at, profiles!suggestions_user_id_fkey(username)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    user_id: r.user_id,
    autor_username: r.profiles?.username ?? null,
    content: r.content,
    status: r.status,
    admin_reply: r.admin_reply,
    admin_reply_at: r.admin_reply_at,
    created_at: r.created_at,
  }));
}

export async function responderSugerencia(id: string, respuesta: string) {
  await supabase
    .from("suggestions")
    .update({ admin_reply: respuesta, admin_reply_at: new Date().toISOString(), status: "leida" })
    .eq("id", id);
}

export async function actualizarEstadoSugerencia(id: string, status: string) {
  await supabase.from("suggestions").update({ status }).eq("id", id);
}
