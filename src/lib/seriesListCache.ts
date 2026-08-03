import { listarSeriesConEstado, historialReciente, SerieListado, EventoHistorial } from "./seriesList";

export interface DatosListaPendiente {
  series: SerieListado[];
  historial: EventoHistorial[];
}

export async function cargarDatosListaPendiente(userId: string): Promise<DatosListaPendiente> {
  const [series, historial] = await Promise.all([listarSeriesConEstado(userId), historialReciente(userId, 60)]);
  return { series, historial };
}

// Caché simple en memoria (dura mientras la app esté abierta) — se
// dispara sola en segundo plano apenas arranca la app (ver navigation),
// para que "Lista pendiente" pueda pintar al toque en vez de esperar a
// que se calculen las series desde cero.
let cache: DatosListaPendiente | null = null;
let cachePromise: Promise<DatosListaPendiente> | null = null;
let cacheUserId: string | null = null;

/** Dispara la carga en segundo plano — no hace falta esperarla, solo llamarla. */
export function precargarListaPendiente(userId: string) {
  if (cacheUserId === userId && (cache || cachePromise)) return; // ya está lista o en camino para este usuario
  cacheUserId = userId;
  cache = null;
  cachePromise = cargarDatosListaPendiente(userId)
    .then((r) => {
      cache = r;
      return r;
    })
    .catch((e) => {
      console.error("Error precargando la lista pendiente de series:", e);
      cachePromise = null;
      throw e;
    });
}

/** Lo que ya esté listo AHORA MISMO, sin esperar nada — null si todavía no terminó de bajar. */
export function cacheSincronicaListaPendiente(userId: string): DatosListaPendiente | null {
  return cacheUserId === userId ? cache : null;
}

/** Usa lo que ya esté precargado (o lo que esté en camino) — si por algún motivo no se había disparado antes, lo dispara ahora. */
export async function obtenerListaPendiente(userId: string): Promise<DatosListaPendiente> {
  if (cacheUserId === userId && cache) return cache;
  if (cacheUserId !== userId || !cachePromise) precargarListaPendiente(userId);
  return await cachePromise!;
}

/** Guarda datos recién pedidos (más frescos que el caché) para que la próxima visita salga de acá directamente. */
export function actualizarCacheListaPendiente(userId: string, datos: DatosListaPendiente) {
  cacheUserId = userId;
  cache = datos;
}

/** Al desloguearse, para no arrastrar series de otra cuenta. */
export function limpiarCacheListaPendiente() {
  cache = null;
  cachePromise = null;
  cacheUserId = null;
}
