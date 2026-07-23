import React, { useCallback, useState } from "react";
import { View, FlatList, Image, Pressable, TextInput, StyleSheet } from "react-native";
import { Alert } from "../lib/alert";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { Grupo, listarGruposCreadosPor, eliminarGrupo, suspenderComentariosGrupo, listarSolicitudesDeMisGrupos, aceptarSolicitudGrupo, rechazarSolicitudGrupo, SolicitudGrupo } from "../lib/groups";
import { Text } from "../components/Themed";
import ActionSheetModal from "../components/ActionSheetModal";
import ConfirmModal from "../components/ConfirmModal";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function AdminGroupsScreen({ navigation }: any) {
  const { t } = useT();
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudGrupo[]>([]);
  const [grupoAccion, setGrupoAccion] = useState<Grupo | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuDuracionVisible, setMenuDuracionVisible] = useState(false);
  const [confirmBorrar, setConfirmBorrar] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [])
  );

  async function cargar() {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;
    setGrupos(await listarGruposCreadosPor(uid));
    setSolicitudes(await listarSolicitudesDeMisGrupos(uid));
  }

  async function aceptar(s: SolicitudGrupo) {
    try {
      await aceptarSolicitudGrupo(s.id);
      cargar();
    } catch (e: any) {
      Alert.alert("No se pudo aceptar", e.message);
    }
  }

  async function rechazar(s: SolicitudGrupo) {
    try {
      await rechazarSolicitudGrupo(s.id);
      cargar();
    } catch (e: any) {
      Alert.alert("No se pudo rechazar", e.message);
    }
  }

  function abrirAcciones(grupo: Grupo) {
    setGrupoAccion(grupo);
    setMenuVisible(true);
  }

  async function suspender(duracionMs: number | null) {
    if (!grupoAccion) return;
    const hasta = duracionMs ? new Date(Date.now() + duracionMs).toISOString() : null;
    try {
      await suspenderComentariosGrupo(grupoAccion.id, hasta);
      cargar();
    } catch (e: any) {
      Alert.alert("No se pudo actualizar", e.message);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={grupos.filter((g) => (busqueda.trim() ? g.name.toLowerCase().includes(busqueda.trim().toLowerCase()) : true))}
        keyExtractor={(g) => g.id}
        ListHeaderComponent={
          <>
            <TextInput
              style={styles.buscador}
              placeholder={t("Buscar en mis grupos...")}
              placeholderTextColor={theme.colors.textFaint}
              value={busqueda}
              onChangeText={setBusqueda}
            />
            {solicitudes.length > 0 && (
              <View style={{ marginBottom: 12, marginHorizontal: 12 }}>
                <Text style={styles.seccionTitulo}>{t("Solicitudes para entrar a tus grupos")}</Text>
                {solicitudes.map((s) => (
                  <View key={s.id} style={styles.solicitudCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nombre}>{s.requester_username ?? t("Usuario")}</Text>
                      <Text style={styles.miembros}>{t('quiere entrar a "{nombre}"').replace("{nombre}", s.group_name)}</Text>
                    </View>
                    <Pressable style={styles.aceptarBtn} onPress={() => aceptar(s)}>
                      <Text style={styles.aceptarBtnTexto}>{t("Aceptar")}</Text>
                    </Pressable>
                    <Pressable style={styles.rechazarBtn} onPress={() => rechazar(s)}>
                      <Text style={styles.rechazarBtnTexto}>{t("Rechazar")}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </>
        }
        ListEmptyComponent={<Text style={styles.vacio}>{t("Todavía no creaste ningún grupo.")}</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable style={styles.cardInfo} onPress={() => navigation.navigate("DetalleGrupo", { groupId: item.id, groupName: item.name })}>
              {item.photo_url ? (
                <Image source={{ uri: item.photo_url }} style={styles.foto} />
              ) : (
                <View style={[styles.foto, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.nombre}>{item.name}</Text>
                <Text style={styles.miembros}>{item.miembros} {t("miembros")}</Text>
                {item.comments_suspended_until && new Date(item.comments_suspended_until) > new Date() && (
                  <Text style={styles.suspendido}>{t("Comentarios suspendidos")}</Text>
                )}
              </View>
            </Pressable>
            <Pressable style={styles.menuBtn} onPress={() => abrirAcciones(item)} hitSlop={10}>
              <Ionicons name="settings-outline" size={18} color="#000000" />
            </Pressable>
          </View>
        )}
      />

      <ActionSheetModal
        visible={menuVisible}
        onCerrar={() => setMenuVisible(false)}
        titulo={grupoAccion?.name}
        opciones={[
          { label: t("Ver grupo"), icono: "eye-outline", onPress: () => grupoAccion && navigation.navigate("DetalleGrupo", { groupId: grupoAccion.id, groupName: grupoAccion.name }) },
          { label: t("Suspender comentarios"), icono: "pause-circle-outline", onPress: () => setMenuDuracionVisible(true) },
          { label: t("Reactivar comentarios"), icono: "play-circle-outline", onPress: () => suspender(null) },
          {
            label: t("Silenciar usuarios"),
            icono: "volume-mute-outline",
            onPress: () =>
              grupoAccion &&
              navigation.navigate("ModerarUsuariosGrupo", {
                groupId: grupoAccion.id,
                groupName: grupoAccion.name,
                esPrivado: grupoAccion.visibility === "private",
                modo: "silenciar",
              }),
          },
          {
            label: t("Eliminar usuarios"),
            icono: "person-remove-outline",
            destructivo: true,
            onPress: () =>
              grupoAccion &&
              navigation.navigate("ModerarUsuariosGrupo", {
                groupId: grupoAccion.id,
                groupName: grupoAccion.name,
                esPrivado: grupoAccion.visibility === "private",
                modo: "eliminar",
              }),
          },
          { label: t("Eliminar grupo"), icono: "trash-outline", destructivo: true, onPress: () => setConfirmBorrar(true) },
        ]}
      />

      <ActionSheetModal
        visible={menuDuracionVisible}
        onCerrar={() => setMenuDuracionVisible(false)}
        titulo={t("¿Por cuánto tiempo?")}
        opciones={[
          { label: t("1 día"), icono: "time-outline", onPress: () => suspender(1000 * 60 * 60 * 24) },
          { label: t("1 semana"), icono: "time-outline", onPress: () => suspender(1000 * 60 * 60 * 24 * 7) },
          { label: t("Indefinidamente"), icono: "infinite-outline", onPress: () => suspender(1000 * 60 * 60 * 24 * 365 * 100), destructivo: true },
        ]}
      />

      <ConfirmModal
        visible={confirmBorrar}
        onCerrar={() => setConfirmBorrar(false)}
        titulo={t("Eliminar grupo")}
        mensaje={t('¿Seguro que querés eliminar "{nombre}"? Esto borra el grupo para siempre, junto con sus comentarios.').replace("{nombre}", grupoAccion?.name ?? "")}
        botones={[
          { label: t("Cancelar"), onPress: () => {} },
          {
            label: t("Eliminar"),
            destacado: true,
            onPress: async () => {
              try {
                if (grupoAccion) await eliminarGrupo(grupoAccion.id);
                cargar();
              } catch (e: any) {
                Alert.alert(t("No se pudo eliminar"), e.message);
              }
            },
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  buscador: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    padding: 10,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 12,
  },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 32, paddingHorizontal: 24 },
  card: { flexDirection: "row", alignItems: "center", padding: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  cardInfo: { flex: 1, flexDirection: "row", alignItems: "center" },
  foto: { width: 44, height: 44, borderRadius: 8, marginRight: 12 },
  nombre: { fontSize: 15, fontWeight: "600" },
  miembros: { fontSize: 12, color: theme.colors.textMuted },
  suspendido: { fontSize: 11, color: theme.colors.danger, marginTop: 2, fontWeight: "700" },
  menuBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  menuBtnTexto: { fontSize: 20, color: theme.colors.textMuted },
  seccionTitulo: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted, textTransform: "uppercase", marginBottom: 8 },
  solicitudCard: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 10, marginBottom: 8 },
  aceptarBtn: { backgroundColor: theme.colors.primary, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, marginRight: 6 },
  aceptarBtnTexto: { color: "#000000", fontSize: 12, fontWeight: "700" },
  rechazarBtn: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  rechazarBtnTexto: { color: theme.colors.textMuted, fontSize: 12, fontWeight: "700" },
});
