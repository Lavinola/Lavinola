/**
 * Matching de nombres: el desafío real del importador (spec). Los nombres del
 * export de TV Time no siempre calzan 1 a 1 con TMDB ("The Office (US)" vs
 * "The Office", acentos, subtítulos, etc). Estrategia:
 *   1. Normalizar ambos lados (minúsculas, sin acentos, sin puntuación, sin
 *      paréntesis/años).
 *   2. Pedir los primeros resultados de búsqueda a TMDB.
 *   3. Puntuar similitud contra cada resultado.
 *   4. Si el mejor puntaje supera el umbral de confianza -> match automático.
 *      Si no -> se devuelve como "dudoso" con candidatos, para que el usuario
 *      elija en la pantalla de desambiguación.
 */
import { searchSeries, searchMovies } from "./tmdb";
import { RegistroImportado } from "./tvtimeImport";

const UMBRAL_CONFIANZA = 0.72;
const MAX_CANDIDATOS = 5; // cuántos se le muestran al usuario en "elegilo vos"
const MAX_RESULTADOS_A_EVALUAR = 20; // cuántos resultados de TMDB se puntúan antes de elegir los mejores

export interface CandidatoMatch {
  tmdb_id: number;
  titulo: string;
  poster_path: string | null;
  score: number;
}

export interface ResultadoMatch {
  nombreOriginal: string;
  tipo: "series" | "movie";
  registros: RegistroImportado[]; // todas las filas originales que corresponden a este título (ej: cada episodio)
  mejorCandidato: CandidatoMatch | null;
  confiado: boolean; // true si mejorCandidato.score >= UMBRAL_CONFIANZA
  candidatos: CandidatoMatch[]; // para la pantalla de "elegilo vos"
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // saca acentos
    .replace(/\(.*?\)/g, "") // saca "(US)", "(2016)", etc.
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Similitud por palabras compartidas (Jaccard) + bonus fuerte si uno contiene al otro + cercanía de largo. */
function similitud(a: string, b: string): number {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const wa = na.split(" ").filter(Boolean);
  const wb = nb.split(" ").filter(Boolean);
  const setA = new Set(wa);
  const setB = new Set(wb);
  const interseccion = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  const jaccard = union === 0 ? 0 : interseccion / union;

  // Si uno es substring completo del otro (ej: "the office" dentro de "the office us"),
  // es una señal muy fuerte de que es el mismo título con alguna variante regional.
  const contiene = na.includes(nb) || nb.includes(na) ? 0.35 : 0;

  // Si comparten la mayoría de las palabras más largas (más específicas) del título más corto,
  // sumamos aunque el largo total no calce (subtítulos, ": Parte 2", etc).
  const masCorta = wa.length <= wb.length ? setA : setB;
  const masLarga = wa.length <= wb.length ? setB : setA;
  const cubiertas = masCorta.size === 0 ? 0 : [...masCorta].filter((w) => masLarga.has(w)).length / masCorta.size;

  return Math.min(1, jaccard * 0.5 + cubiertas * 0.4 + contiene);
}

/** Agrupa filas del import por título (una serie con 40 episodios vistos = 1 sola búsqueda). */
export function agruparPorTitulo(registros: RegistroImportado[]): Map<string, RegistroImportado[]> {
  const grupos = new Map<string, RegistroImportado[]>();
  for (const r of registros) {
    const clave = `${r.tipo}::${normalizar(r.nombreOriginal)}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(r);
  }
  return grupos;
}

async function buscarCandidatos(nombre: string, tipo: "series" | "movie"): Promise<CandidatoMatch[]> {
  async function evaluar(query: string): Promise<CandidatoMatch[]> {
    const data = tipo === "series" ? await searchSeries(query) : await searchMovies(query);
    const resultados: any[] = (data.results ?? []).slice(0, MAX_RESULTADOS_A_EVALUAR);
    return resultados
      .map((r) => ({
        tmdb_id: r.id,
        titulo: tipo === "series" ? r.name : r.title,
        poster_path: r.poster_path ?? null,
        score: similitud(nombre, tipo === "series" ? r.name : r.title),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATOS);
  }

  let candidatos = await evaluar(nombre);

  // Si no encontramos nada bueno con el nombre tal cual (o TMDB no devolvió nada),
  // probamos de nuevo con el nombre "limpio": sin acentos ni puntuación rara (TV
  // Time a veces exporta con formato distinto al de TMDB). Ojo: NO le sacamos lo
  // que viene después de ":" — eso rompería spin-offs como "The Walking Dead:
  // Daryl Dixon", que dejarían de buscar el spin-off y buscarían la serie padre.
  if (candidatos.length === 0 || candidatos[0].score < UMBRAL_CONFIANZA) {
    const nombreLimpio = normalizar(nombre);
    if (nombreLimpio && nombreLimpio !== nombre.toLowerCase().trim()) {
      const candidatosAlt = await evaluar(nombreLimpio);
      if (candidatosAlt.length > 0 && (candidatos.length === 0 || candidatosAlt[0].score > candidatos[0].score)) {
        candidatos = candidatosAlt;
      }
    }
  }

  return candidatos;
}

/** Procesa todos los grupos y devuelve el resultado de matching para cada título único. */
export async function matchearTitulos(
  grupos: Map<string, RegistroImportado[]>,
  onProgress?: (procesados: number, total: number) => void
): Promise<ResultadoMatch[]> {
  const resultados: ResultadoMatch[] = [];
  const total = grupos.size;
  let procesados = 0;

  for (const [, registros] of grupos) {
    const primero = registros[0];
    let candidatos: CandidatoMatch[] = [];
    try {
      candidatos = await buscarCandidatos(primero.nombreOriginal, primero.tipo);
    } catch (e) {
      console.error(`Error buscando candidatos para "${primero.nombreOriginal}":`, e);
    }
    const mejor = candidatos[0] ?? null;

    resultados.push({
      nombreOriginal: primero.nombreOriginal,
      tipo: primero.tipo,
      registros,
      mejorCandidato: mejor,
      confiado: !!mejor && mejor.score >= UMBRAL_CONFIANZA,
      candidatos,
    });

    procesados++;
    onProgress?.(procesados, total);
  }

  return resultados;
}
