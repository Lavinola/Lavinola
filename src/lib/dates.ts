/**
 * La fecha de HOY tal como la vive el usuario en su celular, en formato
 * aaaa-mm-dd — para comparar contra un air_date/release_date y saber si
 * algo "ya salió" o "todavía no".
 *
 * IMPORTANTE: nunca usar `new Date().toISOString().slice(0, 10)` para
 * esto. `toISOString()` convierte a UTC, y en Argentina (UTC-3) a partir
 * de las ~21hs locales ya es "mañana" en UTC — eso hacía que capítulos,
 * películas y temporadas se marcaran como estrenados un día antes de
 * tiempo (o que un cartel dijera "Mañana" cuando en realidad faltaban 2
 * días), específicamente de noche. Esta función arma la fecha con los
 * componentes LOCALES del dispositivo (año/mes/día), no con UTC.
 */
export function hoyLocalISO(): string {
  const d = new Date();
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/** Todas las fechas de la app se muestran así: dd/mm/aaaa. */
export function formatearFecha(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "—";
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const anio = d.getUTCFullYear();
  return `${dia}/${mes}/${anio}`;
}

/**
 * Igual que formatearFecha, pero para una vista marcada con "no sé la
 * fecha exacta, elegí el año" — muestra solo el año (la fecha completa
 * igual está guardada por dentro para poder ordenar, pero no tiene
 * sentido mostrarla si el usuario dijo que no la sabía).
 */
export function formatearFechaVista(fecha: string | null | undefined, soloAño: boolean): string {
  if (!fecha) return "—";
  if (!soloAño) return formatearFecha(fecha);
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "—";
  return String(d.getUTCFullYear());
}

/** Igual, pero con hora — para fechas que incluyen timestamp (comentarios, notificaciones). */
export function formatearFechaHora(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "—";
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const anio = d.getFullYear();
  const horas = String(d.getHours()).padStart(2, "0");
  const minutos = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${anio} ${horas}:${minutos}`;
}

/** "Hace cuánto": 1-59 → "Xmin", 1-23hs → "Xh", de ahí en más → "Xd" (para posts y comentarios del Lobby). */
export function formatearTiempoRelativo(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "—";
  const segundos = Math.max(0, (Date.now() - d.getTime()) / 1000);
  const minutos = Math.floor(segundos / 60);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `${minutos}min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h`;
  const dias = Math.floor(horas / 24);
  return `${dias}d`;
}
