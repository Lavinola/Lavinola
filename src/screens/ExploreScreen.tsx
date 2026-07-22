import React, { useEffect, useState } from "react";
import { View, FlatList, Image, StyleSheet, Pressable, ActivityIndicator, Alert, ScrollView } from "react-native";
import { Text } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import { getTrendingSeries, getTrendingMovies, posterUrl } from "../lib/tmdb";
import { recomendarSeries, recomendarPeliculas, marcarNoMeInteresa } from "../lib/recommendations";
import { syncSeries, syncMovie, seguirSerie, agregarPelicula } from "../lib/sync";
import { supabase } from "../lib/supabase";
import ConfirmModal from "../components/ConfirmModal";
import TopPills from "../components/TopPills";
import NewsScreen from "./NewsScreen";
import TopMonthlyScreen from "./TopMonthlyScreen";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function ExploreScreen({ navigation }: any) {
  const { t } = useT();
  const [subTab, setSubTab] = useState<"descubrir" | "topMensual" | "noticias">("descubrir");

  return (
    <View style={styles.container}>
      <Pressable style={styles.buscadorFalso} onPress={() => navigation.navigate("BuscadorGlobal")}>
        <Ionicons name="search" size={16} color={theme.colors.textMuted} />
        <Text style={styles.buscadorTexto}>{t("Buscar series, películas, usuarios, grupos...")}</Text>
      </Pressable>
      <TopPills
        variante="rect"
        opciones={[
          { key: "descubrir", label: t("Descubrir") },
          { key: "topMensual", label: t("Top mensual") },
          { key: "noticias", label: t("Noticias") },
        ]}
        valor={subTab}
        onCambiar={setSubTab}
      />
      {subTab === "descubrir" ? (
        <Descubrir navigation={navigation} />
      ) : subTab === "topMensual" ? (
        <TopMonthlyScreen navigation={navigation} />
      ) : (
        <NewsScreen />
      )}
    </View>
  );
}

interface ItemFila {
  id: number;
  titulo: string;
  poster_path: string | null;
  tipo: "series" | "movie";
}

function Descubrir({ navigation }: any) {
  const { t } = useT();
  const [seriesModa, setSeriesModa] = useState<ItemFila[]>([]);
  const [peliculasModa, setPeliculasModa] = useState<ItemFila[]>([]);
  const [seriesRecomendadas, setSeriesRecomendadas] = useState<ItemFila[]>([]);
  const [peliculasRecomendadas, setPeliculasRecomendadas] = useState<ItemFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [descartarItem, setDescartarItem] = useState<ItemFila | null>(null);
  const [agregados, setAgregados] = useState<Set<string>>(new Set());

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      setUserId(uid);

      const [trendSeries, trendMovies, recSeries, recMovies] = await Promise.all([
        getTrendingSeries(),
        getTrendingMovies(),
        uid ? recomendarSeries(uid) : Promise.resolve([]),
        uid ? recomendarPeliculas(uid) : Promise.resolve([]),
      ]);

      let idsSeriesAgregadas = new Set<number>();
      let idsPeliculasAgregadas = new Set<number>();
      if (uid) {
        const [{ data: misSeries }, { data: misPeliculas }] = await Promise.all([
          supabase.from("user_series").select("series_tmdb_id").eq("user_id", uid),
          supabase.from("user_movies").select("movie_tmdb_id").eq("user_id", uid),
        ]);
        idsSeriesAgregadas = new Set((misSeries ?? []).map((s: any) => s.series_tmdb_id));
        idsPeliculasAgregadas = new Set((misPeliculas ?? []).map((p: any) => p.movie_tmdb_id));
      }

      setSeriesModa((trendSeries.results ?? []).map(mapSerie).filter((s: ItemFila) => !idsSeriesAgregadas.has(s.id)));
      setPeliculasModa((trendMovies.results ?? []).map(mapPelicula).filter((p: ItemFila) => !idsPeliculasAgregadas.has(p.id)));
      setSeriesRecomendadas((recSeries ?? []).map(mapSerie).filter((s: ItemFila) => !idsSeriesAgregadas.has(s.id)));
      setPeliculasRecomendadas((recMovies ?? []).map(mapPelicula).filter((p: ItemFila) => !idsPeliculasAgregadas.has(p.id)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function mapSerie(s: any): ItemFila {
    return { id: s.id, titulo: s.name, poster_path: s.poster_path, tipo: "series" };
  }
  function mapPelicula(p: any): ItemFila {
    return { id: p.id, titulo: p.title, poster_path: p.poster_path, tipo: "movie" };
  }

  async function abrir(item: ItemFila) {
    try {
      if (item.tipo === "series") await syncSeries(item.id);
      else await syncMovie(item.id);
      navigation.navigate("DetalleTitulo", { tmdbId: item.id, tipo: item.tipo });
    } catch (e: any) {
      console.error("Error al abrir el título:", e);
      Alert.alert("No se pudo abrir", e.message ?? "Revisá tu conexión y probá de nuevo.");
    }
  }

  async function agregarRapido(item: ItemFila) {
    if (!userId) return;
    const clave = `${item.tipo}-${item.id}`;
    try {
      if (item.tipo === "series") await seguirSerie(userId, item.id);
      else await agregarPelicula(userId, item.id);
      setAgregados((prev) => new Set(prev).add(clave));
    } catch (e: any) {
      console.error("Error al agregar rápido:", e);
      Alert.alert("No se pudo agregar", e.message ?? "Revisá tu conexión y probá de nuevo.");
    }
  }

  async function descartar(item: ItemFila) {
    if (!userId) return;
    setDescartarItem(item);
  }

  async function confirmarDescarte() {
    if (!userId || !descartarItem) return;
    await marcarNoMeInteresa(userId, descartarItem.tipo, descartarItem.id);
    cargar();
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 32 }} />;

  return (
    <>
    <ScrollView>
      <FilaHorizontal
        titulo={t("Películas tendencia")}
        items={peliculasModa}
        onPress={abrir}
        onAgregar={agregarRapido}
        agregados={agregados}
        onVerMas={() => navigation.navigate("DescubrirMas", { tipoInicial: "movie", ordenInicial: "tendencias" })}
      />
      <FilaHorizontal
        titulo={t("Películas recomendadas para ti")}
        items={peliculasRecomendadas}
        onPress={abrir}
        onLongPress={descartar}
        onAgregar={agregarRapido}
        agregados={agregados}
        vacioTexto={t("Agregá algunas películas para que empecemos a recomendarte.")}
        onVerMas={() => navigation.navigate("DescubrirMas", { tipoInicial: "movie", ordenInicial: "recomendado" })}
      />
      <FilaHorizontal
        titulo={t("Series tendencia")}
        items={seriesModa}
        onPress={abrir}
        onAgregar={agregarRapido}
        agregados={agregados}
        onVerMas={() => navigation.navigate("DescubrirMas", { tipoInicial: "series", ordenInicial: "tendencias" })}
      />
      <FilaHorizontal
        titulo={t("Series recomendadas para ti")}
        items={seriesRecomendadas}
        onPress={abrir}
        onLongPress={descartar}
        onAgregar={agregarRapido}
        agregados={agregados}
        vacioTexto={t("Agregá algunas series para que empecemos a recomendarte.")}
        onVerMas={() => navigation.navigate("DescubrirMas", { tipoInicial: "series", ordenInicial: "recomendado" })}
      />
    </ScrollView>
    <ConfirmModal
      visible={!!descartarItem}
      onCerrar={() => setDescartarItem(null)}
      titulo={t("No me interesa")}
      mensaje={descartarItem ? `¿Sacar "${descartarItem.titulo}" de tus recomendaciones?` : ""}
      botones={[
        { label: t("Cancelar"), onPress: () => {} },
        { label: t("Sacar"), onPress: confirmarDescarte, destacado: true },
      ]}
    />
    </>
  );
}

function FilaHorizontal({
  titulo,
  items,
  onPress,
  onLongPress,
  onAgregar,
  agregados,
  vacioTexto,
  onVerMas,
}: {
  titulo: string;
  items: ItemFila[];
  onPress: (item: ItemFila) => void;
  onLongPress?: (item: ItemFila) => void;
  onAgregar: (item: ItemFila) => void;
  agregados: Set<string>;
  vacioTexto?: string;
  onVerMas: () => void;
}) {
  if (items.length === 0 && !vacioTexto) return null; // filas de "moda" (trending): si TMDB no trajo nada, no mostramos nada

  return (
    <View style={styles.seccion}>
      <Pressable style={styles.seccionHeader} onPress={onVerMas}>
        <Text style={[styles.seccionTitulo, { marginBottom: 0 }]}>{titulo}</Text>
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
      </Pressable>
      {items.length === 0 ? (
        <Text style={styles.vacioTexto}>{vacioTexto}</Text>
      ) : (
      <FlatList
        horizontal
        data={items}
        keyExtractor={(i) => `${i.tipo}-${i.id}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 8 }}
        renderItem={({ item }) => {
          const yaAgregado = agregados.has(`${item.tipo}-${item.id}`);
          return (
            <View style={styles.card}>
              <Pressable onPress={() => onPress(item)} onLongPress={onLongPress ? () => onLongPress(item) : undefined}>
                {item.poster_path ? (
                  <Image source={{ uri: posterUrl(item.poster_path, "w342")! }} style={styles.poster} />
                ) : (
                  <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
                )}
              </Pressable>
              <Pressable
                style={[styles.masBtn, yaAgregado && styles.masBtnAgregado]}
                onPress={() => onAgregar(item)}
                disabled={yaAgregado}
                hitSlop={6}
              >
                <Text style={[styles.masBtnTexto, yaAgregado && styles.masBtnTextoAgregado]}>{yaAgregado ? "✓" : "+"}</Text>
              </Pressable>
              <Text numberOfLines={2} style={styles.cardTitulo}>
                {item.titulo}
              </Text>
            </View>
          );
        }}
      />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  buscadorFalso: { flexDirection: "row", alignItems: "center", gap: 8, margin: 12, marginBottom: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 12 },
  buscadorTexto: { color: theme.colors.textFaint, fontSize: 13 },
  container: { flex: 1 },
  seccion: { marginBottom: 16 },
  seccionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.primary,
  },
  seccionTitulo: { fontSize: 17, fontWeight: "700", marginBottom: 8 },
  vacioTexto: { fontSize: 13, color: theme.colors.textMuted, paddingHorizontal: 12 },
  card: { width: 120, marginRight: 10 },
  poster: { width: 120, height: 180, borderRadius: 8 },
  masBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    backgroundColor: "rgba(10,10,10,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  masBtnAgregado: { backgroundColor: theme.colors.primary },
  masBtnTexto: { color: theme.colors.primaryLight, fontSize: 15, fontWeight: "800" },
  masBtnTextoAgregado: { color: "#000000" },
  cardTitulo: { fontSize: 12, marginTop: 4 },
});
