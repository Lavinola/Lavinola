import React, { useEffect, useRef, useState } from "react";
import { View, Modal, TextInput, FlatList, Image, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import { searchMovies, searchSeries, getSeriesDetails, getSeasonEpisodes, posterUrl, getTmdbLanguage } from "../lib/tmdb";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export interface SeleccionTitulo {
  itemType: "series" | "movie" | "episode";
  tmdbId: number;
  nombre: string;
  posterPath: string | null;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeName?: string | null;
}

interface Props {
  visible: boolean;
  onCerrar: () => void;
  onSeleccionar: (s: SeleccionTitulo) => void;
}

export default function TituloPickerModal({ visible, onCerrar, onSeleccionar }: Props) {
  const { t } = useT();
  const [tab, setTab] = useState<"movie" | "series">("movie");
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si eligió una serie, preguntamos si es sobre la serie entera o un capítulo puntual.
  const [serieParaCapitulo, setSerieParaCapitulo] = useState<{ tmdbId: number; nombre: string; posterPath: string | null } | null>(null);
  const [temporadas, setTemporadas] = useState<{ season_number: number; episode_count: number }[]>([]);
  const [cargandoTemporadas, setCargandoTemporadas] = useState(false);
  const [temporadaElegida, setTemporadaElegida] = useState<number | null>(null);
  const [episodios, setEpisodios] = useState<{ episode_number: number; name: string | null }[]>([]);
  const [cargandoEpisodios, setCargandoEpisodios] = useState(false);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResultados([]);
      setSerieParaCapitulo(null);
      setTemporadas([]);
      setTemporadaElegida(null);
      setEpisodios([]);
    }
  }, [visible]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResultados([]);
      return;
    }
    debounceRef.current = setTimeout(buscar, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tab]);

  async function buscar() {
    setCargando(true);
    try {
      const idioma = getTmdbLanguage();
      const data = tab === "movie" ? await searchMovies(query.trim(), idioma) : await searchSeries(query.trim(), idioma);
      setResultados((data?.results ?? []).slice(0, 20));
    } catch (e) {
      console.error("Error buscando títulos para la encuesta:", e);
    } finally {
      setCargando(false);
    }
  }

  function elegir(item: any) {
    if (tab === "movie") {
      onSeleccionar({ itemType: "movie", tmdbId: item.id, nombre: item.title, posterPath: item.poster_path ?? null });
      onCerrar();
    } else {
      setSerieParaCapitulo({ tmdbId: item.id, nombre: item.name, posterPath: item.poster_path ?? null });
      cargarTemporadas(item.id);
    }
  }

  async function cargarTemporadas(tmdbId: number) {
    setCargandoTemporadas(true);
    try {
      const detalle = await getSeriesDetails(tmdbId, getTmdbLanguage());
      const lista = (detalle?.seasons ?? [])
        .filter((s: any) => s.season_number > 0 && s.episode_count > 0) // sin "Especiales"
        .map((s: any) => ({ season_number: s.season_number, episode_count: s.episode_count }));
      setTemporadas(lista);
    } catch (e) {
      console.error("Error al cargar temporadas:", e);
    } finally {
      setCargandoTemporadas(false);
    }
  }

  async function elegirTemporada(temporada: number) {
    setTemporadaElegida(temporada);
    setEpisodios([]);
    if (!serieParaCapitulo) return;
    setCargandoEpisodios(true);
    try {
      const detalle = await getSeasonEpisodes(serieParaCapitulo.tmdbId, temporada);
      setEpisodios((detalle?.episodes ?? []).map((e: any) => ({ episode_number: e.episode_number, name: e.name ?? null })));
    } catch (e) {
      console.error("Error al cargar capítulos:", e);
    } finally {
      setCargandoEpisodios(false);
    }
  }

  function elegirCapitulo(ep: { episode_number: number; name: string | null }) {
    if (!serieParaCapitulo || temporadaElegida == null) return;
    onSeleccionar({
      itemType: "episode",
      tmdbId: serieParaCapitulo.tmdbId,
      nombre: serieParaCapitulo.nombre,
      posterPath: serieParaCapitulo.posterPath,
      seasonNumber: temporadaElegida,
      episodeNumber: ep.episode_number,
      episodeName: ep.name,
    });
    onCerrar();
  }

  function confirmarSerieCompleta() {
    if (!serieParaCapitulo) return;
    onSeleccionar({ itemType: "series", tmdbId: serieParaCapitulo.tmdbId, nombre: serieParaCapitulo.nombre, posterPath: serieParaCapitulo.posterPath });
    onCerrar();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.caja} onPress={() => {}}>
          {serieParaCapitulo ? (
            <View>
              <View style={styles.serieHeaderRow}>
                {serieParaCapitulo.posterPath && <Image source={{ uri: posterUrl(serieParaCapitulo.posterPath, "w185")! }} style={styles.miniPoster} />}
                <Text style={styles.serieHeaderTexto} numberOfLines={2}>
                  {serieParaCapitulo.nombre}
                </Text>
              </View>
              <Pressable style={styles.opcionBtn} onPress={confirmarSerieCompleta}>
                <Text style={styles.opcionBtnTexto}>{t("Usar toda la serie")}</Text>
              </Pressable>
              <Text style={styles.oTexto}>{t("o elegí un capítulo puntual")}:</Text>
              {cargandoTemporadas ? (
                <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 10 }} />
              ) : (
                <>
                  <FlatList
                    horizontal
                    data={temporadas}
                    keyExtractor={(s) => String(s.season_number)}
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 10 }}
                    renderItem={({ item: s }) => (
                      <Pressable
                        onPress={() => elegirTemporada(s.season_number)}
                        style={[styles.temporadaPill, temporadaElegida === s.season_number && styles.temporadaPillActiva]}
                      >
                        <Text style={[styles.temporadaPillTexto, temporadaElegida === s.season_number && styles.temporadaPillTextoActiva]}>
                          T{s.season_number}
                        </Text>
                      </Pressable>
                    )}
                  />
                  {cargandoEpisodios ? (
                    <ActivityIndicator color={theme.colors.primary} />
                  ) : (
                    temporadaElegida != null && (
                      <FlatList
                        data={episodios}
                        keyExtractor={(e) => String(e.episode_number)}
                        style={{ maxHeight: 220 }}
                        renderItem={({ item: ep }) => (
                          <Pressable style={styles.episodioFila} onPress={() => elegirCapitulo(ep)}>
                            <Text style={styles.episodioTexto} numberOfLines={1}>
                              E{ep.episode_number}
                              {ep.name ? `: ${ep.name}` : ""}
                            </Text>
                          </Pressable>
                        )}
                      />
                    )
                  )}
                </>
              )}
              <Pressable style={styles.volverBtn} onPress={() => setSerieParaCapitulo(null)}>
                <Text style={styles.volverBtnTexto}>{t("Volver a buscar")}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ maxHeight: 480 }}>
              <View style={styles.tabsRow}>
                <Pressable style={[styles.tab, tab === "movie" && styles.tabActivo]} onPress={() => setTab("movie")}>
                  <Text style={tab === "movie" ? styles.tabTextoActivo : styles.tabTexto}>{t("Películas")}</Text>
                </Pressable>
                <Pressable style={[styles.tab, tab === "series" && styles.tabActivo]} onPress={() => setTab("series")}>
                  <Text style={tab === "series" ? styles.tabTextoActivo : styles.tabTexto}>{t("Series")}</Text>
                </Pressable>
              </View>
              <TextInput
                style={styles.buscador}
                placeholder={t("Buscar título...")}
                placeholderTextColor={theme.colors.textFaint}
                value={query}
                onChangeText={setQuery}
                autoFocus
              />
              {cargando ? (
                <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 16 }} />
              ) : (
                <FlatList
                  data={resultados}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={({ item }) => (
                    <Pressable style={styles.resultadoFila} onPress={() => elegir(item)}>
                      {item.poster_path ? (
                        <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.miniPoster} />
                      ) : (
                        <View style={[styles.miniPoster, styles.miniPosterVacio]} />
                      )}
                      <Text style={styles.resultadoTexto} numberOfLines={2}>
                        {tab === "movie" ? item.title : item.name}
                      </Text>
                    </Pressable>
                  )}
                />
              )}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  caja: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 16, maxHeight: "80%" },
  tabsRow: { flexDirection: "row", marginBottom: 10, gap: 8 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceAlt },
  tabActivo: { backgroundColor: theme.colors.primary },
  tabTexto: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted },
  tabTextoActivo: { fontSize: 13, fontWeight: "700", color: "#000000" },
  buscador: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 10,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceAlt,
    marginBottom: 10,
  },
  resultadoFila: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 10 },
  miniPoster: { width: 40, height: 58, borderRadius: 4, backgroundColor: theme.colors.surfaceAlt },
  miniPosterVacio: {},
  resultadoTexto: { flex: 1, fontSize: 14 },
  serieHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  serieHeaderTexto: { flex: 1, fontSize: 15, fontWeight: "700" },
  opcionBtn: { backgroundColor: theme.colors.primary, borderRadius: 8, paddingVertical: 10, alignItems: "center", marginBottom: 10 },
  opcionBtnDeshabilitado: { opacity: 0.4 },
  opcionBtnTexto: { color: "#000000", fontWeight: "700", fontSize: 13 },
  oTexto: { fontSize: 12, color: theme.colors.textMuted, textAlign: "center", marginBottom: 10 },
  temporadaPill: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, marginRight: 8 },
  temporadaPillActiva: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  temporadaPillTexto: { fontSize: 13, color: theme.colors.textMuted, fontWeight: "700" },
  temporadaPillTextoActiva: { color: "#000000" },
  episodioFila: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceAlt, marginBottom: 6 },
  episodioTexto: { fontSize: 13 },
  volverBtn: { alignItems: "center", paddingVertical: 6, marginTop: 6 },
  volverBtnTexto: { fontSize: 12, color: theme.colors.textMuted },
});
