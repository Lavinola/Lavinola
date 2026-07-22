import { supabase } from "./supabase";

export interface Anuncio {
  id: string;
  message: string;
  created_at: string;
}

export async function listarAnuncios(): Promise<Anuncio[]> {
  const { data, error } = await supabase.from("announcements").select("id, message, created_at").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Crea el anuncio (visible in-app para todos) y dispara el push a quienes tengan token guardado. */
export async function crearAnuncio(mensaje: string): Promise<{ ok: boolean; motivo?: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const adminId = userData.user?.id;
  if (!adminId) return { ok: false, motivo: "No autenticado" };

  const { error } = await supabase.from("announcements").insert({ admin_id: adminId, message: mensaje.slice(0, 500) });
  if (error) return { ok: false, motivo: error.message };

  const { data } = await supabase.functions.invoke("broadcast-announcement", { body: { message: mensaje.slice(0, 500) } });
  return data ?? { ok: true }; // el anuncio in-app ya quedó creado aunque el push falle
}
