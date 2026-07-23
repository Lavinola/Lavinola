import React, { useEffect, useState } from "react";
import { View, FlatList, TextInput, Pressable, Image, StyleSheet, KeyboardAvoidingView, Platform, Keyboard, ActivityIndicator } from "react-native";
import { Alert } from "../lib/alert";
import { Text } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import {
  cargarMensajesChat,
  enviarMensajeTexto,
  marcarChatLeido,
  MensajeChat,
  editarMensajeChat,
  eliminarMensajeChat,
  obtenerUltimaLecturaDelOtro,
  reaccionarMensajeChat,
  quitarReaccionMensajeChat,
} from "../lib/chats";
import { MOODS } from "../lib/moods";
import { marcarNotificacionesDeChatComoLeidas } from "../lib/notificationsFeed";
import { calcularCompatibilidad } from "../lib/favorites";
import ChatOptionsMenu from "../components/ChatOptionsMenu";
import AdminBadge from "../components/AdminBadge";
import ActionSheetModal from "../components/ActionSheetModal";
import ConfirmModal from "../components/ConfirmModal";
import { posterUrl } from "../lib/tmdb";
import { formatearFechaHora } from "../lib/dates";
import { traducirTexto, idiomaCorto } from "../lib/translate";
import { useT } from "../i18n/i18n";
import { useHeaderHeight } from "@react-navigation/elements";
import { theme } from "../theme";

interface Props {
  route: {
    params: {
      chatId: string;
      otroUsername?: string | null;
      otroUserId?: string | null;
    };
  };
  navigation: any;
}

export default function ActivityThreadScreen({ route, navigation }: Props) {
  const { t } = useT();
  const headerHeight = useHeaderHeight();
  const { chatId, otroUsername, otroUserId } = route.params;
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [texto, setTexto] = useState("");
  const [gifElegido, setGifElegido] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [compatibilidad, setCompatibilidad] = useState<number | null>(null);
  const [previews, setPreviews] = useState<Record<string, { nombre: string; poster_path: string | null; subtitulo: string | null }>>({});
  const [otroAvatarUrl, setOtroAvatarUrl] = useState<string | null>(null);
  const [otroEsAdmin, setOtroEsAdmin] = useState(false);
  const [silenciado, setSilenciado] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [otroLastReadAt, setOtroLastReadAt] = useState<string | null>(null);
  const [mensajeMenuAccion, setMensajeMenuAccion] = useState<MensajeChat | null>(null);
  const [reaccionPickerMensajeId, setReaccionPickerMensajeId] = useState<string | null>(null);
  const [traducciones, setTraducciones] = useState<Record<string, string>>({});
  const [traduciendoId, setTraduciendoId] = useState<string | null>(null);
  const [idiomaUsuario, setIdiomaUsuario] = useState("en");
  const [menuMensajeVisible, setMenuMensajeVisible] = useState(false);
  const [confirmEliminarMsgVisible, setConfirmEliminarMsgVisible] = useState(false);
  const [editandoMensajeId, setEditandoMensajeId] = useState<string | null>(null);

  useEffect(() => {
    inicializar();

    const canal = supabase
      .channel(`chat-${chatId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `chat_id=eq.${chatId}` }, () => cargar())
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_message_reactions" }, () => cargar())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_reads", filter: `chat_id=eq.${chatId}` },
        (payload: any) => {
          if (payload.new?.user_id === otroUserId) setOtroLastReadAt(payload.new.last_read_at);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  async function inicializar() {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    setUserId(uid);
    if (uid) {
      const { data: perfilPropio } = await supabase.from("profiles").select("content_language").eq("id", uid).maybeSingle();
      setIdiomaUsuario(idiomaCorto(perfilPropio?.content_language));
    }
    await cargar();
    if (uid) {
      marcarChatLeido(chatId, uid);
      marcarNotificacionesDeChatComoLeidas(uid, chatId);
    }
    if (otroUserId) {
      const { data: perfil } = await supabase.from("profiles").select("avatar_url, is_admin").eq("id", otroUserId).maybeSingle();
      setOtroAvatarUrl(perfil?.avatar_url ?? null);
      setOtroEsAdmin(!!perfil?.is_admin);
      setOtroLastReadAt(await obtenerUltimaLecturaDelOtro(chatId, otroUserId));
      if (uid) setCompatibilidad(await calcularCompatibilidad(uid, otroUserId));
    }
    await cargarEstadoChat(uid);
  }

  async function cargarEstadoChat(uid: string | null) {
    if (!uid) return;
    const [{ data: estado }, { data: bloqueo }] = await Promise.all([
      supabase.from("chat_user_state").select("silenced_until, silenced_forever").eq("user_id", uid).eq("chat_id", chatId).maybeSingle(),
      supabase.from("chat_blocks").select("chat_id").eq("chat_id", chatId).maybeSingle(),
    ]);
    setSilenciado(!!estado && (estado.silenced_forever || (estado.silenced_until && new Date(estado.silenced_until).getTime() > Date.now())));
    setBloqueado(!!bloqueo);
  }

  async function cargar() {
    const data = await cargarMensajesChat(chatId, userId ?? undefined);
    setMensajes(data);
    if (userId) marcarChatLeido(chatId, userId);

    // Traemos nombre/poster de cada título, grupo o lista recomendado en el hilo.
    for (const m of data) {
      if (m.kind !== "shared_title") continue;
      const clave = m.tmdb_id ? `title-${m.tmdb_id}` : m.shared_group_id ? `group-${m.shared_group_id}` : `list-${m.shared_list_id}`;
      if (previews[clave]) continue;
      if (m.tmdb_id && m.item_type) {
        const tabla = m.item_type === "series" ? "series_cache" : "movies_cache";
        const tablaUsuario = m.item_type === "series" ? "user_series" : "user_movies";
        const columnaId = m.item_type === "series" ? "series_tmdb_id" : "movie_tmdb_id";
        const [{ data: cache }, { data: custom }] = await Promise.all([
          supabase.from(tabla).select("*").eq("tmdb_id", m.tmdb_id).maybeSingle(),
          supabase.from(tablaUsuario).select("custom_poster_path").eq("user_id", m.sender_id).eq(columnaId, m.tmdb_id).maybeSingle(),
        ]);
        if (cache) {
          let nombreFinal = m.item_type === "series" ? cache.name : cache.title;
          let subtitulo: string | null = null;
          if (m.item_type === "series" && m.season_number && m.episode_number) {
            const { data: ep } = await supabase
              .from("episodes_cache")
              .select("name")
              .eq("series_tmdb_id", m.tmdb_id)
              .eq("season_number", m.season_number)
              .eq("episode_number", m.episode_number)
              .maybeSingle();
            nombreFinal = `${nombreFinal} — ${ep?.name ?? `T${m.season_number}E${m.episode_number}`}`;
            subtitulo = `T${m.season_number} - E${m.episode_number}`;
          } else if (m.item_type === "series") {
            subtitulo = cache.total_seasons ? `${cache.total_seasons} ${cache.total_seasons === 1 ? t("temporada") : t("temporadas")}` : null;
          } else {
            subtitulo = cache.release_date ? cache.release_date.slice(0, 4) : null;
          }
          setPreviews((prev) => ({ ...prev, [clave]: { nombre: nombreFinal, poster_path: (custom as any)?.custom_poster_path ?? cache.poster_path, subtitulo } }));
        }
      } else if (m.shared_group_id) {
        const { data: g } = await supabase.from("groups").select("name, photo_url").eq("id", m.shared_group_id).maybeSingle();
        if (g) setPreviews((prev) => ({ ...prev, [clave]: { nombre: g.name, poster_path: g.photo_url, subtitulo: null } }));
      } else if (m.shared_list_id) {
        const { data: l } = await supabase.from("lists").select("title").eq("id", m.shared_list_id).maybeSingle();
        if (l) setPreviews((prev) => ({ ...prev, [clave]: { nombre: l.title, poster_path: null, subtitulo: null } }));
      }
    }
  }

  function abrirGifPicker() {
    navigation.navigate("ElegirGif", { onElegir: setGifElegido });
  }

  async function enviar() {
    if (editandoMensajeId) {
      if (!texto.trim()) return;
      try {
        await editarMensajeChat(editandoMensajeId, texto.trim());
        setEditandoMensajeId(null);
        setTexto("");
        await cargar();
      } catch (e: any) {
        Alert.alert("No se pudo editar", e.message ?? "Puede que ya haya pasado la hora para editarlo.");
      }
      return;
    }
    if ((!texto.trim() && !gifElegido) || !userId) return;
    Keyboard.dismiss();
    try {
      await enviarMensajeTexto(chatId, userId, texto.trim(), gifElegido);
      setTexto("");
      setGifElegido(null);
      await cargar();
    } catch (e: any) {
      console.error("Error al enviar mensaje:", e);
      Alert.alert("No se pudo enviar", e.message ?? "Revisá tu conexión y probá de nuevo.");
    }
  }

  function tocarMensaje(m: MensajeChat) {
    if (m.sender_id !== userId || m.deleted || m.kind !== "text") return;
    const dentroDeLaHora = Date.now() - new Date(m.created_at).getTime() < 60 * 60 * 1000;
    if (!dentroDeLaHora) return;
    setMensajeMenuAccion(m);
    setMenuMensajeVisible(true);
  }

  function empezarAEditar() {
    if (!mensajeMenuAccion) return;
    setMenuMensajeVisible(false);
    setEditandoMensajeId(mensajeMenuAccion.id);
    setTexto(mensajeMenuAccion.content ?? "");
  }

  function cancelarEdicion() {
    setEditandoMensajeId(null);
    setTexto("");
  }

  async function confirmarEliminarMensaje() {
    if (!mensajeMenuAccion) return;
    setConfirmEliminarMsgVisible(false);
    try {
      await eliminarMensajeChat(mensajeMenuAccion.id);
      await cargar();
    } catch (e: any) {
      Alert.alert("No se pudo eliminar", e.message ?? "Puede que ya haya pasado la hora para eliminarlo.");
    }
  }

  async function elegirReaccionMensaje(m: MensajeChat, emoji: string) {
    if (!userId) return;
    setReaccionPickerMensajeId(null);
    try {
      if (m.mi_reaccion === emoji) await quitarReaccionMensajeChat(m.id, userId);
      else await reaccionarMensajeChat(m.id, userId, emoji);
      await cargar();
    } catch (e: any) {
      console.error("Error al reaccionar al mensaje:", e);
    }
  }

  async function traducirMensaje(m: MensajeChat) {
    if (traducciones[m.id]) {
      setTraducciones((prev) => {
        const copia = { ...prev };
        delete copia[m.id];
        return copia;
      });
      return;
    }
    setTraduciendoId(m.id);
    try {
      const texto = await traducirTexto(m.content ?? "", idiomaUsuario);
      setTraducciones((prev) => ({ ...prev, [m.id]: texto }));
    } catch (e: any) {
      Alert.alert(t("No se pudo traducir"), e.message ?? t("Probá de nuevo en un rato."));
    } finally {
      setTraduciendoId(null);
    }
  }

  function abrirRecomendacion(m: MensajeChat) {
    if (m.tmdb_id && m.item_type && m.season_number && m.episode_number) {
      navigation.navigate("EpisodioDetalle", { seriesTmdbId: m.tmdb_id, seasonNumber: m.season_number, episodeNumber: m.episode_number, episodeName: null });
    } else if (m.tmdb_id && m.item_type) {
      navigation.navigate("DetalleTitulo", { tmdbId: m.tmdb_id, tipo: m.item_type });
    } else if (m.shared_group_id) {
      const clave = `group-${m.shared_group_id}`;
      navigation.navigate("DetalleGrupo", { groupId: m.shared_group_id, groupName: previews[clave]?.nombre ?? t("Grupo") });
    } else if (m.shared_list_id) {
      const clave = `list-${m.shared_list_id}`;
      navigation.navigate("DetalleLista", { listId: m.shared_list_id, listTitle: previews[clave]?.nombre ?? "Lista", soloLectura: m.sender_id !== userId });
    }
  }

  return (
    <>
    <KeyboardAvoidingView style={styles.container} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <View style={styles.tituloBox}>
        <Pressable
          style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
          disabled={!otroUserId}
          onPress={() => otroUserId && navigation.navigate("PerfilAjeno", { userId: otroUserId })}
        >
          {otroAvatarUrl ? (
            <Image source={{ uri: otroAvatarUrl }} style={styles.tituloAvatar} />
          ) : (
            <View style={[styles.tituloAvatar, { backgroundColor: theme.colors.surfaceAlt }]} />
          )}
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            <Text style={styles.tituloNombre} numberOfLines={1}>
              {otroUsername ?? t("Conversación")} {silenciado && "🔇"}
              {compatibilidad !== null && (
                <Text style={styles.tituloCompatibilidad}> · {compatibilidad}% {t("de Gustos en común")}</Text>
              )}
            </Text>
            {otroEsAdmin && <AdminBadge />}
          </View>
        </Pressable>
        <Pressable style={styles.tituloMenuBtn} onPress={() => setMenuVisible(true)} hitSlop={10}>
          <Text style={styles.tituloMenuBtnTexto}>⋯</Text>
        </Pressable>
      </View>

      <FlatList
        data={[...mensajes].reverse()}
        inverted
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => {
          const esMio = item.sender_id === userId;
          const esLista = !!item.shared_list_id;
          const clave = item.tmdb_id ? `title-${item.tmdb_id}` : item.shared_group_id ? `group-${item.shared_group_id}` : `list-${item.shared_list_id}`;
          const preview = item.kind === "shared_title" ? previews[clave] : null;
          const leido = esMio && !!otroLastReadAt && otroLastReadAt >= item.created_at;

          if (item.deleted) {
            return (
              <View style={[styles.burbuja, esMio ? styles.burbujaPropia : styles.burbujaAjena]}>
                <Text style={styles.mensajeEliminadoTexto}>{esMio ? t("Eliminaste un mensaje") : t("Eliminó un mensaje")}</Text>
              </View>
            );
          }

          return (
            <Pressable onLongPress={() => tocarMensaje(item)} delayLongPress={350}>
              <View
                style={[
                  styles.burbuja,
                  esMio ? styles.burbujaPropia : styles.burbujaAjena,
                  item.kind === "shared_title" && !esLista && styles.burbujaRecomendacion,
                ]}
              >
                {item.kind === "shared_title" && esLista && (
                  <Pressable onPress={() => abrirRecomendacion(item)}>
                    <Text style={styles.recomendacionEtiqueta}>{esMio ? t("Recomendaste la lista") : t("Te recomendó la lista")}</Text>
                    <Text style={styles.listaLinkTexto}>{preview?.nombre ?? "..."}</Text>
                  </Pressable>
                )}
                {item.kind === "shared_title" && !esLista && (
                  <Pressable style={styles.recomendacionCard} onPress={() => abrirRecomendacion(item)}>
                    {preview?.poster_path ? (
                      <Image
                        source={{ uri: item.shared_group_id ? preview.poster_path : posterUrl(preview.poster_path, "w185")! }}
                        style={styles.recomendacionPoster}
                      />
                    ) : (
                      <View style={[styles.recomendacionPoster, { backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" }]}>
                        {!preview && <ActivityIndicator size="small" color={theme.colors.primaryLight} />}
                      </View>
                    )}
                    <View style={styles.recomendacionTextos}>
                      <Text style={styles.recomendacionEtiqueta}>
                        {esMio ? t("Recomendaste") : t("Te recomendó")} {item.shared_group_id ? t("el grupo ") : ""}
                      </Text>
                      <Text style={styles.recomendacionTitulo} numberOfLines={2}>
                        {preview?.nombre ?? "..."}
                      </Text>
                      {preview?.subtitulo && <Text style={styles.recomendacionSub}>{preview.subtitulo}</Text>}
                    </View>
                  </Pressable>
                )}
                {item.content ? <Text>{traducciones[item.id] ?? item.content}</Text> : null}
                {item.gif_url && <Image source={{ uri: item.gif_url }} style={styles.gifEnBurbuja} />}
                {item.edited_at && <Text style={styles.editadoTexto}>{t("mensaje editado")}</Text>}
                <View style={styles.pieMensajeRow}>
                    {!esMio && (
                      <Pressable
                        onPress={() => setReaccionPickerMensajeId(reaccionPickerMensajeId === item.id ? null : item.id)}
                        hitSlop={8}
                      >
                        <Ionicons name="happy-outline" size={15} color="#FFFFFF" />
                      </Pressable>
                    )}
                    {Object.keys(item.reacciones ?? {}).length > 0 && (
                      <View style={{ flexDirection: "row", gap: 4, marginLeft: esMio ? 0 : 4 }}>
                        {Object.keys(item.reacciones).map((emoji) => (
                          <IconoReaccionChat key={emoji} emoji={emoji} />
                        ))}
                      </View>
                    )}
                    <View style={{ flex: 1 }} />
                    <Text style={[styles.burbujaFecha, !esMio && { color: "#FFFFFF" }]}>{formatearFechaHora(item.created_at)}</Text>
                    {!esMio && item.content && (
                      <Pressable onPress={() => traducirMensaje(item)} disabled={traduciendoId === item.id} hitSlop={6} style={{ marginLeft: 8 }}>
                        <Text style={styles.traducirTextoChat}>
                          {traduciendoId === item.id ? t("Traduciendo...") : traducciones[item.id] ? t("Ver original") : t("Traducir")}
                        </Text>
                      </Pressable>
                    )}
                    {esMio && (
                      <Ionicons
                        name="checkmark-done"
                        size={14}
                        color={leido ? theme.colors.primary : theme.colors.textMuted}
                        style={{ marginLeft: 3 }}
                      />
                    )}
                  </View>

                {reaccionPickerMensajeId === item.id && (
                  <View style={styles.emojiPickerRow}>
                    <Pressable onPress={() => elegirReaccionMensaje(item, "like")} style={styles.emojiPickerBtn}>
                      <Ionicons name="thumbs-up" size={20} color={theme.colors.primaryLight} />
                    </Pressable>
                    <Pressable onPress={() => elegirReaccionMensaje(item, "love")} style={styles.emojiPickerBtn}>
                      <Ionicons name="heart" size={20} color={theme.colors.primaryLight} />
                    </Pressable>
                    {MOODS.map((m) => (
                      <Pressable key={m.key} onPress={() => elegirReaccionMensaje(item, m.key)} style={styles.emojiPickerBtn}>
                        <Image source={m.imagen} style={styles.emojiPickerImagen} resizeMode="contain" />
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </Pressable>
          );
        }}
      />

      {gifElegido && (
        <View style={styles.gifPreviewRow}>
          <Image source={{ uri: gifElegido }} style={styles.gifPreview} />
          <Pressable onPress={() => setGifElegido(null)} hitSlop={8}>
            <Text style={styles.gifQuitarTexto}>Quitar GIF</Text>
          </Pressable>
        </View>
      )}

      {editandoMensajeId && (
        <View style={styles.editandoRow}>
          <Text style={styles.editandoBannerTexto}>{t("Editando mensaje")}</Text>
          <Pressable onPress={cancelarEdicion} hitSlop={8}>
            <Text style={styles.gifQuitarTexto}>{t("Cancelar")}</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.inputRow}>
        <Pressable style={styles.gifBtn} onPress={abrirGifPicker} disabled={!!editandoMensajeId}>
          <Text style={styles.gifBtnTexto}>GIF</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder={t("Escribir...")}
          placeholderTextColor={theme.colors.textFaint}
          value={texto}
          onChangeText={setTexto}
          maxLength={500}
        />
        <Pressable style={styles.enviarBtn} onPress={enviar}>
          <Ionicons name={editandoMensajeId ? "checkmark" : "paper-plane"} size={18} color="#000000" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
    {otroUserId && (
      <ChatOptionsMenu
        visible={menuVisible}
        onCerrar={() => setMenuVisible(false)}
        userId={userId}
        chatId={chatId}
        otroUserId={otroUserId}
        silenciado={silenciado}
        bloqueado={bloqueado}
        onCambio={() => cargarEstadoChat(userId)}
        onChatEliminado={() => navigation.goBack()}
      />
    )}
    <ActionSheetModal
      visible={menuMensajeVisible}
      onCerrar={() => setMenuMensajeVisible(false)}
      opciones={[
        { label: t("Editar"), icono: "create-outline", onPress: empezarAEditar },
        { label: t("Eliminar"), icono: "trash-outline", destructivo: true, onPress: () => { setMenuMensajeVisible(false); setConfirmEliminarMsgVisible(true); } },
      ]}
    />
    <ConfirmModal
      visible={confirmEliminarMsgVisible}
      onCerrar={() => setConfirmEliminarMsgVisible(false)}
      titulo={t("Eliminar mensaje")}
      mensaje={t("¿Seguro que querés eliminarlo? A la otra persona le va a quedar un aviso de que eliminaste un mensaje.")}
      botones={[
        { label: t("Cancelar"), onPress: () => {} },
        { label: t("Eliminar"), destacado: true, onPress: confirmarEliminarMensaje },
      ]}
    />
    </>
  );
}

function IconoReaccionChat({ emoji }: { emoji: string }) {
  if (emoji === "like") return <Ionicons name="thumbs-up" size={13} color={theme.colors.primaryLight} />;
  if (emoji === "love") return <Ionicons name="heart" size={13} color={theme.colors.primaryLight} />;
  const mood = MOODS.find((m) => m.key === emoji);
  if (mood) return <Image source={mood.imagen} style={{ width: 14, height: 14 }} resizeMode="contain" />;
  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  tituloBox: { flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  tituloAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  tituloMenuBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  tituloMenuBtnTexto: { fontSize: 22, color: theme.colors.textMuted },
  tituloNombre: { fontSize: 16, fontWeight: "700", flex: 1 },
  tituloCompatibilidad: { fontSize: 13, fontWeight: "400", color: theme.colors.textMuted },
  // Ahora al revés de como estaba: mis mensajes en gris/negro, los del otro en violeta.
  burbuja: { padding: 10, borderRadius: theme.radius.md, marginBottom: 8, maxWidth: "80%" },
  burbujaRecomendacion: { width: "75%", maxWidth: "75%" },
  burbujaPropia: { backgroundColor: theme.colors.surfaceAlt, alignSelf: "flex-end" },
  burbujaAjena: { backgroundColor: "#3D1750", alignSelf: "flex-start" },
  burbujaFecha: { fontSize: 9, opacity: 0.6, marginTop: 4, textAlign: "right" },
  pieMensajeRow: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 },
  traducirTextoChat: { fontSize: 10, color: "#B8B8B8", fontWeight: "700" },
  reaccionesResumenRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4, justifyContent: "flex-end" },
  reaccionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: theme.radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reaccionChipTexto: { fontSize: 10, color: "#FFFFFF", fontWeight: "700" },
  emojiPickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 8,
  },
  emojiPickerBtn: { padding: 4 },
  emojiPickerImagen: { width: 24, height: 24 },
  editadoTexto: { fontSize: 9, color: theme.colors.textMuted, fontStyle: "italic", marginTop: 3, textAlign: "right" },
  mensajeEliminadoTexto: { fontSize: 13, fontStyle: "italic", opacity: 0.6 },
  editandoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 8 },
  editandoBannerTexto: { color: theme.colors.primaryLight, fontSize: 12, fontWeight: "700" },
  recomendacionCard: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.15)", borderRadius: theme.radius.md, padding: 8, marginBottom: 6 },
  recomendacionPoster: { width: 56, height: 84, borderRadius: 6, marginRight: 10, backgroundColor: theme.colors.surfaceAlt, flexShrink: 0 },
  recomendacionTextos: { flex: 1, minWidth: 0 },
  recomendacionEtiqueta: { fontSize: 10, opacity: 0.75 },
  recomendacionTitulo: { fontSize: 13, fontWeight: "700", marginTop: 1 },
  recomendacionSub: { fontSize: 11, opacity: 0.75, marginTop: 2 },
  listaLinkTexto: { fontSize: 14, fontWeight: "700", textDecorationLine: "underline", marginTop: 2, marginBottom: 4 },
  recomendacionFecha: { fontSize: 9, opacity: 0.6, marginTop: 4, textAlign: "right" },
  gifEnBurbuja: { width: 140, height: 140, borderRadius: 8, marginTop: 4, backgroundColor: theme.colors.surfaceAlt },
  gifPreviewRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 8, gap: 10 },
  gifPreview: { width: 60, height: 60, borderRadius: 8, backgroundColor: theme.colors.surfaceAlt },
  gifQuitarTexto: { color: theme.colors.textMuted, fontSize: 12, fontWeight: "700" },
  inputRow: { flexDirection: "row", padding: 8, alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  gifBtn: { width: 44, height: 38, borderRadius: 8, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center", marginRight: 6 },
  gifBtnTexto: { color: theme.colors.primaryLight, fontSize: 11, fontWeight: "800" },
  input: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: 10, marginRight: 8 },
  enviarBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
});
