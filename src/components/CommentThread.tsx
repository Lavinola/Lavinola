import React, { useEffect, useState } from "react";
import { View, TextInput, Pressable, Image, StyleSheet } from "react-native";
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
} from "../lib/comments";
import ReportModal from "./ReportModal";
import ConfirmModal from "./ConfirmModal";
import { traducirTexto, idiomaCorto } from "../lib/translate";
import { posterUrl } from "../lib/tmdb";
import { formatearFechaHora, formatearTiempoRelativo } from "../lib/dates";
import { supabase } from "../lib/supabase";
import { Text } from "../components/Themed";
import ActionSheetModal from "./ActionSheetModal";
import ExpandableText from "./ExpandableText";
import { MOODS } from "../lib/moods";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  targetType: "series" | "movie" | "episode" | "group";
  targetId: string;
  groupId?: string;
  navigation?: any;
  soloLectura?: boolean;
  highlightCommentId?: string; // si viene, ese comentario se muestra primero y resaltado (venís de una notificación o de "Posts/Comentarios")
  soloSiguiendo?: boolean; // si viene true, solo muestra comentarios de gente que seguís
  soloAutorId?: string; // si viene, solo muestra comentarios de ESE usuario (para la pestaña "Yo")
  mostrarTipo?: boolean; // solo true en Comentarios/Posts de la ficha de un título — en todos lados más, no hace falta aclarar que es un comentario
}

const MAX_NIVEL_VISUAL = 4; // a partir de acá, el hijo se muestra colapsado tras "ver respuestas"

// Reacciones: la manito y el corazón son íconos vectoriales violeta (para que
// tengan el color de la marca, no el emoji del sistema), y después las mismas
// 12 caritas de ánimo que se usan en "¿Cómo te sentiste?".
const REACCIONES_ICONO: { key: string; icono: "thumbs-up" | "heart" }[] = [
  { key: "like", icono: "thumbs-up" },
  { key: "love", icono: "heart" },
];

/** Ícono/imagen de una reacción para mostrar en chiquito (botón resumen, contador, etc). */
function IconoReaccion({ reaccionKey, size = 16 }: { reaccionKey: string; size?: number }) {
  if (reaccionKey === "like") return <Ionicons name="thumbs-up" size={size} color={theme.colors.primaryLight} />;
  if (reaccionKey === "love") return <Ionicons name="heart" size={size} color={theme.colors.primaryLight} />;
  const mood = MOODS.find((m) => m.key === reaccionKey);
  if (mood) return <Image source={mood.imagen} style={{ width: size, height: size }} resizeMode="contain" />;
  return <Ionicons name="happy-outline" size={size} color={theme.colors.textMuted} />;
}

export default function CommentThread({ targetType, targetId, groupId, navigation, soloLectura, highlightCommentId, soloSiguiendo, soloAutorId, mostrarTipo }: Props) {
  const { t } = useT();
  const [orden, setOrden] = useState<OrdenComentarios>("nuevo");
  const [raiz, setRaiz] = useState<Comentario[]>([]);
  const [nuevoTexto, setNuevoTexto] = useState("");
  const [gifElegido, setGifElegido] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [idiomaUsuario, setIdiomaUsuario] = useState("en");
  const [siguiendoIds, setSiguiendoIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: perfil } = await supabase.from("profiles").select("content_language").eq("id", uid).maybeSingle();
        setIdiomaUsuario(idiomaCorto(perfil?.content_language));
        if (soloSiguiendo) {
          const { data: sigo } = await supabase.from("follows").select("followee_id").eq("follower_id", uid);
          setSiguiendoIds(new Set((sigo ?? []).map((f: any) => f.followee_id)));
        }
      }
    });
    cargar();
  }, [orden]);

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
      await cargar();
    } catch (e: any) {
      console.error("Error al postear comentario:", e);
      Alert.alert("No se pudo publicar", e.message ?? "Revisá tu conexión y probá de nuevo.");
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.ordenRow}>
        {(["nuevo", "viejo", "mas_respuestas"] as OrdenComentarios[]).map((o) => (
          <Pressable key={o} onPress={() => setOrden(o)} style={[styles.ordenChip, orden === o && styles.ordenChipActive]}>
            <Text style={orden === o ? styles.ordenTextActive : styles.ordenText}>
              {o === "nuevo" ? t("Más nuevo") : o === "viejo" ? t("Más antiguo") : t("Más respuestas")}
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
            placeholder={t("Comentar (texto y/o GIF, sin fotos)...")}
            value={nuevoTexto}
            onChangeText={setNuevoTexto}
            multiline
            maxLength={2500}
          />
          <Pressable style={styles.gifBtn} onPress={() => abrirGifPicker(setGifElegido)}>
            <Text style={styles.gifBtnTexto}>GIF</Text>
          </Pressable>
          <Pressable style={styles.enviarBtn} onPress={enviar}>
            <Text style={styles.enviarBtnText}>{t("Publicar")}</Text>
          </Pressable>
        </View>
      )}

      {[...raiz]
        .filter((c) => !soloSiguiendo || !siguiendoIds || siguiendoIds.has(c.user_id))
        .filter((c) => !soloAutorId || c.user_id === soloAutorId)
        .sort((a, b) => (a.id === highlightCommentId ? -1 : b.id === highlightCommentId ? 1 : 0))
        .map((c) => (
          <NodoComentario
            key={c.id}
            comentario={c}
            nivel={0}
            userId={userId}
            idiomaUsuario={idiomaUsuario}
            onReply={cargar}
            targetType={targetType}
            targetId={targetId}
            groupId={groupId}
            navigation={navigation}
            resaltado={c.id === highlightCommentId}
            highlightCommentId={highlightCommentId}
            mostrarTipo={mostrarTipo}
          />
        ))}
    </View>
  );
}

function NodoComentario({
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
  mostrarTipo,
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
  mostrarTipo?: boolean;
}) {
  const [respuestas, setRespuestas] = useState<Comentario[] | null>(null);
  const [mostrandoInput, setMostrandoInput] = useState(false);
  const [reportarVisible, setReportarVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [confirmEliminarVisible, setConfirmEliminarVisible] = useState(false);
  const [eliminado, setEliminado] = useState(false);
  const [reaccionesPickerVisible, setReaccionesPickerVisible] = useState(false);
  const [texto, setTexto] = useState("");
  const [gifElegido, setGifElegido] = useState<string | null>(null);
  const [miReaccion, setMiReaccion] = useState<string | null>(comentario.mi_reaccion);
  const [reacciones, setReacciones] = useState<Record<string, number>>(comentario.reacciones ?? {});
  const { t } = useT();
  const [traduccion, setTraduccion] = useState<string | null>(null);
  const [traduciendo, setTraduciendo] = useState(false);

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
    if (respuestas) {
      setRespuestas(null); // toggle: si ya estaban abiertas, las cierra
      return;
    }
    const data = await cargarRespuestas(comentario.id, userId);
    setRespuestas(data);
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
      await abrirRespuestas();
    } catch (e: any) {
      console.error("Error al postear respuesta:", e);
      Alert.alert("No se pudo publicar", e.message ?? "Revisá tu conexión y probá de nuevo.");
    }
  }

  async function elegirReaccion(emoji: string) {
    if (!userId) return;
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
    } catch (e: any) {
      Alert.alert("No se pudo eliminar", e.message);
    }
  }

  const totalReacciones = Object.values(reacciones).reduce((a, b) => a + b, 0);
  const emojisUsados = Object.entries(reacciones).filter(([, n]) => n > 0);

  const indentacion = Math.min(nivel, MAX_NIVEL_VISUAL) * 14;

  if (eliminado) return null;

  return (
    <View style={{ marginLeft: indentacion, marginTop: 8 }}>
      <View style={[styles.comentarioBox, resaltado && styles.comentarioBoxResaltado]}>
        <View style={styles.encabezadoRow}>
          <Pressable
            disabled={!navigation}
            onPress={() => navigation?.navigate("PerfilAjeno", { userId: comentario.user_id })}
            style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
          >
            {comentario.autor_avatar_url ? (
              <Image source={{ uri: comentario.autor_avatar_url }} style={styles.avatarComentario} />
            ) : (
              <View style={[styles.avatarComentario, { backgroundColor: theme.colors.surfaceAlt }]} />
            )}
            <View style={{ flexDirection: "row", alignItems: "baseline", flexShrink: 1 }}>
              <Text style={styles.autor}>{comentario.autor_username ?? t("Usuario")}</Text>
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
          />
        )}
        {comentario.content ? <ExpandableText texto={traduccion ?? comentario.content} style={styles.contenido} /> : null}
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
          <Pressable onPress={() => setReaccionesPickerVisible(!reaccionesPickerVisible)} style={styles.resumenReaccion}>
            <IconoReaccion reaccionKey={miReaccion ?? ""} size={16} />
            <Text style={styles.accionTexto}>
              {emojisUsados.length > 0 ? emojisUsados.map(([, n]) => n).reduce((a, b) => a + b, 0) : totalReacciones || ""}
            </Text>
          </Pressable>
          <Pressable onPress={() => setMostrandoInput(!mostrandoInput)}>
            <Text style={styles.accionTexto}>{t("Responder")}</Text>
          </Pressable>
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
                maxLength={2500}
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

        {comentario.reply_count > 0 && (
          <Pressable onPress={abrirRespuestas}>
            <Text style={styles.verRespuestas}>
              {respuestas ? t("Ocultar respuestas") : t("Ver {n} respuestas más").replace("{n}", String(comentario.reply_count))}
            </Text>
          </Pressable>
        )}
      </View>

      {respuestas?.map((r) => (
        <NodoComentario
          key={r.id}
          comentario={r}
          nivel={nivel + 1}
          userId={userId}
          idiomaUsuario={idiomaUsuario}
          onReply={onReply}
          targetType={targetType}
          targetId={targetId}
          groupId={groupId}
          navigation={navigation}
          resaltado={r.id === highlightCommentId}
          highlightCommentId={highlightCommentId}
        />
      ))}
      <ActionSheetModal
        visible={reportarVisible}
        onCerrar={() => setReportarVisible(false)}
        titulo={formatearFechaHora(comentario.created_at)}
        opciones={[
          ...(userId === comentario.user_id
            ? [{ label: t("Eliminar"), icono: "trash-outline" as const, destructivo: true, onPress: () => { setReportarVisible(false); setConfirmEliminarVisible(true); } }]
            : []),
          { label: t("Denunciar"), icono: "flag-outline", destructivo: true, onPress: () => { setReportarVisible(false); setReportModalVisible(true); } },
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  ordenRow: { flexDirection: "row", marginBottom: 12 },
  ordenChip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, marginRight: 6 },
  ordenChipActive: { backgroundColor: theme.colors.primary },
  ordenText: { fontSize: 12, color: theme.colors.textMuted },
  ordenTextActive: { fontSize: 12, color: "#000000", fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 6, marginBottom: 6 },
  input: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 8, marginRight: 6, maxHeight: 80, color: theme.colors.text, backgroundColor: theme.colors.surface },
  gifBtn: { borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10, marginRight: 6 },
  gifBtnTexto: { color: theme.colors.primaryLight, fontSize: 12, fontWeight: "700" },
  enviarBtn: { backgroundColor: theme.colors.primary, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10 },
  enviarBtnText: { color: "#000000", fontSize: 12, fontWeight: "700" },
  gifPreviewBox: { alignSelf: "flex-start", marginBottom: 6 },
  gifPreview: { width: 100, height: 100, borderRadius: 8, backgroundColor: theme.colors.surfaceAlt },
  gifQuitar: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.danger, alignItems: "center", justifyContent: "center" },
  gifQuitarTexto: { color: theme.colors.text, fontSize: 11, fontWeight: "700" },
  gifEnComentario: { width: 160, height: 160, borderRadius: 8, marginTop: 6, backgroundColor: theme.colors.surfaceAlt },
  comentarioBox: { backgroundColor: theme.colors.surface, borderRadius: 8, padding: 10 },
  comentarioBoxResaltado: { borderWidth: 2, borderColor: theme.colors.primary },
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
}) {
  const { t } = useT();
  const [nombre, setNombre] = useState<string | null>(null);
  const [posterPath, setPosterPath] = useState<string | null>(null);
  const [subtitulo, setSubtitulo] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (tmdbId && itemType) {
        const tabla = itemType === "series" ? "series_cache" : "movies_cache";
        const tablaUsuario = itemType === "series" ? "user_series" : "user_movies";
        const columnaId = itemType === "series" ? "series_tmdb_id" : "movie_tmdb_id";
        const [{ data }, { data: custom }] = await Promise.all([
          supabase.from(tabla).select("*").eq("tmdb_id", tmdbId).maybeSingle(),
          autorId
            ? supabase.from(tablaUsuario).select("custom_poster_path").eq("user_id", autorId).eq(columnaId, tmdbId).maybeSingle()
            : Promise.resolve({ data: null as any }),
        ]);
        if (data) {
          let nombreFinal = itemType === "series" ? data.name : data.title;
          if (itemType === "series" && seasonNumber && episodeNumber) {
            const { data: ep } = await supabase
              .from("episodes_cache")
              .select("name")
              .eq("series_tmdb_id", tmdbId)
              .eq("season_number", seasonNumber)
              .eq("episode_number", episodeNumber)
              .maybeSingle();
            nombreFinal = `${nombreFinal} — ${ep?.name ?? `T${seasonNumber}E${episodeNumber}`}`;
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
          setNombre(nombreFinal);
          setPosterPath(custom?.custom_poster_path ?? data.poster_path);
        }
      } else if (groupId) {
        const { data } = await supabase.from("groups").select("name, photo_url").eq("id", groupId).maybeSingle();
        if (data) {
          setNombre(data.name);
          setPosterPath(data.photo_url ?? null);
        }
      } else if (listId) {
        const { data } = await supabase.from("lists").select("title").eq("id", listId).maybeSingle();
        if (data) setNombre(data.title);
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
    <Pressable style={stylesRecomendacion.card} onPress={abrir}>
      {posterPath ? (
        <Image source={{ uri: groupId ? posterPath : posterUrl(posterPath, "w185")! }} style={stylesRecomendacion.poster} />
      ) : (
        <View style={[stylesRecomendacion.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={stylesRecomendacion.etiqueta}>
          {autorUsername ?? t("Alguien")} {t("recomendó ")}
          {groupId ? t("el grupo ") : ""}
        </Text>
        <Text style={stylesRecomendacion.titulo}>{nombre ?? "..."}</Text>
        {subtitulo && <Text style={stylesRecomendacion.sub}>{subtitulo}</Text>}
      </View>
    </Pressable>
  );
}

const stylesRecomendacion = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: 8, marginTop: 4, marginBottom: 4 },
  poster: { width: 56, height: 84, borderRadius: 6, marginRight: 10 },
  etiqueta: { fontSize: 10, color: theme.colors.textMuted },
  titulo: { fontSize: 13, fontWeight: "700", color: theme.colors.text, marginTop: 1 },
  sub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
});
