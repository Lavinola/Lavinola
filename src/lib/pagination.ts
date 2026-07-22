/**
 * Supabase (por PostgREST) nunca devuelve más de 1000 filas en una sola
 * consulta, aunque haya más — es un límite de seguridad que viene activado
 * por defecto, y lo hace en silencio (sin error, sin aviso). Para cualquier
 * usuario con más de 1000 películas, episodios vistos, comentarios, etc. eso
 * se traduce en listas y contadores truncados a 1000 sin que nada avise.
 *
 * Este helper pagina automáticamente con `.range()` hasta traer todo.
 */
export async function fetchAllRows<T>(
  queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const TAMANO_PAGINA = 1000;
  let todas: T[] = [];
  let desde = 0;

  while (true) {
    const { data, error } = await queryFactory(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    todas = todas.concat(data);
    if (data.length < TAMANO_PAGINA) break; // esta página vino incompleta = ya no hay más
    desde += TAMANO_PAGINA;
  }

  return todas;
}
