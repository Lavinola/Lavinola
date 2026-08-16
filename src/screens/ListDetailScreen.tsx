import React, { useCallback, useRef, useState } from "react";
import { View, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text, AppButton } from "../components/Themed";
import EstadoVacio from "../components/EstadoVacio";
import ConfirmModal from "../components/ConfirmModal";
import { seleccion } from "../lib/haptics";
import { Alert } from "../lib/alert";
import { seguirLista, dejarDeSeguirLista } from "../lib/lists";
import { Ionicons } from "@expo/vector-icons";
import PublishActionModal from "../components/PublishActionModal";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { posterUrl } from "../lib/tmdb";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface ItemLista {
  item_type: "series" | "movie";
  tmdb_id: number;
  nombre: string;
  poster_path: string | null;
  added_at: string;
  anio: string | null;
  runtime_minutes: number | null; // solo películas
  total_seasons: number | null; // solo series
}

type OrdenLista = "reciente" | "alfabetico";

export default function ListDetailScreen({ route, navigation }: any) {
  const { t } = useT();
  const { listId, listTitle, soloLectura } = route.params;
  const [descripcion, setDescripcion] = useState<string | null>(null);
  const [items, setItems] = useState<ItemLista[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishModalVisible, setPublishModalVisible] = useState(false);
  const [modoVista, setModoVista] = useState<"grilla" | "lista">("grilla");
  const [orden, setOrden] = useState<OrdenLista>("reciente");
  const [userId, setUserId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [siguiendo, setSiguiendo] = useState(false);
  const [confirmDejarDeSeguirVisible, setConfirmDejarDeSeguirVisible] = useState(false);
  const yaCargoRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      cargar(yaCargoRef.current); // silencioso a partir de la segunda vez, para no perder el scroll
      yaCargoRef.current = true;
    }, [])
  );

  async function cargar(silencioso = false) {
    if (!silencioso) setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);
    const [{ data: listaData }, { data }] = await Promise.all([
      supabase.from("lists").select("description, user_id").eq("id", listId).maybeSingle(),
      supabase.from("list_items").select("item_type, tmdb_id, added_at").eq("list_id", listId),
    ]);
    setDescripcion(listaData?.description ?? null);
    const ownerId = listaData?.user_id ?? null;
    setOwnerId(ownerId);
    if (uid && ownerId && uid !== ownerId) {
      const { data: follow } = await supabase.from("list_follows").select("list_id").eq("user_id", uid).eq("list_id", listId).maybeSingle();
      setSiguiendo(!!follow);
    }

    // Antes esto traía cada título UNO POR UNO (una consulta aparte por
    // cada fila) — con listas grandes, eso se sentía lento. Ahora se trae
    // todo en un puñado de consultas en tanda.
    const filas = data ?? [];
    const idsSeries = [...new Set(filas.filter((f) => f.item_type === "series").map((f) => f.tmdb_id))];
    const idsMovies = [...new Set(filas.filter((f) => f.item_type === "movie").map((f) => f.tmdb_id))];
    const [seriesCache, moviesCache, customSeriesPosters, customMoviePosters] = await Promise.all([
      idsSeries.length > 0
        ? supabase.from("series_cache").select("tmdb_id, name, poster_path, first_air_date, total_seasons").in("tmdb_id", idsSeries)
        : Promise.resolve({ data: [] }),
      idsMovies.length > 0
        ? supabase.from("movies_cache").select("tmdb_id, title, poster_path, release_date, runtime_minutes").in("tmdb_id", idsMovies)
        : Promise.resolve({ data: [] }),
      // El póster que se ve en la lista tiene que ser el mismo que eligió
      // el dueño de la lista en la ficha del título (si es que eligió uno
      // propio) — antes esto no se miraba acá, así que cambiarlo desde la
      // ficha no se reflejaba nunca en las listas.
      ownerId && idsSeries.length > 0
        ? supabase.from("user_series").select("series_tmdb_id, custom_poster_path").eq("user_id", ownerId).in("series_tmdb_id", idsSeries)
        : Promise.resolve({ data: [] }),
      ownerId && idsMovies.length > 0
        ? supabase.from("user_movies").select("movie_tmdb_id, custom_poster_path").eq("user_id", ownerId).in("movie_tmdb_id", idsMovies)
        : Promise.resolve({ data: [] }),
    ]);
    const seriesMap = new Map((seriesCache.data ?? []).map((r: any) => [r.tmdb_id, r]));
    const moviesMap = new Map((moviesCache.data ?? []).map((r: any) => [r.tmdb_id, r]));
    const customSeriesMap = new Map((customSeriesPosters.data ?? []).map((r: any) => [r.series_tmdb_id, r.custom_poster_path]));
    const customMovieMap = new Map((customMoviePosters.data ?? []).map((r: any) => [r.movie_tmdb_id, r.custom_poster_path]));

    const resultado: ItemLista[] = filas.map((fila) => {
      if (fila.item_type === "series") {
        const cache = seriesMap.get(fila.tmdb_id);
        return {
          item_type: "series" as const,
          tmdb_id: fila.tmdb_id,
          nombre: cache?.name ?? "—",
          poster_path: customSeriesMap.get(fila.tmdb_id) ?? cache?.poster_path ?? null,
          added_at: fila.added_at,
          anio: cache?.first_air_date ? cache.first_air_date.slice(0, 4) : null,
          runtime_minutes: null,
          total_seasons: cache?.total_seasons ?? null,
        };
      } else {
        const cache = moviesMap.get(fila.tmdb_id);
        return {
          item_type: "movie" as const,
          tmdb_id: fila.tmdb_id,
          nombre: cache?.title ?? "—",
          poster_path: customMovieMap.get(fila.tmdb_id) ?? cache?.poster_path ?? null,
          added_at: fila.added_at,
          anio: cache?.release_date ? cache.release_date.slice(0, 4) : null,
          runtime_minutes: cache?.runtime_minutes ?? null,
          total_seasons: null,
        };
      }
    });
    setItems(ordenarItems(resultado, orden));
    if (!silencioso) setLoading(false);
  }

  function ordenarItems(lista: ItemLista[], criterio: OrdenLista): ItemLista[] {
    const copia = [...lista];
    if (criterio === "alfabetico") copia.sort((a, b) => a.nombre.localeCompare(b.nombre));
    else copia.sort((a, b) => b.added_at.localeCompare(a.added_at));
    return copia;
  }

  function cambiarOrden() {
    const nuevo = orden === "reciente" ? "alfabetico" : "reciente";
    setOrden(nuevo);
    setItems((prev) => ordenarItems(prev, nuevo));
  }

  async function toggleSeguirLista() {
    if (!userId) return;
    if (siguiendo) {
      setConfirmDejarDeSeguirVisible(true);
      return;
    }
    setSiguiendo(true);
    try {
      seleccion();
      await seguirLista(userId, listId);
    } catch (e: any) {
      setSiguiendo(false);
      Alert.alert(t("No se pudo seguir la lista"), e.message);
    }
  }

  async function confirmarDejarDeSeguir() {
    if (!userId) return;
    setConfirmDejarDeSeguirVisible(false);
    setSiguiendo(false);
    try {
      await dejarDeSeguirLista(userId, listId);
    } catch (e: any) {
      setSiguiendo(true);
      Alert.alert(t("No se pudo dejar de seguir"), e.message);
    }
  }

  const esMiaLaLista = !!userId && !!ownerId && userId === ownerId;

  const botonesGrupo = (
    <View style={styles.columnaBotonesChicos}>
      <View style={styles.filaBotonesChicos}>
        <Pressable style={styles.botonChico} onPress={() => setModoVista(modoVista === "grilla" ? "lista" : "grilla")} hitSlop={6}>
          <Ionicons name={modoVista === "grilla" ? "list" : "grid"} size={15} color="#FFFFFF" />
        </Pressable>
        <Pressable style={styles.botonChico} onPress={() => setPublishModalVisible(true)} hitSlop={6}>
          <Ionicons name="paper-plane" size={15} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={styles.filaBotonesChicos}>
        <Pressable style={styles.botonChico} onPress={cambiarOrden} hitSlop={6}>
          {orden === "reciente" ? (
            <Text style={styles.ordenBotonTexto}>Az</Text>
          ) : (
            <Ionicons name="time-outline" size={15} color="#FFFFFF" />
          )}
        </Pressable>
        {!esMiaLaLista && (
          <Pressable style={[styles.botonChicoTilde, siguiendo && styles.botonChico]} onPress={toggleSeguirLista} hitSlop={6}>
            <Ionicons name={siguiendo ? "checkmark-circle" : "checkmark-circle-outline"} size={22} color={siguiendo ? "#000000" : theme.colors.primaryLight} />
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {soloLectura ? (
        <View style={styles.botonesRow}>
          <Text style={styles.descripcionLectura} numberOfLines={3}>
            {descripcion}
          </Text>
          {botonesGrupo}
        </View>
      ) : (
        <View>
          {descripcion ? (
            <Text style={styles.descripcionPropia} numberOfLines={3}>
              {descripcion}
            </Text>
          ) : null}
          <View style={styles.botonesRow}>
            <View style={{ flex: 1, marginRight: 6 }}>
              <AppButton title={t("Agregar/quitar series")} variant="outline" onPress={() => navigation.navigate("ElegirParaLista", { listId, tipo: "series" })} />
            </View>
            <View style={{ flex: 1, marginRight: 6 }}>
              <AppButton title={t("Agregar/quitar películas")} variant="outline" onPress={() => navigation.navigate("ElegirParaLista", { listId, tipo: "movie" })} />
            </View>
            {botonesGrupo}
          </View>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : modoVista === "grilla" ? (
        <FlatList
          key="grilla"
          data={items}
          keyExtractor={(i) => `${i.item_type}-${i.tmdb_id}`}
          numColumns={3}
          contentContainerStyle={{ padding: 8 }}
          ListEmptyComponent={<EstadoVacio icono="albums-outline" titulo={t("Esta lista todavía no tiene nada. Usá los botones de arriba para agregar.")} />}
          renderItem={({ item }) => (
            <Pressable
              style={styles.item}
              onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: item.item_type })}
            >
              {item.poster_path ? (
                <Image source={{ uri: posterUrl(item.poster_path, "w342")! }} style={styles.poster} />
              ) : (
                <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          key="lista"
          data={items}
          keyExtractor={(i) => `${i.item_type}-${i.tmdb_id}`}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={<EstadoVacio icono="albums-outline" titulo={t("Esta lista todavía no tiene nada. Usá los botones de arriba para agregar.")} />}
          renderItem={({ item }) => (
            <Pressable
              style={styles.filaItem}
              onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: item.item_type })}
            >
              {item.poster_path ? (
                <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.filaPoster} />
              ) : (
                <View style={[styles.filaPoster, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.filaNombre} numberOfLines={2}>
                  {item.nombre}
                </Text>
                <Text style={styles.filaSub}>
                  {item.item_type === "series"
                    ? [
                        item.total_seasons ? `${item.total_seasons} ${item.total_seasons === 1 ? t("temporada") : t("temporadas")}` : null,
                        item.anio,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : [item.anio, item.runtime_minutes ? `${Math.floor(item.runtime_minutes / 60)} h ${item.runtime_minutes % 60} min` : null]
                        .filter(Boolean)
                        .join(" · ")}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
      <PublishActionModal
        visible={publishModalVisible}
        onCerrar={() => setPublishModalVisible(false)}
        navigation={navigation}
        recomendarParams={{ kind: "list", listId, nombre: listTitle, posterPath: items[0]?.poster_path ?? null }}
        publicarListaParams={!soloLectura ? { listId } : undefined}
      />
      <ConfirmModal
        visible={confirmDejarDeSeguirVisible}
        onCerrar={() => setConfirmDejarDeSeguirVisible(false)}
        titulo={t("Dejar de seguir")}
        mensaje={t('¿Seguro que querés dejar de seguir "{nombre}"?').replace("{nombre}", listTitle ?? "")}
        botones={[
          { label: t("Cancelar"), onPress: () => {} },
          { label: t("Dejar de seguir"), destacado: true, onPress: confirmarDejarDeSeguir },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  botonesRow: { flexDirection: "row", alignItems: "center", padding: 12 },
  columnaBotonesChicos: { alignItems: "center", gap: 8 },
  filaBotonesChicos: { flexDirection: "row", gap: 8 },
  ordenBotonTexto: { fontSize: 13, fontWeight: "800", color: "#FFFFFF" },
  botonChico: {
    width: 40,
    height: 32,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  botonChicoTilde: {
    width: 40,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  descripcionLectura: { flex: 1, fontSize: 13, color: theme.colors.textMuted, textAlign: "center", marginRight: 10 },
  descripcionPropia: { fontSize: 13, color: theme.colors.textMuted, textAlign: "center", paddingHorizontal: 20, paddingTop: 10 },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24, paddingHorizontal: 24, width: "100%" },
  item: { flex: 1 / 3, padding: 4 },
  poster: { width: "100%", aspectRatio: 2 / 3, borderRadius: 6 },
  filaItem: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 12 },
  filaPoster: { width: 46, height: 46, borderRadius: 6 },
  filaNombre: { fontSize: 14 },
  filaSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
});
