import { supabase } from "./supabase";
import { syncSeries, syncMovie } from "./sync";
import { ResultadoMatch } from "./matcher";

export interface ProgresoImportacion {
  procesados: number;
  total: number;
  tituloActual: string;
}

/**
 * Aplica un ResultadoMatch ya resuelto (con tmdb_id confirmado, sea por match
 * automático o elegido a mano en la pantalla de desambiguación).
 */
export async function aplicarMatch(
  userId: string,
  resultado: ResultadoMatch,
  tmdbIdElegido: number
): Promise<{ episodiosOmitidos: number }> {
  if (resultado.tipo === "series") {
    await syncSeries(tmdbIdElegido);
    await supabase.from("user_series").upsert({
      user_id: userId,
      series_tmdb_id: tmdbIdElegido,
      in_watchlist: true,
      last_watched_at: new Date().toISOString(),
    });

    const episodiosPedidos = resultado.registros.filter((r) => r.temporada != null && r.episodio != null);

    // IMPORTANTE: user_episodes_watched tiene una foreign key que exige que
    // cada (temporada, episodio) exista antes en episodes_cache. Si se manda
    // todo junto en un solo upsert y UN SOLO episodio no matchea (típico en
    // series viejas, donde TMDB tiene huecos o numeración incompleta), ese
    // único error hacía fallar el envío ENTERO — perdiendo silenciosamente
    // TODOS los episodios de esa serie, no solo el problemático. Por eso
    // primero consultamos cuáles existen de verdad, y solo mandamos esos.
    const { data: existentesEnCache } = await supabase
      .from("episodes_cache")
      .select("season_number, episode_number")
      .eq("series_tmdb_id", tmdbIdElegido);
    const existentesSet = new Set((existentesEnCache ?? []).map((e) => `${e.season_number}-${e.episode_number}`));

    const episodios = episodiosPedidos
      .filter((r) => existentesSet.has(`${r.temporada}-${r.episodio}`))
      .map((r) => ({
        user_id: userId,
        series_tmdb_id: tmdbIdElegido,
        season_number: r.temporada,
        episode_number: r.episodio,
        watched_at: r.fechaVisto ?? new Date().toISOString(),
      }));
    const episodiosOmitidos = episodiosPedidos.length - episodios.length;
    if (episodiosOmitidos > 0) {
      console.warn(
        `Importación: ${episodiosOmitidos} episodio(s) de "${resultado.nombreOriginal}" no existen en el catálogo de TMDB (numeración incompleta) — se omitieron, el resto se importó bien.`
      );
    }

    if (episodios.length > 0) {
      const { error } = await supabase.from("user_episodes_watched").upsert(episodios, { onConflict: "user_id,series_tmdb_id,season_number,episode_number" });
      if (error) {
        console.error(`Error al guardar episodios de "${resultado.nombreOriginal}":`, error.message);
        throw error;
      }
    }
    return { episodiosOmitidos };
  } else {
    await syncMovie(tmdbIdElegido);
    const { error } = await supabase.from("user_movies").upsert({
      user_id: userId,
      movie_tmdb_id: tmdbIdElegido,
      watched: true,
      watched_at: resultado.registros[0]?.fechaVisto ?? new Date().toISOString(),
    });
    if (error) {
      console.error(`Error al guardar la película "${resultado.nombreOriginal}":`, error.message);
      throw error;
    }
    return { episodiosOmitidos: 0 };
  }
}

/** Aplica todos los resultados confiados de una tanda, reportando progreso. Devuelve cuántos episodios se omitieron por no existir en el catálogo de TMDB. */
export async function aplicarMatchesConfiados(
  userId: string,
  resultados: ResultadoMatch[],
  onProgreso?: (p: ProgresoImportacion) => void
): Promise<{ episodiosOmitidosTotal: number }> {
  const confiados = resultados.filter((r) => r.confiado && r.mejorCandidato);
  let episodiosOmitidosTotal = 0;
  for (let i = 0; i < confiados.length; i++) {
    const r = confiados[i];
    onProgreso?.({ procesados: i, total: confiados.length, tituloActual: r.nombreOriginal });
    try {
      const { episodiosOmitidos } = await aplicarMatch(userId, r, r.mejorCandidato!.tmdb_id);
      episodiosOmitidosTotal += episodiosOmitidos;
    } catch (e) {
      // Un título puntual que falla no debería frenar el resto de la
      // importación — lo dejamos loggeado y seguimos con los demás.
      console.error(`No se pudo importar "${r.nombreOriginal}":`, e);
    }
  }
  onProgreso?.({ procesados: confiados.length, total: confiados.length, tituloActual: "" });
  return { episodiosOmitidosTotal };
}
