import React, { useEffect, useState } from "react";
import { View, FlatList, Image, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import EstadoVacio from "../components/EstadoVacio";
import ConfirmModal from "../components/ConfirmModal";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "../lib/alert";
import { supabase } from "../lib/supabase";
import { listarListasQueContienenTitulo, seguirLista, dejarDeSeguirLista, Lista } from "../lib/lists";
import { nombreOUsuario } from "../components/NombreUsuario";
import FiltroListasTituloModal, { FiltroQuienListas, CriterioOrdenListasTitulo } from "../components/FiltroListasTituloModal";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function ListasConTituloScreen({ route, navigation }: any) {
  const { itemType, tmdbId } = route.params;
  const { t } = useT();
  const [userId, setUserId] = useState<string | null>(null);
  const [seguidosIds, setSeguidosIds] = useState<Set<string>>(new Set());
  const [listas, setListas] = useState<Lista[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroVisible, setFiltroVisible] = useState(false);
  const [filtro, setFiltro] = useState<FiltroQuienListas>("todos");
  const [orden, setOrden] = useState<CriterioOrdenListasTitulo>("popularidad");
  const [ordenAsc, setOrdenAsc] = useState(false);
  const [listaADejarDeSeguir, setListaADejarDeSeguir] = useState<Lista | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);
    try {
      const [datos, siguiendo] = await Promise.all([
        listarListasQueContienenTitulo(itemType, tmdbId, uid),
        uid ? supabase.from("follows").select("followee_id").eq("follower_id", uid) : Promise.resolve({ data: [] as any[] }),
      ]);
      setListas(datos);
      setSeguidosIds(new Set((siguiendo.data ?? []).map((f: any) => f.followee_id)));
    } catch (e: any) {
      console.error("Error al cargar listas del título:", e);
    } finally {
      setLoading(false);
    }
  }

  async function toggleSeguir(lista: Lista) {
    if (!userId) return;
    if (lista.siguiendo) {
      setListaADejarDeSeguir(lista);
      return;
    }
    setListas((prev) => prev.map((l) => (l.id === lista.id ? { ...l, siguiendo: true, seguidores: (l.seguidores ?? 0) + 1 } : l)));
    try {
      await seguirLista(userId, lista.id);
    } catch (e: any) {
      setListas((prev) => prev.map((l) => (l.id === lista.id ? { ...l, siguiendo: false, seguidores: (l.seguidores ?? 1) - 1 } : l)));
      Alert.alert(t("No se pudo seguir la lista"), e.message);
    }
  }

  async function confirmarDejarDeSeguir() {
    if (!userId || !listaADejarDeSeguir) return;
    const lista = listaADejarDeSeguir;
    setListaADejarDeSeguir(null);
    setListas((prev) => prev.map((l) => (l.id === lista.id ? { ...l, siguiendo: false, seguidores: Math.max((l.seguidores ?? 1) - 1, 0) } : l)));
    try {
      await dejarDeSeguirLista(userId, lista.id);
    } catch (e: any) {
      setListas((prev) => prev.map((l) => (l.id === lista.id ? { ...l, siguiendo: true, seguidores: (l.seguidores ?? 0) + 1 } : l)));
      Alert.alert(t("No se pudo dejar de seguir"), e.message);
    }
  }

  const filtradas = listas
    .filter((l) => (busqueda.trim() ? l.title.toLowerCase().includes(busqueda.trim().toLowerCase()) : true))
    .filter((l) => (filtro === "seguidos" ? !!l.user_id && seguidosIds.has(l.user_id) : true))
    .sort((a, b) => {
      let cmp = 0;
      if (orden === "alfabetico") cmp = a.title.localeCompare(b.title);
      else if (orden === "fecha") cmp = (a.created_at ?? "").localeCompare(b.created_at ?? "");
      else cmp = (a.seguidores ?? 0) - (b.seguidores ?? 0);
      return ordenAsc ? cmp : -cmp;
    });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.buscadorRow}>
        <View style={styles.buscadorConLupa}>
          <Ionicons name="search" size={16} color={theme.colors.primaryLight} />
          <TextInput
            style={styles.buscadorInput}
            placeholder={t("Buscar lista...")}
            placeholderTextColor={theme.colors.textFaint}
            value={busqueda}
            onChangeText={setBusqueda}
          />
        </View>
        <Pressable style={styles.filtroBtn} onPress={() => setFiltroVisible(true)} hitSlop={8}>
          <Ionicons name="options-outline" size={20} color={theme.colors.text} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={filtradas}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={<EstadoVacio icono="albums-outline" titulo={t("Ninguna lista incluye este título todavía.")} />}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate("DetalleLista", { listId: item.id, listTitle: item.title, soloLectura: item.user_id !== userId })}
            >
              {item.portadas && item.portadas[0] ? (
                <Image source={{ uri: `https://image.tmdb.org/t/p/w185${item.portadas[0]}` }} style={styles.portada} />
              ) : (
                <View style={[styles.portada, styles.portadaVacia]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.tituloLista} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.autorLista} numberOfLines={1}>
                  {nombreOUsuario(item.autor_display_name, item.autor_username)} · {item.seguidores ?? 0} {t("seguidores")}
                </Text>
              </View>
              {userId && item.user_id !== userId && (
                <Pressable style={[styles.seguirBtn, item.siguiendo && styles.seguirBtnActivo]} onPress={() => toggleSeguir(item)}>
                  <Text style={[styles.seguirBtnTexto, item.siguiendo && styles.seguirBtnTextoActivo]}>
                    {item.siguiendo ? t("Siguiendo") : t("Seguir")}
                  </Text>
                </Pressable>
              )}
            </Pressable>
          )}
        />
      )}

      <FiltroListasTituloModal
        visible={filtroVisible}
        onCerrar={() => setFiltroVisible(false)}
        filtro={filtro}
        onCambiarFiltro={setFiltro}
        orden={orden}
        ascendente={ordenAsc}
        onCambiarOrden={(o, asc) => {
          setOrden(o);
          setOrdenAsc(asc);
        }}
      />

      <ConfirmModal
        visible={!!listaADejarDeSeguir}
        onCerrar={() => setListaADejarDeSeguir(null)}
        titulo={t("Dejar de seguir")}
        mensaje={t('¿Seguro que querés dejar de seguir "{nombre}"?').replace("{nombre}", listaADejarDeSeguir?.title ?? "")}
        botones={[
          { label: t("Cancelar"), onPress: () => {} },
          { label: t("Dejar de seguir"), destacado: true, onPress: confirmarDejarDeSeguir },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  buscadorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginTop: 12 },
  buscadorConLupa: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
  },
  buscadorInput: { flex: 1, color: theme.colors.text, paddingVertical: 10 },
  filtroBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  card: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10 },
  portada: { width: 44, height: 66, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt },
  portadaVacia: {},
  tituloLista: { fontSize: 15, fontWeight: "700" },
  autorLista: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  seguirBtn: { borderWidth: 1, borderColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 6, paddingHorizontal: 14 },
  seguirBtnActivo: { backgroundColor: theme.colors.primary },
  seguirBtnTexto: { color: theme.colors.primaryLight, fontWeight: "700", fontSize: 12 },
  seguirBtnTextoActivo: { color: "#000000" },
});
