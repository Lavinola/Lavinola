/**
 * Búsqueda de GIFs vía Giphy. Deliberadamente NO se permite subir imágenes
 * propias — solo elegir de este catálogo, que ya viene moderado por Giphy.
 * Esto mantiene la misma lógica de seguridad del spec original (nada de
 * fotos subidas por el usuario en comentarios).
 *
 * Antes usábamos Tenor, pero Google discontinuó la API pública el 30/06/2026
 * (dejó de aceptar altas nuevas desde el 13/01/2026). Giphy es el reemplazo
 * más directo — misma lógica, key gratis: https://developers.giphy.com/
 *
 * Requiere mostrar atribución "Powered by GIPHY" donde se use la API (ver
 * atribución en GifPickerScreen).
 */
const GIPHY_API_KEY = process.env.EXPO_PUBLIC_GIPHY_API_KEY;
const GIPHY_BASE = "https://api.giphy.com/v1";

export interface GifResultado {
  id: string;
  previewUrl: string; // versión chica, para el grid de búsqueda
  gifUrl: string; // versión que se guarda y se muestra en el comentario
}

function mapearResultados(data: any): GifResultado[] {
  return (data.data ?? []).map((g: any) => ({
    id: g.id,
    previewUrl: g.images?.fixed_width_small?.url ?? g.images?.fixed_width?.url ?? g.images?.original?.url,
    gifUrl: g.images?.downsized?.url ?? g.images?.original?.url,
  }));
}

export async function buscarGifs(query: string, limite = 24): Promise<GifResultado[]> {
  if (!GIPHY_API_KEY) {
    throw new Error("Falta configurar EXPO_PUBLIC_GIPHY_API_KEY en el .env — sin eso, la búsqueda de GIFs no funciona.");
  }
  const url = new URL(`${GIPHY_BASE}/gifs/search`);
  url.searchParams.set("api_key", GIPHY_API_KEY);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limite));
  url.searchParams.set("lang", "es");
  url.searchParams.set("rating", "pg-13"); // filtro de contenido propio de Giphy (equivalente al "medium" de Tenor)

  const res = await fetch(url.toString());
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    console.error("Giphy API error:", res.status, texto);
    throw new Error(`Giphy devolvió un error (${res.status}). Revisá que la API key sea válida.`);
  }
  const data = await res.json();
  return mapearResultados(data);
}

/** Sugerencias iniciales al abrir el picker, sesgadas a cine/series. */
export function buscarGifsTendenciaCine(): Promise<GifResultado[]> {
  return buscarGifs("movie reaction");
}
