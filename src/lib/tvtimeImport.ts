/**
 * Parsers de los formatos de export soportados (ver spec):
 *  - TV Time, CSV oficial vía pedido GDPR a support@tvtime.com:
 *      tracking-prod-records.csv     -> películas
 *      tracking-prod-records-v2.csv  -> series (una fila por episodio visto)
 *  - TV Time, JSON/CSV de la extensión de Chrome "TV Time Out by Refract"
 *  - Letterboxd (solo películas), el export oficial de la cuenta
 *    (Settings → Import & Export → Export data): diary.csv o watched.csv,
 *    reconocible por su columna "Letterboxd URI".
 *
 * La salida de todos los parsers se normaliza a `RegistroImportado`, que es
 * lo único que el resto del importador (matcher.ts) necesita conocer — así
 * agregar un formato nuevo no toca nada del resto del pipeline.
 */
import Papa from "papaparse";

export type TipoRegistro = "series" | "movie";

export interface RegistroImportado {
  tipo: TipoRegistro;
  nombreOriginal: string; // tal cual viene en el archivo, para mostrar en la UI de matching
  temporada?: number; // solo series
  episodio?: number; // solo series
  fechaVisto?: string; // ISO, si viene
  tvdbId?: string; // solo series — TV Time usa TheTVDB como id interno (columna "s_id"), y TMDB puede resolverlo directo sin buscar por nombre
  añoLanzamiento?: number; // solo películas — cuando el CSV trae "release_date" real (no siempre viene), sirve para no confundir películas con el mismo nombre pero de años distintos
  tmdbId?: number; // cuando el origen ya trae el id de TMDB directo (ej: Sofa Time) — se salta la búsqueda/matching por nombre por completo, es 100% confiable
  soloPendiente?: boolean; // "quiero verla" / watchlist, no vista todavía — si no está, se asume vista (comportamiento de siempre)
}

/** Detecta el formato del archivo por su contenido y lo parsea (TV Time o Letterboxd). */
export function parseArchivoTVTime(contenido: string, nombreArchivo: string): RegistroImportado[] {
  const esJSON = nombreArchivo.toLowerCase().endsWith(".json") || contenido.trim().startsWith("[") || contenido.trim().startsWith("{");

  if (esJSON) return parseJSON(contenido);

  // Letterboxd siempre trae esta columna en su export — es la forma más
  // confiable de reconocerlo (el nombre del archivo puede variar: diary.csv,
  // watched.csv, etc., pero la columna "Letterboxd URI" siempre está).
  const primeraLinea = contenido.split("\n")[0] ?? "";
  if (/letterboxd\s*uri/i.test(primeraLinea)) return parseLetterboxd(contenido);

  return parseCSV(contenido, nombreArchivo);
}

function parseLetterboxd(contenido: string): RegistroImportado[] {
  const { data } = Papa.parse<Record<string, string>>(contenido, {
    header: true,
    skipEmptyLines: true,
  });

  return data
    .map((row: Record<string, string>): RegistroImportado | null => {
      const nombre = row["Name"] || row["name"] || "";
      if (!nombre) return null;
      // "Watched Date" está en diary.csv; si no viene (ej. watched.csv,
      // que es más simple), usamos "Date" a secas.
      const fecha = row["Watched Date"] || row["watched Date"] || row["Date"] || row["date"] || undefined;
      return {
        tipo: "movie",
        nombreOriginal: nombre,
        fechaVisto: fecha,
      };
    })
    .filter((r): r is RegistroImportado => r !== null);
}

function parseJSON(contenido: string): RegistroImportado[] {
  const data = JSON.parse(contenido);
  const items: any[] = Array.isArray(data) ? data : data.items ?? data.records ?? [];

  return items.map((item): RegistroImportado => {
    // La extensión Refract exporta campos como show_name / episode / season / movie_name
    const esSerie = !!(item.show_name || item.series_name || item.season != null);
    if (esSerie) {
      return {
        tipo: "series",
        nombreOriginal: item.show_name ?? item.series_name ?? item.title ?? "",
        temporada: Number(item.season ?? item.season_number) || undefined,
        episodio: Number(item.episode ?? item.episode_number) || undefined,
        fechaVisto: item.watched_at ?? item.date ?? undefined,
      };
    }
    return {
      tipo: "movie",
      nombreOriginal: item.movie_name ?? item.title ?? "",
      fechaVisto: item.watched_at ?? item.date ?? undefined,
    };
  }).filter((r) => r.nombreOriginal);
}

function parseCSV(contenido: string, nombreArchivo: string): RegistroImportado[] {
  const { data } = Papa.parse<Record<string, string>>(contenido, {
    header: true,
    skipEmptyLines: true,
  });
  if (data.length === 0) return [];
  const columnas = Object.keys(data[0] ?? {});

  // ---- Formato oficial real de TV Time (confirmado contra un export real) ----
  // El archivo de "series" (tracking-prod-records-v2.csv) tiene una columna
  // "key" que mezcla filas de distinto tipo: solo las que arrancan con
  // "watch-episode-" o "rewatch-episode-" son capítulos realmente vistos —
  // las que arrancan con "user-series-" son solo "seguís esta serie", no
  // marcan nada como visto.
  if (columnas.includes("key") && columnas.includes("s_id") && columnas.includes("episode_number")) {
    return data
      .filter((row) => row["key"]?.startsWith("watch-episode-") || row["key"]?.startsWith("rewatch-episode-"))
      .map((row): RegistroImportado | null => {
        const nombre = row["series_name"] || "";
        if (!nombre) return null;
        return {
          tipo: "series",
          nombreOriginal: nombre,
          temporada: Number(row["season_number"]) || undefined,
          episodio: Number(row["episode_number"]) || undefined,
          fechaVisto: row["created_at"] || undefined,
          // TV Time usa TheTVDB como id interno de cada serie — con esto
          // podemos pedirle a TMDB el título exacto sin adivinar por nombre.
          tvdbId: row["s_id"] || undefined,
        };
      })
      .filter((r): r is RegistroImportado => r !== null);
  }

  // El archivo "de películas" (tracking-prod-records.csv) en realidad trae
  // de TODO mezclado en la misma tabla: películas vistas, pero también
  // "seguís esta serie" (follow), "querés ver esto" (towatch), y conteos
  // agregados de series — todo junto. Solo entity_type=movie + type=watch
  // son películas efectivamente marcadas como vistas.
  if (columnas.includes("entity_type") && columnas.includes("movie_name") && columnas.includes("type")) {
    return data
      .filter((row) => row["entity_type"] === "movie" && row["type"] === "watch")
      .map((row): RegistroImportado | null => {
        const nombre = row["movie_name"] || "";
        if (!nombre) return null;
        // El release_date de este archivo no siempre viene (bastante menos
        // de la mitad de las filas lo traen), y cuando no lo tiene manda un
        // valor "vacío" tipo año 1 — lo descartamos en ese caso.
        const rawFecha = row["release_date"] || "";
        const año = rawFecha && !rawFecha.startsWith("0001-") ? Number(rawFecha.slice(0, 4)) : undefined;
        return {
          tipo: "movie",
          nombreOriginal: nombre,
          fechaVisto: row["watch_date"] || row["created_at"] || undefined,
          añoLanzamiento: año && año > 1880 ? año : undefined,
        };
      })
      .filter((r): r is RegistroImportado => r !== null);
  }

  // ---- Fallback genérico para otros formatos (ej. la extensión Refract, u
  // otro export con columnas más simples que no matchean las firmas de arriba) ----
  const pareceSerie =
    nombreArchivo.includes("v2") || columnas.some((k) => /season|episode|temporada|episodio/i.test(k));

  return data
    .map((row: Record<string, string>): RegistroImportado | null => {
      const nombre =
        row["show_name"] || row["series_name"] || row["movie_name"] || row["name"] || row["title"] || "";
      if (!nombre) return null;

      if (pareceSerie) {
        return {
          tipo: "series",
          nombreOriginal: nombre,
          temporada: Number(row["season_number"] || row["season"]) || undefined,
          episodio: Number(row["episode_number"] || row["episode"]) || undefined,
          fechaVisto: row["created_at"] || row["watched_at"] || row["date"] || undefined,
        };
      }
      return {
        tipo: "movie",
        nombreOriginal: nombre,
        fechaVisto: row["created_at"] || row["watched_at"] || row["date"] || undefined,
      };
    })
    .filter((r): r is RegistroImportado => r !== null);
}

// ============================================================
// Sofa Time — export desde Ajustes → Exportar datos, baja un .zip con 6
// archivos JSON (algunos pueden venir vacíos si no usás esa categoría):
//   watchedMovie.json / watchedShow.json     -> vistas
//   watchlistMovie.json / watchlistShow.json -> pendientes ("quiero verla")
//   stopWatchingMovie.json / stopWatchingShow.json -> abandonadas (se
//     importan igual que las vistas parciales; nuestro propio sistema ya
//     calcula solo el estado "abandonada" a partir de la fecha del último
//     capítulo visto, no hace falta un campo aparte para esto)
//
// A diferencia de TV Time, cada título de Sofa Time ya trae el id de TMDB
// directo (columna "tmdb") — no hace falta buscar ni adivinar por nombre,
// así que estos registros se procesan con muchísima más confianza (ver
// agruparPorTmdbId en matcher.ts).
// ============================================================

interface SofaEpisodio {
  number: number;
  addedDate?: string;
}
interface SofaTemporada {
  number: number;
  episodes: SofaEpisodio[];
}
interface SofaItem {
  tmdb: number;
  title: string;
  type: "movie" | "tv";
  addedDate?: string;
  seasons?: SofaTemporada[];
}

/** Nombres reconocibles de los 6 archivos que trae el export de Sofa Time (sin importar el sufijo de fecha que le agregan). */
export const ARCHIVOS_SOFA_TIME = [
  "watchedmovie",
  "watchedshow",
  "watchlistmovie",
  "watchlistshow",
  "stopwatchingmovie",
  "stopwatchingshow",
] as const;

function parseSofaItems(contenido: string, esPelicula: boolean, soloPendiente: boolean): RegistroImportado[] {
  let items: SofaItem[];
  try {
    items = JSON.parse(contenido);
  } catch {
    return [];
  }
  if (!Array.isArray(items)) return [];

  const registros: RegistroImportado[] = [];
  for (const item of items) {
    if (!item.tmdb || !item.title) continue;

    if (esPelicula) {
      registros.push({
        tipo: "movie",
        nombreOriginal: item.title,
        tmdbId: item.tmdb,
        fechaVisto: item.addedDate,
        soloPendiente,
      });
      continue;
    }

    // Series: si no tiene episodios cargados (típico de un "quiero verla"
    // recién agregado), igual generamos un registro sin temporada/episodio
    // para que la serie quede agregada a la lista, aunque sea sin nada visto.
    const episodiosDeTodasLasTemporadas = (item.seasons ?? [])
      .filter((t) => t.number > 0) // temporada 0 = especiales, la app no los trackea a propósito
      .flatMap((t) => t.episodes.map((e) => ({ ...e, temporada: t.number })));

    if (episodiosDeTodasLasTemporadas.length === 0) {
      registros.push({ tipo: "series", nombreOriginal: item.title, tmdbId: item.tmdb, soloPendiente });
    } else {
      for (const ep of episodiosDeTodasLasTemporadas) {
        registros.push({
          tipo: "series",
          nombreOriginal: item.title,
          tmdbId: item.tmdb,
          temporada: ep.temporada,
          episodio: ep.number,
          fechaVisto: ep.addedDate,
          soloPendiente,
        });
      }
    }
  }
  return registros;
}

/** Recibe los archivos ya descomprimidos del ZIP de Sofa Time (nombre -> contenido) y devuelve todos los registros juntos. */
export function parseSofaTimeArchivos(archivos: Record<string, string>): RegistroImportado[] {
  let registros: RegistroImportado[] = [];
  for (const [nombre, contenido] of Object.entries(archivos)) {
    const nombreLower = nombre.toLowerCase();
    if (nombreLower.includes("watchedmovie") || nombreLower.includes("stopwatchingmovie")) {
      registros = registros.concat(parseSofaItems(contenido, true, false));
    } else if (nombreLower.includes("watchlistmovie")) {
      registros = registros.concat(parseSofaItems(contenido, true, true));
    } else if (nombreLower.includes("watchedshow") || nombreLower.includes("stopwatchingshow")) {
      registros = registros.concat(parseSofaItems(contenido, false, false));
    } else if (nombreLower.includes("watchlistshow")) {
      registros = registros.concat(parseSofaItems(contenido, false, true));
    }
  }
  return registros;
}
