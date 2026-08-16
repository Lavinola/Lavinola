import React, { useEffect, useState } from "react";
import { View, FlatList, TextInput, Pressable, StyleSheet, ActivityIndicator, Image } from "react-native";
import { Text } from "./Themed";
import EstadoVacio from "./EstadoVacio";
import ListPreviewCard from "./ListPreviewCard";
import ConfirmModal from "../components/ConfirmModal";
import { seleccion } from "../lib/haptics";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "../lib/alert";
import { supabase } from "../lib/supabase";
import { Lista, listarListasTendencia, buscarListasPorNombre, seguirLista, dejarDeSeguirLista } from "../lib/lists";
import { buscarTitulosTolerante, ResultadoTitulo } from "../lib/tituloSearch";
import { posterUrl } from "../lib/tmdb";
import { nombreOUsuario } from "./NombreUsuario";
import FiltroListasTituloModal, { FiltroQuienListas, CriterioOrdenListasTitulo } from "./FiltroListasTituloModal";
import UnderlineTabs from "./UnderlineTabs";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type ModoBusqueda = "tendencias" | "nombre" | "titulo";

export default function BuscarListasSection({ navigation }: any) {
  const { t } = useT();
  const [modo, setModo] = useState<ModoBusqueda>("tendencias");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <UnderlineTabs
        opciones={[
          { key: "tendencias", label: t("Tendencias") },
          { key: "nombre", label: t("Buscar por") + "\n" + t("nombre") },
          { key: "titulo", label: t("Buscar por") + "\n" + t("película/serie") },
        ]}
        valor={modo}
        onCambiar={setModo}
        multilinea
      />

      {modo === "tendencias" && <TendenciasListas navigation={navigation} userId={userId} />}
      {modo === "nombre" && <BuscarPorNombre navigation={navigation} userId={userId} />}
      {modo === "titulo" && <BuscarPorTitulo navigation={navigation} />}
    </View>
  );
}

function ListaConSeguir({ item, userId, navigation, onCambio }: { item: Lista; userId: string | null; navigation: any; onCambio: (l: Lista) => void }) {
  const { t } = useT();
  const [confirmVisible, setConfirmVisible] = useState(false);

  async function toggleSeguir() {
    if (!userId) return;
    if (item.siguiendo) {
      setConfirmVisible(true);
      return;
    }
    onCambio({ ...item, siguiendo: true, seguidores: (item.seguidores ?? 0) + 1 });
    try {
      seleccion();
      await seguirLista(userId, item.id);
    } catch (e: any) {
      onCambio({ ...item, siguiendo: false, seguidores: item.seguidores });
      Alert.alert(t("No se pudo seguir la lista"), e.message);
    }
  }

  async function confirmarDejarDeSeguir() {
    if (!userId) return;
    setConfirmVisible(false);
    onCambio({ ...item, siguiendo: false, seguidores: Math.max((item.seguidores ?? 1) - 1, 0) });
    try {
      await dejarDeSeguirLista(userId, item.id);
    } catch (e: any) {
      onCambio({ ...item, siguiendo: true, seguidores: item.seguidores });
      Alert.alert(t("No se pudo dejar de seguir"), e.message);
    }
  }

  return (
    <>
      <ListPreviewCard
        lista={item}
        onPress={() => navigation.push("DetalleLista", { listId: item.id, listTitle: item.title, soloLectura: item.user_id !== userId })}
        subtitulo={`${nombreOUsuario(item.autor_display_name, item.autor_username)} · ${item.cantidad} ${t("títulos")} · ${item.seguidores ?? 0} ${t("seguidores")}`}
        accionesDerecha={
          userId && item.user_id !== userId ? (
            <Pressable style={[styles.seguirBtn, item.siguiendo && styles.seguirBtnActivo]} onPress={toggleSeguir}>
              <Text style={[styles.seguirBtnTexto, item.siguiendo && styles.seguirBtnTextoActivo]}>{item.siguiendo ? t("Siguiendo") : t("Seguir")}</Text>
            </Pressable>
          ) : undefined
        }
      />
      <ConfirmModal
        visible={confirmVisible}
        onCerrar={() => setConfirmVisible(false)}
        titulo={t("Dejar de seguir")}
        mensaje={t('¿Seguro que querés dejar de seguir "{nombre}"?').replace("{nombre}", item.title)}
        botones={[
          { label: t("Cancelar"), onPress: () => {} },
          { label: t("Dejar de seguir"), destacado: true, onPress: confirmarDejarDeSeguir },
        ]}
      />
    </>
  );
}

function TendenciasListas({ navigation, userId }: { navigation: any; userId: string | null }) {
  const { t } = useT();
  const [listas, setListas] = useState<Lista[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listarListasTendencia(userId)
      .then(setListas)
      .catch((e) => console.error("Error al cargar tendencias de listas:", e))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 32 }} />;

  return (
    <FlatList
      data={listas}
      keyExtractor={(l) => l.id}
      contentContainerStyle={{ padding: 12 }}
      ListEmptyComponent={<EstadoVacio icono="trending-up-outline" titulo={t("Todavía no hay listas en tendencia.")} />}
      renderItem={({ item }) => (
        <ListaConSeguir
          item={item}
          userId={userId}
          navigation={navigation}
          onCambio={(l) => setListas((prev) => prev.map((x) => (x.id === l.id ? l : x)))}
        />
      )}
    />
  );
}

function BuscarPorNombre({ navigation, userId }: { navigation: any; userId: string | null }) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [listas, setListas] = useState<Lista[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroVisible, setFiltroVisible] = useState(false);
  const [filtro, setFiltro] = useState<FiltroQuienListas>("todos");
  const [orden, setOrden] = useState<CriterioOrdenListasTitulo>("popularidad");
  const [ordenAsc, setOrdenAsc] = useState(false);
  const [seguidosIds, setSeguidosIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (userId) supabase.from("follows").select("followee_id").eq("follower_id", userId).then(({ data }) => setSeguidosIds(new Set((data ?? []).map((f: any) => f.followee_id))));
  }, [userId]);

  useEffect(() => {
    if (!query.trim()) {
      setListas([]);
      return;
    }
    setLoading(true);
    const idTimeout = setTimeout(() => {
      buscarListasPorNombre(query, userId)
        .then(setListas)
        .catch((e) => console.error("Error al buscar listas por nombre:", e))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(idTimeout);
  }, [query, userId]);

  const filtradas = listas
    .filter((l) => (filtro === "seguidos" ? !!l.user_id && seguidosIds.has(l.user_id) : true))
    .sort((a, b) => {
      let cmp = 0;
      if (orden === "fecha") cmp = (a.created_at ?? "").localeCompare(b.created_at ?? "");
      else cmp = (a.seguidores ?? 0) - (b.seguidores ?? 0);
      return ordenAsc ? cmp : -cmp;
    });

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.buscadorRow}>
        <TextInput
          style={styles.buscadorInput}
          placeholder={t("Buscar lista por nombre...")}
          placeholderTextColor={theme.colors.textFaint}
          value={query}
          onChangeText={setQuery}
        />
        <Pressable style={styles.filtroBtn} onPress={() => setFiltroVisible(true)} hitSlop={8}>
          <Ionicons name="options-outline" size={20} color={theme.colors.text} />
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filtradas}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={
            query.trim() ? <EstadoVacio icono="search-outline" titulo={t("No encontramos listas con ese nombre.")} /> : null
          }
          renderItem={({ item }) => (
            <ListaConSeguir
              item={item}
              userId={userId}
              navigation={navigation}
              onCambio={(l) => setListas((prev) => prev.map((x) => (x.id === l.id ? l : x)))}
            />
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
        ocultarAlfabetico
      />
    </View>
  );
}

function BuscarPorTitulo({ navigation }: { navigation: any }) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ResultadoTitulo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResultados([]);
      return;
    }
    let vigente = true;
    setLoading(true);
    const idTimeout = setTimeout(() => {
      buscarTitulosTolerante(query, () => vigente)
        .then((r) => vigente && setResultados(r))
        .catch((e) => console.error("Error al buscar títulos:", e))
        .finally(() => vigente && setLoading(false));
    }, 350);
    return () => {
      vigente = false;
      clearTimeout(idTimeout);
    };
  }, [query]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.buscadorRow}>
        <TextInput
          style={[styles.buscadorInput, { flex: 1 }]}
          placeholder={t("Buscar película o serie...")}
          placeholderTextColor={theme.colors.textFaint}
          value={query}
          onChangeText={setQuery}
        />
      </View>
      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={resultados}
          keyExtractor={(r) => `${r.tipo}-${r.id}`}
          numColumns={3}
          contentContainerStyle={{ padding: 8 }}
          ListEmptyComponent={query.trim() ? <EstadoVacio icono="film-outline" titulo={t("No encontramos nada con ese nombre.")} /> : null}
          renderItem={({ item }) => (
            <Pressable
              style={styles.tituloCell}
              onPress={() => navigation.navigate("ListasConTitulo", { itemType: item.tipo, tmdbId: item.id, nombre: item.titulo })}
            >
              {item.poster_path ? (
                <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.tituloPoster} />
              ) : (
                <View style={[styles.tituloPoster, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              <Text numberOfLines={2} style={styles.tituloNombre}>
                {item.titulo}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  buscadorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginTop: 12 },
  buscadorInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
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
  seguirBtn: { borderWidth: 1, borderColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 6, paddingHorizontal: 14 },
  seguirBtnActivo: { backgroundColor: theme.colors.primary },
  seguirBtnTexto: { color: theme.colors.primaryLight, fontWeight: "700", fontSize: 12 },
  seguirBtnTextoActivo: { color: "#000000" },
  tituloCell: { flex: 1 / 3, padding: 4 },
  tituloPoster: { width: "100%", aspectRatio: 2 / 3, borderRadius: 6 },
  tituloNombre: { fontSize: 11, marginTop: 4, textAlign: "center" },
});
