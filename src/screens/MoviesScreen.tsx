import React, { useCallback, useState } from "react";
import { View, FlatList, Image, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Alert } from "../lib/alert";
import { Text } from "../components/Themed";
import EstadoVacio from "../components/EstadoVacio";
import { impactoLiviano } from "../lib/haptics";
import { SkeletonPosterGrid } from "../components/SkeletonShapes";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { posterUrl, getWatchProvidersDisponibles, GrupoPlataforma } from "../lib/tmdb";
import { getMovieReleaseInfoCacheado, getMovieWatchProvidersCacheado } from "../lib/sync";
import { formatearFecha, hoyLocalISO } from "../lib/dates";
import CalificarModal from "../components/CalificarModal";
import { toggleVistaPelicula } from "../lib/watchStatus";
import OrdenPeliculasModal from "../components/OrdenPeliculasModal";
import FiltroPendientesModal from "../components/FiltroPendientesModal";
import { promedioPuntuacionPeliculas } from "../lib/stats";
import { cacheSincronicaPeliculas, obtenerPeliculas, actualizarCachePeliculas, cargarDatosPeliculas } from "../lib/moviesListCache";

function diasHasta(fecha: string | null): number {
  if (!fecha) return 0;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const destino = new Date(fecha + "T00:00:00");
  return Math.max(0, Math.round((destino.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)));
}
import TopPills from "../components/TopPills";
import AgregarButton from "../components/AgregarButton";
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
  first_watched_at: string | null;
}

export default function MoviesScreen({ navigation }: any) {
  const { t } = useT();
  const [subTab, setSubTab] = useState<SubTab>("pendiente");
  const [vista, setVista] = useState<Vista>("grilla");
  const [orden, setOrden] = useState<"añadida" | "alfabetico" | "año" | "puntuacion_lavinola">("año");
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
  const [infoEstreno, setInfoEstreno] = useState<Record<number, { fecha: string | null; tipo: string | null; plataforma: string | null }>>({});
  const [cargandoInfoProximamente, setCargandoInfoProximamente] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [])
  );

  async function cargar() {
    const { data: userData } = await supabase.auth.getSession();
    const userId = userData.session?.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }

    // Si ya se había precargado en segundo plano (al abrir la app, o en
    // una visita anterior a esta pantalla), lo pintamos al toque en vez
    // de mostrar el spinner y esperar de nuevo — y de todas formas
    // seguimos abajo pidiendo la versión más fresca en segundo plano.
    const yaListo = cacheSincronicaPeliculas(userId);
    if (yaListo) {
      setWatchRegion(yaListo.watchRegion);
      setMovies(yaListo.movies);
      setPuntuaciones(yaListo.puntuaciones);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const datos = yaListo ? await cargarDatosPeliculas(userId) : await obtenerPeliculas(userId);
      setWatchRegion(datos.watchRegion);
      setMovies(datos.movies);
      setPuntuaciones(datos.puntuaciones);
      actualizarCachePeliculas(userId, datos);
    } catch (e: any) {
      console.error("Error al cargar tus películas:", e);
      Alert.alert(t("No se pudieron cargar tus películas"), e.message ?? t("Probá de nuevo."));
    } finally {
      if (!yaListo) setLoading(false);
    }
  }

  async function marcarVista(tmdbId: number, watched: boolean) {
    const { data: userData } = await supabase.auth.getSession();
    const userId = userData.session?.user?.id;
    if (!userId) return;
    if (watched) impactoLiviano();
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

    const hoy = hoyLocalISO();
    const candidatas = movies.filter((m) => !m.watched && (!m.release_date || m.release_date <= hoy));
    let cancelado = false;
    (async () => {
      const resultados = await Promise.all(
        candidatas.map(async (m) => {
          const p = await getMovieWatchProvidersCacheado(m.tmdb_id, watchRegion);
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

  // Para "Lista pendiente" en modo lista: qué plataformas tenés disponibles
  // para cada título en tu país, para mostrarlo chiquito debajo de la
  // duración (solo si hay alguna — si no, no se muestra nada).
  const [plataformasPendientes, setPlataformasPendientes] = useState<Record<number, string[]>>({});
  React.useEffect(() => {
    if (subTab !== "pendiente") return;
    const hoyStr = hoyLocalISO();
    const idsPendientes = [...new Set(movies.filter((m) => !m.watched && (!m.release_date || m.release_date <= hoyStr)).map((m) => m.tmdb_id))];
    const faltan = idsPendientes.filter((id) => !plataformasPendientes[id]);
    if (faltan.length === 0) return;
    let cancelado = false;
    (async () => {
      const resultados = await Promise.all(
        faltan.map(async (id) => {
          const p = await getMovieWatchProvidersCacheado(id, watchRegion);
          return { id, nombres: (p?.flatrate ?? []).map((prov: any) => prov.provider_name) };
        })
      );
      if (!cancelado) {
        setPlataformasPendientes((prev) => {
          const nuevo = { ...prev };
          resultados.forEach((r) => {
            nuevo[r.id] = r.nombres;
          });
          return nuevo;
        });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [subTab, movies, watchRegion]);

  // Para la pestaña "Próximamente": de dónde sale realmente (cine o una
  // plataforma puntual) según el país del usuario — movies_cache.release_date
  // es una fecha "genérica" que puede no coincidir con la de acá.
  React.useEffect(() => {
    if (subTab !== "proximamente") return;
    const hoyStr = hoyLocalISO();
    const idsProximas = [...new Set(movies.filter((m) => !m.watched && m.release_date && m.release_date > hoyStr).map((m) => m.tmdb_id))];
    const faltan = idsProximas.filter((id) => !infoEstreno[id]);
    if (faltan.length === 0) {
      setCargandoInfoProximamente(false);
      return;
    }
    setCargandoInfoProximamente(true);
    let cancelado = false;
    (async () => {
      const resultados = await Promise.all(
        faltan.map(async (id) => {
          const info = await getMovieReleaseInfoCacheado(id, watchRegion);
          let plataforma: string | null = null;
          if (info.tipo === "digital") {
            const providers = await getMovieWatchProvidersCacheado(id, watchRegion);
            plataforma = providers?.flatrate?.[0]?.provider_name ?? null;
          }
          return { id, fecha: info.fecha, tipo: info.tipo, plataforma };
        })
      );
      if (!cancelado) {
        setInfoEstreno((prev) => {
          const nuevo = { ...prev };
          resultados.forEach((r) => {
            nuevo[r.id] = { fecha: r.fecha, tipo: r.tipo, plataforma: r.plataforma };
          });
          return nuevo;
        });
        setCargandoInfoProximamente(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [subTab, movies, watchRegion]);

  const hoy = hoyLocalISO();
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
    .sort((a, b) => {
      const fechaA = infoEstreno[a.tmdb_id]?.fecha ?? a.release_date!;
      const fechaB = infoEstreno[b.tmdb_id]?.fecha ?? b.release_date!;
      return fechaA < fechaB ? -1 : 1;
    });
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
          <AgregarButton navigation={navigation} />
          <View style={{ flexDirection: "row", gap: 12 }}>
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
        </View>
      )}

      {loading || (subTab === "proximamente" && cargandoInfoProximamente) ? (
        <SkeletonPosterGrid />
      ) : subTab === "pendiente" && vista === "grilla" ? (
        <FlatList
          key="grilla"
          data={listado}
          keyExtractor={(item) => String(item.tmdb_id)}
          numColumns={3}
          contentContainerStyle={{ padding: 8 }}
          ListEmptyComponent={<EstadoVacio icono="film-outline" titulo={t("No tenés películas pendientes.")} />}
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
            <EstadoVacio icono="film-outline" titulo={subTab === "pendiente" ? t("No tenés películas pendientes.") : t("No hay estrenos marcados todavía.")} />
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
                    {plataformasPendientes[item.tmdb_id]?.length ? (
                      <Text style={styles.cardSubChica}>{plataformasPendientes[item.tmdb_id].join(", ")}</Text>
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
                    <Text style={styles.cardSub}>
                      {t("Estreno: {fecha}").replace("{fecha}", formatearFecha(infoEstreno[item.tmdb_id]?.fecha ?? item.release_date))}
                    </Text>
                    {infoEstreno[item.tmdb_id]?.tipo === "cine" && <Text style={styles.cardSubChica}>{t("Cine")}</Text>}
                    {infoEstreno[item.tmdb_id]?.tipo === "digital" && infoEstreno[item.tmdb_id]?.plataforma && (
                      <Text style={styles.cardSubChica}>{infoEstreno[item.tmdb_id]!.plataforma}</Text>
                    )}
                  </>
                )}
              </View>
              {subTab === "proximamente" &&
                (() => {
                  // Mismo criterio que la fecha de arriba: si hay fecha para
                  // tu país, la cuenta de "Faltan X días" tiene que usar ESA
                  // fecha — si no, se desincroniza con lo que se ve en pantalla.
                  const fechaParaContar = infoEstreno[item.tmdb_id]?.fecha ?? item.release_date;
                  const dias = diasHasta(fechaParaContar);
                  return (
                    dias > 0 && (
                      <View style={styles.faltanCol}>
                        <Text style={styles.faltanTexto}>{dias === 1 ? t("Falta") : t("Faltan")}</Text>
                        <Text style={styles.faltanNumero}>{dias}</Text>
                        <Text style={styles.faltanTexto}>{dias === 1 ? t("día") : t("días")}</Text>
                      </View>
                    )
                  );
                })()}
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
                  <Ionicons name="eye" size={16} color={item.watched ? theme.colors.text : theme.colors.primary} />
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
          onCerrar={() => {
            setCalificarModal(null);
            cargar();
          }}
          tipo="movie"
          tmdbId={calificarModal.tmdbId}
          titulo={calificarModal.titulo}
          posterPath={calificarModal.poster}
          navigation={navigation}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  vistaToggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingTop: 8, gap: 12 },
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
