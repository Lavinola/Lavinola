import React, { useEffect, useState } from "react";
import { View, TextInput, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import TopPills from "../components/TopPills";
import PublishActionModal from "../components/PublishActionModal";
import CrearEncuestaModal from "../components/CrearEncuestaModal";
import SeriesProgressBar from "../components/SeriesProgressBar";
import RatingStars from "../components/RatingStars";
import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../lib/pagination";
import { posterUrl } from "../lib/tmdb";
import { progresoDeSeries } from "../lib/seriesList";
import { SeriesStatusFilter } from "../types";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface ItemPropio {
  tmdb_id: number;
  nombre: string;
  poster_path: string | null;
  // Películas
  watched?: boolean;
  runtime_minutes?: number | null;
  // Series
  estado?: SeriesStatusFilter;
  porcentaje?: number;
  total_seasons?: number;
  // Comunes
  anio?: string | null;
  rating?: number | null;
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

interface TemporadaConEstado {
  season: number;
  completa: boolean; // ya se estrenaron todos sus capítulos según TMDB
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
  const [modoSeleccion, setModoSeleccion] = useState<"serie" | "temporada" | "capitulo">("serie");
  const [temporadas, setTemporadas] = useState<TemporadaConEstado[]>([]);
  const [temporadaElegida, setTemporadaElegida] = useState<number | null>(null);
  const [episodios, setEpisodios] = useState<{ episode_number: number; name: string | null; air_date: string | null }[]>([]);
  const [cargandoEpisodios, setCargandoEpisodios] = useState(false);

  const [publishModalVisible, setPublishModalVisible] = useState(false);
  const [crearEncuestaVisible, setCrearEncuestaVisible] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
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
        supabase
          .from("user_movies")
          .select("movie_tmdb_id, watched, rating, movies_cache(title, poster_path, release_date, runtime_minutes)")
          .eq("user_id", userId)
          .range(desde, hasta)
      );
      const lista: ItemPropio[] = filas.map((r: any) => ({
        tmdb_id: r.movie_tmdb_id,
        nombre: r.movies_cache?.title ?? "—",
        poster_path: r.movies_cache?.poster_path ?? null,
        watched: !!r.watched,
        anio: r.movies_cache?.release_date ? String(r.movies_cache.release_date).slice(0, 4) : null,
        runtime_minutes: r.movies_cache?.runtime_minutes ?? null,
        rating: r.rating ?? null,
      }));
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setItems(lista);
    } else {
      const [filas, progreso] = await Promise.all([
        fetchAllRows<any>((desde, hasta) =>
          supabase
            .from("user_series")
            .select("series_tmdb_id, rating, series_cache(name, poster_path, total_seasons, first_air_date)")
            .eq("user_id", userId)
            .range(desde, hasta)
        ),
        progresoDeSeries(userId),
      ]);
      const lista: ItemPropio[] = filas.map((r: any) => ({
        tmdb_id: r.series_tmdb_id,
        nombre: r.series_cache?.name ?? "—",
        poster_path: r.series_cache?.poster_path ?? null,
        estado: progreso[r.series_tmdb_id]?.estado,
        porcentaje: progreso[r.series_tmdb_id]?.porcentaje ?? 0,
        total_seasons: r.series_cache?.total_seasons ?? 0,
        anio: r.series_cache?.first_air_date ? String(r.series_cache.first_air_date).slice(0, 4) : null,
        rating: r.rating ?? null,
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
    setModoSeleccion("serie");
    setSeleccion({ itemType: "series", tmdbId: item.tmdb_id, nombre: item.nombre, subtitulo: null, posterPath: item.poster_path });
    setTemporadaElegida(null);
    setEpisodios([]);
    const [{ data: episodiosData }, { data: serieData }] = await Promise.all([
      supabase.from("episodes_cache").select("season_number, air_date").eq("series_tmdb_id", item.tmdb_id),
      supabase.from("series_cache").select("seasons_meta").eq("tmdb_id", item.tmdb_id).maybeSingle(),
    ]);
    const hoy = new Date().toISOString().slice(0, 10);
    const seasonsMeta: { season_number: number; episode_count: number }[] = (serieData as any)?.seasons_meta ?? [];
    const emitidosPorTemporada = new Map<number, number>();
    (episodiosData ?? []).forEach((e: any) => {
      if (e.air_date && e.air_date <= hoy) {
        emitidosPorTemporada.set(e.season_number, (emitidosPorTemporada.get(e.season_number) ?? 0) + 1);
      }
    });
    const numeros = [...new Set((episodiosData ?? []).map((r: any) => r.season_number))].sort((a, b) => a - b);
    const lista: TemporadaConEstado[] = numeros.map((n) => {
      const metaTemporada = seasonsMeta.find((s) => s.season_number === n);
      const total = metaTemporada?.episode_count ?? 0;
      const emitidos = emitidosPorTemporada.get(n) ?? 0;
      return { season: n, completa: total > 0 && emitidos >= total };
    });
    setTemporadas(lista);
  }

  // Para el modo "capítulo": al elegir una temporada, traemos sus episodios
  // (con fecha de estreno, para poder deshabilitar los que todavía no salieron).
  async function elegirTemporadaParaCapitulos(temporada: number) {
    if (!serieElegida) return;
    setTemporadaElegida(temporada);
    setCargandoEpisodios(true);
    const { data } = await supabase
      .from("episodes_cache")
      .select("episode_number, name, air_date")
      .eq("series_tmdb_id", serieElegida.tmdb_id)
      .eq("season_number", temporada)
      .order("episode_number");
    setEpisodios(data ?? []);
    setCargandoEpisodios(false);
  }

  // Para el modo "temporada": tocar una temporada YA publica sobre ella
  // directamente (no hace falta elegir un capítulo después). Solo se puede
  // si ya se estrenaron todos sus capítulos.
  function elegirTemporadaParaPublicar(temporada: TemporadaConEstado) {
    if (!serieElegida || !temporada.completa) return;
    setTemporadaElegida(temporada.season);
    setSeleccion({
      itemType: "series",
      tmdbId: serieElegida.tmdb_id,
      nombre: serieElegida.nombre,
      subtitulo: `${t("Temporada")} ${temporada.season}`,
      posterPath: serieElegida.poster_path,
      seasonNumber: temporada.season,
    });
  }

  function elegirEpisodio(ep: { episode_number: number; name: string | null; air_date: string | null }) {
    if (!serieElegida || temporadaElegida == null) return;
    const hoy = new Date().toISOString().slice(0, 10);
    if (!ep.air_date || ep.air_date > hoy) return; // todavía no se estrenó — no se puede elegir
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
    setModoSeleccion("serie");
    setTemporadaElegida(null);
    setEpisodios([]);
  }

  function elegirModo(modo: "serie" | "temporada" | "capitulo") {
    if (!serieElegida) return;
    setModoSeleccion(modo);
    setTemporadaElegida(null);
    setEpisodios([]);
    if (modo === "serie") {
      elegirSerieCompleta(serieElegida);
    } else {
      // Vuelve a "serie sin elegir nada todavía" hasta que se toque una
      // temporada puntual (o un capítulo, según el modo).
      setSeleccion({ itemType: "series", tmdbId: serieElegida.tmdb_id, nombre: serieElegida.nombre, subtitulo: null, posterPath: serieElegida.poster_path });
    }
  }

  const filtrados = busqueda.trim() ? items.filter((i) => i.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())) : items;
  const faltaElegirTemporada = modoSeleccion === "temporada" && (!seleccion || seleccion.seasonNumber == null);
  const faltaElegirCapitulo = modoSeleccion === "capitulo" && (!seleccion || seleccion.episodeNumber == null);
  const faltaCompletarSeleccion = faltaElegirTemporada || faltaElegirCapitulo;

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
            <Pressable style={styles.checkboxRow} onPress={() => elegirModo(modoSeleccion === "temporada" ? "serie" : "temporada")}>
              <View style={[styles.checkbox, modoSeleccion === "temporada" && styles.checkboxActivo]}>
                {modoSeleccion === "temporada" && <Text style={styles.checkboxTilde}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>{t("Publicar sobre una temporada")}</Text>
            </Pressable>

            {modoSeleccion === "temporada" && (
              <View style={{ marginTop: 8, marginBottom: 4 }}>
                <Text style={styles.subtitulo2}>{t("Temporada")}</Text>
                <FlatList
                  horizontal
                  data={temporadas}
                  keyExtractor={(temp) => String(temp.season)}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 6 }}
                  renderItem={({ item: temp }) => (
                    <Pressable
                      style={[
                        styles.temporadaPill,
                        temporadaElegida === temp.season && styles.temporadaPillActiva,
                        !temp.completa && styles.temporadaPillDeshabilitada,
                      ]}
                      disabled={!temp.completa}
                      onPress={() => elegirTemporadaParaPublicar(temp)}
                    >
                      <Text style={[styles.temporadaPillTexto, temporadaElegida === temp.season && styles.temporadaPillTextoActiva]}>T{temp.season}</Text>
                    </Pressable>
                  )}
                />
                {temporadas.some((temp) => !temp.completa) && (
                  <Text style={styles.ayudaTemporada}>{t("Las temporadas que todavía no terminaron de estrenarse no se pueden elegir.")}</Text>
                )}
              </View>
            )}

            <Pressable style={styles.checkboxRow} onPress={() => elegirModo(modoSeleccion === "capitulo" ? "serie" : "capitulo")}>
              <View style={[styles.checkbox, modoSeleccion === "capitulo" && styles.checkboxActivo]}>
                {modoSeleccion === "capitulo" && <Text style={styles.checkboxTilde}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>{t("Publicar sobre un capítulo")}</Text>
            </Pressable>

            {modoSeleccion === "capitulo" && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.subtitulo2}>{t("Temporada")}</Text>
                <FlatList
                  horizontal
                  data={temporadas}
                  keyExtractor={(temp) => String(temp.season)}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 6 }}
                  renderItem={({ item: temp }) => (
                    <Pressable
                      style={[styles.temporadaPill, temporadaElegida === temp.season && styles.temporadaPillActiva]}
                      onPress={() => elegirTemporadaParaCapitulos(temp.season)}
                    >
                      <Text style={[styles.temporadaPillTexto, temporadaElegida === temp.season && styles.temporadaPillTextoActiva]}>T{temp.season}</Text>
                    </Pressable>
                  )}
                />
                {cargandoEpisodios ? (
                  <ActivityIndicator style={{ marginTop: 12 }} />
                ) : (
                  temporadaElegida != null && (
                    <>
                      <FlatList
                        data={episodios}
                        keyExtractor={(e) => String(e.episode_number)}
                        style={{ maxHeight: 260, marginTop: 8 }}
                        renderItem={({ item: ep }) => {
                          const hoy = new Date().toISOString().slice(0, 10);
                          const yaSalio = !!ep.air_date && ep.air_date <= hoy;
                          return (
                            <Pressable
                              style={[
                                styles.episodioFila,
                                seleccion?.itemType === "episode" && seleccion.episodeNumber === ep.episode_number && styles.episodioFilaActiva,
                                !yaSalio && styles.episodioFilaDeshabilitada,
                              ]}
                              disabled={!yaSalio}
                              onPress={() => elegirEpisodio(ep)}
                            >
                              <Text style={styles.episodioTexto} numberOfLines={1}>
                                E{ep.episode_number}
                                {ep.name ? `: ${ep.name}` : ""}
                              </Text>
                            </Pressable>
                          );
                        }}
                      />
                      {episodios.some((e) => !e.air_date || e.air_date > new Date().toISOString().slice(0, 10)) && (
                        <Text style={styles.ayudaTemporada}>{t("Los capítulos que todavía no se estrenaron no se pueden elegir.")}</Text>
                      )}
                    </>
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
          style={[styles.publicarBtn, faltaCompletarSeleccion && styles.publicarBtnDeshabilitado]}
          disabled={faltaCompletarSeleccion}
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
                  <View>
                    {item.poster_path ? (
                      <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.poster} />
                    ) : (
                      <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
                    )}
                    {tipo === "movie" ? (
                      <SeriesProgressBar estado={item.watched ? "terminada" : "sin_comenzar"} porcentaje={100} />
                    ) : (
                      <SeriesProgressBar estado={item.estado ?? "sin_comenzar"} porcentaje={item.porcentaje ?? 0} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nombre} numberOfLines={2}>
                      {item.nombre}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
                      {tipo === "movie" ? (
                        <>
                          {item.anio && <Text style={styles.filaSub}>{item.anio}</Text>}
                          {item.runtime_minutes ? (
                            <Text style={styles.filaSub}>
                              {item.anio ? " · " : ""}
                              {Math.floor(item.runtime_minutes / 60)} h {item.runtime_minutes % 60} min
                            </Text>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {!!item.total_seasons && (
                            <Text style={styles.filaSub}>
                              {item.total_seasons} {item.total_seasons === 1 ? t("temporada") : t("temporadas")}
                            </Text>
                          )}
                          {item.anio && <Text style={styles.filaSub}>{item.total_seasons ? " · " : ""}{item.anio}</Text>}
                        </>
                      )}
                    </View>
                    {item.rating != null && (
                      <View style={{ marginTop: 3 }}>
                        <RatingStars rating={item.rating} size={12} />
                      </View>
                    )}
                  </View>
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
  nombre: { fontSize: 14, fontWeight: "600" },
  filaSub: { fontSize: 12, color: theme.colors.textMuted },
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
  temporadaPillDeshabilitada: { opacity: 0.35 },
  temporadaPillTexto: { fontSize: 13, color: theme.colors.textMuted, fontWeight: "700" },
  temporadaPillTextoActiva: { color: "#000000" },
  ayudaTemporada: { fontSize: 11, color: theme.colors.textFaint, marginTop: 4 },
  episodioFila: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surface, marginBottom: 6 },
  episodioFilaActiva: { borderWidth: 1.5, borderColor: theme.colors.primary },
  episodioFilaDeshabilitada: { opacity: 0.35 },
  episodioTexto: { fontSize: 13 },
  cambiarTexto: { fontSize: 13, color: theme.colors.primaryLight, fontWeight: "700", textAlign: "center" },
  publicarBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: 14, alignItems: "center", marginTop: 12 },
  publicarBtnDeshabilitado: { opacity: 0.4 },
  publicarBtnTexto: { color: "#000000", fontWeight: "800", fontSize: 15 },
});
