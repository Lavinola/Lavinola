import React, { useState } from "react";
import { View, Image, Pressable, StyleSheet, TextInput, ActivityIndicator } from "react-native";
import { Alert } from "../lib/alert";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Themed";
import NombreUsuario from "./NombreUsuario";
import Avatar from "./Avatar";
import { impactoLiviano } from "../lib/haptics";
import ActionSheetModal from "./ActionSheetModal";
import ConfirmModal from "./ConfirmModal";
import ReportModal from "./ReportModal";
import { Post, reaccionarPost, quitarReaccionPost, eliminarPost, marcarPostNoInteresa, listarReaccionesDePost, ReaccionConAutor } from "../lib/posts";
import { guardarItem, quitarGuardado } from "../lib/savedItems";
import { Comentario, cargarComentariosRaiz, postearComentario } from "../lib/comments";
import { NodoComentario } from "./CommentThread";
import ReaccionesListModal from "./ReaccionesListModal";
import StarRating from "./StarRating";
import { posterUrl } from "../lib/tmdb";
import { formatearFechaHora, formatearTiempoRelativo } from "../lib/dates";
import { traducirTexto, idiomaCorto } from "../lib/translate";
import { MOODS } from "../lib/moods";
import IconoReaccion, { REACCIONES_ICONO } from "./IconoReaccion";
import ExpandableText from "./ExpandableText";
import { supabase } from "../lib/supabase";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function PostCard({
  post,
  navigation,
  onCambio,
  mostrarNoInteresa,
  mostrarTipo,
}: {
  post: Post;
  navigation: any;
  onCambio?: () => void;
  mostrarNoInteresa?: boolean;
  mostrarTipo?: boolean; // solo true en Posts/Comentarios (perfil) o Comentarios/Posts (ficha de un título)
}) {
  const { t } = useT();
  const [spoilerVisible, setSpoilerVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [confirmEliminarVisible, setConfirmEliminarVisible] = useState(false);
  const [eliminado, setEliminado] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [traduccion, setTraduccion] = useState<string | null>(null);
  const [traduciendo, setTraduciendo] = useState(false);
  const [reaccionesModalVisible, setReaccionesModalVisible] = useState(false);
  const [reacciones, setReacciones] = useState<ReaccionConAutor[]>([]);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [mostrarInput, setMostrarInput] = useState(false);
  const [respuestas, setRespuestas] = useState<Comentario[] | null>(null);
  const [cargandoRespuestas, setCargandoRespuestas] = useState(false);
  const [nuevaRespuesta, setNuevaRespuesta] = useState("");
  const [gifElegido, setGifElegido] = useState<string | null>(null);
  const [idiomaUsuario, setIdiomaUsuario] = useState("en");
  const [cantidadComentarios, setCantidadComentarios] = useState(post.cantidad_comentarios ?? 0);
  // Mismo criterio que con los comentarios: copia local de mi reacción y
  // el conteo — así reaccionar tampoco obliga a recargar toda la
  // pantalla de afuera (Lobby/grupo), evitando que se reinicie el scroll.
  const [miReaccion, setMiReaccion] = useState(post.mi_reaccion ?? null);
  const [reaccionesConteo, setReaccionesConteo] = useState(post.reacciones ?? {});
  const [guardado, setGuardado] = useState(post.is_saved ?? false);

  React.useEffect(() => {
    setGuardado(post.is_saved ?? false);
  }, [post.is_saved]);

  React.useEffect(() => {
    setCantidadComentarios(post.cantidad_comentarios ?? 0);
  }, [post.cantidad_comentarios]);

  React.useEffect(() => {
    setMiReaccion(post.mi_reaccion ?? null);
  }, [post.mi_reaccion]);

  React.useEffect(() => {
    setReaccionesConteo(post.reacciones ?? {});
  }, [post.reacciones]);

  React.useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: perfil } = await supabase.from("profiles").select("content_language").eq("id", uid).maybeSingle();
        setIdiomaUsuario(idiomaCorto(perfil?.content_language));
      }
    });
  }, []);

  function abrirTitulo() {
    if (post.item_type === "list" && post.list_id) {
      navigation.navigate("DetalleLista", { listId: post.list_id, listTitle: post.titulo_nombre ?? t("Lista") });
    } else if (post.item_type === "group" && post.group_id) {
      navigation.navigate("DetalleGrupo", { groupId: post.group_id, groupName: post.titulo_nombre ?? t("Grupo") });
    } else if (post.item_type === "episode") {
      navigation.navigate("EpisodioDetalle", {
        seriesTmdbId: post.tmdb_id,
        seasonNumber: post.season_number,
        episodeNumber: post.episode_number,
        episodeName: post.episodio_nombre ?? null,
      });
    } else if (post.tmdb_id) {
      navigation.navigate("DetalleTitulo", { tmdbId: post.tmdb_id, tipo: post.item_type });
    }
  }

  async function cargarRespuestas() {
    setCargandoRespuestas(true);
    try {
      const datos = await cargarComentariosRaiz("post", post.id, "viejo", userId);
      setRespuestas(datos);
      setCantidadComentarios(datos.length); // la burbujita cuenta respuestas directas — esto la mantiene sincronizada con lo que realmente hay
    } catch (e) {
      console.error("Error al cargar respuestas del post:", e);
    } finally {
      setCargandoRespuestas(false);
    }
  }

  function toggleLista() {
    const nuevoValor = !mostrarLista;
    setMostrarLista(nuevoValor);
    if (nuevoValor && respuestas === null) cargarRespuestas();
  }

  function toggleInput() {
    setMostrarInput((v) => !v);
  }

  function abrirGifPicker() {
    if (!navigation) return;
    navigation.navigate("ElegirGif", { onElegir: setGifElegido });
  }

  async function enviarRespuesta() {
    if ((!nuevaRespuesta.trim() && !gifElegido) || !userId) return;
    try {
      await postearComentario({ userId, targetType: "post", targetId: post.id, content: nuevaRespuesta.trim(), gifUrl: gifElegido });
      setNuevaRespuesta("");
      setGifElegido(null);
      setCantidadComentarios((c) => c + 1);
      setMostrarLista(true);
      await cargarRespuestas();
    } catch (e: any) {
      console.error("Error al postear respuesta:", e);
      Alert.alert(t("No se pudo publicar"), e.message ?? "Revisá tu conexión y probá de nuevo.");
    }
  }

  function toggleGuardado() {
    if (!userId) return;
    const anterior = guardado;
    setGuardado(!anterior);
    (async () => {
      try {
        if (anterior) await quitarGuardado(userId, "post", post.id);
        else await guardarItem(userId, "post", post.id);
      } catch (e: any) {
        setGuardado(anterior);
        Alert.alert("No se pudo guardar", e.message);
      }
    })();
  }

  function elegirReaccion(key: string) {
    if (!userId) return;
    impactoLiviano();
    setPickerVisible(false);
    const anteriorEmoji = miReaccion;
    const anteriorConteo = reaccionesConteo;
    const nuevoConteo = { ...reaccionesConteo };
    if (anteriorEmoji) nuevoConteo[anteriorEmoji] = Math.max(0, (nuevoConteo[anteriorEmoji] ?? 1) - 1);
    if (anteriorEmoji === key) {
      setMiReaccion(null);
    } else {
      nuevoConteo[key] = (nuevoConteo[key] ?? 0) + 1;
      setMiReaccion(key);
    }
    setReaccionesConteo(nuevoConteo);
    (async () => {
      try {
        if (anteriorEmoji === key) await quitarReaccionPost(userId, post.id);
        else await reaccionarPost(userId, post.id, key);
      } catch (e: any) {
        setMiReaccion(anteriorEmoji); // no se pudo guardar — volvemos a como estaba
        setReaccionesConteo(anteriorConteo);
        Alert.alert("No se pudo reaccionar", e.message);
      }
    })();
  }

  const esMiPost = !!userId && userId === post.user_id;

  async function tocarBotonReaccion() {
    if (esMiPost) {
      if (totalReacciones === 0) return; // nada que mostrar, y no te podés reaccionar a vos mismo
      try {
        setReacciones(await listarReaccionesDePost(post.id));
        setReaccionesModalVisible(true);
      } catch (e: any) {
        Alert.alert("No se pudo cargar", e.message);
      }
    } else {
      setPickerVisible((v) => !v);
    }
  }

  async function traducir() {
    if (traduccion) {
      setTraduccion(null);
      return;
    }
    setTraduciendo(true);
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      let idiomaDestino = "es";
      if (userId) {
        const { data: perfil } = await supabase.from("profiles").select("content_language").eq("id", userId).maybeSingle();
        idiomaDestino = idiomaCorto(perfil?.content_language);
      }
      setTraduccion(await traducirTexto(post.content, idiomaDestino));
    } catch (e: any) {
      Alert.alert("No se pudo traducir", e.message);
    } finally {
      setTraduciendo(false);
    }
  }

  function denunciar() {
    setMenuVisible(false);
    setReportModalVisible(true);
  }

  async function noMeInteresa() {
    if (!userId) return;
    setMenuVisible(false);
    try {
      await marcarPostNoInteresa(userId, post.id, post.user_id);
      onCambio?.();
    } catch (e: any) {
      Alert.alert("No se pudo actualizar", e.message);
    }
  }

  function confirmarEliminar() {
    setMenuVisible(false);
    setConfirmEliminarVisible(true);
  }

  async function eliminarConfirmado() {
    setConfirmEliminarVisible(false);
    try {
      await eliminarPost(post.id);
      setEliminado(true);
      onCambio?.();
    } catch (e: any) {
      Alert.alert("No se pudo eliminar", e.message);
    }
  }

  const totalReacciones = Object.values(reaccionesConteo ?? {}).reduce((a, b) => a + b, 0);

  if (eliminado) return null;

  return (
    <View style={styles.card}>
      <View style={styles.autorRow}>
        <Pressable style={{ flexDirection: "row", alignItems: "center", flex: 1 }} onPress={() => navigation.navigate("PerfilAjeno", { userId: post.user_id })}>
          <Avatar uri={post.avatar_url} size={34} style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <NombreUsuario style={styles.username} displayName={post.display_name} username={post.username} numberOfLines={1} />
            <Text style={styles.fecha}>{formatearTiempoRelativo(post.created_at)}</Text>
          </View>
        </Pressable>
        {mostrarTipo && (
          <View style={styles.tipoTag}>
            <Text style={styles.tipoTagTexto}>{t("Post")}</Text>
          </View>
        )}
        <Pressable onPress={() => setMenuVisible(true)} hitSlop={10} style={{ marginLeft: 6 }}>
          <Text style={styles.menuPuntitos}>⋯</Text>
        </Pressable>
      </View>

      {post.item_type === "recap" ? (
        <View style={styles.recapImagenBox}>
          {post.image_url && <Image source={{ uri: post.image_url }} style={styles.recapImagen} resizeMode="cover" />}
        </View>
      ) : post.item_type === "list" ? (
        <Pressable style={styles.listaCard} onPress={abrirTitulo}>
          <Text style={styles.listaEtiqueta}>Recomienda su lista</Text>
          <Text style={styles.listaNombre} numberOfLines={1}>
            {post.titulo_nombre ?? t("Lista")}
          </Text>
          <View style={styles.listaPostersRow}>
            {(post.lista_items ?? []).map((it, i) => (
              <View key={i} style={styles.listaPoster}>
                {it.poster_path ? (
                  <Image source={{ uri: posterUrl(it.poster_path, "w185")! }} style={styles.listaPosterImg} />
                ) : (
                  <View style={[styles.listaPosterImg, { backgroundColor: theme.colors.surfaceAlt }]} />
                )}
              </View>
            ))}
            {(post.lista_items_total ?? 0) > (post.lista_items?.length ?? 0) && (
              <Pressable style={styles.listaMasBtn} onPress={abrirTitulo}>
                <Text style={styles.listaMasTexto}>+</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      ) : post.item_type === "group" ? (
        <Pressable style={styles.tituloRow} onPress={abrirTitulo}>
          {post.poster_path ? (
            <Image source={{ uri: post.poster_path }} style={styles.poster} />
          ) : (
            <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.subtitulo}>{t("Recomienda el grupo")}</Text>
            <Text style={styles.tituloNombre} numberOfLines={2}>
              {post.titulo_nombre ?? "..."}
            </Text>
          </View>
        </Pressable>
      ) : (
        <Pressable style={styles.tituloRow} onPress={abrirTitulo}>
          {post.poster_path ? (
            <Image source={{ uri: posterUrl(post.poster_path, "w185")! }} style={styles.poster} />
          ) : (
            <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.tituloNombre} numberOfLines={2}>
              {post.titulo_nombre ?? "..."}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
              {post.subtitulo && <Text style={styles.subtitulo}>{post.subtitulo}</Text>}
              {post.item_type === "episode" && post.episodio_nombre && (
                <Text style={styles.subtitulo}> · {post.episodio_nombre}</Text>
              )}
            </View>
            {!!post.calificacion_autor && (
              <View style={{ marginTop: 4 }}>
                <StarRating valor={post.calificacion_autor} size={13} />
              </View>
            )}
          </View>
        </Pressable>
      )}

      {post.has_spoiler && !spoilerVisible ? (
        <Pressable style={styles.spoilerBox} onPress={() => setSpoilerVisible(true)}>
          <Text style={styles.spoilerTexto}>{t("Contiene spoiler")}</Text>
          <Text style={styles.spoilerVerTexto}>{t("Ver")}</Text>
        </Pressable>
      ) : (
        <ExpandableText texto={traduccion ?? post.content} style={styles.contenido} />
      )}

      {pickerVisible && (
        <View style={styles.reaccionPickerRow}>
          {REACCIONES_ICONO.map((r) => (
            <Pressable key={r.key} onPress={() => elegirReaccion(r.key)} style={styles.reaccionPickerBtn}>
              <Ionicons name={r.icono} size={20} color={theme.colors.primaryLight} />
            </Pressable>
          ))}
          {MOODS.map((m) => (
            <Pressable key={m.key} onPress={() => elegirReaccion(m.key)} style={styles.reaccionPickerBtn}>
              <Image source={m.imagen} style={{ width: 20, height: 20 }} resizeMode="contain" />
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.accionesRow}>
        <Pressable onPress={tocarBotonReaccion} style={styles.accionBtn}>
          <IconoReaccion reaccionKey={miReaccion ?? ""} size={16} />
          <Text style={styles.accionTexto}>{totalReacciones > 0 ? totalReacciones : ""}</Text>
        </Pressable>
        <Pressable onPress={toggleLista} style={styles.accionBtn}>
          <Ionicons name="chatbubble-outline" size={15} color={theme.colors.textMuted} />
          <Text style={styles.accionTexto}>{cantidadComentarios}</Text>
        </Pressable>
        <Pressable onPress={toggleInput} style={styles.accionBtn}>
          <Text style={styles.accionTexto}>{t("Comentar")}</Text>
        </Pressable>
        <Pressable onPress={toggleGuardado} style={styles.accionBtn} hitSlop={6}>
          <Ionicons name={guardado ? "bookmark" : "bookmark-outline"} size={16} color={guardado ? theme.colors.primary : theme.colors.textMuted} />
        </Pressable>
        {!!post.content?.trim() && (
          <Pressable onPress={traducir} disabled={traduciendo} style={styles.traducirBtn}>
            <Text style={styles.traducirTexto}>{traduciendo ? t("Traduciendo...") : traduccion ? t("Ver original") : t("Traducir")}</Text>
          </Pressable>
        )}
      </View>

      {mostrarInput && (
        <View style={styles.inputRow}>
          <TextInput
            placeholderTextColor={theme.colors.textFaint}
            style={styles.input}
            placeholder={t("Responder (texto y/o GIF)...")}
            value={nuevaRespuesta}
            onChangeText={setNuevaRespuesta}
            multiline
            maxLength={2000}
          />
          <View style={{ flexDirection: "row" }}>
            <Pressable style={styles.gifBtn} onPress={abrirGifPicker}>
              <Text style={styles.gifBtnTexto}>GIF</Text>
            </Pressable>
            <Pressable style={styles.enviarBtn} onPress={enviarRespuesta}>
              <Text style={styles.enviarBtnTexto}>{t("Enviar")}</Text>
            </Pressable>
          </View>
        </View>
      )}
      {gifElegido && (
        <View style={styles.gifPreviewBox}>
          <Image source={{ uri: gifElegido }} style={styles.gifPreview} />
          <Pressable onPress={() => setGifElegido(null)} style={styles.gifQuitar}>
            <Text style={styles.gifQuitarTexto}>✕</Text>
          </Pressable>
        </View>
      )}

      {mostrarLista && (
        <View style={styles.respuestasBox}>
          {cargandoRespuestas ? (
            <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 10 }} />
          ) : !respuestas || respuestas.length === 0 ? (
            <Text style={styles.sinRespuestas}>{t("Todavía no hay comentarios.")}</Text>
          ) : (
            respuestas.map((r) => (
              <NodoComentario
                key={r.id}
                comentario={r}
                nivel={0}
                userId={userId}
                idiomaUsuario={idiomaUsuario}
                onReply={cargarRespuestas}
                targetType="post"
                targetId={post.id}
                navigation={navigation}
              />
            ))
          )}
        </View>
      )}

      <ActionSheetModal
        visible={menuVisible}
        onCerrar={() => setMenuVisible(false)}
        titulo={formatearFechaHora(post.created_at)}
        opciones={[
          ...(userId === post.user_id ? [{ label: t("Eliminar"), icono: "trash-outline" as const, destructivo: true, onPress: confirmarEliminar }] : []),
          ...(mostrarNoInteresa && userId !== post.user_id ? [{ label: t("No me interesa"), icono: "eye-off-outline" as const, onPress: noMeInteresa }] : []),
          { label: t("Denunciar"), icono: "flag-outline", destructivo: true, onPress: denunciar },
        ]}
      />
      <ReportModal visible={reportModalVisible} onCerrar={() => setReportModalVisible(false)} reporterId={userId} targetType="post" targetId={post.id} />
      <ConfirmModal
        visible={confirmEliminarVisible}
        onCerrar={() => setConfirmEliminarVisible(false)}
        titulo={t("Eliminar post")}
        mensaje={t("¿Seguro que querés eliminarlo? No se puede deshacer.")}
        botones={[
          { label: t("Cancelar"), onPress: () => {} },
          { label: t("Eliminar"), destacado: true, onPress: eliminarConfirmado },
        ]}
      />
      <ReaccionesListModal
        visible={reaccionesModalVisible}
        onCerrar={() => setReaccionesModalVisible(false)}
        reacciones={reacciones}
        onVerPerfil={(uid) => navigation.navigate("PerfilAjeno", { userId: uid })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 12, marginBottom: 12 },
  autorRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, marginRight: 8, backgroundColor: theme.colors.surfaceAlt },
  avatarPlaceholder: {},
  username: { fontSize: 13, fontWeight: "700" },
  fecha: { fontSize: 10, color: theme.colors.textMuted },
  menuPuntitos: { fontSize: 18, color: theme.colors.textMuted, paddingHorizontal: 4 },
  tituloRow: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: 8, marginBottom: 10 },
  poster: { width: 48, height: 72, borderRadius: 6, marginRight: 10 },
  tituloNombre: { fontSize: 14, fontWeight: "700" },
  subtitulo: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  contenido: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
  traducirTexto: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },
  traducirBtn: { marginLeft: "auto" },
  spoilerBox: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    padding: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  spoilerTexto: { fontSize: 13, color: theme.colors.textMuted, fontWeight: "700", marginBottom: 6 },
  spoilerVerTexto: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },
  reaccionPickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    padding: 8,
    marginBottom: 10,
  },
  reaccionPickerBtn: { padding: 2 },
  accionesRow: { flexDirection: "row", gap: 20 },
  accionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  accionTexto: { fontSize: 12, color: theme.colors.textMuted, fontWeight: "700" },
  tipoTag: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tipoTagTexto: { fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, textTransform: "uppercase" },
  recapImagenBox: { width: "100%", aspectRatio: 9 / 16, borderRadius: theme.radius.md, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt, marginBottom: 10 },
  recapImagen: { width: "100%", height: "100%" },
  listaCard: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: 10, marginBottom: 10 },
  listaEtiqueta: { fontSize: 11, color: theme.colors.textMuted },
  listaNombre: { fontSize: 15, fontWeight: "700", marginTop: 2, marginBottom: 8 },
  listaPostersRow: { flexDirection: "row", gap: 6 },
  listaPoster: { width: 48, height: 72, borderRadius: 6, overflow: "hidden" },
  listaPosterImg: { width: "100%", height: "100%" },
  listaMasBtn: { width: 48, height: 72, borderRadius: 6, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center" },
  listaMasTexto: { color: theme.colors.primaryLight, fontSize: 18, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "stretch", marginTop: 10 },
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
    backgroundColor: theme.colors.surfaceAlt,
  },
  gifBtn: { justifyContent: "center", alignItems: "center", height: 40, borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 6, paddingHorizontal: 10, marginRight: 6 },
  gifBtnTexto: { color: theme.colors.primaryLight, fontSize: 12, fontWeight: "700" },
  enviarBtn: { justifyContent: "center", alignItems: "center", height: 40, backgroundColor: theme.colors.primary, borderRadius: 6, paddingHorizontal: 10 },
  enviarBtnTexto: { color: "#000000", fontSize: 12, fontWeight: "700" },
  gifPreviewBox: { alignSelf: "flex-start", marginTop: 8 },
  gifPreview: { width: 100, height: 100, borderRadius: 8, backgroundColor: theme.colors.surfaceAlt },
  gifQuitar: { position: "absolute", top: -6, right: -6, backgroundColor: theme.colors.background, borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  gifQuitarTexto: { fontSize: 11, color: theme.colors.text },
  respuestasBox: { marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, paddingTop: 10 },
  sinRespuestas: { fontSize: 12, color: theme.colors.textMuted, textAlign: "center", paddingVertical: 8 },
});
