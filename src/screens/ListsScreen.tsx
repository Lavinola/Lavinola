import React, { useCallback, useState } from "react";
import { View, FlatList, Pressable, TextInput, StyleSheet, Alert, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { Text, AppButton } from "../components/Themed";
import ActionSheetModal from "../components/ActionSheetModal";
import ConfirmModal from "../components/ConfirmModal";
import PublishActionModal from "../components/PublishActionModal";
import {
  Lista,
  VisibilidadLista,
  ETIQUETAS_VISIBILIDAD,
  listarMisListas,
  listarListasQueSigo,
  cambiarVisibilidadLista,
  borrarLista,
  dejarDeSeguirLista,
  enriquecerListas,
  silenciarListaSeguida,
  silenciarNuevosSeguidoresLista,
  actualizarDescripcionLista,
} from "../lib/lists";
import ListPreviewCard from "../components/ListPreviewCard";
import ReportModal from "../components/ReportModal";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type SubTab = "mias" | "sigo";

export default function ListsScreen({ navigation }: any) {
  const { t } = useT();
  const [subTab, setSubTab] = useState<SubTab>("mias");
  const [userId, setUserId] = useState<string | null>(null);
  const [misListas, setMisListas] = useState<Lista[]>([]);
  const [listasQueSigo, setListasQueSigo] = useState<Lista[]>([]);
  const [listaAccion, setListaAccion] = useState<Lista | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [confirmBorrarVisible, setConfirmBorrarVisible] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [listaARecomendar, setListaARecomendar] = useState<Lista | null>(null);
  const [publishModalVisible, setPublishModalVisible] = useState(false);
  const [menuSigoVisible, setMenuSigoVisible] = useState(false);
  const [listaAccionSigo, setListaAccionSigo] = useState<Lista | null>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [editarDescVisible, setEditarDescVisible] = useState(false);
  const [descripcionEditada, setDescripcionEditada] = useState("");
  const [guardandoDesc, setGuardandoDesc] = useState(false);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [])
  );

  async function cargar() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);
    if (!uid) return;
    const [mias, sigo] = await Promise.all([listarMisListas(uid), listarListasQueSigo(uid)]);
    const [miasEnriquecidas, sigoEnriquecidas] = await Promise.all([enriquecerListas(mias), enriquecerListas(sigo)]);
    setMisListas(miasEnriquecidas);
    setListasQueSigo(sigoEnriquecidas);
  }

  function abrirAcciones(lista: Lista) {
    setListaAccion(lista);
    setMenuVisible(true);
  }

  function abrirEditarDescripcion() {
    if (!listaAccion) return;
    setDescripcionEditada(listaAccion.description ?? "");
    setMenuVisible(false);
    setEditarDescVisible(true);
  }

  async function elegirVisibilidad(v: VisibilidadLista) {
    if (!listaAccion) return;
    try {
      await cambiarVisibilidadLista(listaAccion.id, v);
      cargar();
    } catch (e: any) {
      Alert.alert(t("No se pudo cambiar"), e.message);
    }
  }

  async function guardarDescripcion() {
    if (!listaAccion) return;
    setGuardandoDesc(true);
    try {
      await actualizarDescripcionLista(listaAccion.id, descripcionEditada.trim() || null);
      setEditarDescVisible(false);
      cargar();
    } catch (e: any) {
      Alert.alert(t("No se pudo guardar"), e.message);
    } finally {
      setGuardandoDesc(false);
    }
  }

  async function dejarDeSeguir(lista: Lista) {
    if (!userId) return;
    await dejarDeSeguirLista(userId, lista.id);
    cargar();
  }

  function abrirAccionesSigo(lista: Lista) {
    setListaAccionSigo(lista);
    setMenuSigoVisible(true);
  }

  async function toggleSilenciarSeguida() {
    if (!userId || !listaAccionSigo) return;
    await silenciarListaSeguida(userId, listaAccionSigo.id, !listaAccionSigo.silenciada);
    setMenuSigoVisible(false);
    cargar();
  }

  async function toggleSilenciarNuevosSeguidores() {
    if (!listaAccion) return;
    await silenciarNuevosSeguidoresLista(listaAccion.id, !listaAccion.mute_new_followers);
    setMenuVisible(false);
    cargar();
  }

  const listado = (subTab === "mias" ? misListas : listasQueSigo).filter((l) =>
    busqueda.trim() ? l.title.toLowerCase().includes(busqueda.trim().toLowerCase()) : true
  );

  return (
    <View style={styles.container}>
      <View style={styles.tabsRow}>
        <Pressable style={[styles.tabBtn, subTab === "mias" && styles.tabBtnActivo]} onPress={() => setSubTab("mias")}>
          <Text style={styles.tabTexto}>{t("Tus listas")}</Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, subTab === "sigo" && styles.tabBtnActivo]} onPress={() => setSubTab("sigo")}>
          <Text style={styles.tabTexto}>{t("Listas que sigues")}</Text>
        </Pressable>
        <Pressable style={styles.tabBtn} onPress={() => navigation.navigate("CrearLista")}>
          <Text style={styles.tabTexto}>{t("Crear")}</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.buscador}
        placeholder={t("Buscar lista...")}
        placeholderTextColor={theme.colors.textFaint}
        value={busqueda}
        onChangeText={setBusqueda}
      />

      <FlatList
        keyboardShouldPersistTaps="handled"
        data={listado}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={
          <Text style={styles.vacio}>
            {subTab === "mias" ? t("Todavía no creaste ninguna lista.") : t("Todavía no seguís ninguna lista de otra persona.")}
          </Text>
        }
        renderItem={({ item }) => (
          <ListPreviewCard
            lista={item}
            onPress={() => navigation.navigate("DetalleLista", { listId: item.id, listTitle: item.title, soloLectura: subTab === "sigo" })}
            subtitulo={
              subTab === "mias"
                ? [
                    t("{n} títulos").replace("{n}", String(item.cantidad)),
                    item.seguidores ? t("{n} seguidores").replace("{n}", String(item.seguidores)) : null,
                    t(ETIQUETAS_VISIBILIDAD[item.visibility]),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : [
                    t("{n} títulos").replace("{n}", String(item.cantidad)),
                    item.seguidores ? t("{n} seguidores").replace("{n}", String(item.seguidores)) : null,
                    item.autor_username ? `@${item.autor_username}${item.autor_display_name ? ` ${item.autor_display_name}` : ""}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
            }
            accionesDerecha={
              subTab === "mias" ? (
                <>
                  <Pressable
                    style={styles.recomendarBtnFila}
                    onPress={() => {
                      setListaARecomendar(item);
                      setPublishModalVisible(true);
                    }}
                    hitSlop={8}
                  >
                    <Ionicons name="paper-plane" size={16} color="#FFFFFF" />
                  </Pressable>
                  <Pressable onPress={() => abrirAcciones(item)} hitSlop={8}>
                    <Text style={styles.accionTexto}>⋯</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    style={styles.recomendarBtnFila}
                    onPress={() => {
                      setListaARecomendar(item);
                      setPublishModalVisible(true);
                    }}
                    hitSlop={8}
                  >
                    <Ionicons name="paper-plane" size={16} color="#FFFFFF" />
                  </Pressable>
                  <Pressable onPress={() => abrirAccionesSigo(item)} hitSlop={8}>
                    <Text style={styles.accionTexto}>⋯</Text>
                  </Pressable>
                </>
              )
            }
          />
        )}
      />

      <ActionSheetModal
        visible={menuVisible}
        onCerrar={() => setMenuVisible(false)}
        titulo={listaAccion?.title}
        opciones={[
          {
            label: listaAccion?.mute_new_followers ? t("Dejar de silenciar nuevos seguidores") : t("Silenciar (no notificar nuevos seguidores)"),
            icono: listaAccion?.mute_new_followers ? "notifications-off" : "notifications-off-outline",
            onPress: toggleSilenciarNuevosSeguidores,
          },
          { label: t("Editar descripción"), icono: "create-outline", onPress: abrirEditarDescripcion },
          { label: t("Mostrar a: Solo yo"), icono: "lock-closed-outline", onPress: () => elegirVisibilidad("private") },
          { label: t("Mostrar a: Usuarios que te siguen"), icono: "people-outline", onPress: () => elegirVisibilidad("followers") },
          { label: t("Mostrar a: Todos los usuarios"), icono: "earth-outline", onPress: () => elegirVisibilidad("public") },
          { label: t("Eliminar lista"), icono: "trash-outline", destructivo: true, onPress: () => setConfirmBorrarVisible(true) },
        ]}
      />

      <ActionSheetModal
        visible={menuSigoVisible}
        onCerrar={() => setMenuSigoVisible(false)}
        titulo={listaAccionSigo?.title}
        opciones={[
          {
            label: listaAccionSigo?.silenciada ? t("Dejar de silenciar") : t("Silenciar (no notificar cambios)"),
            icono: listaAccionSigo?.silenciada ? "notifications-off" : "notifications-off-outline",
            onPress: toggleSilenciarSeguida,
          },
          {
            label: t("Dejar de seguir"),
            icono: "close-circle-outline",
            onPress: () => {
              setMenuSigoVisible(false);
              if (listaAccionSigo) dejarDeSeguir(listaAccionSigo);
            },
          },
          {
            label: t("Reportar"),
            icono: "flag-outline",
            destructivo: true,
            onPress: () => {
              setMenuSigoVisible(false);
              setReportModalVisible(true);
            },
          },
        ]}
      />

      {listaAccionSigo && (
        <ReportModal
          visible={reportModalVisible}
          onCerrar={() => setReportModalVisible(false)}
          reporterId={userId}
          targetType="list"
          targetId={listaAccionSigo.id}
        />
      )}

      <ConfirmModal
        visible={confirmBorrarVisible}
        onCerrar={() => setConfirmBorrarVisible(false)}
        titulo={t("Eliminar lista")}
        mensaje={t('¿Seguro que querés eliminar "{nombre}"?').replace("{nombre}", listaAccion?.title ?? "")}
        botones={[
          { label: t("Cancelar"), onPress: () => {} },
          {
            label: t("Eliminar"),
            destacado: true,
            onPress: async () => {
              if (listaAccion) await borrarLista(listaAccion.id);
              cargar();
            },
          },
        ]}
      />

      {listaARecomendar && (
        <PublishActionModal
          visible={publishModalVisible}
          onCerrar={() => setPublishModalVisible(false)}
          navigation={navigation}
          recomendarParams={{ kind: "list", listId: listaARecomendar.id, nombre: listaARecomendar.title, posterPath: null }}
          publicarListaParams={subTab === "mias" ? { listId: listaARecomendar.id } : undefined}
        />
      )}

      <Modal visible={editarDescVisible} transparent animationType="fade" onRequestClose={() => setEditarDescVisible(false)}>
        <Pressable style={styles.editarDescFondo} onPress={() => setEditarDescVisible(false)}>
          <Pressable style={styles.editarDescHoja} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.editarDescTitulo}>{t("Editar descripción")}</Text>
            <TextInput
              style={styles.editarDescInput}
              value={descripcionEditada}
              onChangeText={setDescripcionEditada}
              placeholder={t("Contá de qué se trata esta lista...")}
              placeholderTextColor={theme.colors.textFaint}
              multiline
              maxLength={100}
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <AppButton title={t("Cancelar")} variant="muted" onPress={() => setEditarDescVisible(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton title={guardandoDesc ? t("Guardando...") : t("Guardar")} onPress={guardarDescripcion} disabled={guardandoDesc} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  tabsRow: { flexDirection: "row", padding: 12, gap: 8 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: "center", backgroundColor: "#000000", borderWidth: 1, borderColor: "transparent" },
  tabBtnActivo: { borderColor: theme.colors.primary },
  tabTexto: { fontSize: 13, fontWeight: "700", color: theme.colors.primaryLight },
  buscador: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    padding: 10,
  },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24 },
  card: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardDesc: { fontSize: 12, color: theme.colors.text, marginTop: 2 },
  cardSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  accionTexto: { fontSize: 20, color: theme.colors.textMuted, paddingHorizontal: 8 },
  recomendarBtnFila: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center", marginRight: 10 },
  borrar: { color: theme.colors.danger, fontSize: 12 },
  editarDescFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 24 },
  editarDescHoja: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 20 },
  editarDescTitulo: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  editarDescInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    padding: 12,
    minHeight: 70,
    textAlignVertical: "top",
  },
});
