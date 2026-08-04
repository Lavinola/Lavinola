import React, { useEffect, useRef, useState } from "react";
import { View, Modal, TextInput, FlatList, Image, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import { searchMovies, searchSeries, posterUrl, getTmdbLanguage } from "../lib/tmdb";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export interface SeleccionTitulo {
  itemType: "series" | "movie" | "episode";
  tmdbId: number;
  nombre: string;
  posterPath: string | null;
  seasonNumber?: number;
  episodeNumber?: number;
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
  const [temporada, setTemporada] = useState("");
  const [capitulo, setCapitulo] = useState("");

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResultados([]);
      setSerieParaCapitulo(null);
      setTemporada("");
      setCapitulo("");
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
    }
  }

  function confirmarSerieCompleta() {
    if (!serieParaCapitulo) return;
    onSeleccionar({ itemType: "series", tmdbId: serieParaCapitulo.tmdbId, nombre: serieParaCapitulo.nombre, posterPath: serieParaCapitulo.posterPath });
    onCerrar();
  }

  function confirmarCapitulo() {
    if (!serieParaCapitulo) return;
    const t = parseInt(temporada, 10);
    const c = parseInt(capitulo, 10);
    if (!t || !c) return;
    onSeleccionar({
      itemType: "episode",
      tmdbId: serieParaCapitulo.tmdbId,
      nombre: `${serieParaCapitulo.nombre} — T${t} · E${c}`,
      posterPath: serieParaCapitulo.posterPath,
      seasonNumber: t,
      episodeNumber: c,
    });
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
              <View style={styles.filaNumeros}>
                <TextInput
                  style={styles.inputNumero}
                  placeholder={t("Temporada")}
                  placeholderTextColor={theme.colors.textFaint}
                  value={temporada}
                  onChangeText={setTemporada}
                  keyboardType="number-pad"
                />
                <TextInput
                  style={styles.inputNumero}
                  placeholder={t("Capítulo")}
                  placeholderTextColor={theme.colors.textFaint}
                  value={capitulo}
                  onChangeText={setCapitulo}
                  keyboardType="number-pad"
                />
              </View>
              <Pressable
                style={[styles.opcionBtn, (!temporada || !capitulo) && styles.opcionBtnDeshabilitado]}
                disabled={!temporada || !capitulo}
                onPress={confirmarCapitulo}
              >
                <Text style={styles.opcionBtnTexto}>{t("Usar este capítulo")}</Text>
              </Pressable>
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
  filaNumeros: { flexDirection: "row", gap: 8, marginBottom: 10 },
  inputNumero: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 10,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceAlt,
  },
  volverBtn: { alignItems: "center", paddingVertical: 6 },
  volverBtnTexto: { fontSize: 12, color: theme.colors.textMuted },
});
