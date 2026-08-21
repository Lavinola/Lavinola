import React, { useCallback, useRef, useState } from "react";
import { View, TextInput, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { posterUrl } from "../lib/tmdb";
import { notificarAgregadoALista } from "../lib/lists";
import OrdenTitulosModal, { CriterioOrdenTitulos } from "../components/OrdenTitulosModal";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface ItemConEnLista {
  tmdb_id: number;
  nombre: string;
  poster_path: string | null;
  enLista: boolean;
  fechaLanzamiento: string | null;
  ultimaVez: string | null;
}

function ordenarItems(items: ItemConEnLista[], criterio: CriterioOrdenTitulos, ascendente: boolean): ItemConEnLista[] {
  const arr = [...items];
  arr.sort((a, b) => {
    let cmp = 0;
    if (criterio === "alfabetico") cmp = a.nombre.localeCompare(b.nombre);
    else if (criterio === "fecha") cmp = (a.fechaLanzamiento ?? "").localeCompare(b.fechaLanzamiento ?? "");
    else cmp = (a.ultimaVez ?? "").localeCompare(b.ultimaVez ?? "");
    return ascendente ? cmp : -cmp;
  });
  return arr;
}

export default function ChooseForListScreen({ route }: any) {
  const { t } = useT();
  const { listId, tipo } = route.params as { listId: string; tipo: "series" | "movie" };
  const [items, setItems] = useState<ItemConEnLista[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [orden, setOrden] = useState<CriterioOrdenTitulos>("alfabetico");
  const [ascendente, setAscendente] = useState(true);
  const [ordenModalVisible, setOrdenModalVisible] = useState(false);
  const agregadosEnSesionRef = useRef<{ nombre: string }[]>([]);

  useFocusEffect(
    useCallback(() => {
      cargar();
      return () => {
        // Al salir de la pantalla, si agregaste algo en esta sesión, se avisa
        // UNA vez a los seguidores de la lista — así no se manda un aviso
        // por cada título si agregaste varios seguidos.
        if (agregadosEnSesionRef.current.length > 0) {
          notificarAgregadoALista(listId, agregadosEnSesionRef.current).catch((e) => console.error("Error al avisar a seguidores de la lista:", e));
          agregadosEnSesionRef.current = [];
        }
      };
    }, [])
  );

  async function cargar() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getSession();
    const uid = userData.session?.user?.id;
    if (!uid) {
      setLoading(false);
      return;
    }

    const { data: enListaData } = await supabase.from("list_items").select("tmdb_id").eq("list_id", listId).eq("item_type", tipo);
    const idsEnLista = new Set((enListaData ?? []).map((r: any) => r.tmdb_id));

    let lista: ItemConEnLista[] = [];
    if (tipo === "series") {
      const { data } = await supabase
        .from("user_series")
        .select("series_tmdb_id, last_watched_at, series_cache(name, poster_path, first_air_date)")
        .eq("user_id", uid);
      lista = (data ?? []).map((r: any) => ({
        tmdb_id: r.series_tmdb_id,
        nombre: r.series_cache?.name ?? "—",
        poster_path: r.series_cache?.poster_path ?? null,
        enLista: idsEnLista.has(r.series_tmdb_id),
        fechaLanzamiento: r.series_cache?.first_air_date ?? null,
        ultimaVez: r.last_watched_at ?? null,
      }));
    } else {
      const { data } = await supabase
        .from("user_movies")
        .select("movie_tmdb_id, watched_at, movies_cache(title, poster_path, release_date)")
        .eq("user_id", uid);
      lista = (data ?? []).map((r: any) => ({
        tmdb_id: r.movie_tmdb_id,
        nombre: r.movies_cache?.title ?? "—",
        poster_path: r.movies_cache?.poster_path ?? null,
        enLista: idsEnLista.has(r.movie_tmdb_id),
        fechaLanzamiento: r.movies_cache?.release_date ?? null,
        ultimaVez: r.watched_at ?? null,
      }));
    }
    setItems(ordenarItems(lista, orden, ascendente));
    setLoading(false);
  }

  async function toggle(item: ItemConEnLista) {
    if (item.enLista) {
      await supabase.from("list_items").delete().eq("list_id", listId).eq("item_type", tipo).eq("tmdb_id", item.tmdb_id);
      agregadosEnSesionRef.current = agregadosEnSesionRef.current.filter((a) => a.nombre !== item.nombre);
    } else {
      await supabase.from("list_items").insert({ list_id: listId, item_type: tipo, tmdb_id: item.tmdb_id });
      agregadosEnSesionRef.current = [...agregadosEnSesionRef.current, { nombre: item.nombre }];
    }
    setItems((prev) => prev.map((i) => (i.tmdb_id === item.tmdb_id ? { ...i, enLista: !i.enLista } : i)));
  }

  function cambiarOrden(nuevoCriterio: CriterioOrdenTitulos, nuevaAscendente: boolean) {
    setOrden(nuevoCriterio);
    setAscendente(nuevaAscendente);
    setItems((prev) => ordenarItems(prev, nuevoCriterio, nuevaAscendente));
  }

  const filtrados = busqueda.trim() ? items.filter((i) => i.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())) : items;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.filaBusqueda}>
        <TextInput
          style={styles.buscador}
          placeholder={tipo === "series" ? t("Buscar en tus series...") : t("Buscar en tus películas...")}
          placeholderTextColor={theme.colors.textFaint}
          value={busqueda}
          onChangeText={setBusqueda}
        />
        <Pressable style={styles.ordenBtn} onPress={() => setOrdenModalVisible(true)}>
          <Ionicons name="swap-vertical" size={18} color={theme.colors.primaryLight} />
          <Text style={styles.ordenBtnTexto}>{t("Ordenar")}</Text>
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={filtrados}
          keyExtractor={(i) => String(i.tmdb_id)}
          ListEmptyComponent={
            <Text style={styles.vacio}>
              {tipo === "series" ? t("Todavía no agregaste ninguna serie a tu perfil.") : t("Todavía no agregaste ninguna película a tu perfil.")}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.fila} onPress={() => toggle(item)}>
              {item.poster_path ? (
                <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.poster} />
              ) : (
                <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              <Text style={styles.nombre} numberOfLines={2}>
                {item.nombre}
              </Text>
              <Ionicons name={item.enLista ? "checkmark-circle" : "add-circle-outline"} size={26} color={theme.colors.primaryLight} />
            </Pressable>
          )}
        />
      )}

      <OrdenTitulosModal
        visible={ordenModalVisible}
        onCerrar={() => setOrdenModalVisible(false)}
        orden={orden}
        ascendente={ascendente}
        onCambiar={cambiarOrden}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  filaBusqueda: { flexDirection: "row", alignItems: "center", gap: 8, margin: 12 },
  buscador: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: 10 },
  ordenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  ordenBtnTexto: { fontSize: 12.5, fontWeight: "700", color: theme.colors.primaryLight },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24, paddingHorizontal: 24 },
  fila: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 12 },
  poster: { width: 42, height: 63, borderRadius: 4, marginRight: 12 },
  nombre: { flex: 1, fontSize: 14, marginRight: 12 },
});
