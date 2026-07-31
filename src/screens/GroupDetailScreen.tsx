import React, { useEffect, useState } from "react";
import { View, ScrollView, FlatList, Image, Pressable, StyleSheet } from "react-native";
import { Alert } from "../lib/alert";
import CommentThread from "../components/CommentThread";
import ActionSheetModal from "../components/ActionSheetModal";
import ConfirmModal from "../components/ConfirmModal";
import ReportModal from "../components/ReportModal";
import { Text } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { marcarGrupoLeido, miEstadoEnGrupo, salirDeGrupo, silenciarGrupo, quitarSilencioGrupoLista, idsGruposSilenciados, unirseAGrupo, actualizarBannerGrupo } from "../lib/groups";
import { marcarNotificacionesDeGrupoComoLeidas } from "../lib/notificationsFeed";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  route: any;
  navigation: any;
}

interface Miembro {
  id: string;
  username: string | null;
  avatar_url: string | null;
}

export default function GroupDetailScreen({ route, navigation }: Props) {
  const { t } = useT();
  const { groupId, groupName } = route.params;
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [grupo, setGrupo] = useState<{
    banner_url: string | null;
    photo_url: string | null;
    description: string | null;
    comments_suspended_until: string | null;
    creator_id: string | null;
  } | null>(null);
  const [miEstado, setMiEstado] = useState<{ baneado: boolean; silenciado: boolean }>({ baneado: false, silenciado: false });
  const [userId, setUserId] = useState<string | null>(null);
  const [silenciadoPersonal, setSilenciadoPersonal] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuSilenciarVisible, setMenuSilenciarVisible] = useState(false);
  const [confirmSalirVisible, setConfirmSalirVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [soyMiembro, setSoyMiembro] = useState<boolean | null>(null);
  const [uniendome, setUniendome] = useState(false);

  useEffect(() => {
    cargarMiembros();
    cargarGrupo();
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        marcarGrupoLeido(groupId, data.user.id);
        marcarNotificacionesDeGrupoComoLeidas(data.user.id, groupId);
        miEstadoEnGrupo(groupId, data.user.id).then(setMiEstado);
        const silenciados = await idsGruposSilenciados(data.user.id);
        setSilenciadoPersonal(silenciados.has(groupId));
        const { data: filaMiembro } = await supabase
          .from("group_members")
          .select("user_id")
          .eq("group_id", groupId)
          .eq("user_id", data.user.id)
          .maybeSingle();
        setSoyMiembro(!!filaMiembro);
      }
    });
  }, []);

  async function unirme() {
    if (!userId) return;
    setUniendome(true);
    try {
      await unirseAGrupo(groupId, userId);
      setSoyMiembro(true);
      await cargarMiembros();
    } catch (e: any) {
      console.error("Error al unirse al grupo:", e);
    } finally {
      setUniendome(false);
    }
  }

  async function cambiarBanner() {
    setMenuVisible(false);
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert(t("Sin permiso"), t("Necesitamos acceso a tus fotos para elegir un banner."));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, base64: true });
    if (res.canceled || !res.assets?.[0]) return;
    try {
      const asset = res.assets[0];
      const base64 = asset.base64 ?? (await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }));
      const nombreArchivo = `${groupId}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("group-banners").upload(nombreArchivo, decode(base64), { contentType: "image/jpeg" });
      if (error) {
        Alert.alert(t("No se pudo subir la foto"), error.message);
        return;
      }
      const { data: publicUrl } = supabase.storage.from("group-banners").getPublicUrl(nombreArchivo);
      await actualizarBannerGrupo(groupId, publicUrl.publicUrl);
      setGrupo((g) => (g ? { ...g, banner_url: publicUrl.publicUrl } : g));
    } catch (e: any) {
      Alert.alert(t("No se pudo subir la foto"), e.message ?? "Revisá tu conexión y probá de nuevo.");
    }
  }

  async function toggleSilencioPersonal() {
    if (!userId) return;
    setMenuVisible(false);
    if (silenciadoPersonal) {
      await quitarSilencioGrupoLista(userId, groupId);
      setSilenciadoPersonal(false);
    } else {
      setMenuSilenciarVisible(true);
    }
  }

  async function silenciarConDuracion(duracion: "1dia" | "1semana" | "siempre") {
    if (!userId) return;
    setMenuSilenciarVisible(false);
    await silenciarGrupo(userId, groupId, duracion);
    setSilenciadoPersonal(true);
  }

  async function confirmarSalir() {
    if (!userId) return;
    setConfirmSalirVisible(false);
    await salirDeGrupo(groupId, userId);
    navigation.goBack();
  }

  async function cargarGrupo() {
    const { data } = await supabase.from("groups").select("banner_url, photo_url, description, comments_suspended_until, creator_id").eq("id", groupId).maybeSingle();
    if (data)
      setGrupo({
        banner_url: data.banner_url ?? data.photo_url,
        photo_url: data.photo_url,
        description: data.description,
        comments_suspended_until: data.comments_suspended_until,
        creator_id: data.creator_id,
      });
  }

  async function cargarMiembros() {
    const { data } = await supabase.from("group_members").select("profiles!group_members_user_id_fkey(id, username, avatar_url)").eq("group_id", groupId);
    setMiembros((data ?? []).map((r: any) => r.profiles).filter(Boolean));
  }

  const suspendido = !!grupo?.comments_suspended_until && new Date(grupo.comments_suspended_until) > new Date();

  return (
    <>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
      <View>
        {grupo?.banner_url ? (
          <Image source={{ uri: grupo.banner_url }} style={styles.banner} />
        ) : (
          <View style={[styles.banner, { backgroundColor: theme.colors.surfaceAlt }]} />
        )}
        <Pressable style={styles.menuBtnFlotante} onPress={() => setMenuVisible(true)} hitSlop={12}>
          <Text style={styles.menuBtnFlotanteTexto}>⋯</Text>
        </Pressable>
        <Pressable
          style={styles.recomendarBtnFlotante}
          onPress={() => navigation.navigate("Recomendar", { kind: "group", groupId, nombre: groupName, posterPath: grupo?.photo_url ?? null })}
          hitSlop={12}
        >
          <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.container}>
        <Text style={styles.titulo}>{groupName}</Text>
        {grupo?.description && <Text style={styles.descripcion}>{grupo.description}</Text>}

        {soyMiembro === false && (
          <Pressable style={styles.unirmeBtn} onPress={unirme} disabled={uniendome}>
            <Text style={styles.unirmeBtnTexto}>{uniendome ? t("Uniéndote...") : t("Unirme al grupo")}</Text>
          </Pressable>
        )}

        {miembros.length > 0 && (
          <View style={{ marginBottom: 16, marginTop: 8 }}>
            <Text style={styles.miembrosTitulo}>{t("{n} miembros").replace("{n}", String(miembros.length))}</Text>
            <FlatList
              horizontal
              data={miembros.slice(0, 8)}
              keyExtractor={(m) => m.id}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable style={styles.miembroCard} onPress={() => navigation.navigate("PerfilAjeno", { userId: item.id })}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: theme.colors.surfaceAlt }]} />
                  )}
                  <Text style={styles.miembroNombre} numberOfLines={1}>
                    {item.username ?? "Usuario"}
                  </Text>
                </Pressable>
              )}
              ListFooterComponent={
                miembros.length > 8 ? (
                  <Pressable style={styles.masBtn} onPress={() => navigation.navigate("MiembrosGrupo", { groupId })}>
                    <Text style={styles.masBtnTexto}>+</Text>
                  </Pressable>
                ) : null
              }
            />
          </View>
        )}

        {suspendido && <Text style={styles.suspendidoAviso}>{t("Los comentarios de este grupo están suspendidos temporalmente.")}</Text>}
        {miEstado.baneado && <Text style={styles.suspendidoAviso}>Fuiste eliminado de este grupo. Podés verlo, pero no comentar ni volver a unirte.</Text>}
        {!miEstado.baneado && miEstado.silenciado && <Text style={styles.suspendidoAviso}>Un admin te silenció en este grupo.</Text>}
        <CommentThread
          targetType="group"
          targetId={groupId}
          groupId={groupId}
          navigation={navigation}
          soloLectura={suspendido || miEstado.baneado || miEstado.silenciado || soyMiembro === false}
        />
      </View>
    </ScrollView>

    <ActionSheetModal
      visible={menuVisible}
      onCerrar={() => setMenuVisible(false)}
      titulo={groupName}
      opciones={[
        ...(userId && grupo?.creator_id === userId
          ? [{ label: t("Cambiar banner"), icono: "image-outline" as const, onPress: cambiarBanner }]
          : []),
        { label: silenciadoPersonal ? t("Dejar de silenciar") : t("Silenciar grupo"), icono: "volume-mute-outline", onPress: toggleSilencioPersonal },
        { label: t("Salir del grupo"), icono: "exit-outline", destructivo: true, onPress: () => { setMenuVisible(false); setConfirmSalirVisible(true); } },
        { label: t("Denunciar"), icono: "flag-outline", destructivo: true, onPress: () => { setMenuVisible(false); setReportVisible(true); } },
      ]}
    />

    <ActionSheetModal
      visible={menuSilenciarVisible}
      onCerrar={() => setMenuSilenciarVisible(false)}
      titulo={t("¿Por cuánto tiempo?")}
      opciones={[
        { label: t("1 día"), icono: "time-outline", onPress: () => silenciarConDuracion("1dia") },
        { label: t("1 semana"), icono: "time-outline", onPress: () => silenciarConDuracion("1semana") },
        { label: t("Siempre"), icono: "infinite-outline", onPress: () => silenciarConDuracion("siempre"), destructivo: true },
      ]}
    />

    <ConfirmModal
      visible={confirmSalirVisible}
      onCerrar={() => setConfirmSalirVisible(false)}
      titulo={t("Salir del grupo")}
      mensaje={t('¿Seguro que querés salir de "{nombre}"?').replace("{nombre}", groupName)}
      botones={[
        { label: t("Cancelar"), onPress: () => {} },
        { label: t("Salir"), destacado: true, onPress: confirmarSalir },
      ]}
    />

    <ReportModal visible={reportVisible} onCerrar={() => setReportVisible(false)} reporterId={userId} targetType="group" targetId={groupId} />
    </>
  );
}

const styles = StyleSheet.create({
  banner: { width: "100%", aspectRatio: 16 / 9, backgroundColor: theme.colors.surfaceAlt },
  recomendarBtnFlotante: { position: "absolute", top: 56, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  menuBtnFlotante: { position: "absolute", top: 12, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  menuBtnFlotanteTexto: { fontSize: 20, color: "#FFFFFF" },
  unirmeBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: 12, alignItems: "center", marginTop: 12 },
  unirmeBtnTexto: { color: "#000000", fontWeight: "800", fontSize: 14 },
  container: { padding: 16 },
  titulo: { fontSize: 20, fontWeight: "700" },
  descripcion: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  miembrosTitulo: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 8 },
  miembroCard: { width: 64, alignItems: "center", marginRight: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, marginBottom: 4 },
  miembroNombre: { fontSize: 11 },
  masBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.primary, justifyContent: "center", alignItems: "center", alignSelf: "center", marginLeft: 4 },
  masBtnTexto: { color: theme.colors.primaryLight, fontSize: 20, fontWeight: "700" },
  suspendidoAviso: { fontSize: 12, color: theme.colors.danger, fontWeight: "700", marginBottom: 8 },
});
