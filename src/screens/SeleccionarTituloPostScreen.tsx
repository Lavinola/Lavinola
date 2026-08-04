import React, { useEffect, useState } from "react";
import { View, TextInput, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import TopPills from "../components/TopPills";
import PublishActionModal from "../components/PublishActionModal";
import CrearEncuestaModal from "../components/CrearEncuestaModal";
import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../lib/pagination";
import { posterUrl } from "../lib/tmdb";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface ItemPropio {
  tmdb_id: number;
  nombre: string;
  poster_path: string | null;
}

interface Seleccion {
  itemType: "series" | "movie" | "episode";
  tmdbId: number;
  nombre: string;
  subtitulo: string | null;
  posterPath: string | null;
  seasonNumber?: number;
  episodeNumber?: number;
}

export default function SeleccionarTituloPostScreen({ navigation }: any) {
  const { t } = useT();
  const [tipo, setTipo] = useState<"movie" | "series" | "poll">("movie");
  const [busqueda, setBusqueda] = useState("");
  const [items, setItems] = useState<ItemPropio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [serieElegida, setSerieElegida] = useState<ItemPropio | null>(null);
  const [elegirCapitulo, setElegirCapitulo] = useState(false);
  const [temporadas, setTemporadas] = useState<number[]>([]);
  const [temporadaElegida, setTemporadaElegida] = useState<number | null>(null);
  const [episodios, setEpisodios] = useState<{ episode_number: number; name: string | null }[]>([]);
  const [cargandoEpisodios, setCargandoEpisodios] = useState(false);

  const [publishModalVisible, setPublishModalVisible] = useState(false);
  const [crearEncuestaVisible, setCrearEncuestaVisible] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (userId && tipo !== "poll") cargar();
  }, [tipo, userId]);

  async function cargar() {
    if (!userId) return;
    setCargando(true);
    if (tipo === "movie") {
      const filas = await fetchAllRows<any>((desde, hasta) =>
        supabase.from("user_movies").select("movie_tmdb_id, movies_cache(title, poster_path)").eq("user_id", userId).range(desde, hasta)
      );
      const lista: ItemPropio[] = filas.map((r: any) => ({
        tmdb_id: r.movie_tmdb_id,
        nombre: r.movies_cache?.title ?? "—",
        poster_path: r.movies_cache?.poster_path ?? null,
      }));
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setItems(lista);
    } else {
      const filas = await fetchAllRows<any>((desde, hasta) =>
        supabase.from("user_series").select("series_tmdb_id, series_cache(name, poster_path)").eq("user_id", userId).range(desde, hasta)
      );
      const lista: ItemPropio[] = filas.map((r: any) => ({
        tmdb_id: r.series_tmdb_id,
        nombre: r.series_cache?.name ?? "—",
        poster_path: r.series_cache?.poster_path ?? null,
      }));
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setItems(lista);
    }
    setCargando(false);
  }

  function elegirMovie(item: ItemPropio) {
    setSeleccion({ itemType: "movie", tmdbId: item.tmdb_id, nombre: item.nombre, subtitulo: null, posterPath: item.poster_path });
  }

  function elegirSerieCompleta(item: ItemPropio) {
    setSeleccion({ itemType: "series", tmdbId: item.tmdb_id, nombre: item.nombre, subtitulo: null, posterPath: item.poster_path });
  }

  async function tocarSerie(item: ItemPropio) {
    setSerieElegida(item);
    setElegirCapitulo(false);
    setSeleccion({ itemType: "series", tmdbId: item.tmdb_id, nombre: item.nombre, subtitulo: null, posterPath: item.poster_path });
    setTemporadaElegida(null);
    setEpisodios([]);
    const { data } = await supabase.from("episodes_cache").select("season_number").eq("series_tmdb_id", item.tmdb_id);
    const unicas = [...new Set((data ?? []).map((r: any) => r.season_number))].sort((a, b) => a - b);
    setTemporadas(unicas);
  }

  async function elegirTemporada(temporada: number) {
    if (!serieElegida) return;
    setTemporadaElegida(temporada);
    setCargandoEpisodios(true);
    const { data } = await supabase
      .from("episodes_cache")
      .select("episode_number, name")
      .eq("series_tmdb_id", serieElegida.tmdb_id)
      .eq("season_number", temporada)
      .order("episode_number");
    setEpisodios(data ?? []);
    setCargandoEpisodios(false);
  }

  function elegirEpisodio(ep: { episode_number: number; name: string | null }) {
    if (!serieElegida || temporadaElegida == null) return;
    setSeleccion({
      itemType: "episode",
      tmdbId: serieElegida.tmdb_id,
      nombre: serieElegida.nombre,
      subtitulo: `T${temporadaElegida} · E${ep.episode_number}${ep.name ? `: ${ep.name}` : ""}`,
      posterPath: serieElegida.poster_path,
      seasonNumber: temporadaElegida,
      episodeNumber: ep.episode_number,
    });
  }

  function cambiarTitulo() {
    setSeleccion(null);
    setSerieElegida(null);
    setElegirCapitulo(false);
    setTemporadaElegida(null);
    setEpisodios([]);
  }

  function alternarElegirCapitulo() {
    if (!serieElegida) return;
    const nuevoValor = !elegirCapitulo;
    setElegirCapitulo(nuevoValor);
    if (!nuevoValor) elegirSerieCompleta(serieElegida);
  }

  const filtrados = busqueda.trim() ? items.filter((i) => i.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())) : items;
  const faltaElegirCapitulo = !!seleccion && seleccion.itemType === "series" && elegirCapitulo;

  // --- Paso 2: ya se eligió algo, mostrar la tarjeta + botón de continuar ---
  if (seleccion) {
    return (
      <View style={styles.container}>
        <View style={styles.seleccionCard}>
          {seleccion.posterPath ? (
            <Image source={{ uri: posterUrl(seleccion.posterPath, "w185")! }} style={styles.poster} />
          ) : (
            <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.seleccionNombre} numberOfLines={2}>
              {seleccion.nombre}
            </Text>
            {seleccion.subtitulo && <Text style={styles.seleccionSub}>{seleccion.subtitulo}</Text>}
          </View>
        </View>

        {serieElegida && (
          <>
            <Pressable style={styles.checkboxRow} onPress={alternarElegirCapitulo}>
              <View style={[styles.checkbox, elegirCapitulo && styles.checkboxActivo]}>
                {elegirCapitulo && <Text style={styles.checkboxTilde}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>{t("Elegir un capítulo")}</Text>
            </Pressable>

            {elegirCapitulo && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.subtitulo2}>{t("Temporada")}</Text>
                <FlatList
                  horizontal
                  data={temporadas}
                  keyExtractor={(n) => String(n)}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 6 }}
                  renderItem={({ item: n }) => (
                    <Pressable
                      style={[styles.temporadaPill, temporadaElegida === n && styles.temporadaPillActiva]}
                      onPress={() => elegirTemporada(n)}
                    >
                      <Text style={[styles.temporadaPillTexto, temporadaElegida === n && styles.temporadaPillTextoActiva]}>T{n}</Text>
                    </Pressable>
                  )}
                />
                {cargandoEpisodios ? (
                  <ActivityIndicator style={{ marginTop: 12 }} />
                ) : (
                  temporadaElegida != null && (
                    <FlatList
                      data={episodios}
                      keyExtractor={(e) => String(e.episode_number)}
                      style={{ maxHeight: 260, marginTop: 8 }}
                      renderItem={({ item: ep }) => (
                        <Pressable
                          style={[
                            styles.episodioFila,
                            seleccion.itemType === "episode" && seleccion.episodeNumber === ep.episode_number && styles.episodioFilaActiva,
                          ]}
                          onPress={() => elegirEpisodio(ep)}
                        >
                          <Text style={styles.episodioTexto} numberOfLines={1}>
                            E{ep.episode_number}
                            {ep.name ? `: ${ep.name}` : ""}
                          </Text>
                        </Pressable>
                      )}
                    />
                  )
                )}
              </View>
            )}
          </>
        )}

        <Pressable onPress={cambiarTitulo} style={{ marginTop: 12 }}>
          <Text style={styles.cambiarTexto}>{t("Elegir otro título")}</Text>
        </Pressable>

        <View style={{ flex: 1 }} />
        <Pressable
          style={[styles.publicarBtn, faltaElegirCapitulo && !seleccion.seasonNumber && styles.publicarBtnDeshabilitado]}
          disabled={faltaElegirCapitulo && !seleccion.seasonNumber}
          onPress={() => setPublishModalVisible(true)}
        >
          <Text style={styles.publicarBtnTexto}>{t("Continuar")}</Text>
        </Pressable>

        <PublishActionModal
          visible={publishModalVisible}
          onCerrar={() => {
            setPublishModalVisible(false);
            navigation.goBack();
          }}
          navigation={navigation}
          modoInicial="publicar"
          publicarParams={{
            itemType: seleccion.itemType,
            tmdbId: seleccion.tmdbId,
            seasonNumber: seleccion.seasonNumber ?? null,
            episodeNumber: seleccion.episodeNumber ?? null,
          }}
        />
      </View>
    );
  }

  // --- Paso 1: elegir de qué querés hablar ---
  return (
    <View style={styles.container}>
      <TopPills
        variante="rect"
        opciones={[
          { key: "movie", label: t("Películas") },
          { key: "series", label: t("Series") },
          { key: "poll", label: t("Encuesta") },
        ]}
        valor={tipo}
        onCambiar={(v) => {
          setTipo(v as "movie" | "series" | "poll");
          setBusqueda("");
        }}
      />
      {tipo === "poll" ? (
        <View style={styles.encuestaWrap}>
          <Text style={styles.encuestaTexto}>{t("Compartí una encuesta con todos en el Lobby.")}</Text>
          <Pressable style={styles.crearEncuestaBtn} onPress={() => setCrearEncuestaVisible(true)}>
            <Text style={styles.crearEncuestaBtnTexto}>{t("Crear encuesta")}</Text>
          </Pressable>
          {userId && (
            <CrearEncuestaModal
              visible={crearEncuestaVisible}
              onCerrar={() => setCrearEncuestaVisible(false)}
              userId={userId}
              onCreada={() => navigation.goBack()}
            />
          )}
        </View>
      ) : (
        <>
          <View style={styles.buscadorWrap}>
            <Ionicons name="search" size={16} color={theme.colors.textFaint} />
            <TextInput
              style={styles.buscador}
              placeholder={tipo === "movie" ? t("Buscar en tus películas...") : t("Buscar en tus series...")}
              placeholderTextColor={theme.colors.textFaint}
              value={busqueda}
              onChangeText={setBusqueda}
            />
          </View>
          {cargando ? (
            <ActivityIndicator style={{ marginTop: 32 }} />
          ) : (
            <FlatList
              keyboardShouldPersistTaps="handled"
              data={filtrados}
              keyExtractor={(i) => String(i.tmdb_id)}
              contentContainerStyle={{ padding: 12 }}
              ListEmptyComponent={
                <Text style={styles.vacio}>
                  {tipo === "movie" ? t("Todavía no agregaste ninguna película a tu perfil.") : t("Todavía no agregaste ninguna serie a tu perfil.")}
                </Text>
              }
              renderItem={({ item }) => (
                <Pressable style={styles.fila} onPress={() => (tipo === "movie" ? elegirMovie(item) : tocarSerie(item))}>
                  {item.poster_path ? (
                    <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.poster} />
                  ) : (
                    <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
                  )}
                  <Text style={styles.nombre} numberOfLines={2}>
                    {item.nombre}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </Pressable>
              )}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 12 },
  encuestaWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  encuestaTexto: { fontSize: 14, color: theme.colors.textMuted, textAlign: "center", marginBottom: 20 },
  crearEncuestaBtn: { backgroundColor: theme.colors.primary, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24 },
  crearEncuestaBtnTexto: { color: "#000000", fontWeight: "700", fontSize: 14 },
  buscadorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  buscador: { flex: 1, color: theme.colors.text, paddingVertical: 10, fontSize: 14 },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24, paddingHorizontal: 24 },
  fila: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 12 },
  poster: { width: 46, height: 69, borderRadius: 6 },
  nombre: { flex: 1, fontSize: 14 },
  seleccionCard: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 10, gap: 12, marginTop: 10 },
  seleccionNombre: { fontSize: 15, fontWeight: "700" },
  seleccionSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 3 },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" },
  checkboxActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  checkboxTilde: { color: "#000000", fontWeight: "800", fontSize: 13 },
  checkboxLabel: { fontSize: 14, fontWeight: "600" },
  subtitulo2: { fontSize: 12, color: theme.colors.textMuted, fontWeight: "700", textTransform: "uppercase" },
  temporadaPill: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border },
  temporadaPillActiva: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  temporadaPillTexto: { fontSize: 13, color: theme.colors.textMuted, fontWeight: "700" },
  temporadaPillTextoActiva: { color: "#000000" },
  episodioFila: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surface, marginBottom: 6 },
  episodioFilaActiva: { borderWidth: 1.5, borderColor: theme.colors.primary },
  episodioTexto: { fontSize: 13 },
  cambiarTexto: { fontSize: 13, color: theme.colors.primaryLight, fontWeight: "700", textAlign: "center" },
  publicarBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: 14, alignItems: "center", marginTop: 12 },
  publicarBtnDeshabilitado: { opacity: 0.4 },
  publicarBtnTexto: { color: "#000000", fontWeight: "800", fontSize: 15 },
});
