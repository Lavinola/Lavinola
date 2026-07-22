/**
 * Trae la nota de IMDb usando la API de OMDb (https://www.omdbapi.com).
 * Requiere una API key propia (gratis, hasta 1000 pedidos por día):
 * https://www.omdbapi.com/apikey.aspx
 *
 * Si no está configurada la key (EXPO_PUBLIC_OMDB_API_KEY), esta función
 * devuelve null sin romper nada — el bloque de IMDb simplemente no se
 * muestra en la ficha.
 */
const OMDB_API_KEY = process.env.EXPO_PUBLIC_OMDB_API_KEY;

export interface NotaImdb {
  rating: string; // ej: "8.4"
  votos: string; // ej: "1,234,567"
}

const cache: Record<string, NotaImdb | null> = {};

export async function getNotaImdb(imdbId: string | null | undefined): Promise<NotaImdb | null> {
  if (!OMDB_API_KEY || !imdbId) return null;
  if (imdbId in cache) return cache[imdbId];

  try {
    const res = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`);
    const data = await res.json();
    if (data.Response === "False" || !data.imdbRating || data.imdbRating === "N/A") {
      cache[imdbId] = null;
      return null;
    }
    const nota: NotaImdb = { rating: data.imdbRating, votos: data.imdbVotes ?? "0" };
    cache[imdbId] = nota;
    return nota;
  } catch (e) {
    console.error("Error al traer la nota de IMDb:", e);
    return null;
  }
}
