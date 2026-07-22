import React, { useCallback, useState } from "react";
import { View, FlatList, Image, StyleSheet, Pressable, ActivityIndicator, Alert } from "react-native";
import { Text } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../lib/pagination";
import { posterUrl, getMovieWatchProviders, getWatchProvidersDisponibles, GrupoPlataforma } from "../lib/tmdb";
import { formatearFecha } from "../lib/dates";
import CalificarModal from "../components/CalificarModal";
import { toggleVistaPelicula } from "../lib/watchStatus";
import OrdenPeliculasModal from "../components/OrdenPeliculasModal";
import FiltroPendientesModal from "../components/FiltroPendientesModal";
import { promedioPuntuacionPeliculas } from "../lib/stats";

function diasHasta(fecha: string | null): number {
  if (!fecha) return 0;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const destino = new Date(fecha + "T00:00:00");
  return Math.max(0, Math.round((destino.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)));
}
import TopPills from "../components/TopPills";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type SubTab = "pendiente" | "proximamente";
type Vista = "grilla" | "lista";

interface PeliculaRow {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  watched: boolean;
  release_date: string | null;
  runtime_minutes: number | null;
  added_at: string;
  genre_ids: number[];
}

export default function MoviesScreen({ navigation }: any) {
  const { t } = useT();
  const [subTab, setSubTab] = useState<SubTab>("pendiente");
  const [vista, setVista] = useState<Vista>("grilla");
  const [orden, setOrden] = useState<"añadida" | "alfabetico" | "año" | "puntuacion_lavinola">("añadida");
  const [ascendente, setAscendente] = useState(false);
  const [ordenModalVisible, setOrdenModalVisible] = useState(false);
  const [filtroVisible, setFiltroVisible] = useState(false);
  const [generoId, setGeneroId] = useState<number | null>(null);
  const [plataformas, setPlataformas] = useState<string[]>([]);
  const [watchRegion, setWatchRegion] = useState("AR");
  const [todasLasPlataformas, setTodasLasPlataformas] = useState<GrupoPlataforma[]>([]);
  const [puntuaciones, setPuntuaciones] = useState<Record<number, number>>({});
  const [calificarModal, setCalificarModal] = useState<{ tmdbId: number; titulo: string; poster: string | null } | null>(null);
  const [movies, setMovies] = useState<PeliculaRow[]>([]);
  const [pendientesConPlataforma, setPendientesConPlataforma] = useState<Set<number> | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [])
  );

  async function cargar() {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;

      const { data: perfil } = await supabase.from("profiles").select("country").eq("id", userId).maybeSingle();
      if (perfil?.country) setWatchRegion(perfil.country);

      const data = await fetchAllRows((desde, hasta) =>
        supabase
          .from("user_movies")
          .select("watched, added_at, custom_poster_path, movies_cache(*)")
          .eq("user_id", userId)
          .order("added_at", { ascending: false })
          .range(desde, hasta)
      );

      const rows: PeliculaRow[] = (data ?? [])
        .filter((r: any) => r.movies_cache) // por si algún título no llegó a sincronizarse bien
        .map((r: any) => ({
          tmdb_id: r.movies_cache.tmdb_id,
          title: r.movies_cache.title,
          poster_path: r.custom_poster_path ?? r.movies_cache.poster_path,
          watched: r.watched,
          release_date: r.movies_cache.release_date,
          runtime_minutes: r.movies_cache.runtime_minutes,
          added_at: r.added_at,
          genre_ids: r.movies_cache.genre_ids ?? [],
        }));
      setMovies(rows);

      const puntuaciones = await promedioPuntuacionPeliculas(rows.map((r) => r.tmdb_id));
      setPuntuaciones(puntuaciones);
    } catch (e: any) {
      console.error("Error al cargar tus películas:", e);
      Alert.alert(t("No se pudieron cargar tus películas"), e.message ?? "Probá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function marcarVista(tmdbId: number, watched: boolean) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    await toggleVistaPelicula(userId, tmdbId, watched);
    cargar();
  }

  React.useEffect(() => {
    getWatchProvidersDisponibles("movie", watchRegion).then(setTodasLasPlataformas);
  }, [watchRegion]);

  React.useEffect(() => {
    if (plataformas.length === 0) {
      setPendientesConPlataforma(null); // null = no hay filtro de plataforma activo, se muestran todas
      return;
    }
    const esOtras = plataformas.includes("otras");
    const universoIds = todasLasPlataformas.filter((g) => g.clave !== "otras").flatMap((g) => g.provider_ids);
    const idsElegidos = esOtras ? [] : todasLasPlataformas.filter((g) => plataformas.includes(g.clave)).flatMap((g) => g.provider_ids);

    const hoy = new Date().toISOString().slice(0, 10);
    const candidatas = movies.filter((m) => !m.watched && (!m.release_date || m.release_date <= hoy));
    let cancelado = false;
    (async () => {
      const resultados = await Promise.all(
        candidatas.map(async (m) => {
          const p = await getMovieWatchProviders(m.tmdb_id, watchRegion);
          const idsDisponibles = (p?.flatrate ?? []).map((prov: any) => prov.provider_id);
          const coincideCurada = idsDisponibles.some((id: number) => (esOtras ? universoIds : idsElegidos).includes(id));
          return { id: m.tmdb_id, pasa: esOtras ? !coincideCurada : coincideCurada };
        })
      );
      if (!cancelado) setPendientesConPlataforma(new Set(resultados.filter((r) => r.pasa).map((r) => r.id)));
    })();
    return () => {
      cancelado = true;
    };
  }, [plataformas, movies, watchRegion, todasLasPlataformas]);

  const hoy = new Date().toISOString().slice(0, 10);
  let pendientesSinOrdenar = movies.filter((m) => !m.watched && (!m.release_date || m.release_date <= hoy));
  if (generoId !== null) pendientesSinOrdenar = pendientesSinOrdenar.filter((m) => m.genre_ids.includes(generoId));
  if (pendientesConPlataforma !== null) pendientesSinOrdenar = pendientesSinOrdenar.filter((m) => pendientesConPlataforma.has(m.tmdb_id));
  const pendientes = [...pendientesSinOrdenar].sort((a, b) => {
    let cmp = 0;
    if (orden === "añadida") cmp = a.added_at.localeCompare(b.added_at);
    else if (orden === "alfabetico") cmp = a.title.localeCompare(b.title);
    else if (orden === "año") cmp = (a.release_date ?? "").localeCompare(b.release_date ?? "");
    else if (orden === "puntuacion_lavinola") cmp = (puntuaciones[a.tmdb_id] ?? -1) - (puntuaciones[b.tmdb_id] ?? -1);
    return ascendente ? cmp : -cmp;
  });
  const proximas = movies
    .filter((m) => !m.watched && m.release_date && m.release_date > hoy)
    .sort((a, b) => (a.release_date! < b.release_date! ? -1 : 1));
  const listado = subTab === "pendiente" ? pendientes : proximas;

  return (
    <View style={styles.container}>
      <TopPills
        opciones={[
          { key: "pendiente", label: t("Lista pendiente") },
          { key: "proximamente", label: t("Próximamente") },
        ]}
        valor={subTab}
        onCambiar={setSubTab}
      />

      {subTab === "pendiente" && (
        <View style={styles.vistaToggleRow}>
          <Pressable onPress={() => setOrdenModalVisible(true)} style={styles.vistaToggleBtn}>
            <Ionicons name="swap-vertical" size={18} color={theme.colors.textMuted} />
          </Pressable>
          <Pressable onPress={() => setVista(vista === "grilla" ? "lista" : "grilla")} style={styles.vistaToggleBtn}>
            <Ionicons name={vista === "grilla" ? "list" : "grid"} size={18} color={theme.colors.textMuted} />
          </Pressable>
          <Pressable onPress={() => setFiltroVisible(true)} style={styles.vistaToggleBtn}>
            <Ionicons name="options" size={18} color={theme.colors.textMuted} />
            {(generoId !== null || plataformas.length > 0) && <View style={styles.filtroPuntito} />}
          </Pressable>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : subTab === "pendiente" && vista === "grilla" ? (
        <FlatList
          key="grilla"
          data={listado}
          keyExtractor={(item) => String(item.tmdb_id)}
          numColumns={3}
          contentContainerStyle={{ padding: 8 }}
          ListEmptyComponent={<Text style={styles.vacio}>{t("No tenés películas pendientes.")}</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.gridItem}
              onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: "movie" })}
            >
              <View style={{ position: "relative" }}>
                {item.poster_path ? (
                  <Image source={{ uri: posterUrl(item.poster_path, "w342")! }} style={styles.gridPoster} />
                ) : (
                  <View style={[styles.gridPoster, { backgroundColor: theme.colors.surfaceAlt }]} />
                )}
                {orden === "puntuacion_lavinola" && puntuaciones[item.tmdb_id] != null && (
                  <View style={styles.puntuacionOverlay}>
                    <Text style={styles.puntuacionOverlayTexto}>{puntuaciones[item.tmdb_id].toFixed(1).replace(/\.0$/, "")}</Text>
                    <Ionicons name="star" size={11} color={theme.colors.primaryLight} style={{ marginLeft: 2 }} />
                  </View>
                )}
              </View>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          key="lista"
          data={listado}
          keyExtractor={(item) => String(item.tmdb_id)}
          ListEmptyComponent={
            <Text style={styles.vacio}>
              {subTab === "pendiente" ? t("No tenés películas pendientes.") : t("No hay estrenos marcados todavía.")}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: "movie" })}
            >
              {item.poster_path && (
                <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.poster} />
              )}
              <View style={styles.cardInfo}>
                {subTab === "pendiente" ? (
                  <>
                    <Text style={styles.cardTitle}>
                      {item.title}
                      {item.release_date ? <Text style={styles.cardAnio}> ({item.release_date.slice(0, 4)})</Text> : null}
                    </Text>
                    {item.runtime_minutes ? (
                      <Text style={styles.cardSubChica}>{`${Math.floor(item.runtime_minutes / 60)} h ${item.runtime_minutes % 60} min`}</Text>
                    ) : null}
                    {orden === "puntuacion_lavinola" && puntuaciones[item.tmdb_id] != null && (
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                        <Text style={styles.puntuacionListaTexto}>{puntuaciones[item.tmdb_id].toFixed(1).replace(/\.0$/, "")}</Text>
                        <Ionicons name="star" size={12} color={theme.colors.primaryLight} style={{ marginLeft: 3 }} />
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardSub}>{t("Estreno: {fecha}").replace("{fecha}", formatearFecha(item.release_date))}</Text>
                  </>
                )}
              </View>
              {subTab === "proximamente" && diasHasta(item.release_date) > 0 && (
                <View style={styles.faltanCol}>
                  <Text style={styles.faltanTexto}>{t("Faltan")}</Text>
                  <Text style={styles.faltanNumero}>{diasHasta(item.release_date)}</Text>
                  <Text style={styles.faltanTexto}>{diasHasta(item.release_date) === 1 ? t("día") : t("días")}</Text>
                </View>
              )}
              {subTab === "pendiente" && (
                <Pressable
                  style={[styles.tildeBtn, item.watched && styles.tildeBtnMarcado]}
                  onPress={() => {
                    const nuevoValor = !item.watched;
                    marcarVista(item.tmdb_id, nuevoValor);
                    if (nuevoValor) setCalificarModal({ tmdbId: item.tmdb_id, titulo: item.title, poster: item.poster_path });
                  }}
                  hitSlop={10}
                >
                  <Text style={[styles.tildeTexto, item.watched && styles.tildeTextoMarcado]}>✓</Text>
                </Pressable>
              )}
            </Pressable>
          )}
        />
      )}
      <OrdenPeliculasModal
        visible={ordenModalVisible}
        onCerrar={() => setOrdenModalVisible(false)}
        orden={orden}
        ascendente={ascendente}
        onCambiar={(o, asc) => {
          setOrden(o);
          setAscendente(asc);
        }}
      />
      <FiltroPendientesModal
        visible={filtroVisible}
        onCerrar={() => setFiltroVisible(false)}
        watchRegion={watchRegion}
        generoActual={generoId}
        plataformasActuales={plataformas}
        onAplicar={(g, p) => {
          setGeneroId(g);
          setPlataformas(p);
          setFiltroVisible(false);
        }}
      />
      {calificarModal && (
        <CalificarModal
          visible={!!calificarModal}
          onCerrar={() => setCalificarModal(null)}
          tipo="movie"
          tmdbId={calificarModal.tmdbId}
          titulo={calificarModal.titulo}
          posterPath={calificarModal.poster}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  vistaToggleRow: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 12, paddingTop: 8, gap: 12 },
  vistaToggleBtn: { padding: 6 },
  filtroPuntito: { position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.primary },
  vacio: { textAlign: "center", marginTop: 32, color: theme.colors.textMuted },
  gridItem: { flex: 1 / 3, padding: 4 },
  gridPoster: { width: "100%", aspectRatio: 2 / 3, borderRadius: 6 },
  puntuacionOverlay: {
    position: "absolute",
    bottom: 4,
    right: 4,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#000000",
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  puntuacionOverlayTexto: { color: theme.colors.primaryLight, fontSize: 11, fontWeight: "800" },
  card: { flexDirection: "row", padding: 8, alignItems: "center" },
  poster: { width: 46, height: 69, borderRadius: 4, marginRight: 12, backgroundColor: theme.colors.surfaceAlt },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardAnio: { fontSize: 13, fontWeight: "400", color: theme.colors.textMuted },
  cardSub: { fontSize: 13, color: theme.colors.textMuted },
  cardSubChica: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  puntuacionListaTexto: { fontSize: 12, fontWeight: "800", color: theme.colors.primaryLight },
  faltanCol: { alignItems: "center", justifyContent: "center", marginLeft: 8, paddingLeft: 8 },
  faltanTexto: { fontSize: 11, color: "#FFFFFF", fontWeight: "600" },
  faltanNumero: { fontSize: 22, color: "#FFFFFF", fontWeight: "800", lineHeight: 26 },
  tildeBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.primary, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  tildeBtnMarcado: { backgroundColor: theme.colors.primary },
  tildeTexto: { color: theme.colors.primary, fontSize: 14, fontWeight: "700" },
  tildeTextoMarcado: { color: theme.colors.text },
});
