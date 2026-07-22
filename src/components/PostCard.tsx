import React, { useState } from "react";
import { View, Image, Pressable, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Themed";
import ActionSheetModal from "./ActionSheetModal";
import ConfirmModal from "./ConfirmModal";
import ReportModal from "./ReportModal";
import { Post, reaccionarPost, quitarReaccionPost, eliminarPost, marcarPostNoInteresa } from "../lib/posts";
import StarRating from "./StarRating";
import { posterUrl } from "../lib/tmdb";
import { formatearFechaHora, formatearTiempoRelativo } from "../lib/dates";
import { traducirTexto, idiomaCorto } from "../lib/translate";
import { MOODS } from "../lib/moods";
import ExpandableText from "./ExpandableText";
import { supabase } from "../lib/supabase";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

const REACCIONES_ICONO: { key: string; icono: "thumbs-up" | "heart" }[] = [
  { key: "like", icono: "thumbs-up" },
  { key: "love", icono: "heart" },
];

function IconoReaccion({ reaccionKey, size = 16 }: { reaccionKey: string; size?: number }) {
  if (reaccionKey === "like") return <Ionicons name="thumbs-up" size={size} color={theme.colors.primaryLight} />;
  if (reaccionKey === "love") return <Ionicons name="heart" size={size} color={theme.colors.primaryLight} />;
  const mood = MOODS.find((m) => m.key === reaccionKey);
  if (mood) return <Image source={mood.imagen} style={{ width: size, height: size }} resizeMode="contain" />;
  return <Ionicons name="happy-outline" size={size} color={theme.colors.textMuted} />;
}

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

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  function abrirTitulo() {
    if (post.item_type === "list" && post.list_id) {
      navigation.navigate("DetalleLista", { listId: post.list_id, listTitle: post.titulo_nombre ?? t("Lista") });
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

  function abrirComentarios() {
    navigation.navigate("Comentarios", { targetType: "post", targetId: post.id });
  }

  async function elegirReaccion(key: string) {
    if (!userId) return;
    setPickerVisible(false);
    try {
      if (post.mi_reaccion === key) await quitarReaccionPost(userId, post.id);
      else await reaccionarPost(userId, post.id, key);
      onCambio?.();
    } catch (e: any) {
      Alert.alert("No se pudo reaccionar", e.message);
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

  const totalReacciones = Object.values(post.reacciones ?? {}).reduce((a, b) => a + b, 0);

  if (eliminado) return null;

  return (
    <View style={styles.card}>
      <View style={styles.autorRow}>
        <Pressable style={{ flexDirection: "row", alignItems: "center", flex: 1 }} onPress={() => navigation.navigate("PerfilAjeno", { userId: post.user_id })}>
          {post.avatar_url ? <Image source={{ uri: post.avatar_url }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarPlaceholder]} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.username}>{post.username ?? t("Usuario")}</Text>
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
        <Pressable onPress={() => setPickerVisible(!pickerVisible)} style={styles.accionBtn}>
          <IconoReaccion reaccionKey={post.mi_reaccion ?? ""} size={16} />
          <Text style={styles.accionTexto}>{totalReacciones > 0 ? totalReacciones : ""}</Text>
        </Pressable>
        <Pressable onPress={abrirComentarios} style={styles.accionBtn}>
          <Ionicons name="chatbubble-outline" size={15} color={theme.colors.textMuted} />
          <Text style={styles.accionTexto}>{post.cantidad_comentarios ? post.cantidad_comentarios : t("Comentar")}</Text>
        </Pressable>
        {!!post.content?.trim() && (
          <Pressable onPress={traducir} disabled={traduciendo} style={styles.traducirBtn}>
            <Text style={styles.traducirTexto}>{traduciendo ? t("Traduciendo...") : traduccion ? t("Ver original") : t("Traducir")}</Text>
          </Pressable>
        )}
      </View>

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
});
