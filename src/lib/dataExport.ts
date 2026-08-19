import { supabase } from "./supabase";
import { fetchAllRows } from "./pagination";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { zipSync, strToU8 } from "fflate";

/** Junta todos los datos personales del usuario desde las distintas tablas. */
async function recolectarDatos(userId: string) {
  const [
    perfilRes,
    series,
    peliculas,
    episodios,
    favoritos,
    comentarios,
    listas,
    siguiendo,
    seguidores,
    posts,
    mensajesChat,
    grupos,
    estadosDeAnimo,
    actoresFavoritos,
    historialPeliculas,
    historialEpisodios,
  ] = await Promise.all([
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
    fetchAllRows((desde, hasta) =>
      supabase.from("posts").select("item_type, tmdb_id, season_number, episode_number, content, has_spoiler, created_at").eq("user_id", userId).range(desde, hasta)
    ),
    fetchAllRows((desde, hasta) =>
      supabase.from("chat_messages").select("chat_id, content, gif_url, created_at").eq("sender_id", userId).eq("deleted", false).range(desde, hasta)
    ),
    fetchAllRows((desde, hasta) =>
      supabase.from("group_members").select("joined_at, groups(name)").eq("user_id", userId).range(desde, hasta)
    ),
    fetchAllRows((desde, hasta) =>
      supabase.from("title_mood_reactions").select("target_type, target_id, mood, created_at").eq("user_id", userId).range(desde, hasta)
    ),
    fetchAllRows((desde, hasta) =>
      supabase.from("title_favorite_cast").select("target_type, target_id, actor_name, created_at").eq("user_id", userId).range(desde, hasta)
    ),
    fetchAllRows((desde, hasta) =>
      supabase.from("movie_watch_events").select("movie_tmdb_id, watched_at").eq("user_id", userId).range(desde, hasta)
    ),
    fetchAllRows((desde, hasta) =>
      supabase.from("episode_watch_events").select("series_tmdb_id, season_number, episode_number, watched_at").eq("user_id", userId).range(desde, hasta)
    ),
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
    posts_del_lobby: (posts ?? []).map((p: any) => ({
      tipo: p.item_type,
      tmdb_id: p.tmdb_id,
      temporada: p.season_number,
      episodio: p.episode_number,
      contenido: p.content,
      tiene_spoiler: p.has_spoiler,
      publicado_el: p.created_at,
    })),
    mensajes_de_chat_enviados: (mensajesChat ?? []).map((m: any) => ({
      chat_id: m.chat_id,
      contenido: m.content,
      gif_url: m.gif_url,
      enviado_el: m.created_at,
    })),
    grupos: (grupos ?? []).map((g: any) => ({
      nombre: g.groups?.name ?? null,
      te_uniste_el: g.joined_at,
    })),
    como_te_sentiste: (estadosDeAnimo ?? []).map((e: any) => ({
      tipo: e.target_type,
      target_id: e.target_id,
      animo: e.mood,
      fecha: e.created_at,
    })),
    actor_director_favorito_votado: (actoresFavoritos ?? []).map((a: any) => ({
      tipo: a.target_type,
      target_id: a.target_id,
      nombre: a.actor_name,
      fecha: a.created_at,
    })),
    historial_completo_peliculas: (historialPeliculas ?? []).map((h: any) => ({
      tmdb_id: h.movie_tmdb_id,
      vista_el: h.watched_at,
    })),
    historial_completo_episodios: (historialEpisodios ?? []).map((h: any) => ({
      serie_tmdb_id: h.series_tmdb_id,
      temporada: h.season_number,
      episodio: h.episode_number,
      visto_el: h.watched_at,
    })),
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
  secciones.push(
    "### POSTS DEL LOBBY ###\n" +
      aCSV(datos.posts_del_lobby, ["tipo", "tmdb_id", "temporada", "episodio", "contenido", "tiene_spoiler", "publicado_el"])
  );
  secciones.push("### MENSAJES DE CHAT ENVIADOS ###\n" + aCSV(datos.mensajes_de_chat_enviados, ["chat_id", "contenido", "gif_url", "enviado_el"]));
  secciones.push("### GRUPOS ###\n" + aCSV(datos.grupos, ["nombre", "te_uniste_el"]));
  secciones.push("### COMO TE SENTISTE ###\n" + aCSV(datos.como_te_sentiste, ["tipo", "target_id", "animo", "fecha"]));
  secciones.push(
    "### ACTOR/DIRECTOR FAVORITO VOTADO ###\n" + aCSV(datos.actor_director_favorito_votado, ["tipo", "target_id", "nombre", "fecha"])
  );
  secciones.push("### HISTORIAL COMPLETO DE PELICULAS (todas las veces que la viste) ###\n" + aCSV(datos.historial_completo_peliculas, ["tmdb_id", "vista_el"]));
  secciones.push(
    "### HISTORIAL COMPLETO DE EPISODIOS (todas las veces que los viste) ###\n" +
      aCSV(datos.historial_completo_episodios, ["serie_tmdb_id", "temporada", "episodio", "visto_el"])
  );

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

/** Uint8Array → base64, en tandas chicas para no reventar la pila con archivos grandes. */
function bytesABase64(bytes: Uint8Array): string {
  const TAMANIO_TANDA = 8192;
  let binario = "";
  for (let i = 0; i < bytes.length; i += TAMANIO_TANDA) {
    const tanda = bytes.subarray(i, i + TAMANIO_TANDA);
    binario += String.fromCharCode(...tanda);
  }
  return btoa(binario);
}

/** Igual que compartirArchivo, pero para contenido binario (por ejemplo, un ZIP). */
async function compartirArchivoBinario(nombre: string, bytes: Uint8Array, mimeType: string) {
  if (Platform.OS === "web") {
    const blob = new Blob([bytes as BlobPart], { type: mimeType });
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
  await FileSystem.writeAsStringAsync(uri, bytesABase64(bytes), { encoding: "base64" });

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

/**
 * Descarga TODO en un solo ZIP: el JSON completo + un CSV limpio por cada
 * tabla (a diferencia del CSV "todo junto" de arriba, estos sí se pueden
 * abrir directo en Excel/Sheets sin manoseo, porque cada uno tiene un único
 * encabezado). Pensado para reemplazar tener que elegir entre JSON o CSV.
 */
export async function exportarDatosZip(userId: string) {
  const datos = await recolectarDatos(userId);

  const archivos: Record<string, Uint8Array> = {
    "datos-completos.json": strToU8(JSON.stringify(datos, null, 2)),
    "series.csv": strToU8(aCSV(datos.series, ["tmdb_id", "nombre", "calificacion", "donde_lo_vio", "ultima_actividad"])),
    "peliculas.csv": strToU8(aCSV(datos.peliculas, ["tmdb_id", "nombre", "vista", "calificacion", "donde_la_vio", "vista_el"])),
    "episodios_vistos.csv": strToU8(aCSV(datos.episodios_vistos, ["serie_tmdb_id", "temporada", "episodio", "visto_el", "calificacion"])),
    "favoritos.csv": strToU8(aCSV(datos.favoritos, ["item_type", "tmdb_id"])),
    "comentarios.csv": strToU8(aCSV(datos.comentarios, ["target_type", "target_id", "content", "created_at"])),
    "listas.csv": strToU8(aCSV(datos.listas, ["title", "created_at"])),
    "posts_del_lobby.csv": strToU8(
      aCSV(datos.posts_del_lobby, ["tipo", "tmdb_id", "temporada", "episodio", "contenido", "tiene_spoiler", "publicado_el"])
    ),
    "mensajes_de_chat_enviados.csv": strToU8(aCSV(datos.mensajes_de_chat_enviados, ["chat_id", "contenido", "gif_url", "enviado_el"])),
    "grupos.csv": strToU8(aCSV(datos.grupos, ["nombre", "te_uniste_el"])),
    "como_te_sentiste.csv": strToU8(aCSV(datos.como_te_sentiste, ["tipo", "target_id", "animo", "fecha"])),
    "actor_director_favorito_votado.csv": strToU8(aCSV(datos.actor_director_favorito_votado, ["tipo", "target_id", "nombre", "fecha"])),
    "historial_completo_peliculas.csv": strToU8(aCSV(datos.historial_completo_peliculas, ["tmdb_id", "vista_el"])),
    "historial_completo_episodios.csv": strToU8(
      aCSV(datos.historial_completo_episodios, ["serie_tmdb_id", "temporada", "episodio", "visto_el"])
    ),
  };

  const zip = zipSync(archivos, { level: 6 });
  await compartirArchivoBinario(`lavinola-datos-${userId.slice(0, 8)}.zip`, zip, "application/zip");
}
