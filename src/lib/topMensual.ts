import { supabase } from "./supabase";

export interface ItemTopMensual {
  tmdb_id: number;
  cantidad: number;
  nombre: string;
  poster_path: string | null;
  subtitulo: string | null; // año (película) o cantidad de temporadas (serie)
}

export async function topTitulosMensual(itemType: "series" | "movie", country: string | null, genreId: number | null = null): Promise<ItemTopMensual[]> {
  const { data, error } = await supabase.rpc("top_titulos_mensual", { p_item_type: itemType, p_country: country, p_genre_id: genreId });
  if (error) throw error;
  const filas: { tmdb_id: number; cantidad: number }[] = data ?? [];
  if (filas.length === 0) return [];

  const ids = filas.map((f) => f.tmdb_id);
  const tabla = itemType === "series" ? "series_cache" : "movies_cache";
  const { data: cache } = await supabase.from(tabla).select("*").in("tmdb_id", ids);
  const porId: Record<number, any> = {};
  (cache ?? []).forEach((c: any) => (porId[c.tmdb_id] = c));

  return filas.map((f) => {
    const c = porId[f.tmdb_id];
    return {
      tmdb_id: f.tmdb_id,
      cantidad: f.cantidad,
      nombre: c ? (itemType === "series" ? c.name : c.title) : "...",
      poster_path: c?.poster_path ?? null,
      subtitulo: c
        ? itemType === "series"
          ? c.total_seasons
            ? `${c.total_seasons} temporada${c.total_seasons === 1 ? "" : "s"}`
            : null
          : c.release_date
          ? String(c.release_date).slice(0, 4)
          : null
        : null,
    };
  });
}
