import { supabase } from "./supabase";
import { crearPostRecap } from "./posts";

/** Sube la imagen capturada del Recap (uri local) a Supabase Storage y devuelve la URL pública. */
export async function subirImagenRecap(userId: string, uriLocal: string): Promise<string> {
  const respuesta = await fetch(uriLocal);
  const blob = await respuesta.blob();
  const nombreArchivo = `${userId}/${Date.now()}.png`;

  const { error } = await supabase.storage.from("recap-images").upload(nombreArchivo, blob, {
    contentType: "image/png",
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from("recap-images").getPublicUrl(nombreArchivo);
  return data.publicUrl;
}

export async function publicarRecapEnLobby(userId: string, imageUrl: string, mensaje: string) {
  await crearPostRecap({ userId, imageUrl, content: mensaje.trim() });
}
