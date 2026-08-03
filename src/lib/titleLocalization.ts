import { supabase } from "./supabase";
import { getTmdbLanguage, getSeriesDetails, getMovieDetails } from "./tmdb";

type Tipo = "series" | "movie";

export interface DetalleLocalizado {
  nombre: string | null;
  sinopsis: string | null;
}

/**
 * Sistema de traducción de títulos en 3 capas, de más rápido/barato a más
 * lento/caro — cada capa solo se usa si la anterior no tenía la respuesta:
 *
 * 1. Memoria de esta sesión (instantáneo, pero solo dura mientras la app
 *    esté abierta en ESTE dispositivo).
 * 2. Supabase, tabla `title_translations` — COMPARTIDA entre todos los
 *    usuarios. La primera persona que necesita el nombre de un título en
 *    un idioma puntual paga el costo de pedírselo a TMDB; el resto de los
 *    usuarios (para siempre, hasta que venza) lo lee de acá.
 * 3. TMDB — solo si ninguna de las dos anteriores lo tenía. Al resolverlo
 *    acá, se guarda en las capas 1 y 2 para la próxima vez.
 *
 * Esto existe para que, con muchos usuarios usando la app al mismo
 * tiempo, no se multiplique un pedido a la clave compartida de TMDB por
 * cada persona que abre el mismo título — con esto, en la práctica, cada
 * título/idioma se le pide a TMDB UNA sola vez entre todos los usuarios.
 */

// Cuánto tiempo confiamos en una traducción ya guardada antes de
// volver a pedírsela a TMDB. A diferencia de series_cache/movies_cache
// (que necesitan actualizarse seguido por episodios/estados nuevos), el
// NOMBRE de un título casi nunca cambia, así que acá el margen es mucho
// más largo.
const TRADUCCION_VIGENTE_DIAS = 30;

function esVigente(syncedAt: string): boolean {
  const dias = (Date.now() - new Date(syncedAt).getTime()) / (1000 * 60 * 60 * 24);
  return dias < TRADUCCION_VIGENTE_DIAS;
}

// ---------- Capa 1: memoria de esta sesión ----------
const memoria = new Map<string, DetalleLocalizado>();
const enCurso = new Map<string, Promise<DetalleLocalizado>>();

function claveCruda(tipo: Tipo, tmdbId: number, idioma: string): string {
  return `${tipo}-${tmdbId}-${idioma}`;
}

// ---------- Capa 2: Supabase (compartido entre todos los usuarios) ----------
async function leerDeSupabase(tipo: Tipo, tmdbId: number, idioma: string): Promise<DetalleLocalizado | null> {
  const { data } = await supabase
    .from("title_translations")
    .select("name, overview, synced_at")
    .eq("item_type", tipo)
    .eq("tmdb_id", tmdbId)
    .eq("language", idioma)
    .maybeSingle();
  if (!data || !esVigente(data.synced_at)) return null;
  return { nombre: data.name ?? null, sinopsis: data.overview ?? null };
}

function guardarEnSupabase(tipo: Tipo, tmdbId: number, idioma: string, detalle: DetalleLocalizado) {
  // No hace falta esperar esto para poder mostrar el nombre — si el
  // guardado falla (red, permisos), no pasa nada grave: la próxima
  // persona simplemente le vuelve a preguntar a TMDB, como si este
  // guardado no hubiera existido.
  supabase
    .from("title_translations")
    .upsert(
      { item_type: tipo, tmdb_id: tmdbId, language: idioma, name: detalle.nombre, overview: detalle.sinopsis, synced_at: new Date().toISOString() },
      { onConflict: "item_type,tmdb_id,language" }
    )
    .then(({ error }: any) => {
      if (error) console.error(`No se pudo guardar la traducción ${tipo}-${tmdbId}-${idioma} en Supabase:`, error.message);
    });
}

// ---------- Capa 3: TMDB ----------
async function pedirATmdb(tipo: Tipo, tmdbId: number, idioma: string): Promise<DetalleLocalizado> {
  const d = tipo === "series" ? await getSeriesDetails(tmdbId, idioma) : await getMovieDetails(tmdbId, idioma);
  return {
    nombre: (tipo === "series" ? d?.name : d?.title) ?? null,
    sinopsis: d?.overview || null,
  };
}

/** Un idioma puntual de un título: memoria -> Supabase -> TMDB, en ese orden, guardando en las capas de atrás a medida que se resuelve. */
function obtenerCrudo(tipo: Tipo, tmdbId: number, idioma: string): Promise<DetalleLocalizado> {
  const key = claveCruda(tipo, tmdbId, idioma);
  if (memoria.has(key)) return Promise.resolve(memoria.get(key)!);
  if (enCurso.has(key)) return enCurso.get(key)!;

  const promesa = (async () => {
    try {
      const deSupabase = await leerDeSupabase(tipo, tmdbId, idioma);
      if (deSupabase) {
        memoria.set(key, deSupabase);
        return deSupabase;
      }
      const deTmdb = await pedirATmdb(tipo, tmdbId, idioma);
      memoria.set(key, deTmdb);
      if (deTmdb.nombre) guardarEnSupabase(tipo, tmdbId, idioma, deTmdb);
      return deTmdb;
    } finally {
      enCurso.delete(key);
    }
  })();
  enCurso.set(key, promesa);
  return promesa;
}

/**
 * Nombre Y sinopsis en el idioma de quien está mirando — resuelve primero
 * contra lo que ya haya en memoria o en Supabase (compartido entre TODOS
 * los usuarios) antes de pedirle nada a TMDB. Para español latino
 * (es-419), aplica la misma protección de siempre: si TMDB heredó el
 * título de España sin tener traducción propia, muestra el original en
 * inglés en su lugar.
 */
export async function obtenerDetalleLocalizado(tipo: Tipo, tmdbId: number): Promise<DetalleLocalizado> {
  const idiomaPreferido = getTmdbLanguage();

  if (idiomaPreferido !== "es-419") {
    try {
      return await obtenerCrudo(tipo, tmdbId, idiomaPreferido);
    } catch (e) {
      console.error("obtenerDetalleLocalizado: no se pudo resolver:", e);
      return { nombre: null, sinopsis: null };
    }
  }

  try {
    const [d419, dES, dEN] = await Promise.all([
      obtenerCrudo(tipo, tmdbId, "es-419"),
      obtenerCrudo(tipo, tmdbId, "es-ES"),
      obtenerCrudo(tipo, tmdbId, "en-US"),
    ]);
    const normalizar = (s: string | null) => (s ?? "").trim().toLowerCase();
    const nombre =
      d419.nombre && dES.nombre && dEN.nombre && normalizar(d419.nombre) === normalizar(dES.nombre) && normalizar(d419.nombre) !== normalizar(dEN.nombre)
        ? dEN.nombre
        : d419.nombre ?? dEN.nombre ?? dES.nombre ?? null;
    const sinopsis = d419.sinopsis || dES.sinopsis || dEN.sinopsis || null;
    return { nombre, sinopsis };
  } catch (e) {
    console.error("obtenerDetalleLocalizado: no se pudo resolver:", e);
    return { nombre: null, sinopsis: null };
  }
}

/** Nombre del título en el idioma de quien está mirando (ver obtenerDetalleLocalizado). */
export async function obtenerTituloLocalizado(tipo: Tipo, tmdbId: number): Promise<string | null> {
  return (await obtenerDetalleLocalizado(tipo, tmdbId)).nombre;
}

export function claveLocalizacion(tipo: Tipo, tmdbId: number): string {
  return `${tipo}-${tmdbId}`;
}

/** Nombre localizado de un solo título. Pensado para componentes sueltos, como la tarjetita de "recomendó tal título". */
export async function localizarNombre(tipo: Tipo, tmdbId: number): Promise<string | null> {
  if (getTmdbLanguage() === "en-US") return null; // nada que mejorar si ya está en inglés
  return obtenerTituloLocalizado(tipo, tmdbId);
}

/**
 * Nombre localizado de varios títulos a la vez (en paralelo, usando lo ya
 * resuelto en memoria/Supabase). Devuelve un mapa "tipo-tmdbId" -> nombre,
 * solo con los que efectivamente tienen uno para mostrar.
 */
export async function localizarNombres(items: { tipo: Tipo; tmdbId: number }[]): Promise<Map<string, string>> {
  const resultado = new Map<string, string>();
  if (getTmdbLanguage() === "en-US" || items.length === 0) return resultado;
  await Promise.all(
    items.map(async ({ tipo, tmdbId }) => {
      const nombre = await obtenerTituloLocalizado(tipo, tmdbId);
      if (nombre) resultado.set(claveLocalizacion(tipo, tmdbId), nombre);
    })
  );
  return resultado;
}

/** Al cambiar el idioma de títulos en Ajustes, para que no queden nombres viejos pegados en esta sesión. */
export function limpiarCacheLocalizacion() {
  memoria.clear();
  enCurso.clear();
}
