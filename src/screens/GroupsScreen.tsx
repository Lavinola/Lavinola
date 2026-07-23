import React, { useCallback, useState } from "react";
import { View, FlatList, Image, Pressable, TextInput, StyleSheet } from "react-native";
import { Alert } from "../lib/alert";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import {
  Grupo,
  OrdenGrupos,
  listarGrupos,
  listarMisGrupos,
  unirseAGrupo,
  salirDeGrupo,
  solicitarUnirseAGrupo,
  tengoSolicitudGrupoPendiente,
  contarComentariosNuevosPorGrupo,
  listarSolicitudesDeMisGrupos,
  idsGruposDondeEstoyBaneado,
  silenciarGrupo,
  quitarSilencioGrupoLista,
  idsGruposSilenciados,
  contarMisGruposConNoLeidos,
} from "../lib/groups";
import { Text } from "../components/Themed";
import GroupFiltersModal, { FiltroVisibilidad, FiltroCreador } from "../components/GroupFiltersModal";
import ActionSheetModal from "../components/ActionSheetModal";
import ReportModal from "../components/ReportModal";
import ConfirmModal from "../components/ConfirmModal";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type SubTab = "todos" | "mios";

export default function GroupsScreen({ navigation }: any) {
  const { t } = useT();
  const [subTab, setSubTab] = useState<SubTab>("mios");
  const [filtroVisibilidad, setFiltroVisibilidad] = useState<FiltroVisibilidad>("todos");
  const [filtroCreador, setFiltroCreador] = useState<FiltroCreador>("todos");
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [orden, setOrden] = useState<OrdenGrupos>("ultimo_mensaje");
  const [ascendente, setAscendente] = useState(false);
  const [filtrosModalVisible, setFiltrosModalVisible] = useState(false);
  const [solicitudesEnviadas, setSolicitudesEnviadas] = useState<Set<string>>(new Set());
  const [noLeidosPorGrupo, setNoLeidosPorGrupo] = useState<Record<string, number>>({});
  const [solicitudesAdminCount, setSolicitudesAdminCount] = useState(0);
  const [misGruposNoLeidosCount, setMisGruposNoLeidosCount] = useState(0);
  const [gruposBaneado, setGruposBaneado] = useState<Set<string>>(new Set());
  const [gruposSilenciados, setGruposSilenciados] = useState<Set<string>>(new Set());
  const [busquedaMisGrupos, setBusquedaMisGrupos] = useState("");
  const [busquedaTodos, setBusquedaTodos] = useState("");
  const [menuGrupoVisible, setMenuGrupoVisible] = useState(false);
  const [grupoMenuAccion, setGrupoMenuAccion] = useState<Grupo | null>(null);
  const [avisoPrivadoVisible, setAvisoPrivadoVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [menuSilenciarVisible, setMenuSilenciarVisible] = useState(false);
  const [confirmSalirVisible, setConfirmSalirVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [subTab, orden, ascendente])
  );

  async function cargar() {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    setUserId(uid);
    const lista = subTab === "todos" ? await listarGrupos(uid, orden, ascendente) : uid ? await listarMisGrupos(uid, orden, ascendente) : [];
    setGrupos(lista);

    if (uid) {
      const pendientes = await Promise.all(
        lista.filter((g) => !g.soyMiembro && g.visibility === "private").map(async (g) => ((await tengoSolicitudGrupoPendiente(g.id, uid)) ? g.id : null))
      );
      setSolicitudesEnviadas(new Set(pendientes.filter(Boolean) as string[]));

      if (subTab === "mios") {
        setNoLeidosPorGrupo(await contarComentariosNuevosPorGrupo(uid, lista.map((g) => g.id)));
      }

      const solicitudesAdmin = await listarSolicitudesDeMisGrupos(uid);
      setSolicitudesAdminCount(solicitudesAdmin.length);
      setGruposBaneado(await idsGruposDondeEstoyBaneado(uid));
      setGruposSilenciados(await idsGruposSilenciados(uid));
      setMisGruposNoLeidosCount(await contarMisGruposConNoLeidos(uid));
    }
  }

  async function toggleMembresia(grupo: Grupo) {
    if (!userId || gruposBaneado.has(grupo.id)) return;
    try {
      if (grupo.soyMiembro) {
        await salirDeGrupo(grupo.id, userId);
      } else if (grupo.visibility === "private") {
        if (solicitudesEnviadas.has(grupo.id)) return;
        await solicitarUnirseAGrupo(grupo.id, userId);
      } else {
        await unirseAGrupo(grupo.id, userId);
      }
      cargar();
    } catch (e: any) {
      Alert.alert("No se pudo actualizar", e.message);
    }
  }

  function abrirMenuGrupo(grupo: Grupo) {
    setGrupoMenuAccion(grupo);
    setMenuGrupoVisible(true);
  }

  function confirmarSalirDelGrupo() {
    setMenuGrupoVisible(false);
    setConfirmSalirVisible(true);
  }

  async function salirDelGrupoDesdeMenu() {
    if (!userId || !grupoMenuAccion) return;
    try {
      await salirDeGrupo(grupoMenuAccion.id, userId);
      cargar();
    } catch (e: any) {
      Alert.alert("No se pudo salir del grupo", e.message);
    }
  }

  function denunciarGrupo() {
    setMenuGrupoVisible(false);
    setReportVisible(true);
  }

  function abrirMenuSilenciar() {
    setMenuGrupoVisible(false);
    setMenuSilenciarVisible(true);
  }

  async function silenciar(duracion: "1dia" | "1semana" | "siempre") {
    if (!userId || !grupoMenuAccion) return;
    setMenuSilenciarVisible(false);
    try {
      await silenciarGrupo(userId, grupoMenuAccion.id, duracion);
      cargar();
    } catch (e: any) {
      Alert.alert("No se pudo silenciar", e.message);
    }
  }

  async function dejarDeSilenciar() {
    if (!userId || !grupoMenuAccion) return;
    setMenuGrupoVisible(false);
    try {
      await quitarSilencioGrupoLista(userId, grupoMenuAccion.id);
      cargar();
    } catch (e: any) {
      Alert.alert("No se pudo actualizar", e.message);
    }
  }

  function abrirGrupo(grupo: Grupo) {
    if (grupo.visibility === "private" && !grupo.soyMiembro) {
      setAvisoPrivadoVisible(true);
      return;
    }
    navigation.navigate("DetalleGrupo", { groupId: grupo.id, groupName: grupo.name });
  }

  const gruposFiltrados = grupos.filter((g) => {
    if (filtroVisibilidad !== "todos" && g.visibility !== (filtroVisibilidad === "publicos" ? "public" : "private")) return false;
    if (subTab === "mios") {
      if (filtroCreador === "mios" && g.creator_id !== userId) return false;
      if (filtroCreador === "otros" && g.creator_id === userId) return false;
      if (busquedaMisGrupos.trim() && !g.name.toLowerCase().includes(busquedaMisGrupos.trim().toLowerCase())) return false;
    } else {
      if (busquedaTodos.trim() && !g.name.toLowerCase().includes(busquedaTodos.trim().toLowerCase())) return false;
    }
    return true;
  });

  return (
    <View style={styles.container}>
      <View style={styles.botonesRow}>
        <Pressable
          style={[styles.botonTab, subTab === "mios" && styles.botonTabActivo]}
          onPress={() => {
            setSubTab("mios");
            setOrden("ultimo_mensaje");
            setAscendente(false);
          }}
        >
          <Text style={styles.botonTabTexto}>{t("Mis grupos")}</Text>
          {misGruposNoLeidosCount > 0 && (
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeTexto}>{misGruposNoLeidosCount > 99 ? "99+" : misGruposNoLeidosCount}</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          style={[styles.botonTab, subTab === "todos" && styles.botonTabActivo]}
          onPress={() => {
            setSubTab("todos");
            setOrden("popularidad");
            setAscendente(false);
          }}
        >
          <Text style={styles.botonTabTexto}>{t("Grupos")}</Text>
        </Pressable>
        <Pressable style={styles.botonTab} onPress={() => navigation.navigate("CrearGrupo")}>
          <Text style={styles.botonTabTexto}>{t("Crear grupo")}</Text>
        </Pressable>
        <Pressable style={styles.botonTab} onPress={() => navigation.navigate("AdminGrupos")}>
          <Text style={styles.botonTabTexto}>{t("Admin")}</Text>
          {solicitudesAdminCount > 0 && (
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeTexto}>{solicitudesAdminCount > 99 ? "99+" : solicitudesAdminCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <View style={styles.filtroRow}>
        {subTab === "mios" ? (
          <View style={styles.buscadorConLupa}>
            <Ionicons name="search" size={16} color={theme.colors.primaryLight} />
            <TextInput
              style={styles.buscadorInput}
              placeholder={t("Buscar en mis grupos...")}
              placeholderTextColor={theme.colors.textFaint}
              value={busquedaMisGrupos}
              onChangeText={setBusquedaMisGrupos}
            />
          </View>
        ) : (
          <View style={styles.buscadorConLupa}>
            <Ionicons name="search" size={16} color={theme.colors.primaryLight} />
            <TextInput
              style={styles.buscadorInput}
              placeholder={t("Buscar en grupos...")}
              placeholderTextColor={theme.colors.textFaint}
              value={busquedaTodos}
              onChangeText={setBusquedaTodos}
            />
            <Ionicons name="globe-outline" size={16} color={theme.colors.textMuted} />
          </View>
        )}
        <Pressable style={styles.filtrosBtn} onPress={() => setFiltrosModalVisible(true)}>
          <Ionicons name="options-outline" size={15} color="#000000" />
          <Text style={styles.filtrosBtnTexto}>{t("Filtros")}</Text>
        </Pressable>
      </View>

      <FlatList
        keyboardShouldPersistTaps="handled"
        data={gruposFiltrados}
        keyExtractor={(g) => g.id}
        ListEmptyComponent={
          <Text style={styles.vacio}>{subTab === "todos" ? t("Todavía no hay grupos. ¡Creá el primero!") : t("Todavía no te uniste a ningún grupo.")}</Text>
        }
        renderItem={({ item }) => {
          const esPrivadoSinAcceso = item.visibility === "private" && !item.soyMiembro;
          const solicitudEnviada = solicitudesEnviadas.has(item.id);
          const noLeidos = noLeidosPorGrupo[item.id] ?? 0;
          return (
            <Pressable style={styles.card} onPress={() => abrirGrupo(item)}>
              <View>
                {item.photo_url ? (
                  <Image source={{ uri: item.photo_url }} style={styles.foto} />
                ) : (
                  <View style={[styles.foto, styles.fotoPlaceholder]} />
                )}
                {item.visibility === "private" && (
                  <View style={styles.candadoBadge}>
                    <Ionicons name="lock-closed" size={11} color="#000000" />
                  </View>
                )}
                {subTab === "mios" && noLeidos > 0 && (
                  <View style={styles.noLeidosBadge}>
                    <Text style={styles.noLeidosTexto}>{noLeidos > 99 ? "99+" : noLeidos}</Text>
                  </View>
                )}
                {gruposSilenciados.has(item.id) && (
                  <View style={styles.silenciadoBadge}>
                    <Ionicons name="volume-mute" size={10} color={theme.colors.textMuted} />
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nombre}>{item.name}</Text>
                {!esPrivadoSinAcceso && <Text style={styles.miembros}>{item.miembros} {t("miembros")}</Text>}
              </View>
              {item.soyMiembro ? (
                <Pressable style={styles.menuGrupoBtn} onPress={() => abrirMenuGrupo(item)} hitSlop={10}>
                  <Text style={styles.menuGrupoBtnTexto}>⋯</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.joinBtn} onPress={() => toggleMembresia(item)} disabled={solicitudEnviada || gruposBaneado.has(item.id)}>
                  <Text style={styles.joinBtnText}>
                    {gruposBaneado.has(item.id) ? t("Bloqueado") : esPrivadoSinAcceso ? (solicitudEnviada ? t("Solicitud enviada") : t("Enviar solicitud")) : t("Unirme")}
                  </Text>
                </Pressable>
              )}
            </Pressable>
          );
        }}
      />

      <GroupFiltersModal
        visible={filtrosModalVisible}
        onCerrar={() => setFiltrosModalVisible(false)}
        orden={orden}
        ascendente={ascendente}
        onCambiarOrden={(o, a) => {
          setOrden(o);
          setAscendente(a);
        }}
        visibilidad={filtroVisibilidad}
        onCambiarVisibilidad={setFiltroVisibilidad}
        creador={filtroCreador}
        onCambiarCreador={setFiltroCreador}
        mostrarFiltroCreador={subTab === "mios"}
        mostrarUltimoMensaje={subTab === "mios"}
      />

      <ActionSheetModal
        visible={menuGrupoVisible}
        onCerrar={() => setMenuGrupoVisible(false)}
        titulo={grupoMenuAccion?.name}
        opciones={[
          {
            label: grupoMenuAccion && gruposSilenciados.has(grupoMenuAccion.id) ? t("Dejar de silenciar") : t("Silenciar grupo"),
            icono: "volume-mute-outline",
            onPress: grupoMenuAccion && gruposSilenciados.has(grupoMenuAccion.id) ? dejarDeSilenciar : abrirMenuSilenciar,
          },
          { label: t("Salir del grupo"), icono: "exit-outline", destructivo: true, onPress: confirmarSalirDelGrupo },
          { label: t("Denunciar"), icono: "flag-outline", destructivo: true, onPress: denunciarGrupo },
        ]}
      />

      <ActionSheetModal
        visible={menuSilenciarVisible}
        onCerrar={() => setMenuSilenciarVisible(false)}
        titulo={t("¿Por cuánto tiempo?")}
        opciones={[
          { label: t("1 día"), icono: "time-outline", onPress: () => silenciar("1dia") },
          { label: t("1 semana"), icono: "time-outline", onPress: () => silenciar("1semana") },
          { label: t("Siempre"), icono: "infinite-outline", onPress: () => silenciar("siempre"), destructivo: true },
        ]}
      />

      <ConfirmModal
        visible={confirmSalirVisible}
        onCerrar={() => setConfirmSalirVisible(false)}
        titulo={t("Salir del grupo")}
        mensaje={`¿Seguro que querés salir de "${grupoMenuAccion?.name}"?`}
        botones={[
          { label: t("Cancelar"), onPress: () => {} },
          { label: t("Salir"), destacado: true, onPress: salirDelGrupoDesdeMenu },
        ]}
      />

      <ConfirmModal
        visible={avisoPrivadoVisible}
        onCerrar={() => setAvisoPrivadoVisible(false)}
        titulo={t("Grupo privado")}
        mensaje={t("Tenés que ser miembro para poder verlo. Mandá una solicitud primero.")}
        botones={[{ label: t("Entendido"), onPress: () => {}, destacado: true }]}
      />
      <ReportModal
        visible={reportVisible}
        onCerrar={() => setReportVisible(false)}
        reporterId={userId}
        targetType="group"
        targetId={grupoMenuAccion?.id ?? ""}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  botonesRow: { flexDirection: "row", flexWrap: "wrap", padding: 8, gap: 8 },
  botonTab: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: theme.radius.pill,
    paddingVertical: 10,
    alignItems: "center",
    position: "relative",
    backgroundColor: "#000000",
  },
  adminBadge: {
    position: "absolute",
    top: -6,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#E8E8E8",
    borderWidth: 1,
    borderColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  adminBadgeTexto: { fontSize: 9, fontWeight: "700", color: theme.colors.background },
  botonTabActivo: { borderColor: theme.colors.primary },
  botonTabTexto: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },
  filtroRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
  buscadorConLupa: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  buscadorInput: { flex: 1, color: theme.colors.text, fontSize: 13, padding: 0 },
  filtrosBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
  filtrosBtnTexto: { color: "#000000", fontWeight: "700", fontSize: 12 },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 32 },
  card: { flexDirection: "row", alignItems: "center", padding: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  foto: { width: 44, height: 44, borderRadius: 8, marginRight: 12, backgroundColor: theme.colors.surfaceAlt },
  fotoPlaceholder: {},
  candadoBadge: { position: "absolute", bottom: -2, right: 10, width: 18, height: 18, borderRadius: 9, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.background },
  noLeidosBadge: { position: "absolute", top: -4, left: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: "#E8E8E8", alignItems: "center", justifyContent: "center", paddingHorizontal: 2, borderWidth: 1, borderColor: theme.colors.background },
  noLeidosTexto: { fontSize: 9, fontWeight: "700", color: theme.colors.background },
  silenciadoBadge: { position: "absolute", top: -4, right: 10, width: 16, height: 16, borderRadius: 8, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.background },
  nombre: { fontSize: 15, fontWeight: "600" },
  miembros: { fontSize: 12, color: theme.colors.textMuted },
  joinBtn: { backgroundColor: theme.colors.primary, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  joinBtnText: { color: "#000000", fontSize: 12, fontWeight: "700" },
  menuGrupoBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  menuGrupoBtnTexto: { fontSize: 20, color: theme.colors.textMuted },
});
