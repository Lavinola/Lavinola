import React, { useEffect, useState } from "react";
import { View, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import EstadoVacio from "../components/EstadoVacio";
import StarRating from "../components/StarRating";
import OrdenTitulosPerfilModal from "../components/OrdenTitulosPerfilModal";
import { Ionicons } from "@expo/vector-icons";
import { listarSeriesEnCursoDeUsuario, SeriePerfilItem, OrdenTitulosPerfil } from "../lib/perfilTitulos";
import { posterUrl } from "../lib/tmdb";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function SeriesEnCursoPerfilScreen({ route, navigation }: any) {
  const { targetUserId } = route.params;
  const { t } = useT();
  const [items, setItems] = useState<SeriePerfilItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modoVista, setModoVista] = useState<"grilla" | "lista">("grilla");
  const [mostrarEstrellas, setMostrarEstrellas] = useState(true);
  const [ordenVisible, setOrdenVisible] = useState(false);
  const [orden, setOrden] = useState<OrdenTitulosPerfil>("ultima_vista");
  const [ascendente, setAscendente] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: t("Series") });
  }, []);

  useEffect(() => {
    setLoading(true);
    listarSeriesEnCursoDeUsuario(targetUserId, orden, ascendente)
      .then(setItems)
      .catch((e) => console.error("Error al cargar series del perfil:", e))
      .finally(() => setLoading(false));
  }, [targetUserId, orden, ascendente]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.botonesRow}>
        <Pressable style={styles.botonChico} onPress={() => setOrdenVisible(true)} hitSlop={6}>
          <Ionicons name="swap-vertical" size={16} color="#FFFFFF" />
        </Pressable>
        <Pressable style={styles.botonChico} onPress={() => setModoVista(modoVista === "grilla" ? "lista" : "grilla")} hitSlop={6}>
          <Ionicons name={modoVista === "grilla" ? "list" : "grid"} size={16} color="#FFFFFF" />
        </Pressable>
        <Pressable style={styles.botonChico} onPress={() => setMostrarEstrellas((v) => !v)} hitSlop={6}>
          <Ionicons name={mostrarEstrellas ? "star" : "star-outline"} size={16} color="#FFFFFF" />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          key={modoVista}
          data={items}
          keyExtractor={(i) => String(i.tmdb_id)}
          numColumns={modoVista === "grilla" ? 3 : 1}
          contentContainerStyle={{ padding: 8 }}
          ListEmptyComponent={<EstadoVacio icono="tv-outline" titulo={t("Todavía no empezó ninguna serie.")} />}
          renderItem={({ item }) =>
            modoVista === "grilla" ? (
              <Pressable style={styles.celdaGrilla} onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: "series" })}>
                {item.poster_path ? (
                  <Image source={{ uri: posterUrl(item.poster_path, "w342")! }} style={styles.posterGrilla} />
                ) : (
                  <View style={[styles.posterGrilla, { backgroundColor: theme.colors.surfaceAlt }]} />
                )}
                {mostrarEstrellas && !!item.rating && (
                  <View style={styles.estrellasGrilla}>
                    <StarRating valor={item.rating} size={11} />
                  </View>
                )}
              </Pressable>
            ) : (
              <Pressable style={styles.filaLista} onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: "series" })}>
                {item.poster_path ? (
                  <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.posterLista} />
                ) : (
                  <View style={[styles.posterLista, { backgroundColor: theme.colors.surfaceAlt }]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.tituloLista} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {mostrarEstrellas && !!item.rating && <StarRating valor={item.rating} size={14} />}
                </View>
              </Pressable>
            )
          }
        />
      )}

      <OrdenTitulosPerfilModal
        visible={ordenVisible}
        onCerrar={() => setOrdenVisible(false)}
        orden={orden}
        ascendente={ascendente}
        onCambiar={(o, asc) => {
          setOrden(o);
          setAscendente(asc);
        }}
        labelUltimaVista={t("Lo último que ha visto")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  botonesRow: { flexDirection: "row", gap: 8, padding: 12 },
  botonChico: {
    width: 40,
    height: 32,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  celdaGrilla: { flex: 1 / 3, padding: 4 },
  posterGrilla: { width: "100%", aspectRatio: 2 / 3, borderRadius: 8 },
  estrellasGrilla: { position: "absolute", bottom: 6, left: 8, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 6, paddingHorizontal: 3, paddingVertical: 1 },
  filaLista: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  posterLista: { width: 46, height: 69, borderRadius: 6 },
  tituloLista: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
});
