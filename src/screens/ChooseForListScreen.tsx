import React, { useCallback, useRef, useState } from "react";
import { View, TextInput, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { posterUrl } from "../lib/tmdb";
import { notificarAgregadoALista } from "../lib/lists";
import { theme } from "../theme";

interface ItemConEnLista {
  tmdb_id: number;
  nombre: string;
  poster_path: string | null;
  enLista: boolean;
}

export default function ChooseForListScreen({ route }: any) {
  const { listId, tipo } = route.params as { listId: string; tipo: "series" | "movie" };
  const [items, setItems] = useState<ItemConEnLista[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
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
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setLoading(false);
      return;
    }

    const { data: enListaData } = await supabase.from("list_items").select("tmdb_id").eq("list_id", listId).eq("item_type", tipo);
    const idsEnLista = new Set((enListaData ?? []).map((r: any) => r.tmdb_id));

    let lista: ItemConEnLista[] = [];
    if (tipo === "series") {
      const { data } = await supabase.from("user_series").select("series_tmdb_id, series_cache(name, poster_path)").eq("user_id", uid);
      lista = (data ?? []).map((r: any) => ({
        tmdb_id: r.series_tmdb_id,
        nombre: r.series_cache?.name ?? "—",
        poster_path: r.series_cache?.poster_path ?? null,
        enLista: idsEnLista.has(r.series_tmdb_id),
      }));
    } else {
      const { data } = await supabase.from("user_movies").select("movie_tmdb_id, movies_cache(title, poster_path)").eq("user_id", uid);
      lista = (data ?? []).map((r: any) => ({
        tmdb_id: r.movie_tmdb_id,
        nombre: r.movies_cache?.title ?? "—",
        poster_path: r.movies_cache?.poster_path ?? null,
        enLista: idsEnLista.has(r.movie_tmdb_id),
      }));
    }
    lista.sort((a, b) => Number(b.enLista) - Number(a.enLista) || a.nombre.localeCompare(b.nombre));
    setItems(lista);
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

  const filtrados = busqueda.trim() ? items.filter((i) => i.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())) : items;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TextInput
        style={styles.buscador}
        placeholder={tipo === "series" ? "Buscar en tus series..." : "Buscar en tus películas..."}
        placeholderTextColor={theme.colors.textFaint}
        value={busqueda}
        onChangeText={setBusqueda}
      />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={filtrados}
          keyExtractor={(i) => String(i.tmdb_id)}
          ListEmptyComponent={
            <Text style={styles.vacio}>
              {tipo === "series" ? "Todavía no agregaste ninguna serie a tu perfil." : "Todavía no agregaste ninguna película a tu perfil."}
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
    </View>
  );
}

const styles = StyleSheet.create({
  buscador: { margin: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: 10 },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24, paddingHorizontal: 24 },
  fila: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 12 },
  poster: { width: 42, height: 63, borderRadius: 4, marginRight: 12 },
  nombre: { flex: 1, fontSize: 14, marginRight: 12 },
});
