/** Distancia de edición entre dos textos: cuántas letras hay que cambiar/agregar/sacar para pasar de uno al otro. Sirve para medir "qué tan parecidas" son dos palabras, sin necesitar ninguna librería externa. */
export function distanciaEdicion(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let anterior = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? anterior : 1 + Math.min(anterior, dp[j], dp[j - 1]);
      anterior = temp;
    }
  }
  return dp[n];
}

/** De 0 a 1 (1 = idénticas), a partir de la distancia de edición normalizada por el largo. */
export function parecido(a: string, b: string): number {
  const distancia = distanciaEdicion(a.toLowerCase(), b.toLowerCase());
  const largoMax = Math.max(a.length, b.length, 1);
  return 1 - distancia / largoMax;
}

const STOPWORDS = new Set(["de", "la", "el", "los", "las", "y", "o", "en", "un", "una", "del", "the", "of", "and", "a", "an"]);

/** Palabras "importantes" de una búsqueda (sin las cortas/conectores), para buscar por partes cuando la frase completa no encuentra nada. */
export function palabrasClave(texto: string): string[] {
  return texto
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length >= 4 && !STOPWORDS.has(p));
}
