import React, { useCallback, useState } from "react";
import { View, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text, AppButton } from "../components/Themed";
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
}

export default function ListDetailScreen({ route, navigation }: any) {
  const { t } = useT();
  const { listId, listTitle, soloLectura } = route.params;
  const [descripcion, setDescripcion] = useState<string | null>(null);
  const [items, setItems] = useState<ItemLista[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishModalVisible, setPublishModalVisible] = useState(false);
  const [modoVista, setModoVista] = useState<"grilla" | "lista">("grilla");

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [])
  );

  async function cargar() {
    setLoading(true);
    const [{ data: listaData }, { data }] = await Promise.all([
      supabase.from("lists").select("description").eq("id", listId).maybeSingle(),
      supabase.from("list_items").select("item_type, tmdb_id").eq("list_id", listId),
    ]);
    setDescripcion(listaData?.description ?? null);

    // Antes esto traía cada título UNO POR UNO (una consulta aparte por
    // cada fila) — con listas grandes, eso se sentía lento. Ahora se trae
    // todo en un puñado de consultas en tanda.
    const filas = data ?? [];
    const idsSeries = [...new Set(filas.filter((f) => f.item_type === "series").map((f) => f.tmdb_id))];
    const idsMovies = [...new Set(filas.filter((f) => f.item_type === "movie").map((f) => f.tmdb_id))];
    const [seriesCache, moviesCache] = await Promise.all([
      idsSeries.length > 0 ? supabase.from("series_cache").select("tmdb_id, name, poster_path").in("tmdb_id", idsSeries) : Promise.resolve({ data: [] }),
      idsMovies.length > 0 ? supabase.from("movies_cache").select("tmdb_id, title, poster_path").in("tmdb_id", idsMovies) : Promise.resolve({ data: [] }),
    ]);
    const seriesMap = new Map((seriesCache.data ?? []).map((r: any) => [r.tmdb_id, r]));
    const moviesMap = new Map((moviesCache.data ?? []).map((r: any) => [r.tmdb_id, r]));

    const resultado: ItemLista[] = filas.map((fila) => {
      if (fila.item_type === "series") {
        const cache = seriesMap.get(fila.tmdb_id);
        return { item_type: "series" as const, tmdb_id: fila.tmdb_id, nombre: cache?.name ?? "—", poster_path: cache?.poster_path ?? null };
      } else {
        const cache = moviesMap.get(fila.tmdb_id);
        return { item_type: "movie" as const, tmdb_id: fila.tmdb_id, nombre: cache?.title ?? "—", poster_path: cache?.poster_path ?? null };
      }
    });
    setItems(resultado);
    setLoading(false);
  }

  const botonesGrupo = (
    <View style={styles.columnaBotonesChicos}>
      <Pressable style={styles.botonChico} onPress={() => setPublishModalVisible(true)} hitSlop={6}>
        <Ionicons name="paper-plane" size={15} color="#FFFFFF" />
      </Pressable>
      <Pressable style={styles.botonChico} onPress={() => setModoVista(modoVista === "grilla" ? "lista" : "grilla")} hitSlop={6}>
        <Ionicons name={modoVista === "grilla" ? "list" : "grid"} size={15} color="#FFFFFF" />
      </Pressable>
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
          ListEmptyComponent={<Text style={styles.vacio}>{t("Esta lista todavía no tiene nada. Usá los botones de arriba para agregar.")}</Text>}
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
          ListEmptyComponent={<Text style={styles.vacio}>{t("Esta lista todavía no tiene nada. Usá los botones de arriba para agregar.")}</Text>}
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
              <Text style={styles.filaNombre} numberOfLines={2}>
                {item.nombre}
              </Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  botonesRow: { flexDirection: "row", alignItems: "center", padding: 12 },
  columnaBotonesChicos: { flexDirection: "row", gap: 8 },
  botonChico: {
    width: 40,
    height: 32,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
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
  filaNombre: { fontSize: 14, flex: 1 },
});
