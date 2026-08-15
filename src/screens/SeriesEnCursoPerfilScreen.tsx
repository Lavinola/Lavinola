import React, { useEffect, useState } from "react";
import { View, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import EstadoVacio from "../components/EstadoVacio";
import RatingStars from "../components/RatingStars";
import SeriesProgressBar from "../components/SeriesProgressBar";
import OrdenTitulosPerfilModal from "../components/OrdenTitulosPerfilModal";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { listarSeriesEnCursoDeUsuario, SeriePerfilItem, OrdenTitulosPerfil } from "../lib/perfilTitulos";
import { posterUrl } from "../lib/tmdb";
import { nombreOUsuario } from "../components/NombreUsuario";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

function agruparDeATres<T>(lista: T[]): T[][] {
  const filas: T[][] = [];
  for (let i = 0; i < lista.length; i += 3) filas.push(lista.slice(i, i + 3));
  return filas;
}

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
    supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", targetUserId)
      .maybeSingle()
      .then(({ data }) => {
        navigation.setOptions({ title: `${t("Series de")} ${nombreOUsuario(data?.display_name, data?.username)}` });
      });
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
      <View style={styles.topRow}>
        <Pressable style={styles.iconBtn} onPress={() => setOrdenVisible(true)}>
          <Ionicons name="swap-vertical" size={20} color={theme.colors.text} />
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => setModoVista(modoVista === "grilla" ? "lista" : "grilla")}>
          <Ionicons name={modoVista === "grilla" ? "list" : "grid"} size={20} color={theme.colors.text} />
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => setMostrarEstrellas(!mostrarEstrellas)}>
          <Ionicons name="star" size={20} color={mostrarEstrellas ? theme.colors.primaryLight : theme.colors.textMuted} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 32 }} />
      ) : modoVista === "lista" ? (
        <FlatList
          key="lista"
          data={items}
          keyExtractor={(s) => String(s.tmdb_id)}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={<EstadoVacio icono="tv-outline" titulo={t("Todavía no empezó ninguna serie.")} />}
          renderItem={({ item }) => (
            <Pressable style={styles.filaLista} onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: "series" })}>
              {item.poster_path ? (
                <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.miniPoster} />
              ) : (
                <View style={[styles.miniPoster, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.filaListaTitulo} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.filaListaSub}>
                  {item.total_seasons ? `${item.total_seasons} ${item.total_seasons === 1 ? t("temporada") : t("temporadas")}` : ""}
                  {item.first_air_date ? ` · ${item.first_air_date.slice(0, 4)}` : ""}
                </Text>
                {mostrarEstrellas && <RatingStars rating={item.rating} size={11} />}
                <SeriesProgressBar estado={item.estado} porcentaje={item.porcentaje} />
              </View>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          key="grilla"
          data={agruparDeATres(items)}
          keyExtractor={(fila) => fila.map((s) => s.tmdb_id).join("-")}
          contentContainerStyle={{ padding: 8 }}
          ListEmptyComponent={<EstadoVacio icono="tv-outline" titulo={t("Todavía no empezó ninguna serie.")} />}
          renderItem={({ item: fila }) => (
            <View style={{ flexDirection: "row" }}>
              {fila.map((item) => (
                <Pressable key={item.tmdb_id} style={styles.item} onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: "series" })}>
                  <View style={{ position: "relative" }}>
                    {item.poster_path ? (
                      <Image source={{ uri: posterUrl(item.poster_path, "w342")! }} style={styles.poster} />
                    ) : (
                      <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
                    )}
                    {mostrarEstrellas && item.rating != null && (
                      <View style={styles.estrellasOverlay}>
                        <RatingStars rating={item.rating} size={11} />
                      </View>
                    )}
                  </View>
                  <SeriesProgressBar estado={item.estado} porcentaje={item.porcentaje} />
                </Pressable>
              ))}
              {fila.length < 3 && Array.from({ length: 3 - fila.length }).map((_, i) => <View key={`vacio-${i}`} style={styles.item} />)}
            </View>
          )}
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
  topRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", padding: 12, gap: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  item: { flex: 1 / 3, padding: 4 },
  poster: { width: "100%", aspectRatio: 2 / 3, borderRadius: 6 },
  estrellasOverlay: {
    position: "absolute",
    bottom: 4,
    left: 0,
    right: 0,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingVertical: 2,
    marginHorizontal: 4,
    borderRadius: 4,
  },
  miniPoster: { width: 40, height: 60, borderRadius: 4, marginRight: 10 },
  filaLista: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  filaListaTitulo: { fontSize: 15, fontWeight: "600" },
  filaListaSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
});
