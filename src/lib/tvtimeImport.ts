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
