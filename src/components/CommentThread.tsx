import React, { useEffect, useState, useCallback } from "react";
import { View, TextInput, Pressable, Image, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Alert } from "../lib/alert";
import { Ionicons } from "@expo/vector-icons";
import {
  Comentario,
  OrdenComentarios,
  cargarComentariosRaiz,
  cargarRespuestas,
  postearComentario,
  reaccionar,
  eliminarComentario,
  listarReaccionesDeComentario,
  ReaccionConAutor,
  obtenerCadenaAncestros,
} from "../lib/comments";
import ReaccionesListModal from "./ReaccionesListModal";
import ReportModal from "./ReportModal";
import ConfirmModal from "./ConfirmModal";
import { traducirTexto, idiomaCorto } from "../lib/translate";
import { posterUrl } from "../lib/tmdb";
import { formatearFechaHora, formatearTiempoRelativo } from "../lib/dates";
import { supabase } from "../lib/supabase";
import { Text } from "../components/Themed";
import ActionSheetModal from "./ActionSheetModal";
import ExpandableText from "./ExpandableText";
import NombreUsuario from "./NombreUsuario";
import Avatar from "./Avatar";
import { impactoLiviano } from "../lib/haptics";
import { MOODS } from "../lib/moods";
import IconoReaccion, { REACCIONES_ICONO } from "./IconoReaccion";
import { chequearSubidaDeNivel, NivelInsignia } from "../lib/badges";
import NivelUpModal from "./NivelUpModal";
import QueVemosModal from "./QueVemosModal";
import { listarMiembrosIds } from "../lib/groups";
import { guardarItem, quitarGuardado } from "../lib/savedItems";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  targetType: "series" | "movie" | "episode" | "group" | "post" | "poll";
  targetId: string;
  groupId?: string;
  navigation?: any;
  soloLectura?: boolean;
  highlightCommentId?: string; // si viene, ese comentario se muestra primero y resaltado (venís de una notificación o de "Posts/Comentarios")
  soloSiguiendo?: boolean; // si viene true, solo muestra comentarios de gente que seguís
  soloAutorId?: string; // si viene, solo muestra comentarios de ESE usuario (para la pestaña "Yo")
  mostrarTipo?: boolean; // solo true en Comentarios/Posts de la ficha de un título — en todos lados más, no hace falta aclarar que es un comentario
  contenidoExtra?: React.ReactNode; // se muestra ENTRE la barra de escribir y la lista de comentarios (ej: publicaciones del Lobby sobre este título)
  onAbrirEncuesta?: () => void; // si viene (solo grupos), se muestra el botón "Encuesta" al lado de "¿Qué vemos?"
  onAbrirRecomendar?: () => void; // si viene (solo grupos), se muestra el botón "Recomendar" a la izquierda de "¿Qué vemos?"
  elementosExtra?: ElementoExtra[]; // cosas que NO son comentarios (ej: encuestas) pero se mezclan y ordenan junto con ellos, como si fuesen un mensaje más
}

export interface ElementoExtra {
  id: string;
  createdAt: string;
  pesoRespuestas: number; // para el criterio de orden "más respuestas"
  render: () => React.ReactNode;
}

// Antes cada nivel de respuesta se indentaba un poco más que el anterior,
// hasta que a partir de cierta profundidad el mensaje quedaba tan
// corrido a la derecha que no se veía entero. Ahora TODAS las respuestas
// (sin importar cuán anidadas estén) quedan a la misma indentación que
// una respuesta de primer nivel — la que las agrupa es la rayita
// vertical, no el corrimiento hacia la derecha.

/** Un pedacito del texto citado, corto para que entre en un renglón — o "GIF" si el mensaje citado era solo un GIF sin texto. */
function extractoDeComentario(c: Comentario): string {
  const texto = c.content?.trim();
  if (texto) return texto.length > 40 ? texto.slice(0, 40).trim() + "..." : texto;
  if (c.gif_url) return "GIF";
  return "";
}

export default function CommentThread({ targetType, targetId, groupId, navigation, soloLectura, highlightCommentId, soloSiguiendo, soloAutorId, mostrarTipo, contenidoExtra, onAbrirEncuesta, onAbrirRecomendar, elementosExtra }: Props) {
  const { t } = useT();
  const [orden, setOrden] = useState<OrdenComentarios>(targetType === "group" ? "nuevo" : "viejo");
  const [raiz, setRaiz] = useState<Comentario[]>([]);
  const [nuevoTexto, setNuevoTexto] = useState("");
  const [nivelSubido, setNivelSubido] = useState<NivelInsignia | null>(null);
  const [gifElegido, setGifElegido] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [idiomaUsuario, setIdiomaUsuario] = useState("en");
  const [siguiendoIds, setSiguiendoIds] = useState<Set<string> | null>(null);
  const [miPais, setMiPais] = useState<string | null>(null);
  const [miembroIds, setMiembroIds] = useState<string[]>([]);
  const [queVemosVisible, setQueVemosVisible] = useState(false);
  // Si el comentario a resaltar es una respuesta anidada (no un comentario
  // raíz), hace falta saber por qué hilos colapsados hay que "abrir camino"
  // para llegar hasta él, y cuál es su comentario raíz (para poder
  // mostrarlo primero en la lista, como ya se hacía cuando era raíz).
  const [idsAExpandir, setIdsAExpandir] = useState<Set<string>>(new Set());
  const [raizDelResaltado, setRaizDelResaltado] = useState<string | null>(highlightCommentId ?? null);

  useEffect(() => {
    if (!highlightCommentId) return;
    obtenerCadenaAncestros(highlightCommentId)
      .then((ancestros) => {
        setIdsAExpandir(new Set(ancestros));
        setRaizDelResaltado(ancestros.length > 0 ? ancestros[ancestros.length - 1] : highlightCommentId);
      })
      .catch((e) => console.error("No se pudo resolver la cadena de respuestas del comentario a resaltar:", e));
  }, [highlightCommentId]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: perfil } = await supabase.from("profiles").select("content_language, country").eq("id", uid).maybeSingle();
        setIdiomaUsuario(idiomaCorto(perfil?.content_language));
        setMiPais(perfil?.country ?? "AR");
        if (soloSiguiendo) {
          const { data: sigo } = await supabase.from("follows").select("followee_id").eq("follower_id", uid);
          setSiguiendoIds(new Set((sigo ?? []).map((f: any) => f.followee_id)));
        }
      }
    });
    if (targetType === "group" && groupId) listarMiembrosIds(groupId).then(setMiembroIds);
    cargar();
  }, [orden]);

  // Sin esto, al volver de otra pantalla (por ej. después de recomendar un
  // título desde el botón nuevo, o de postear algo) los comentarios/posts
  // no se actualizaban solos — quedaban con los datos viejos hasta que la
  // pantalla se volvía a montar de cero (saliendo del todo y volviendo).
  useFocusEffect(
    useCallback(() => {
      cargar();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetType, targetId, groupId, orden])
  );

  async function cargar() {
    const data = await cargarComentariosRaiz(targetType, targetId, orden, userId);
    setRaiz(data);
  }

  function abrirGifPicker(onElegir: (url: string) => void) {
    if (!navigation) return;
    navigation.navigate("ElegirGif", { onElegir });
  }

  async function enviar() {
    if ((!nuevoTexto.trim() && !gifElegido) || !userId) return;
    try {
      await postearComentario({ userId, targetType, targetId, groupId, content: nuevoTexto.trim(), gifUrl: gifElegido });
      setNuevoTexto("");
      setGifElegido(null);
      chequearSubidaDeNivel(userId)
        .then((nivel) => nivel && setNivelSubido(nivel))
        .catch((e) => console.error("Error al chequear el nivel de insignias:", e));
      await cargar();
    } catch (e: any) {
      console.error("Error al postear comentario:", e);
      Alert.alert("No se pudo publicar", e.message ?? "Revisá tu conexión y probá de nuevo.");
    }
  }

  return (
    <>
    <View style={styles.container}>
      {targetType === "group" && groupId && (
        <View style={styles.botonesGrupoRow}>
          {onAbrirRecomendar && (
            <Pressable style={styles.queVemosBtn} onPress={onAbrirRecomendar}>
              <Text style={styles.queVemosBtnTexto}>{t("Recomendar")}</Text>
            </Pressable>
          )}
          <Pressable style={styles.queVemosBtn} onPress={() => setQueVemosVisible(true)}>
            <Text style={styles.queVemosBtnTexto}>{t("¿Qué vemos?")}</Text>
          </Pressable>
          {onAbrirEncuesta && (
            <Pressable style={styles.queVemosBtn} onPress={onAbrirEncuesta}>
              <Text style={styles.queVemosBtnTexto}>{t("Encuesta")}</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.ordenRow}>
        {(["nuevo", "viejo", "relevante"] as OrdenComentarios[]).map((o) => (
          <Pressable key={o} onPress={() => setOrden(o)} style={[styles.ordenChip, orden === o && styles.ordenChipActive]}>
            <Text style={orden === o ? styles.ordenTextActive : styles.ordenText}>
              {o === "nuevo" ? t("Más nuevo") : o === "viejo" ? t("Más antiguo") : t("Más relevante")}
            </Text>
          </Pressable>
        ))}
      </View>

      {gifElegido && (
        <View style={styles.gifPreviewBox}>
          <Image source={{ uri: gifElegido }} style={styles.gifPreview} />
          <Pressable onPress={() => setGifElegido(null)} style={styles.gifQuitar}>
            <Text style={styles.gifQuitarTexto}>✕</Text>
          </Pressable>
        </View>
      )}

      {!soloLectura && (
        <View style={styles.inputRow}>
          <TextInput
            placeholderTextColor={theme.colors.textFaint}
            style={styles.input}
            placeholder={t("Comentar (texto y/o GIF)...")}
            value={nuevoTexto}
            onChangeText={setNuevoTexto}
            multiline
            maxLength={2000}
          />
          <View style={{ flexDirection: "row" }}>
            <Pressable style={styles.gifBtn} onPress={() => abrirGifPicker(setGifElegido)}>
              <Text style={styles.gifBtnTexto}>GIF</Text>
            </Pressable>
            <Pressable style={styles.enviarBtn} onPress={enviar}>
              <Text style={styles.enviarBtnText}>{t("Publicar")}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {contenidoExtra}

      {(() => {
        type ItemCombinado =
          | { esExtra: false; id: string; createdAt: string; peso: number; comentario: Comentario }
          | { esExtra: true; id: string; createdAt: string; peso: number; render: () => React.ReactNode };

        const items: ItemCombinado[] = [
          ...raiz
            .filter((c) => !soloSiguiendo || !siguiendoIds || siguiendoIds.has(c.user_id))
            .filter((c) => !soloAutorId || c.user_id === soloAutorId)
            .map((c) => ({ esExtra: false as const, id: c.id, createdAt: c.created_at, peso: c.reply_count + c.likes_count, comentario: c })),
          ...(elementosExtra ?? []).map((e) => ({ esExtra: true as const, id: e.id, createdAt: e.createdAt, peso: e.pesoRespuestas, render: e.render })),
        ];

        items.sort((a, b) => {
          if (a.id === raizDelResaltado) return -1;
          if (b.id === raizDelResaltado) return 1;
          if (orden === "viejo") return a.createdAt.localeCompare(b.createdAt);
          if (orden === "relevante") return b.peso - a.peso || b.createdAt.localeCompare(a.createdAt); // empate: más nuevo primero
          return b.createdAt.localeCompare(a.createdAt); // "nuevo", el criterio por defecto
        });

        return items.map((item) =>
          item.esExtra ? (
            <React.Fragment key={item.id}>{item.render()}</React.Fragment>
          ) : (
            <NodoComentario
              key={item.id}
              comentario={item.comentario}
              nivel={0}
              userId={userId}
              idiomaUsuario={idiomaUsuario}
              onReply={cargar}
              targetType={targetType}
              targetId={targetId}
              groupId={groupId}
              navigation={navigation}
              resaltado={item.id === highlightCommentId}
              highlightCommentId={highlightCommentId}
              idsAExpandir={idsAExpandir}
              mostrarTipo={mostrarTipo}
            />
          )
        );
      })()}
    </View>
    <NivelUpModal nivel={nivelSubido} onCerrar={() => setNivelSubido(null)} />
    {targetType === "group" && groupId && userId && (
      <QueVemosModal
        modo="grupo"
        visible={queVemosVisible}
        onCerrar={() => setQueVemosVisible(false)}
        groupId={groupId}
        userId={userId}
        miembroIds={miembroIds}
        watchRegion={miPais ?? "AR"}
        onEnviado={cargar}
      />
    )}
    </>
  );
}

export function NodoComentario({
  comentario,
  nivel,
  userId,
  idiomaUsuario,
  onReply,
  targetType,
  targetId,
  groupId,
  navigation,
  resaltado,
  highlightCommentId,
  idsAExpandir,
  mostrarTipo,
  padrePreview,
}: {
  comentario: Comentario;
  navigation?: any;
  nivel: number;
  userId: string | null;
  idiomaUsuario: string;
  onReply: () => void;
  targetType: Props["targetType"];
  targetId: string;
  groupId?: string;
  resaltado?: boolean;
  highlightCommentId?: string;
  idsAExpandir?: Set<string>;
  mostrarTipo?: boolean;
  padrePreview?: { nombre: string; extracto: string } | null; // si viene, se muestra "↳ En respuesta a @nombre "extracto..."" arriba (a partir de cierto nivel, cuando ya no se sigue sangrando)
}) {
  const [respuestas, setRespuestas] = useState<Comentario[] | null>(null);
  const [expandido, setExpandido] = useState(false);
  const [mostrandoInput, setMostrandoInput] = useState(false);
  const [reportarVisible, setReportarVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  // Se traen las respuestas apenas se monta el comentario, para que el
  // numerito de la burbujita sea siempre preciso desde el principio. Antes
  // esto se saltaba si comentario.reply_count parecía ser 0 — pero ese
  // valor viene de la consulta de comentarios raíz y en la práctica no
  // estaba siendo confiable al volver a entrar al grupo (quedaba en
  // blanco hasta tocar la burbujita). Trayendo la lista real siempre, el
  // número que se muestra es siempre el correcto, sin depender de ese
  // contador guardado.
  useEffect(() => {
    cargarRespuestas(comentario.id, userId).then(setRespuestas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comentario.id]);

  // Si este comentario es un "escalón" en el camino hacia el comentario
  // resaltado (venís de una notificación de respuesta anidada), se abre
  // solo — si no, quedaría escondido detrás de un "ver respuestas".
  useEffect(() => {
    if (idsAExpandir?.has(comentario.id)) setExpandido(true);
  }, [idsAExpandir, comentario.id]);
  const [confirmEliminarVisible, setConfirmEliminarVisible] = useState(false);
  const [eliminado, setEliminado] = useState(false);
  const [spoilerVisible, setSpoilerVisible] = useState(false);
  const [reaccionesPickerVisible, setReaccionesPickerVisible] = useState(false);
  const [texto, setTexto] = useState("");
  const [gifElegido, setGifElegido] = useState<string | null>(null);
  const [miReaccion, setMiReaccion] = useState<string | null>(comentario.mi_reaccion);
  const [guardado, setGuardado] = useState(comentario.is_saved ?? false);
  const [reacciones, setReacciones] = useState<Record<string, number>>(comentario.reacciones ?? {});
  const { t } = useT();
  const [traduccion, setTraduccion] = useState<string | null>(null);
  const [traduciendo, setTraduciendo] = useState(false);
  const [reaccionesModalVisible, setReaccionesModalVisible] = useState(false);
  const [listaReacciones, setListaReacciones] = useState<ReaccionConAutor[]>([]);

  async function traducir() {
    if (traduccion) {
      setTraduccion(null); // toggle: si ya estaba traducido, volvemos al original
      return;
    }
    setTraduciendo(true);
    try {
      setTraduccion(await traducirTexto(comentario.content, idiomaUsuario));
    } catch (e: any) {
      Alert.alert("No se pudo traducir", e.message ?? "Probá de nuevo en un rato.");
    } finally {
      setTraduciendo(false);
    }
  }

  async function abrirRespuestas() {
    if (expandido) {
      setExpandido(false);
      return;
    }
    if (!respuestas) {
      // Por si todavía no se cargaron solas (ej. si reply_count estaba en
      // 0 al montar pero en realidad sí hay respuestas).
      setRespuestas(await cargarRespuestas(comentario.id, userId));
    }
    setExpandido(true);
  }

  function abrirGifPicker() {
    if (!navigation) return;
    navigation.navigate("ElegirGif", { onElegir: setGifElegido });
  }

  async function responder() {
    if ((!texto.trim() && !gifElegido) || !userId) return;
    try {
      await postearComentario({
        userId,
        targetType,
        targetId,
        groupId,
        content: texto.trim(),
        gifUrl: gifElegido,
        parentCommentId: comentario.id,
      });
      setTexto("");
      setGifElegido(null);
      setMostrandoInput(false);
      await onReply();
      // Antes acá se llamaba a abrirRespuestas(), que en realidad es un
      // interruptor (si ya estaban abiertas, las cierra) — si respondías
      // con la lista de respuestas ya abierta, tu respuesta se guardaba
      // bien pero la lista se colapsaba en vez de mostrarla actualizada,
      // y parecía que había desaparecido. Ahora siempre se vuelve a
      // cargar y se deja abierta, sin importar cómo estaba antes.
      setRespuestas(await cargarRespuestas(comentario.id, userId));
      setExpandido(true);
    } catch (e: any) {
      console.error("Error al postear respuesta:", e);
      Alert.alert("No se pudo publicar", e.message ?? "Revisá tu conexión y probá de nuevo.");
    }
  }

  function toggleGuardado() {
    if (!userId) return;
    const anterior = guardado;
    setGuardado(!anterior);
    (async () => {
      try {
        if (anterior) await quitarGuardado(userId, "comment", comentario.id);
        else await guardarItem(userId, "comment", comentario.id);
      } catch (e: any) {
        setGuardado(anterior);
        Alert.alert("No se pudo guardar", e.message);
      }
    })();
  }

  async function elegirReaccion(emoji: string) {
    if (!userId) return;
    impactoLiviano();
    setReaccionesPickerVisible(false);
    const nuevasReacciones = { ...reacciones };
    if (miReaccion) nuevasReacciones[miReaccion] = Math.max(0, (nuevasReacciones[miReaccion] ?? 1) - 1);
    if (miReaccion === emoji) {
      setMiReaccion(null);
    } else {
      nuevasReacciones[emoji] = (nuevasReacciones[emoji] ?? 0) + 1;
      setMiReaccion(emoji);
    }
    setReacciones(nuevasReacciones);
    await reaccionar(userId, comentario.id, emoji, miReaccion);
    // Sin esto, la reacción se veía bien al toque pero solo en esta
    // instancia puntual — si esta parte de la pantalla se volvía a armar
    // (cerrar/abrir respuestas, volver a la pantalla), usaba datos viejos
    // y la reacción "desaparecía" visualmente aunque siguiera guardada.
    onReplyPropagado();
  }

  function reportarComentario() {
    if (!userId) return;
    setReportarVisible(true);
  }

  async function confirmarEliminarComentario() {
    setConfirmEliminarVisible(false);
    try {
      await eliminarComentario(comentario.id);
      setEliminado(true);
      await onReply(); // avisa al padre para que actualice su lista — si no, al volver a montar este comentario (ej: cerrar y abrir la burbujita) reaparecía
    } catch (e: any) {
      Alert.alert("No se pudo eliminar", e.message);
    }
  }

  const totalReacciones = Object.values(reacciones).reduce((a, b) => a + b, 0);
  const emojisUsados = Object.entries(reacciones).filter(([, n]) => n > 0);
  const esMiComentario = !!userId && userId === comentario.user_id;

  async function tocarBotonReaccion() {
    if (esMiComentario) {
      if (totalReacciones === 0) return; // nada que mostrar, y no te podés reaccionar a vos mismo
      try {
        setListaReacciones(await listarReaccionesDeComentario(comentario.id));
        setReaccionesModalVisible(true);
      } catch (e: any) {
        Alert.alert("No se pudo cargar", e.message);
      }
    } else {
      setReaccionesPickerVisible((v) => !v);
    }
  }

  /**
   * Al borrar (o responder), avisa hacia arriba con onReply — pero eso
   * solo refresca el nivel más externo (la lista raíz, o el post). Si el
   * cambio pasó en un nivel intermedio, ese nivel nunca se enteraba y
   * seguía mostrando datos viejos hasta cerrar/abrir. Por eso, en vez de
   * pasarles a mis hijos el mismo onReply que yo recibí, les paso una
   * versión que primero refresca MIS propias respuestas (donde vive el
   * que se borró) y recién después avisa hacia arriba — así, sin importar
   * cuán anidado esté el cambio, se actualiza en cada nivel del camino.
   */
  async function onReplyPropagado() {
    if (respuestas !== null) setRespuestas(await cargarRespuestas(comentario.id, userId));
    await onReply();
  }

  // Se sangra normalmente hasta el 2do nivel — de ahí en más, en vez de
  // seguir corriendo el mensaje hacia la derecha (hasta que no entra en
  // pantalla), queda en la misma columna que el 2do nivel, y se aclara
  // arriba a quién le está respondiendo.
  const indentacion = nivel > 0 && nivel <= 2 ? 14 : 0;

  if (eliminado) return null;

  return (
    <View style={[{ marginTop: 8, marginLeft: indentacion }, nivel === 0 && targetType === "group" && styles.hiloRaizBox]}>
      {!!padrePreview && (
        <View style={styles.respondiendoARow}>
          <Text style={styles.respondiendoATexto} numberOfLines={1}>
            ↳ {t("En respuesta a")} @{padrePreview.nombre}
            {padrePreview.extracto ? (padrePreview.extracto === "GIF" ? " GIF" : ` "${padrePreview.extracto}"`) : ""}
          </Text>
        </View>
      )}
      <View style={[styles.comentarioBox, resaltado && styles.comentarioBoxResaltado]}>
        <View style={styles.encabezadoRow}>
          <Pressable
            disabled={!navigation}
            onPress={() => navigation?.navigate("PerfilAjeno", { userId: comentario.user_id })}
            style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
          >
            <Avatar uri={comentario.autor_avatar_url} size={22} style={{ marginRight: 6 }} />
            <View style={{ flexDirection: "row", alignItems: "baseline", flexShrink: 1 }}>
              <NombreUsuario style={styles.autor} displayName={comentario.autor_display_name} username={comentario.autor_username} numberOfLines={1} />
              <Text style={styles.fechaComentario}>{formatearTiempoRelativo(comentario.created_at)}</Text>
            </View>
          </Pressable>
          {nivel === 0 && mostrarTipo && (
            <View style={styles.tipoTag}>
              <Text style={styles.tipoTagTexto}>{t("Comentario")}</Text>
            </View>
          )}
          <Pressable onPress={() => setReportarVisible(true)} hitSlop={10}>
            <Text style={styles.menuPuntitos}>⋯</Text>
          </Pressable>
        </View>
        {(comentario.shared_tmdb_id || comentario.shared_group_id || comentario.shared_list_id) && (
          <RecomendacionPreview
            itemType={comentario.shared_item_type}
            tmdbId={comentario.shared_tmdb_id}
            seasonNumber={comentario.shared_season_number}
            episodeNumber={comentario.shared_episode_number}
            groupId={comentario.shared_group_id}
            listId={comentario.shared_list_id}
            autorUsername={comentario.autor_username}
            autorId={comentario.user_id}
            navigation={navigation}
            esQueVemos={comentario.es_que_vemos}
          />
        )}
        {comentario.content ? (
          comentario.has_spoiler && !spoilerVisible ? (
            <Pressable style={styles.spoilerBox} onPress={() => setSpoilerVisible(true)}>
              <Text style={styles.spoilerTexto}>{t("Contiene spoiler")}</Text>
              <Text style={styles.spoilerVerTexto}>{t("Ver")}</Text>
            </Pressable>
          ) : (
            <ExpandableText texto={traduccion ?? comentario.content} style={styles.contenido} />
          )
        ) : null}
        {comentario.gif_url && <Image source={{ uri: comentario.gif_url }} style={styles.gifEnComentario} />}

        {reaccionesPickerVisible && (
          <View style={styles.emojiPickerRow}>
            {REACCIONES_ICONO.map((r) => (
              <Pressable key={r.key} onPress={() => elegirReaccion(r.key)} style={styles.emojiPickerBtn}>
                <Ionicons name={r.icono} size={22} color={theme.colors.primaryLight} />
              </Pressable>
            ))}
            {MOODS.map((m) => (
              <Pressable key={m.key} onPress={() => elegirReaccion(m.key)} style={styles.emojiPickerBtn}>
                <Image source={m.imagen} style={styles.emojiPickerImagen} resizeMode="contain" />
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.accionesRow}>
          <Pressable onPress={tocarBotonReaccion} style={styles.resumenReaccion}>
            <IconoReaccion reaccionKey={miReaccion ?? ""} size={16} />
            <Text style={styles.accionTexto}>
              {emojisUsados.length > 0 ? emojisUsados.map(([, n]) => n).reduce((a, b) => a + b, 0) : totalReacciones || ""}
            </Text>
          </Pressable>
          <Pressable onPress={abrirRespuestas} style={styles.resumenReaccion}>
            <Ionicons name="chatbubble-outline" size={16} color={theme.colors.textMuted} />
            <Text style={styles.accionTexto}>{respuestas ? respuestas.length : comentario.reply_count}</Text>
          </Pressable>
          <Pressable onPress={() => setMostrandoInput(!mostrandoInput)}>
            <Text style={styles.accionTexto}>{t("Responder")}</Text>
          </Pressable>
          {targetType === "post" && (
            <Pressable onPress={toggleGuardado} hitSlop={6}>
              <Ionicons name={guardado ? "bookmark" : "bookmark-outline"} size={16} color={guardado ? theme.colors.primary : theme.colors.textMuted} />
            </Pressable>
          )}
          {comentario.content && (
            <Pressable onPress={traducir} disabled={traduciendo} hitSlop={6} style={styles.traducirBtn}>
              <Text style={styles.traducirTexto}>{traduciendo ? t("Traduciendo...") : traduccion ? t("Ver original") : t("Traducir")}</Text>
            </Pressable>
          )}
        </View>

        {mostrandoInput && (
          <>
            {gifElegido && (
              <View style={styles.gifPreviewBox}>
                <Image source={{ uri: gifElegido }} style={styles.gifPreview} />
                <Pressable onPress={() => setGifElegido(null)} style={styles.gifQuitar}>
                  <Text style={styles.gifQuitarTexto}>✕</Text>
                </Pressable>
              </View>
            )}
            <View style={styles.inputRow}>
              <TextInput
                placeholderTextColor={theme.colors.textFaint}
                style={styles.input}
                value={texto}
                onChangeText={setTexto}
                placeholder={t("Tu respuesta...")}
                multiline
                maxLength={2000}
              />
              <Pressable style={styles.gifBtn} onPress={abrirGifPicker}>
                <Text style={styles.gifBtnTexto}>GIF</Text>
              </Pressable>
              <Pressable style={styles.enviarBtn} onPress={responder}>
                <Text style={styles.enviarBtnText}>Enviar</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      {expandido &&
        respuestas?.map((r) => (
          <NodoComentario
            key={r.id}
            comentario={r}
            nivel={nivel + 1}
            userId={userId}
            idiomaUsuario={idiomaUsuario}
            onReply={onReplyPropagado}
            targetType={targetType}
            targetId={targetId}
            groupId={groupId}
            navigation={navigation}
            resaltado={r.id === highlightCommentId}
            highlightCommentId={highlightCommentId}
            idsAExpandir={idsAExpandir}
            padrePreview={nivel + 1 > 2 ? { nombre: comentario.autor_username ?? "", extracto: extractoDeComentario(comentario) } : undefined}
          />
      ))}
      <ActionSheetModal
        visible={reportarVisible}
        onCerrar={() => setReportarVisible(false)}
        titulo={formatearFechaHora(comentario.created_at)}
        opciones={[
          ...(userId === comentario.user_id
            ? [{ label: t("Eliminar"), icono: "trash-outline" as const, destructivo: true, onPress: () => { setReportarVisible(false); setConfirmEliminarVisible(true); } }]
            : [{ label: t("Denunciar"), icono: "flag-outline" as const, destructivo: true, onPress: () => { setReportarVisible(false); setReportModalVisible(true); } }]),
        ]}
      />
      <ConfirmModal
        visible={confirmEliminarVisible}
        onCerrar={() => setConfirmEliminarVisible(false)}
        titulo={t("Eliminar comentario")}
        mensaje={t("¿Seguro que querés eliminarlo? No se puede deshacer.")}
        botones={[
          { label: t("Cancelar"), onPress: () => {} },
          { label: t("Eliminar"), destacado: true, onPress: confirmarEliminarComentario },
        ]}
      />
      <ReportModal
        visible={reportModalVisible}
        onCerrar={() => setReportModalVisible(false)}
        reporterId={userId}
        targetType="comment"
        targetId={comentario.id}
      />
      <ReaccionesListModal
        visible={reaccionesModalVisible}
        onCerrar={() => setReaccionesModalVisible(false)}
        reacciones={listaReacciones}
        onVerPerfil={(uid) => navigation?.navigate("PerfilAjeno", { userId: uid })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  hiloRaizBox: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 10 },
  ordenRow: { flexDirection: "row", justifyContent: "center", marginBottom: 12 },
  ordenChip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, marginRight: 6 },
  ordenChipActive: { backgroundColor: theme.colors.primary },
  ordenText: { fontSize: 12, color: theme.colors.textMuted },
  ordenTextActive: { fontSize: 12, color: "#000000", fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "stretch", marginTop: 6, marginBottom: 6 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 112,
    fontSize: 14,
    lineHeight: 19,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginRight: 6,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  botonesGrupoRow: { flexDirection: "row", justifyContent: "center", gap: 10, marginBottom: 10 },
  queVemosBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  queVemosBtnTexto: { color: theme.colors.primaryLight, fontWeight: "700", fontSize: 12 },
  gifBtn: { justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 6, paddingHorizontal: 10, marginRight: 6 },
  gifBtnTexto: { color: theme.colors.primaryLight, fontSize: 12, fontWeight: "700" },
  enviarBtn: { justifyContent: "center", alignItems: "center", backgroundColor: theme.colors.primary, borderRadius: 6, paddingHorizontal: 10 },
  enviarBtnText: { color: "#000000", fontSize: 12, fontWeight: "700" },
  gifPreviewBox: { alignSelf: "flex-start", marginBottom: 6 },
  gifPreview: { width: 100, height: 100, borderRadius: 8, backgroundColor: theme.colors.surfaceAlt },
  gifQuitar: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.danger, alignItems: "center", justifyContent: "center" },
  gifQuitarTexto: { color: theme.colors.text, fontSize: 11, fontWeight: "700" },
  gifEnComentario: { width: 160, height: 160, borderRadius: 8, marginTop: 6, backgroundColor: theme.colors.surfaceAlt },
  comentarioBox: { backgroundColor: theme.colors.surfaceAlt, borderRadius: 8, padding: 10 },
  comentarioBoxResaltado: { borderWidth: 2, borderColor: theme.colors.primary },
  spoilerBox: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 14, alignItems: "center" },
  spoilerTexto: { fontSize: 13, color: theme.colors.textMuted, fontWeight: "700", marginBottom: 6 },
  spoilerVerTexto: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },
  respondiendoARow: { marginBottom: 3 },
  respondiendoATexto: { fontSize: 11, color: theme.colors.textFaint, fontStyle: "italic" },
  autor: { fontSize: 13, fontWeight: "700", marginRight: 6 },
  avatarComentario: { width: 22, height: 22, borderRadius: 11, marginRight: 6 },
  fechaComentario: { fontSize: 11, color: theme.colors.textMuted },
  encabezadoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  menuPuntitos: { fontSize: 18, color: theme.colors.textMuted, paddingHorizontal: 6 },
  tipoTag: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tipoTagTexto: { fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, textTransform: "uppercase" },
  emojiPickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, paddingVertical: 8, paddingHorizontal: 12, maxWidth: 260 },
  emojiPickerBtn: { padding: 2 },
  emojiPickerTexto: { fontSize: 20 },
  emojiPickerImagen: { width: 22, height: 22 },
  resumenReaccion: { flexDirection: "row", alignItems: "center", gap: 4, marginRight: 16 },
  contenido: { fontSize: 14, marginTop: 2 },
  traducirTexto: { fontSize: 11, color: theme.colors.primaryLight, fontWeight: "700" },
  traducirBtn: { marginLeft: "auto" },
  accionesRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  accionTexto: { fontSize: 12, color: theme.colors.textMuted, marginRight: 16 },
  verRespuestas: { fontSize: 12, color: theme.colors.primaryLight, marginTop: 6 },
});

/** Preview de "Fulano recomendó «Título»" (o "recomendó el grupo X") con la tapa cuadrada al lado — usado dentro de los comentarios de grupo cuando alguien recomienda algo ahí. */
function RecomendacionPreview({
  itemType,
  tmdbId,
  seasonNumber,
  episodeNumber,
  groupId,
  listId,
  autorUsername,
  autorId,
  navigation,
  esQueVemos,
}: {
  itemType: "series" | "movie" | null;
  tmdbId: number | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  groupId: string | null;
  listId?: string | null;
  autorUsername: string | null;
  autorId?: string | null;
  navigation?: any;
  esQueVemos?: boolean;
}) {
  const { t } = useT();
  const [nombre, setNombre] = useState<string | null>(null);
  const [posterPath, setPosterPath] = useState<string | null>(null);
  const [subtitulo, setSubtitulo] = useState<string | null>(null);
  const [eliminado, setEliminado] = useState(false);

  useEffect(() => {
    (async () => {
      if (tmdbId && !itemType) {
        // tiene tmdbId pero le falta el itemType (dato incompleto/viejo) — hay que resolverlo igual, no dejarlo sin marcar nunca.
        setEliminado(true);
      } else if (tmdbId && itemType) {
        const tabla = itemType === "series" ? "series_cache" : "movies_cache";
        const tablaUsuario = itemType === "series" ? "user_series" : "user_movies";
        const columnaId = itemType === "series" ? "series_tmdb_id" : "movie_tmdb_id";
        const camposCache = itemType === "series" ? "tmdb_id, name, poster_path, total_seasons" : "tmdb_id, title, poster_path, release_date";
        const [{ data }, { data: custom }] = await Promise.all([
          supabase.from(tabla).select(camposCache).eq("tmdb_id", tmdbId).maybeSingle() as any,
          autorId
            ? supabase.from(tablaUsuario).select("custom_poster_path").eq("user_id", autorId).eq(columnaId, tmdbId).maybeSingle()
            : Promise.resolve({ data: null as any }),
        ]);
        if (data) {
          const nombreCache = itemType === "series" ? data.name : data.title;
          let sufijoEpisodio: string | null = null;
          if (itemType === "series" && seasonNumber && episodeNumber) {
            const { data: ep } = await supabase
              .from("episodes_cache")
              .select("name")
              .eq("series_tmdb_id", tmdbId)
              .eq("season_number", seasonNumber)
              .eq("episode_number", episodeNumber)
              .maybeSingle();
            sufijoEpisodio = ep?.name ?? `T${seasonNumber}E${episodeNumber}`;
            setSubtitulo(`T${seasonNumber} - E${episodeNumber}`);
          } else {
            setSubtitulo(
              itemType === "series"
                ? data.total_seasons
                  ? `${data.total_seasons} ${data.total_seasons === 1 ? t("temporada") : t("temporadas")}`
                  : null
                : data.release_date
                ? data.release_date.slice(0, 4)
                : null
            );
          }
          setNombre(sufijoEpisodio ? `${nombreCache} — ${sufijoEpisodio}` : nombreCache);
          setPosterPath(custom?.custom_poster_path ?? data.poster_path);
        } else {
          setEliminado(true);
        }
      } else if (groupId) {
        const { data } = await supabase.from("groups").select("name, photo_url").eq("id", groupId).maybeSingle();
        if (data) {
          setNombre(data.name);
          setPosterPath(data.photo_url ?? null);
        } else {
          setEliminado(true);
        }
      } else if (listId) {
        const { data } = await supabase.from("lists").select("title").eq("id", listId).maybeSingle();
        if (data) setNombre(data.title);
        else setEliminado(true);
      } else {
        setEliminado(true);
      }
    })();
  }, [tmdbId, itemType, groupId, listId]);

  function abrir() {
    if (!navigation) return;
    if (tmdbId && itemType && seasonNumber && episodeNumber) {
      navigation.navigate("EpisodioDetalle", { seriesTmdbId: tmdbId, seasonNumber, episodeNumber, episodeName: null });
    } else if (tmdbId && itemType) {
      navigation.navigate("DetalleTitulo", { tmdbId, tipo: itemType });
    } else if (groupId) navigation.navigate("DetalleGrupo", { groupId, groupName: nombre ?? t("Grupo") });
    else if (listId) navigation.navigate("DetalleLista", { listId, listTitle: nombre ?? t("Lista"), soloLectura: true });
  }

  return (
    <Pressable style={[stylesRecomendacion.card, esQueVemos && stylesRecomendacion.cardQueVemos]} onPress={abrir} disabled={eliminado}>
      {posterPath ? (
        <Image source={{ uri: groupId ? posterPath : posterUrl(posterPath, "w185")! }} style={stylesRecomendacion.poster} />
      ) : (
        <View style={[stylesRecomendacion.poster, { backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" }]}>
          {eliminado && <Ionicons name="trash-outline" size={16} color={theme.colors.textFaint} />}
        </View>
      )}
      <View style={{ flex: 1 }}>
        {eliminado ? (
          <Text style={[stylesRecomendacion.etiqueta, esQueVemos && stylesRecomendacion.textoQueVemos]}>
            {groupId ? t("Este grupo ya no existe") : listId ? t("Esta lista ya no existe") : t("Este título ya no existe")}
          </Text>
        ) : (
          <>
            <Text style={[stylesRecomendacion.etiqueta, esQueVemos && stylesRecomendacion.textoQueVemos]}>
              {esQueVemos
                ? itemType === "series"
                  ? t("Hoy empezamos:")
                  : t("Hoy vemos:")
                : `${autorUsername ?? t("Alguien")} ${t("recomendó ")}${groupId ? t("el grupo ") : ""}`}
            </Text>
            <Text style={[stylesRecomendacion.titulo, esQueVemos && stylesRecomendacion.textoQueVemos]}>{nombre ?? "..."}</Text>
            {subtitulo && <Text style={[stylesRecomendacion.sub, esQueVemos && stylesRecomendacion.textoQueVemos]}>{subtitulo}</Text>}
          </>
        )}
      </View>
    </Pressable>
  );
}

const stylesRecomendacion = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: 8, marginTop: 4, marginBottom: 4 },
  cardQueVemos: { backgroundColor: theme.colors.primary, alignSelf: "center" },
  poster: { width: 56, height: 84, borderRadius: 6, marginRight: 10 },
  etiqueta: { fontSize: 10, color: theme.colors.textMuted },
  titulo: { fontSize: 13, fontWeight: "700", color: theme.colors.text, marginTop: 1 },
  sub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  textoQueVemos: { color: "#000000", opacity: 1 },
});
