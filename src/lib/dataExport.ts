import { supabase } from "./supabase";
import { fetchAllRows } from "./pagination";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

/** Junta todos los datos personales del usuario desde las distintas tablas. */
async function recolectarDatos(userId: string) {
  const [perfilRes, series, peliculas, episodios, favoritos, comentarios, listas, siguiendo, seguidores] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    fetchAllRows((desde, hasta) =>
      supabase.from("user_series").select("series_tmdb_id, rating, watched_platform, last_watched_at, series_cache(name)").eq("user_id", userId).range(desde, hasta)
    ),
    fetchAllRows((desde, hasta) =>
      supabase.from("user_movies").select("movie_tmdb_id, watched, rating, watched_platform, watched_at, movies_cache(title)").eq("user_id", userId).range(desde, hasta)
    ),
    fetchAllRows((desde, hasta) =>
      supabase.from("user_episodes_watched").select("series_tmdb_id, season_number, episode_number, watched_at, rating").eq("user_id", userId).range(desde, hasta)
    ),
    fetchAllRows((desde, hasta) => supabase.from("user_favorites").select("item_type, tmdb_id").eq("user_id", userId).range(desde, hasta)),
    fetchAllRows((desde, hasta) =>
      supabase.from("comentarios").select("target_type, target_id, content, created_at").eq("user_id", userId).range(desde, hasta)
    ),
    fetchAllRows((desde, hasta) => supabase.from("lists").select("title, created_at").eq("user_id", userId).range(desde, hasta)),
    fetchAllRows((desde, hasta) => supabase.from("follows").select("followee_id").eq("follower_id", userId).range(desde, hasta)),
    fetchAllRows((desde, hasta) => supabase.from("follows").select("follower_id").eq("followee_id", userId).range(desde, hasta)),
  ]);

  return {
    perfil: perfilRes.data,
    series: (series ?? []).map((s: any) => ({
      tmdb_id: s.series_tmdb_id,
      nombre: s.series_cache?.name ?? null,
      calificacion: s.rating,
      donde_lo_vio: s.watched_platform,
      ultima_actividad: s.last_watched_at,
    })),
    peliculas: (peliculas ?? []).map((p: any) => ({
      tmdb_id: p.movie_tmdb_id,
      nombre: p.movies_cache?.title ?? null,
      vista: p.watched,
      calificacion: p.rating,
      donde_la_vio: p.watched_platform,
      vista_el: p.watched_at,
    })),
    episodios_vistos: (episodios ?? []).map((e: any) => ({
      serie_tmdb_id: e.series_tmdb_id,
      temporada: e.season_number,
      episodio: e.episode_number,
      visto_el: e.watched_at,
      calificacion: e.rating,
    })),
    favoritos: favoritos ?? [],
    comentarios: comentarios ?? [],
    listas: listas ?? [],
    cantidad_siguiendo: siguiendo?.length ?? 0,
    cantidad_seguidores: seguidores?.length ?? 0,
    exportado_el: new Date().toISOString(),
  };
}

function aCSV(filas: any[], columnas: string[]): string {
  const escapar = (v: any) => {
    if (v === null || v === undefined) return "";
    const texto = String(v).replace(/"/g, '""');
    return `"${texto}"`;
  };
  const header = columnas.join(",");
  const cuerpo = filas.map((f) => columnas.map((c) => escapar(f[c])).join(",")).join("\n");
  return `${header}\n${cuerpo}`;
}

/** Arma un único archivo de texto con una sección CSV por cada tabla. */
function armarCSVCompleto(datos: Awaited<ReturnType<typeof recolectarDatos>>): string {
  const secciones: string[] = [];

  secciones.push("### SERIES ###\n" + aCSV(datos.series, ["tmdb_id", "nombre", "calificacion", "donde_lo_vio", "ultima_actividad"]));
  secciones.push("### PELICULAS ###\n" + aCSV(datos.peliculas, ["tmdb_id", "nombre", "vista", "calificacion", "donde_la_vio", "vista_el"]));
  secciones.push("### EPISODIOS VISTOS ###\n" + aCSV(datos.episodios_vistos, ["serie_tmdb_id", "temporada", "episodio", "visto_el", "calificacion"]));
  secciones.push("### FAVORITOS ###\n" + aCSV(datos.favoritos, ["item_type", "tmdb_id"]));
  secciones.push("### COMENTARIOS ###\n" + aCSV(datos.comentarios, ["target_type", "target_id", "content", "created_at"]));
  secciones.push("### LISTAS ###\n" + aCSV(datos.listas, ["title", "created_at"]));

  return secciones.join("\n\n");
}

async function compartirArchivo(nombre: string, contenido: string, mimeType: string) {
  if (Platform.OS === "web") {
    // En la web no hay "compartir archivos" del sistema — bajamos el
    // archivo directo con la descarga normal del navegador.
    const blob = new Blob([contenido], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nombre;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const uri = FileSystem.cacheDirectory + nombre;
  await FileSystem.writeAsStringAsync(uri, contenido, { encoding: "utf8" });

  const disponible = await Sharing.isAvailableAsync();
  if (!disponible) {
    throw new Error("Tu dispositivo no permite compartir archivos.");
  }
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: "Descargar mis datos de Lavinola" });
}

export async function exportarDatosJSON(userId: string) {
  const datos = await recolectarDatos(userId);
  const contenido = JSON.stringify(datos, null, 2);
  await compartirArchivo(`lavinola-datos-${userId.slice(0, 8)}.json`, contenido, "application/json");
}

export async function exportarDatosCSV(userId: string) {
  const datos = await recolectarDatos(userId);
  const contenido = armarCSVCompleto(datos);
  await compartirArchivo(`lavinola-datos-${userId.slice(0, 8)}.csv`, contenido, "text/csv");
}
