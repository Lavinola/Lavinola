// Noticias de cine y series desde RSS de medios reales — no inventamos ni
// reescribimos contenido, solo mostramos título + resumen corto + fuente, y
// al tocar una se abre la nota original (por derechos de autor, no podemos
// reproducir el artículo completo adentro de la app).

export interface NoticiaFeed {
  titulo: string;
  resumen: string | null;
  imagen: string | null;
  link: string;
  fuente: string;
  fecha: string | null; // ISO si se pudo parsear, si no el texto crudo
}

interface FuenteFeed {
  url: string;
  nombre: string;
}

const FEEDS_POR_IDIOMA: Record<string, FuenteFeed[]> = {
  es: [
    { url: "https://www.sensacine.com/rss/noticias.xml", nombre: "SensaCine" },
    { url: "https://decine21.com/rss", nombre: "Decine21" },
  ],
  en: [
    { url: "https://variety.com/feed/", nombre: "Variety" },
    { url: "https://www.indiewire.com/feed/", nombre: "IndieWire" },
  ],
  pt: [
    { url: "https://www.adorocinema.com/rss/noticias.xml", nombre: "AdoroCinema" },
  ],
};

/** Decodifica entidades HTML de un texto: las nombradas más comunes (&amp;, &quot;, &nbsp;...) y CUALQUIER código numérico (&#8216; comillas tipográficas, &#160; espacio, &#x2019; en hexadecimal, etc. — los feeds de noticias como Variety usan bastantes de estos que no vienen "de memoria", hay que decodificarlos genéricamente). */
function decodificarEntidadesHtml(texto: string): string {
  return texto
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…");
}

function textoDeEtiqueta(xml: string, etiqueta: string): string | null {
  // Cubre tanto <titulo>texto</titulo> como <titulo><![CDATA[texto]]></titulo>
  const regexCdata = new RegExp(`<${etiqueta}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${etiqueta}>`, "i");
  const regexSimple = new RegExp(`<${etiqueta}[^>]*>([\\s\\S]*?)<\\/${etiqueta}>`, "i");
  const m = xml.match(regexCdata) ?? xml.match(regexSimple);
  if (!m) return null;
  return decodificarEntidadesHtml(
    m[1].replace(/<[^>]+>/g, "") // por si el resumen trae HTML adentro
  ).trim();
}

function imagenDeItem(xml: string): string | null {
  const enclosure = xml.match(/<enclosure[^>]*url="([^"]+)"[^>]*>/i);
  if (enclosure) return enclosure[1];
  const media = xml.match(/<media:content[^>]*url="([^"]+)"[^>]*>/i);
  if (media) return media[1];
  const imgEnDescripcion = xml.match(/<img[^>]*src="([^"]+)"/i);
  if (imgEnDescripcion) return imgEnDescripcion[1];
  return null;
}

async function parsearFeed(url: string, nombreFuente: string): Promise<NoticiaFeed[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
    return items
      .map((item) => {
        const titulo = textoDeEtiqueta(item, "title");
        const link = (item.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? "").trim();
        if (!titulo || !link) return null;
        const resumenCrudo = textoDeEtiqueta(item, "description") ?? textoDeEtiqueta(item, "content:encoded");
        const resumen = resumenCrudo ? resumenCrudo.slice(0, 220) : null;
        const fecha = textoDeEtiqueta(item, "pubDate");
        return {
          titulo,
          resumen,
          imagen: imagenDeItem(item),
          link,
          fuente: nombreFuente,
          fecha,
        };
      })
      .filter((n): n is NoticiaFeed => n !== null);
  } catch (e) {
    console.error(`No se pudo traer/parsear el feed de ${nombreFuente}:`, e);
    return [];
  }
}

/** idioma esperado: "es", "en" o "pt" (los primeros 2 caracteres del locale alcanzan). */
export async function listarNoticias(idioma: string): Promise<NoticiaFeed[]> {
  const clave = idioma.slice(0, 2).toLowerCase();
  const fuentes = FEEDS_POR_IDIOMA[clave] ?? FEEDS_POR_IDIOMA.en;

  const resultados = await Promise.all(fuentes.map((f) => parsearFeed(f.url, f.nombre)));
  const todas = resultados.flat();

  todas.sort((a, b) => {
    const fa = a.fecha ? new Date(a.fecha).getTime() : 0;
    const fb = b.fecha ? new Date(b.fecha).getTime() : 0;
    return fb - fa;
  });

  return todas;
}
