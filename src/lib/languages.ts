export interface Idioma {
  code: string; // código language-region que entiende TMDB
  label: string;
}

// Los únicos idiomas que la app soporta de verdad (interfaz traducida). Si en algún
// momento sumamos otro idioma a la interfaz, se agrega acá.
export const IDIOMAS: Idioma[] = [
  { code: "en-US", label: "Inglés" },
  { code: "es-419", label: "Español (Latinoamérica)" },
  { code: "es-ES", label: "Español (España)" },
  { code: "pt-BR", label: "Portugués (Brasil)" },
  { code: "it-IT", label: "Italiano" },
];

/** Idioma sugerido según el país elegido en el registro (el usuario lo puede cambiar después en Ajustes). */
export function idiomaSugeridoPorPais(country: string | null): string {
  if (!country) return "es-419";
  if (country === "ES") return "es-ES";
  if (country === "BR" || country === "PT") return "pt-BR";
  if (country === "IT") return "it-IT";
  const hispanoamerica = ["AR", "BO", "CL", "CO", "CR", "CU", "DO", "EC", "SV", "GT", "HN", "MX", "NI", "PA", "PY", "PE", "PR", "UY", "VE"];
  if (hispanoamerica.includes(country)) return "es-419";
  // Cualquier otro país: inglés por default (es el idioma más universal de los que soportamos).
  return "en-US";
}
