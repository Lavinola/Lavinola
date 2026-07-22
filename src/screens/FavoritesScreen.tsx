import React, { useEffect, useState } from "react";
import { View, FlatList, Image, Pressable, StyleSheet } from "react-native";
import { supabase } from "../lib/supabase";
import { listarFavoritos, Favorito } from "../lib/favorites";
import { posterUrl } from "../lib/tmdb";
import { Text } from "../components/Themed";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type Tab = "series" | "movie";

export default function FavoritesScreen({ navigation }: any) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("series");
  const [favoritos, setFavoritos] = useState<Favorito[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return setLoading(false);
    const data = await listarFavoritos(userId);
    setFavoritos(data);
    setLoading(false);
  }

  const filtrados = favoritos.filter((f) => f.item_type === tab);

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        <Pressable style={[styles.tabChip, tab === "series" && styles.tabChipActive]} onPress={() => setTab("series")}>
          <Text style={tab === "series" ? styles.tabTextActive : styles.tabText}>{t("Series favoritas")}</Text>
        </Pressable>
        <Pressable style={[styles.tabChip, tab === "movie" && styles.tabChipActive]} onPress={() => setTab("movie")}>
          <Text style={tab === "movie" ? styles.tabTextActive : styles.tabText}>{t("Películas favoritas")}</Text>
        </Pressable>
      </View>

      <FlatList
        data={filtrados}
        numColumns={3}
        keyExtractor={(item) => `${item.item_type}-${item.tmdb_id}`}
        contentContainerStyle={{ padding: 6 }}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.vacio}>
              {t("Todavía no marcaste {tipo} como favoritas.").replace("{tipo}", tab === "series" ? t("series") : t("películas"))}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.cell}
            onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: item.item_type })}
          >
            {item.poster_path ? (
              <Image source={{ uri: posterUrl(item.poster_path, "w342")! }} style={styles.poster} />
            ) : (
              <View style={[styles.poster, styles.posterPlaceholder]} />
            )}
            <Text numberOfLines={2} style={styles.titulo}>
              {item.nombre}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabRow: { flexDirection: "row", padding: 8 },
  tabChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, marginRight: 8 },
  tabChipActive: { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primaryLight },
  tabText: { color: theme.colors.textMuted, fontSize: 12 },
  tabTextActive: { color: theme.colors.text, fontSize: 12 },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 32, width: "100%" },
  cell: { flex: 1 / 3, padding: 6 },
  poster: { width: "100%", aspectRatio: 2 / 3, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt },
  posterPlaceholder: {},
  titulo: { fontSize: 12, marginTop: 4 },
});
