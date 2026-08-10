import { searchSeries, searchMovies, getTmdbLanguage, getMovieDetails, getSeriesDetails } from "./tmdb";
import { parecido, palabrasClave } from "./textMatch";

export interface ResultadoTitulo {
  id: number;
  titulo: string;
  poster_path: string | null;
  tipo: "series" | "movie";
  anio: string | null;
  popularidad: number;
}

function mapearSerie(s: any): ResultadoTitulo {
  return {
    id: s.id,
    titulo: s.name,
    poster_path: s.poster_path,
    tipo: "series",
    anio: s.first_air_date ? s.first_air_date.slice(0, 4) : null,
    popularidad: s.popularity ?? 0,
  };
}

function mapearPelicula(p: any): ResultadoTitulo {
  return {
    id: p.id,
    titulo: p.title,
    poster_path: p.poster_path,
    tipo: "movie",
    anio: p.release_date ? p.release_date.slice(0, 4) : null,
    popularidad: p.popularity ?? 0,
  };
}

// Idiomas en los que se busca en simultáneo — TMDB guarda el título de cada
// título en varios idiomas y países (ej: "Cuidado, Hércules vigila" en
// Latinoamérica es "Nuestra pandilla" en España), y el buscador de TMDB
// solo encuentra por el título en el idioma que le pidas. Buscando en
// varios idiomas a la vez y juntando los resultados, cubrimos más casos.
const IDIOMAS_BUSQUEDA = ["es-419", "es-ES", "en-US"];

interface ResultadoConIdioma {
  item: ResultadoTitulo;
  idioma: string;
}

async function buscarPorIdiomas(texto: string, idiomas: string[]): Promise<ResultadoConIdioma[]> {
  const pedidos = idiomas.flatMap((idioma) => [
    searchSeries(texto, idioma).then((r) => ({ idioma, esSerie: true, r })),
    searchMovies(texto, idioma).then((r) => ({ idioma, esSerie: false, r })),
  ]);
  const resultados = await Promise.all(pedidos);
  const items: ResultadoConIdioma[] = [];
  for (const { idioma, esSerie, r } of resultados) {
    for (const raw of r.results ?? []) items.push({ item: esSerie ? mapearSerie(raw) : mapearPelicula(raw), idioma });
  }
  return items;
}

// A veces TMDB no tiene traducción propia para "es-419" (español
// latino) y, sin avisar, devuelve el mismo título que tiene cargado para
// "es-ES" (España) — es lo que pasaba con "Rápido y Furioso", que
// aparecía como "A todo gas" sin pasar por ninguna corrección (porque
// ya "encontramos" el título directamente en el idioma pedido, no hay
// nada que corregir desde el punto de vista del código). Acá comparamos,
// título por título, lo que vino en es-419 contra lo que vino en es-ES
// para el mismo id: si son idénticos (y hay un título en inglés
// distinto de ambos), es señal de que es-419 no tiene traducción propia
// y estamos mostrando la de España sin querer — en ese caso mostramos
// el título original en inglés en su lugar, que es menos "incorrecto"
// para un usuario latinoamericano que el de España.
function evitarTituloDeEspanaSinQuerer(entries: ResultadoConIdioma[], idiomaPreferido: string): ResultadoConIdioma[] {
  if (idiomaPreferido !== "es-419") return entries; // esto solo puede pasar pidiendo español latino
  const porClave = new Map<string, Map<string, ResultadoConIdioma>>();
  for (const entry of entries) {
    const clave = `${entry.item.tipo}-${entry.item.id}`;
    if (!porClave.has(clave)) porClave.set(clave, new Map());
    porClave.get(clave)!.set(entry.idioma, entry);
  }
  return entries.map((entry) => {
    if (entry.idioma !== "es-419") return entry;
    const variantes = porClave.get(`${entry.item.tipo}-${entry.item.id}`);
    const esES = variantes?.get("es-ES");
    const enUS = variantes?.get("en-US");
    const normalizar = (s: string) => s.trim().toLowerCase();
    if (esES && enUS && normalizar(entry.item.titulo) === normalizar(esES.item.titulo) && normalizar(entry.item.titulo) !== normalizar(enUS.item.titulo)) {
      return { ...entry, item: { ...entry.item, titulo: enUS.item.titulo } };
    }
    return entry;
  });
}

// Un mismo título puede aparecer en varias búsquedas de idioma — nos
// quedamos con UNA entrada por título, prefiriendo siempre la que vino del
// idioma de títulos que el usuario tiene configurado (Ajustes > Títulos),
// para que se vea "Rápido y Furioso" y no "A todo gas" si el usuario tiene
// puesto español latino, aunque el que haya encontrado la coincidencia
// haya sido el de España.
function mejorPorId(entries: ResultadoConIdioma[], idiomaPreferido: string): ResultadoConIdioma[] {
  const vistos = new Map<string, ResultadoConIdioma>();
  for (const entry of entries) {
    const clave = `${entry.item.tipo}-${entry.item.id}`;
    const actual = vistos.get(clave);
    if (!actual || (actual.idioma !== idiomaPreferido && entry.idioma === idiomaPreferido)) vistos.set(clave, entry);
  }
  return [...vistos.values()].sort((a, b) => b.item.popularidad - a.item.popularidad);
}

// Si terminamos quedándonos con un título que NO vino de la búsqueda en el
// idioma preferido (ej: solo lo encontramos por el título de España), acá
// se pide de nuevo su ficha puntual — que ya trae el título en el idioma
// configurado por default — y se corrige antes de mostrarlo.
async function corregirIdiomaMostrado(entries: ResultadoConIdioma[], idiomaPreferido: string): Promise<ResultadoTitulo[]> {
  return Promise.all(
    entries.map(async ({ item, idioma }) => {
      if (idioma === idiomaPreferido) return item;
      try {
        const detalle = item.tipo === "series" ? await getSeriesDetails(item.id) : await getMovieDetails(item.id);
        const tituloCorregido = item.tipo === "series" ? detalle.name : detalle.title;
        return tituloCorregido ? { ...item, titulo: tituloCorregido } : item;
      } catch (e) {
        console.error(`No se pudo corregir el idioma de "${item.titulo}":`, e);
        return item; // si falla la corrección, mostramos el que ya teníamos antes que nada
      }
    })
  );
}

/**
 * Busca títulos tolerando dos cosas que el buscador de TMDB no resuelve
 * solo: (1) que el título esté en otro idioma/región (busca en varios a la
 * vez, y corrige el título mostrado al idioma configurado por el usuario),
 * y (2) errores de tipeo — si la búsqueda "tal cual" no encuentra nada o
 * casi nada, prueba de nuevo con cada palabra importante por separado (el
 * motor de TMDB tolera algo de esto) y se queda solo con lo que resulte
 * razonablemente parecido a lo que escribiste. No es perfecto (no hay
 * forma de "adivinar" cualquier error de tipeo con certeza), pero ayuda en
 * la mayoría de los casos.
 *
 * Usado por la búsqueda principal (lupita), y también por los buscadores
 * de título para elegir foto de portada de perfil y tapa/banner de grupo
 * — misma calidad de búsqueda en todos lados.
 */
export async function buscarTitulosTolerante(texto: string, sigueVigente: () => boolean = () => true): Promise<ResultadoTitulo[]> {
  const idiomaPreferido = getTmdbLanguage();
  const idiomas = [idiomaPreferido, ...IDIOMAS_BUSQUEDA.filter((i) => i !== idiomaPreferido)];

  const directosConIdioma = evitarTituloDeEspanaSinQuerer(await buscarPorIdiomas(texto, idiomas), idiomaPreferido);
  const mejoresDirectos = mejorPorId(directosConIdioma, idiomaPreferido);

  // Si mientras esperábamos la respuesta el usuario ya siguió tipeando,
  // esta búsqueda quedó vieja y su resultado se va a descartar igual del
  // lado del que llama — no tiene sentido gastar más pedidos a TMDB
  // corrigiendo idiomas de algo que nadie va a ver.
  if (mejoresDirectos.length >= 3) {
    if (!sigueVigente()) return mejoresDirectos.map((e) => e.item);
    return corregirIdiomaMostrado(mejoresDirectos, idiomaPreferido);
  }

  // Muy pocos (o ningún) resultado directo — probamos tolerando errores de
  // tipeo: buscamos cada palabra clave por separado, y nos quedamos con lo
  // que quede razonablemente parecido al texto completo que escribiste.
  const claves = palabrasClave(texto);
  if (claves.length === 0) return corregirIdiomaMostrado(mejoresDirectos, idiomaPreferido);
  if (!sigueVigente()) return mejoresDirectos.map((e) => e.item);

  const fallbackConIdioma = (await Promise.all(claves.map((palabra) => buscarPorIdiomas(palabra, [idiomaPreferido])))).flat();

  const conParecido = mejorPorId(fallbackConIdioma, idiomaPreferido)
    .map((entry) => ({ entry, score: parecido(texto, entry.item.titulo) }))
    .filter(({ score }) => score >= 0.65) // bastante parecido, no cualquier cosa
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry);

  const combinados = mejorPorId([...mejoresDirectos, ...conParecido], idiomaPreferido);
  if (!sigueVigente()) return combinados.map((e) => e.item);
  return corregirIdiomaMostrado(combinados, idiomaPreferido);
}
