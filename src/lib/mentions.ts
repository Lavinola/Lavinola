import { supabase } from "./supabase";
import { listarMiembrosIds } from "./groups";

export interface CandidatoMencion {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

/**
 * Candidatos para autocompletar un "@" — siempre gente que seguís. Si se
 * pasa `groupId`, además tienen que ser miembros de ese grupo (mencionar
 * ahí a alguien que sigue pero no está en el grupo no tendría sentido:
 * no puede ver el comentario).
 */
export async function buscarCandidatosMencion(userId: string, query: string, groupId?: string | null): Promise<CandidatoMencion[]> {
  const { data: sigo } = await supabase.from("follows").select("followee_id").eq("follower_id", userId);
  let idsPermitidos = (sigo ?? []).map((f: any) => f.followee_id as string);
  if (idsPermitidos.length === 0) return [];

  if (groupId) {
    const miembros = new Set(await listarMiembrosIds(groupId));
    idsPermitidos = idsPermitidos.filter((id) => miembros.has(id));
    if (idsPermitidos.length === 0) return [];
  }

  let consulta = supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", idsPermitidos).limit(8);
  if (query.trim()) {
    consulta = consulta.or(`username.ilike.%${query}%,display_name.ilike.%${query}%`);
  }
  const { data } = await consulta;
  return (data ?? []) as CandidatoMencion[];
}

/** Detecta @usuarios en un texto ya escrito (para el autocompletado: qué se está tipeando ahora mismo). */
export const REGEX_MENCION = /@([a-zA-Z0-9_]{1,30})/g;

/**
 * Dado el texto completo y dónde está el cursor, busca si justo ahí hay un
 * "@algo" en construcción (sin espacio después) — devuelve la porción ya
 * tipeada después del @ (para buscar candidatos) y en qué posición
 * empieza el @, para poder reemplazarlo al elegir alguien.
 */
export function detectarMencionEnCurso(texto: string, posicionCursor: number): { query: string; inicio: number } | null {
  const textoHastaCursor = texto.slice(0, posicionCursor);
  const match = /@([a-zA-Z0-9_]*)$/.exec(textoHastaCursor);
  if (!match) return null;
  return { query: match[1], inicio: match.index };
}

/** Reemplaza el "@algo" en construcción por "@username " completo, y devuelve el texto nuevo + dónde queda el cursor. */
export function completarMencion(texto: string, inicio: number, posicionCursor: number, username: string): { texto: string; cursor: number } {
  const antes = texto.slice(0, inicio);
  const despues = texto.slice(posicionCursor);
  const inserto = `@${username} `;
  return { texto: antes + inserto + despues, cursor: antes.length + inserto.length };
}

export interface SegmentoTexto {
  texto: string;
  esMencion: boolean;
}

/** Parte un texto ya publicado en segmentos comunes y de "@mención", para poder renderizar cada mención en negrita y tocable por separado. */
export function partirTextoConMenciones(texto: string): SegmentoTexto[] {
  const segmentos: SegmentoTexto[] = [];
  let ultimoIndice = 0;
  const regex = /@([a-zA-Z0-9_]{1,30})/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(texto))) {
    if (match.index > ultimoIndice) segmentos.push({ texto: texto.slice(ultimoIndice, match.index), esMencion: false });
    segmentos.push({ texto: match[0], esMencion: true });
    ultimoIndice = match.index + match[0].length;
  }
  if (ultimoIndice < texto.length) segmentos.push({ texto: texto.slice(ultimoIndice), esMencion: false });
  return segmentos;
}

/** Al tocar una @mención ya publicada: busca el userId por username y navega a su perfil. */
export async function irAPerfilPorUsername(username: string, navigation: any) {
  const { data } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
  if (data?.id) navigation.navigate("PerfilAjeno", { userId: data.id });
}
