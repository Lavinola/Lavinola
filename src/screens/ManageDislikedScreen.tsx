import React, { useEffect, useState } from "react";
import { View, FlatList, Image, Pressable, StyleSheet } from "react-native";
import { Text } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { listarDescartados, quitarDescarte } from "../lib/recommendations";
import { posterUrl } from "../lib/tmdb";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function ManageDislikedScreen() {
  const { t } = useT();
  const [items, setItems] = useState<Awaited<ReturnType<typeof listarDescartados>>>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      if (data.user?.id) cargar(data.user.id);
    });
  }, []);

  async function cargar(uid: string) {
    const data = await listarDescartados(uid);
    setItems(data);
  }

  async function quitar(tipo: "series" | "movie", tmdbId: number) {
    if (!userId) return;
    await quitarDescarte(userId, tipo, tmdbId);
    cargar(userId);
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(i) => `${i.item_type}-${i.tmdb_id}`}
      contentContainerStyle={{ padding: 12 }}
      ListEmptyComponent={<Text style={styles.vacio}>{t("No descartaste ninguna recomendación todavía.")}</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          {item.poster_path && <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.poster} />}
          <Text style={styles.nombre}>{item.nombre}</Text>
          <Pressable onPress={() => quitar(item.item_type, item.tmdb_id)}>
            <Text style={styles.quitar}>{t("Quitar")}</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24 },
  card: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  poster: { width: 36, height: 54, borderRadius: 4, marginRight: 10, backgroundColor: theme.colors.surfaceAlt },
  nombre: { flex: 1, fontSize: 14 },
  quitar: { color: theme.colors.primaryLight, fontSize: 13 },
});
