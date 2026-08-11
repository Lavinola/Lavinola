import { getMovieDetails, getSeriesDetails, getContentLanguageCruda, getMostrarEnPropio } from "./tmdb";

/**
 * Qué idioma mostrar entre paréntesis al lado del título principal — o
 * `null` si no corresponde mostrar nada (el usuario tiene la app en
 * inglés, ahí no hay "segundo idioma" que valga la pena mostrar).
 *
 * - "Mostrar en tu idioma" DESACTIVADO → el título principal ya está en
 *   inglés, así que el secundario es el idioma propio del usuario.
 * - "Mostrar en tu idioma" ACTIVADO → el principal ya está en su idioma,
 *   así que el secundario es inglés.
 */
export function idiomaSecundarioPara(contentLanguage: string, mostrarEnPropio: boolean): string | null {
  if (contentLanguage.toLowerCase().startsWith("en")) return null;
  return mostrarEnPropio ? "en-US" : contentLanguage;
}

async function tituloEnIdioma(tipo: "series" | "movie", id: number, idioma: string): Promise<string | null> {
  try {
    const detalle = tipo === "series" ? await getSeriesDetails(id, idioma) : await getMovieDetails(id, idioma);
    const titulo = tipo === "series" ? detalle?.name : detalle?.title;
    return titulo || null;
  } catch {
    return null;
  }
}

/**
 * El título traducido para mostrar entre paréntesis al lado del
 * principal, según la configuración actual del usuario (leída de
 * setIdiomaTitulos, aplicada al abrir la app / cambiar el idioma) — o
 * `null` si no corresponde mostrar nada.
 *
 * Si el idioma secundario es español latino y TMDB no tiene traducción
 * propia para ese título, cae a español de España (mismo criterio que se
 * usa en el resto de la app para sinopsis y búsqueda).
 */
export async function obtenerTituloSecundario(tipo: "series" | "movie", id: number): Promise<string | null> {
  const idiomaSecundario = idiomaSecundarioPara(getContentLanguageCruda(), getMostrarEnPropio());
  if (!idiomaSecundario) return null;

  let titulo = await tituloEnIdioma(tipo, id, idiomaSecundario);
  if (!titulo && idiomaSecundario === "es-419") {
    titulo = await tituloEnIdioma(tipo, id, "es-ES");
  }
  return titulo;
}
