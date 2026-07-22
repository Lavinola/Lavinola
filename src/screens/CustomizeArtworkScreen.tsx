import React, { useEffect, useState } from "react";
import { View, Image, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import TopPills from "../components/TopPills";
import { getSeriesImages, getMovieImages, posterUrl } from "../lib/tmdb";
import { supabase } from "../lib/supabase";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  route: { params: { tmdbId: number; tipo: "series" | "movie"; onElegido?: (campo: "poster" | "backdrop", path: string) => void } };
  navigation: any;
}

type Tab = "carteles" | "banners";

export default function CustomizeArtworkScreen({ route, navigation }: Props) {
  const { t } = useT();
  const { tmdbId, tipo, onElegido } = route.params;
  const [tab, setTab] = useState<Tab>("carteles");
  const [posters, setPosters] = useState<any[]>([]);
  const [backdrops, setBackdrops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setLoading(true);
    const data = tipo === "series" ? await getSeriesImages(tmdbId) : await getMovieImages(tmdbId);
    setPosters(data.posters ?? []);
    setBackdrops(data.backdrops ?? []);
    setLoading(false);
  }

  async function elegir(path: string) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    const tabla = tipo === "series" ? "user_series" : "user_movies";
    const columnaId = tipo === "series" ? "series_tmdb_id" : "movie_tmdb_id";
    const campo = tab === "carteles" ? "custom_poster_path" : "custom_backdrop_path";
    await supabase.from(tabla).update({ [campo]: path }).eq("user_id", userId).eq(columnaId, tmdbId);
    onElegido?.(tab === "carteles" ? "poster" : "backdrop", path);
    navigation.goBack();
  }

  const items = tab === "carteles" ? posters : backdrops;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TopPills
        opciones={[
          { key: "carteles", label: t("Carteles") },
          { key: "banners", label: t("Banners") },
        ]}
        valor={tab}
        onCambiar={setTab}
      />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => `${item.file_path}-${i}`}
          numColumns={tab === "carteles" ? 3 : 1}
          key={tab}
          contentContainerStyle={{ padding: 8 }}
          ListEmptyComponent={<Text style={styles.vacio}>No hay opciones disponibles.</Text>}
          renderItem={({ item }) => (
            <Pressable style={tab === "carteles" ? styles.posterItem : styles.backdropItem} onPress={() => elegir(item.file_path)}>
              <Image
                source={{ uri: posterUrl(item.file_path, tab === "carteles" ? "w185" : "w342")! }}
                style={tab === "carteles" ? styles.poster : styles.backdrop}
              />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24 },
  posterItem: { flex: 1 / 3, padding: 4 },
  poster: { width: "100%", aspectRatio: 2 / 3, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt },
  backdropItem: { padding: 4 },
  backdrop: { width: "100%", aspectRatio: 16 / 9, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt },
});
