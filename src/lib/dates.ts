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
