/**
 * Traducción de comentarios. Usa MyMemory (https://mymemory.translated.net/),
 * gratis y sin necesidad de API key — pensada justamente para volúmenes
 * chicos como este (traducir comentarios cortos, no textos largos). Si en
 * algún momento se vuelve un cuello de botella, se puede migrar a Google
 * Cloud Translation sin cambiar la firma de `traducirTexto`.
 */

/** De "es-419" / "en-US" / "pt-BR" a un código de 2 letras que entiende el traductor. */
export function idiomaCorto(contentLanguage: string | null | undefined): string {
  if (!contentLanguage) return "en";
  return contentLanguage.split("-")[0].toLowerCase();
}

const LIMITE_CARACTERES_MYMEMORY = 480; // el servicio gratis corta en 500; dejamos margen

async function traducirTrozo(texto: string, idiomaDestino: string): Promise<string> {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", texto);
  url.searchParams.set("langpair", `autodetect|${idiomaDestino}`);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`No se pudo traducir (${res.status}).`);
  const data = await res.json();

  // MyMemory devuelve error status 200 igual, con el mensaje de error METIDO
  // adentro del campo de traducción (no como error HTTP aparte) — por eso
  // antes se colaban mensajes como "QUERY LENGTH LIMIT EXCEEDED" como si
  // fueran el texto traducido. Achicamos esto revisando responseStatus (que
  // sí es confiable) antes de confiar en el texto que vino.
  const detalle = String(data?.responseDetails ?? "").toUpperCase();
  if (data?.responseStatus === 403 || detalle.includes("SELECT TWO DISTINCT LANGUAGES")) {
    return texto; // ya estaba en el idioma de destino, no hace falta traducir
  }
  if (data?.responseStatus && data.responseStatus !== 200) {
    throw new Error(`Error del traductor: ${detalle || data.responseStatus}`);
  }

  const traduccion = data?.responseData?.translatedText;
  if (!traduccion) throw new Error("El servicio de traducción no devolvió nada.");
  return traduccion;
}

export async function traducirTexto(texto: string, idiomaDestino: string): Promise<string> {
  if (texto.length <= LIMITE_CARACTERES_MYMEMORY) {
    return traducirTrozo(texto, idiomaDestino);
  }

  // Texto largo (ej. una reseña de varios párrafos, o un post/comentario
  // largo): el servicio gratis solo acepta ~500 caracteres por pedido, así
  // que lo partimos en oraciones y las agrupamos en tandas que entren en el
  // límite, traducimos cada tanda, y las volvemos a unir.
  const oraciones = texto.match(/[^.!?]+[.!?]+["')\]]*|\s*[^.!?]+$/g) ?? [texto];
  const tandas: string[] = [];
  let actual = "";
  for (const oracion of oraciones) {
    if ((actual + oracion).length > LIMITE_CARACTERES_MYMEMORY && actual) {
      tandas.push(actual);
      actual = oracion;
    } else {
      actual += oracion;
    }
  }
  if (actual) tandas.push(actual);

  // Red de seguridad: los posts/comentarios suelen ser más informales que
  // una reseña (poca o ninguna puntuación), así que a veces ni partiendo por
  // oraciones alcanza — puede quedar un solo "pedazo" larguísimo sin ningún
  // punto. Si eso pasa, lo cortamos a la fuerza por palabras, en trozos que
  // sí entren en el límite.
  const tandasFinales: string[] = [];
  for (const tanda of tandas) {
    if (tanda.length <= LIMITE_CARACTERES_MYMEMORY) {
      tandasFinales.push(tanda);
      continue;
    }
    const palabras = tanda.split(/(\s+)/);
    let trozo = "";
    for (const palabra of palabras) {
      if ((trozo + palabra).length > LIMITE_CARACTERES_MYMEMORY && trozo) {
        tandasFinales.push(trozo);
        trozo = palabra;
      } else {
        trozo += palabra;
      }
    }
    if (trozo) tandasFinales.push(trozo);
  }

  const traducidas = await Promise.all(tandasFinales.map((t) => traducirTrozo(t.trim(), idiomaDestino)));
  return traducidas.join(" ");
}
