import React from "react";
import { View, Image, FlatList, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Themed";
import SeriesProgressBar from "./SeriesProgressBar";
import { posterUrl } from "../lib/tmdb";
import { ProgresoSerie } from "../lib/seriesList";
import { theme } from "../theme";

export interface ItemMiniTitulo {
  tmdb_id: number;
  nombre: string;
  poster_path: string | null;
}

interface Props {
  titulo: string;
  items: ItemMiniTitulo[];
  tipo: "series" | "movie";
  navigation: any;
  progreso?: Record<number, ProgresoSerie>;
  onAgregar?: () => void;
  favoritas?: boolean;
  onVerTodo?: () => void;
  vacioTexto?: string;
}

/** El mismo rengloncito-botón (con línea violeta arriba y abajo) que se usa en el perfil propio y en el ajeno. */
export default function FilaMiniTitulos({ titulo, items, tipo, navigation, progreso, onAgregar, favoritas, onVerTodo, vacioTexto }: Props) {
  return (
    <View style={styles.filaMiniWrap}>
      <Pressable style={styles.filaMiniHeader} onPress={onVerTodo} disabled={!onVerTodo}>
        <View style={styles.filaMiniTituloRow}>
          <Text style={styles.seccionTitulo}>{titulo}</Text>
          {favoritas && <Ionicons name="heart" size={16} color={theme.colors.primaryLight} style={{ marginLeft: 6 }} />}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {onAgregar && (
            <Pressable onPress={onAgregar} hitSlop={8} style={{ marginRight: 12 }}>
              <Text style={styles.agregarBtn}>+ Agregar</Text>
            </Pressable>
          )}
          {onVerTodo && <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />}
        </View>
      </Pressable>
      {items.length === 0 ? (
        <Text style={styles.filaMiniVacio}>{vacioTexto ?? (onAgregar ? "Todavía no marcaste ninguna como favorita." : "Todavía no agregaste nada acá.")}</Text>
      ) : (
        <FlatList
          horizontal
          data={items}
          keyExtractor={(i) => `${tipo}-${i.tmdb_id}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 10 }}
          renderItem={({ item }) => (
            <Pressable style={styles.miniCard} onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo })}>
              {item.poster_path ? (
                <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.miniPoster} />
              ) : (
                <View style={[styles.miniPoster, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              {tipo === "series" && progreso?.[item.tmdb_id] && (
                <SeriesProgressBar estado={progreso[item.tmdb_id].estado} porcentaje={progreso[item.tmdb_id].porcentaje} />
              )}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filaMiniWrap: { marginTop: 0 },
  filaMiniHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.primary,
  },
  filaMiniTituloRow: { flexDirection: "row", alignItems: "center" },
  seccionTitulo: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  agregarBtn: { color: theme.colors.primaryLight, fontSize: 13, fontWeight: "600" },
  filaMiniVacio: { color: theme.colors.textMuted, fontSize: 12, paddingHorizontal: 16, marginTop: 10 },
  miniCard: { marginRight: 8 },
  miniPoster: { width: 90, height: 135, borderRadius: 6 },
});
