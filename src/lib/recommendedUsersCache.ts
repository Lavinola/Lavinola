import { listarUsuariosRecomendados, UsuarioBasico } from "./follows";

// Caché simple en memoria (dura mientras la app esté abierta, se borra
// sola al cerrarla o al desloguearse) — calcular las recomendaciones
// tarda bastante (mira seguidores/siguiendo en común y % de gustos de
// varios candidatos), así que en vez de hacerlo recién cuando el usuario
// entra a buscar gente, se dispara solo en segundo plano apenas arranca
// la app, para que ya esté lista cuando la necesite.
let cache: UsuarioBasico[] | null = null;
let cachePromise: Promise<UsuarioBasico[]> | null = null;
let cacheUserId: string | null = null;

/** Dispara el cálculo en segundo plano — no hace falta esperarlo, solo llamarlo. */
export function precargarUsuariosRecomendados(userId: string) {
  if (cacheUserId === userId && (cache || cachePromise)) return; // ya está lista o en camino para este usuario
  cacheUserId = userId;
  cache = null;
  cachePromise = listarUsuariosRecomendados(userId)
    .then((r) => {
      cache = r;
      return r;
    })
    .catch((e) => {
      console.error("Error precargando usuarios recomendados:", e);
      cachePromise = null;
      return [];
    });
}

/** Usa lo que ya esté precargado (o lo que esté en camino) — si por algún motivo no se había disparado antes, lo dispara ahora. */
export async function obtenerUsuariosRecomendados(userId: string): Promise<UsuarioBasico[]> {
  if (cacheUserId === userId && cache) return cache;
  if (cacheUserId !== userId || !cachePromise) precargarUsuariosRecomendados(userId);
  return (await cachePromise) ?? [];
}

/** Al desloguearse, para no arrastrar sugerencias de otra cuenta. */
export function limpiarCacheUsuariosRecomendados() {
  cache = null;
  cachePromise = null;
  cacheUserId = null;
}
