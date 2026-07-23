import React, { useEffect, useRef, useState } from "react";
import { View, Image, ScrollView, FlatList, Pressable, StyleSheet, ActivityIndicator, Dimensions } from "react-native";
import { Alert } from "../lib/alert";
import { Text, AppButton } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import ConfettiOverlay from "../components/ConfettiOverlay";
import PublishActionModal from "../components/PublishActionModal";
import { serieRecienCompletada } from "../lib/celebration";
import { useT } from "../i18n/i18n";
import StarRating from "../components/StarRating";
import WatchedPlatformPicker from "../components/WatchedPlatformPicker";
import ActionSheetModal from "../components/ActionSheetModal";
import ConfirmModal from "../components/ConfirmModal";
import TopPills from "../components/TopPills";
import MoodPicker from "../components/MoodPicker";
import CastVotePicker from "../components/CastVotePicker";
import { contarComentarios } from "../lib/comments";
import { contarPostsDeTitulo } from "../lib/posts";
import {
  getSeriesWatchProviders,
  getMovieWatchProviders,
  getSeriesCredits,
  getMovieCredits,
  getMovieDetails,
  getSeriesExternalIds,
  posterUrl,
  getSeriesVideos,
  getMovieVideos,
  elegirTrailer,
  getSeriesRecommendations,
  getMovieRecommendations,
  getSeriesCertification,
  getMovieCertification,
  normalizarClasificacion,
} from "../lib/tmdb";
import { seguirSerie, agregarPelicula, syncSeries, syncMovie, eliminarSerieDeMisSeries, eliminarPeliculaDeMisPeliculas } from "../lib/sync";
import { getNotaImdb, NotaImdb } from "../lib/imdb";
import { supabase } from "../lib/supabase";
import { esFavorito, toggleFavorito, contarFavoritosDeTitulo } from "../lib/favorites";
import { getEstadoVistoPelicula, toggleVistaPelicula, volverAVerPelicula, establecerFechaPrimeraVistaPelicula, establecerFechaUltimaVistaPelicula } from "../lib/watchStatus";
import DateTimePicker from "@react-native-community/datetimepicker";
import { getMoodStats, elegirMood, MoodStats } from "../lib/moods";
import { getCastVoteStats, votarActor, CastVoteStats } from "../lib/castVotes";
import {
  promedioSerie,
  promedioPelicula,
  calificarSerie,
  calificarPelicula,
  cantidadQueAgregaron,
  guardarPlataformaSerie,
  guardarPlataformaPelicula,
} from "../lib/ratings";
import {
  listarEpisodiosPorTemporada,
  episodiosAnterioresNoVistos,
  marcarVariosEpisodios,
  desmarcarEpisodio,
  EpisodioConEstado,
} from "../lib/episodes";
import { theme } from "../theme";
import { formatearFecha } from "../lib/dates";
import { GENEROS_PELICULAS } from "../lib/tmdbGenres";

interface Props {
  route: any;
  navigation: any;
}

type Tab = "info" | "episodios";

function etiquetaEstadoSerie(status: string | null | undefined, firstAirDate: string | null | undefined): string {
  const hoy = new Date().toISOString().slice(0, 10);
  if (status === "Ended") return "Finalizada";
  if (status === "Canceled") return "Cancelada";
  if (!firstAirDate || firstAirDate > hoy) return "Próximamente";
  return "En producción";
}

export default function TitleDetailScreen({ route, navigation }: Props) {
  const { t } = useT();
  const { tmdbId, tipo } = route.params;
  const [tab, setTab] = useState<Tab>("info");
  const [titulo, setTitulo] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [favorito, setFavorito] = useState(false);
  const [agregada, setAgregada] = useState(true); // arranca en true para no mostrar el botón un instante de más mientras carga
  const [customPoster, setCustomPoster] = useState<string | null>(null);
  const [customBackdrop, setCustomBackdrop] = useState<string | null>(null);
  const [mostrarConfetti, setMostrarConfetti] = useState(false);
  const [publishModalVisible, setPublishModalVisible] = useState(false);
  const [confirmEliminarVisible, setConfirmEliminarVisible] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [vista, setVista] = useState(false);
  const [vistaVersion, setVistaVersion] = useState(0); // fuerza recarga de fecha/revisitas sin cambiar `vista`
  const [menuVistaVisible, setMenuVistaVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [certificacion, setCertificacion] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, [tmdbId]);

  async function cargar() {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      setUserId(uid);

      const tabla = tipo === "series" ? "series_cache" : "movies_cache";
      try {
        if (tipo === "series") await syncSeries(tmdbId);
        else await syncMovie(tmdbId);
      } catch (e) {
        console.error("No se pudo sincronizar con TMDB, seguimos con lo que haya en caché:", e);
      }
      const { data: cache, error } = await supabase.from(tabla).select("*").eq("tmdb_id", tmdbId).single();
      if (error) throw error;
      setTitulo(cache);

      if (uid) {
        setFavorito(await esFavorito(uid, tipo, tmdbId));
        const tablaUsuario = tipo === "series" ? "user_series" : "user_movies";
        const columnaId = tipo === "series" ? "series_tmdb_id" : "movie_tmdb_id";
        const { data: fila } = await supabase
          .from(tablaUsuario)
          .select(`${columnaId}, custom_poster_path, custom_backdrop_path${tipo === "movie" ? ", watched" : ""}`)
          .eq("user_id", uid)
          .eq(columnaId, tmdbId)
          .maybeSingle();
        setAgregada(!!fila);
        setCustomPoster((fila as any)?.custom_poster_path ?? null);
        setCustomBackdrop((fila as any)?.custom_backdrop_path ?? null);
        if (tipo === "movie") setVista(!!(fila as any)?.watched);

        const { data: profile } = await supabase.from("profiles").select("country").eq("id", uid).maybeSingle();
        const paisCert = profile?.country ?? "US";
        const cert = tipo === "series" ? await getSeriesCertification(tmdbId, paisCert) : await getMovieCertification(tmdbId, paisCert);
        setCertificacion(normalizarClasificacion(cert));
      }
    } catch (e: any) {
      console.error("Error al cargar la ficha de título:", e);
      Alert.alert("No se pudo cargar", e.message ?? "Revisá tu conexión a Supabase y probá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  function toqueVista() {
    if (!userId || tipo !== "movie") return;
    if (vista) {
      // Ya está vista: en vez de destildarla directo, preguntamos qué quiso decir
      // (por ahí se equivocó, o por ahí la volvió a ver).
      setMenuVistaVisible(true);
      return;
    }
    marcarVista(true);
  }

  async function marcarVista(nuevoValor: boolean) {
    if (!userId) return;
    try {
      await toggleVistaPelicula(userId, tmdbId, nuevoValor);
      setVista(nuevoValor);
      if (nuevoValor) setAgregada(true);
      setVistaVersion((v) => v + 1);
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message);
    }
  }

  async function eliminarDeMisTitulos() {
    if (!userId) return;
    setConfirmEliminarVisible(false);
    try {
      if (tipo === "series") await eliminarSerieDeMisSeries(userId, tmdbId);
      else await eliminarPeliculaDeMisPeliculas(userId, tmdbId);
      setAgregada(false);
      setVista(false);
      setVistaVersion((v) => v + 1);
    } catch (e: any) {
      Alert.alert("No se pudo eliminar", e.message);
    }
  }

  async function marcarVolverAVer() {
    if (!userId) return;
    try {
      await volverAVerPelicula(userId, tmdbId);
      setVista(true);
      setVistaVersion((v) => v + 1);
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message);
    }
  }

  async function agregarAlPerfil() {
    if (!userId) return;
    setAgregando(true);
    try {
      if (tipo === "series") await seguirSerie(userId, tmdbId);
      else await agregarPelicula(userId, tmdbId);
      setAgregada(true);
    } catch (e: any) {
      Alert.alert("No se pudo agregar", e.message);
    } finally {
      setAgregando(false);
    }
  }

  const [menuVisible, setMenuVisible] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  if (loading) return <ActivityIndicator style={{ marginTop: 32 }} />;
  if (!titulo) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ color: theme.colors.textMuted, marginBottom: 12, textAlign: "center" }}>
          No se pudo cargar este título.
        </Text>
        <AppButton title={t("Reintentar")} onPress={cargar} variant="outline" />
      </View>
    );
  }

  const nombre = tipo === "series" ? titulo.name : titulo.title;

  // El header (título + tilde de vista) queda "anclado" al hacer scroll. Antes
  // usábamos stickyHeaderIndices (el mecanismo nativo de ScrollView), pero en
  // Android tiene un bug conocido: el bloque se ve anclado perfecto, pero los
  // toques no se registran bien una vez que quedó pegado arriba. Lo armamos a
  // mano en cambio: el header vive en su lugar normal del scroll (se hace
  // invisible pero sigue ahí para que el scroll no salte), y una COPIA real y
  // aparte, con position:absolute arriba de todo, aparece recién cuando se
  // pasa el umbral — esa copia sí es 100% tocable en cualquier momento.
  const UMBRAL_ANCLADO = Dimensions.get("window").width * (9 / 16) - 40;
  const headerAnclado = scrollY > UMBRAL_ANCLADO;

  function renderHeaderContenido() {
    return (
      <>
        <View style={styles.headerConTilde}>
          <View style={{ flex: 1 }}>
            <Text style={styles.nombre}>{nombre}</Text>
            {tipo === "series" ? (
              <>
                <Text style={styles.subInfo}>{titulo.total_seasons ? `${titulo.total_seasons} ${titulo.total_seasons === 1 ? t("temporada") : t("temporadas")}` : ""}</Text>
                <Text style={styles.subInfo}>{t(etiquetaEstadoSerie(titulo.status, titulo.first_air_date))}</Text>
              </>
            ) : (
              <>
                {titulo.runtime_minutes ? (
                  <Text style={styles.subInfo}>{`${Math.floor(titulo.runtime_minutes / 60)} h ${titulo.runtime_minutes % 60} min`}</Text>
                ) : null}
                {titulo.release_date && <Text style={styles.subInfo}>{formatearFecha(titulo.release_date)}</Text>}
                {(titulo.genre_ids ?? []).length > 0 && (
                  <Text style={styles.subInfo}>
                    {(titulo.genre_ids ?? []).map((id: number) => GENEROS_PELICULAS[id]).filter(Boolean).map((g: string) => t(g)).slice(0, 3).join(", ")}
                    {certificacion ? `  •  ${certificacion}` : ""}
                  </Text>
                )}
              </>
            )}
          </View>
          {tipo === "movie" && (
            <View style={styles.vistaRowHeader}>
              <Text style={styles.vistaTextoHeader}>{vista ? t("Vista") : t("No vista")}</Text>
              <Pressable style={[styles.vistaCirculo, vista && styles.vistaCirculoActivo]} onPress={toqueVista} hitSlop={10}>
                <Text style={[styles.vistaTilde, vista && styles.vistaTildeActivo]}>✓</Text>
              </Pressable>
            </View>
          )}
        </View>

        {tipo === "series" && (
          <TopPills
            opciones={[
              { key: "info", label: t("Información") },
              { key: "episodios", label: t("Episodios") },
            ]}
            valor={tab}
            onCambiar={setTab}
          />
        )}
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
      >
        <View style={styles.backdropWrap}>
          {customBackdrop || titulo.backdrop_path ? (
            <Image source={{ uri: posterUrl(customBackdrop ?? titulo.backdrop_path, "w500")! }} style={styles.backdrop} />
          ) : (
            <View style={[styles.backdrop, { backgroundColor: theme.colors.surfaceAlt }]} />
          )}
          <Pressable style={styles.menuBtn} onPress={() => setMenuVisible(true)} hitSlop={12}>
            <Text style={styles.menuBtnTexto}>⋯</Text>
          </Pressable>
          <Pressable
            style={styles.recomendarBtnFlotante}
            onPress={() => setPublishModalVisible(true)}
            hitSlop={12}
          >
            <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
          </Pressable>
          {!agregada && userId && (
            <Pressable style={styles.agregarBtnGrande} onPress={agregarAlPerfil} disabled={agregando}>
              <Text style={styles.agregarBtnGrandeTexto}>
                {agregando ? "AGREGANDO..." : `+ AÑADIR ${tipo === "series" ? "SERIE" : "PELÍCULA"}`}
              </Text>
            </Pressable>
          )}
        </View>

        <View style={[styles.headerConTildeWrap, { opacity: headerAnclado ? 0 : 1 }]} pointerEvents={headerAnclado ? "none" : "auto"}>
          {renderHeaderContenido()}
        </View>

        {tipo === "series" ? (
          tab === "info" ? (
            <InformacionTab tmdbId={tmdbId} tipo={tipo} titulo={titulo} userId={userId} navigation={navigation} vista={vista} vistaVersion={vistaVersion} />
          ) : (
            <EpisodiosTab tmdbId={tmdbId} userId={userId} navigation={navigation} onSerieAgregada={() => setAgregada(true)} onSerieCompletada={() => setMostrarConfetti(true)} />
          )
        ) : (
          <InformacionTab tmdbId={tmdbId} tipo={tipo} titulo={titulo} userId={userId} navigation={navigation} vista={vista} vistaVersion={vistaVersion} />
        )}
      </ScrollView>

      {headerAnclado && (
        <View style={[styles.headerConTildeWrap, styles.headerFlotante]}>
          {renderHeaderContenido()}
        </View>
      )}

      <ActionSheetModal
        visible={menuVisible}
        onCerrar={() => setMenuVisible(false)}
        titulo={nombre}
        opciones={[
          {
            label: t("Personalizar (cambiar cartel/banner)"),
            icono: "color-palette-outline",
            onPress: () =>
              navigation.navigate("PersonalizarCaratula", {
                tmdbId,
                tipo,
                onElegido: (campo: "poster" | "backdrop", path: string) => {
                  if (campo === "poster") setCustomPoster(path);
                  else setCustomBackdrop(path);
                },
              }),
          },
          {
            label: favorito ? t("Quitar de favoritos") : t("Marcar como favorita"),
            icono: favorito ? "heart" : "heart-outline",
            onPress: async () => {
              if (!userId) return;
              await toggleFavorito(userId, tipo, tmdbId, favorito);
              setFavorito(!favorito);
            },
          },
          {
            label: t("Añadir a una lista"),
            icono: "albums-outline",
            onPress: () => navigation.navigate("ElegirLista", { itemType: tipo, tmdbId }),
          },
          ...(agregada
            ? [
                {
                  label: tipo === "series" ? "Eliminar serie" : "Eliminar película",
                  icono: "trash-outline" as const,
                  destructivo: true,
                  onPress: () => {
                    setMenuVisible(false);
                    setConfirmEliminarVisible(true);
                  },
                },
              ]
            : []),
        ]}
      />

      <ConfirmModal
        visible={confirmEliminarVisible}
        onCerrar={() => setConfirmEliminarVisible(false)}
        titulo={tipo === "series" ? "Eliminar serie" : "Eliminar película"}
        mensaje={`¿Seguro que querés eliminar "${nombre}" de tus ${
          tipo === "series" ? "series" : "películas"
        }? Si la habías marcado como vista, ese estado se pierde y va a aparecer como no vista si la volvés a agregar.`}
        botones={[
          { label: "Cancelar", onPress: () => {} },
          { label: "Eliminar", destacado: true, onPress: eliminarDeMisTitulos },
        ]}
      />

      <ActionSheetModal
        visible={menuVistaVisible}
        onCerrar={() => setMenuVistaVisible(false)}
        titulo={t("Ya la marcaste como vista")}
        opciones={[
          { label: t("No vista (me equivoqué)"), icono: "eye-off-outline", onPress: () => marcarVista(false) },
          { label: t("Volví a verla"), icono: "eye-outline", onPress: marcarVolverAVer },
        ]}
      />
      {mostrarConfetti && <ConfettiOverlay onFin={() => setMostrarConfetti(false)} />}
      <PublishActionModal
        visible={publishModalVisible}
        onCerrar={() => setPublishModalVisible(false)}
        navigation={navigation}
        recomendarParams={{ kind: "title", itemType: tipo, tmdbId, nombre, posterPath: customPoster ?? titulo.poster_path }}
        publicarParams={{ itemType: tipo, tmdbId }}
      />
    </View>
  );
}

function InformacionTab({ tmdbId, tipo, titulo, userId, navigation, vista, vistaVersion }: any) {
  const { t } = useT();
  const [providers, setProviders] = useState<any>(null);
  const [popularidad, setPopularidad] = useState(0);
  const [promedio, setPromedio] = useState<{ promedio: number | null; cantidad: number }>({ promedio: null, cantidad: 0 });
  const [miRating, setMiRating] = useState(0);
  const [miPlataforma, setMiPlataforma] = useState<string | null>(null);
  const [puedeCalificar, setPuedeCalificar] = useState(false);
  const [reparto, setReparto] = useState<any[]>([]);
  const [imdb, setImdb] = useState<NotaImdb | null>(null);
  const [cantidadComentarios, setCantidadComentarios] = useState(0);
  const [cantidadFavoritos, setCantidadFavoritos] = useState(0);
  const [trailer, setTrailer] = useState<{ key: string; name: string } | null>(null);
  const [recomendados, setRecomendados] = useState<any[]>([]);
  const [fechaVista, setFechaVista] = useState<string | null>(null);
  const [primeraFechaVista, setPrimeraFechaVista] = useState<string | null>(null);
  const [vecesVista, setVecesVista] = useState(1);
  const [moodStats, setMoodStats] = useState<MoodStats>({ miMood: null, porcentajes: {}, total: 0 });
  const [castStats, setCastStats] = useState<CastVoteStats>({ miVoto: null, porcentajes: {}, total: 0 });
  const [menuFechaVisible, setMenuFechaVisible] = useState<"primera" | "ultima" | null>(null);
  const [mostrarPicker, setMostrarPicker] = useState(false);
  // Ref (no state) para saber qué fecha se está editando en el momento en que
  // el usuario termina de elegir una fecha en el picker nativo — el estado
  // `menuFechaVisible` no sirve para esto porque el ActionSheetModal se
  // auto-cierra (y lo resetea a null) apenas tocás cualquier opción, mucho
  // antes de que el picker nativo termine de abrirse y el usuario elija algo.
  const campoFechaRef = useRef<"primera" | "ultima">("primera");

  const targetType = tipo as "series" | "movie";
  const targetId = String(tmdbId);

  useEffect(() => {
    cargar();
    cargarImdb();
  }, [tmdbId, vista, vistaVersion]);

  async function cargarImdb() {
    try {
      const imdbId = tipo === "series" ? (await getSeriesExternalIds(tmdbId)).imdb_id : (await getMovieDetails(tmdbId)).imdb_id;
      setImdb(await getNotaImdb(imdbId));
    } catch {
      setImdb(null);
    }
  }

  async function cargar() {
    if (userId) {
      const { data: profile } = await supabase.from("profiles").select("country").eq("id", userId).maybeSingle();
      const watchRegion = profile?.country ?? "AR";
      const p = tipo === "series" ? await getSeriesWatchProviders(tmdbId, watchRegion) : await getMovieWatchProviders(tmdbId, watchRegion);
      setProviders(p);

      if (tipo === "series") {
        const { data: us } = await supabase.from("user_series").select("rating, watched_platform").eq("user_id", userId).eq("series_tmdb_id", tmdbId).maybeSingle();
        setMiRating(us?.rating ?? 0);
        setMiPlataforma(us?.watched_platform ?? null);
        setPuedeCalificar(!!us && titulo.status !== "Returning Series");
      } else {
        const { data: um } = await supabase
          .from("user_movies")
          .select("rating, watched, watched_platform, watched_at, first_watched_at, times_watched")
          .eq("user_id", userId)
          .eq("movie_tmdb_id", tmdbId)
          .maybeSingle();
        setMiRating(um?.rating ?? 0);
        setMiPlataforma(um?.watched_platform ?? null);
        setPuedeCalificar(!!vista);
        setFechaVista(um?.watched_at ?? null);
        setPrimeraFechaVista(um?.first_watched_at ?? null);
        setVecesVista(um?.times_watched ?? 1);
      }

      setMoodStats(await getMoodStats(targetType, targetId, userId));
      setCastStats(await getCastVoteStats(targetType, targetId, userId));
    }

    setPopularidad(await cantidadQueAgregaron(tipo === "series" ? "user_series" : "user_movies", tmdbId));
    setPromedio(tipo === "series" ? await promedioSerie(tmdbId) : await promedioPelicula(tmdbId));

    const credits = tipo === "series" ? await getSeriesCredits(tmdbId) : await getMovieCredits(tmdbId);
    setReparto((credits.cast ?? []).slice(0, 15));
    const cantComentarios = await contarComentarios(tipo, String(tmdbId));
    const cantPosts = await contarPostsDeTitulo(tipo, tmdbId);
    setCantidadComentarios(cantComentarios + cantPosts);
    setCantidadFavoritos(await contarFavoritosDeTitulo(tipo, tmdbId));

    const videos = tipo === "series" ? await getSeriesVideos(tmdbId) : await getMovieVideos(tmdbId);
    setTrailer(elegirTrailer(videos));

    const recs = tipo === "series" ? await getSeriesRecommendations(tmdbId) : await getMovieRecommendations(tmdbId);
    setRecomendados((recs?.results ?? []).slice(0, 15));
  }

  async function calificar(valor: number) {
    if (!userId) return;
    try {
      if (tipo === "series") await calificarSerie(userId, tmdbId, valor);
      else await calificarPelicula(userId, tmdbId, valor);
      setMiRating(valor);
      setPromedio(tipo === "series" ? await promedioSerie(tmdbId) : await promedioPelicula(tmdbId));
    } catch (e: any) {
      Alert.alert("No se pudo calificar", e.message);
    }
  }

  async function elegirPlataforma(plataforma: string) {
    if (!userId) return;
    if (tipo === "series") await guardarPlataformaSerie(userId, tmdbId, plataforma);
    else await guardarPlataformaPelicula(userId, tmdbId, plataforma);
    setMiPlataforma(plataforma);
  }

  async function ponerFechaDeEstreno() {
    if (!userId || !titulo.release_date) return;
    try {
      if (campoFechaRef.current === "ultima") {
        await establecerFechaUltimaVistaPelicula(userId, tmdbId, new Date(titulo.release_date).toISOString());
        setFechaVista(titulo.release_date);
      } else {
        await establecerFechaPrimeraVistaPelicula(userId, tmdbId, new Date(titulo.release_date).toISOString());
        setPrimeraFechaVista(titulo.release_date);
      }
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message);
    }
  }

  async function elegirFechaManual(fecha: Date) {
    if (!userId) return;
    try {
      if (campoFechaRef.current === "ultima") {
        await establecerFechaUltimaVistaPelicula(userId, tmdbId, fecha.toISOString());
        setFechaVista(fecha.toISOString());
      } else {
        await establecerFechaPrimeraVistaPelicula(userId, tmdbId, fecha.toISOString());
        setPrimeraFechaVista(fecha.toISOString());
      }
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message);
    }
  }

  async function elegirMoodPropio(mood: string) {
    if (!userId) return;
    try {
      await elegirMood(userId, targetType, targetId, mood);
      setMoodStats(await getMoodStats(targetType, targetId, userId));
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message);
    }
  }

  async function votarActorPropio(actor: any) {
    if (!userId) return;
    try {
      await votarActor(userId, targetType, targetId, actor.id, actor.name);
      setCastStats(await getCastVoteStats(targetType, targetId, userId));
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message);
    }
  }

  return (
    <>
    <View style={styles.tabContainer}>
      <View style={styles.puntajeRow}>
        <Image source={require("../../assets/logo-icon-only.png")} style={styles.puntajeLogo} resizeMode="contain" />
        <StarRating valor={promedio.promedio ?? 0} />
        <Text style={styles.puntajeNota}>{promedio.promedio ? promedio.promedio.toFixed(1) : "—"}/5</Text>
        <Text style={styles.puntajeVotos}>({promedio.cantidad})</Text>
      </View>
      {imdb && (
        <View style={styles.puntajeRow}>
          <Image source={require("../../assets/imdb-logo-white.png")} style={styles.imdbLogo} resizeMode="contain" />
          <Text style={styles.puntajeNota}>{imdb.rating}/10</Text>
          <Text style={styles.puntajeVotos}>({imdb.votos})</Text>
        </View>
      )}
      <Text style={styles.popularidad}>{popularidad} {popularidad === 1 ? t("persona agregó este título") : t("personas agregaron este título")}</Text>

      {puedeCalificar ? (
        <View style={styles.tuCalificacion}>
          <Text style={styles.label}>{tipo === "series" ? t("Valorá esta serie") : t("Valorá esta película")}</Text>
          <StarRating valor={miRating} onCambiar={calificar} conEtiquetas size={42} />

          <Text style={[styles.label, { marginTop: 20 }]}>{t("¿Cómo te sentiste?")}</Text>
          <MoodPicker miMood={moodStats.miMood} porcentajes={moodStats.porcentajes} onElegir={elegirMoodPropio} />

          {reparto.length > 0 && (
            <>
              <Text style={styles.label}>{t("¿Quién te ha gustado más?")}</Text>
              <CastVotePicker reparto={reparto} miVoto={castStats.miVoto} porcentajes={castStats.porcentajes} onVotar={votarActorPropio} />
            </>
          )}

          <WatchedPlatformPicker
            opciones={tipo === "movie" ? [t("Cine"), ...(providers?.flatrate ?? []).map((p: any) => p.provider_name)] : (providers?.flatrate ?? []).map((p: any) => p.provider_name)}
            valor={miPlataforma}
            onCambiar={elegirPlataforma}
          />
        </View>
      ) : (
        userId && <Text style={styles.sinVer}>{t("Terminala para poder calificarla.")}</Text>
      )}

      <Text style={styles.seccionTitulo}>{t("Dónde verlo")}</Text>
      {providers?.flatrate?.length ? (
        <View style={styles.plataformasRow}>
          {providers.flatrate.map((p: any) => (
            <View key={p.provider_id} style={styles.plataformaLogoBox}>
              {p.logo_path ? (
                <Image source={{ uri: posterUrl(p.logo_path, "w185")! }} style={styles.plataformaLogo} />
              ) : (
                <Text style={styles.dato}>{p.provider_name}</Text>
              )}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.dato}>{t("Aún no disponible en ninguna plataforma")}</Text>
      )}

      {titulo.overview && (
        <>
          <Text style={styles.seccionTitulo}>{t("Sinopsis")}</Text>
          <Text style={styles.overview}>{titulo.overview}</Text>
        </>
      )}

      {trailer && (
        <Pressable
          style={styles.trailerBtn}
          onPress={() => WebBrowser.openBrowserAsync(`https://www.youtube.com/watch?v=${trailer.key}`)}
        >
          <Ionicons name="play-circle" size={20} color="#000000" />
          <Text style={styles.trailerBtnTexto}>{t("Ver tráiler")}</Text>
        </Pressable>
      )}

      {reparto.length > 0 && (
        <>
          <Text style={styles.seccionTitulo}>{t("Reparto")}</Text>
          <FlatList
            horizontal
            data={reparto}
            keyExtractor={(a) => String(a.id)}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable style={styles.actorCard} onPress={() => navigation.navigate("Actor", { personId: item.id })}>
                {item.profile_path ? (
                  <Image source={{ uri: posterUrl(item.profile_path, "w185")! }} style={styles.actorFoto} />
                ) : (
                  <View style={[styles.actorFoto, { backgroundColor: theme.colors.surfaceAlt }]} />
                )}
                <Text numberOfLines={1} style={styles.actorNombre}>
                  {item.name}
                </Text>
                <Text numberOfLines={1} style={styles.actorPersonaje}>
                  {item.character}
                </Text>
              </Pressable>
            )}
          />
        </>
      )}

      <View style={styles.comentariosRow}>
        <Pressable
          style={styles.favoritosBtn}
          onPress={() => navigation.navigate("FavoritosDe", { itemType: tipo, tmdbId, nombre: tipo === "series" ? titulo.name : titulo.title })}
        >
          <Ionicons name="heart" size={18} color="#000000" />
          <Text style={styles.favoritosBtnNumero}>{cantidadFavoritos}</Text>
        </Pressable>
        <Pressable
          style={styles.comentariosBanner}
          onPress={() => navigation.navigate("Comentarios", { targetType: tipo, targetId: String(tmdbId) })}
        >
          <Text style={styles.comentariosBannerTexto}>{t("COMENTARIOS/POSTS")} ({cantidadComentarios})</Text>
          <Text style={styles.comentariosBannerFlecha}>›</Text>
        </Pressable>
      </View>

      {tipo === "movie" && vista && primeraFechaVista && (
        <View style={styles.fechaVistaBox}>
          <Pressable onPress={() => { campoFechaRef.current = "primera"; setMenuFechaVisible("primera"); }}>
            <Text style={styles.fechaVistaTexto}>{t("Vista el")} {formatearFecha(primeraFechaVista)} ✎</Text>
          </Pressable>
          {vecesVista > 1 && fechaVista && fechaVista !== primeraFechaVista && (
            <Pressable onPress={() => { campoFechaRef.current = "ultima"; setMenuFechaVisible("ultima"); }}>
              <Text style={styles.fechaVistaTexto}>{t("Vuelta a ver el")} {formatearFecha(fechaVista)} ✎</Text>
            </Pressable>
          )}
          {vecesVista > 1 && <Text style={styles.fechaVistaVeces}>{t("La viste")} {vecesVista} {t("veces")}</Text>}
        </View>
      )}

      {recomendados.length > 0 && (
        <>
          <Text style={styles.seccionTitulo}>{t("También te podría gustar")}</Text>
          <FlatList
            horizontal
            data={recomendados}
            keyExtractor={(r) => String(r.id)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10 }}
            renderItem={({ item }) => (
              <Pressable
                style={styles.recomendadoCard}
                onPress={() => navigation.push("DetalleTitulo", { tmdbId: item.id, tipo })}
              >
                {item.poster_path ? (
                  <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.recomendadoPoster} />
                ) : (
                  <View style={[styles.recomendadoPoster, { backgroundColor: theme.colors.surfaceAlt }]} />
                )}
                <Text style={styles.recomendadoTitulo} numberOfLines={2}>
                  {item.title ?? item.name}
                </Text>
              </Pressable>
            )}
          />
        </>
      )}

      <Text style={styles.atribucion}>
        This product uses the TMDB API but is not endorsed or certified by TMDB. Datos de streaming con
        atribución a JustWatch.
      </Text>
    </View>

    <ActionSheetModal
      visible={!!menuFechaVisible}
      onCerrar={() => setMenuFechaVisible(null)}
      titulo={menuFechaVisible === "ultima" ? t("¿Cuándo la volviste a ver?") : t("¿Cuándo la viste?")}
      opciones={[
        ...(titulo.release_date
          ? [{ label: t("Fue el día de estreno ({fecha})").replace("{fecha}", formatearFecha(titulo.release_date)), icono: "calendar-outline" as const, onPress: ponerFechaDeEstreno }]
          : []),
        { label: t("Elegir otra fecha"), icono: "create-outline", onPress: () => setMostrarPicker(true) },
      ]}
    />
    {mostrarPicker && (
      <DateTimePicker
        value={(campoFechaRef.current === "ultima" ? fechaVista : primeraFechaVista) ? new Date((campoFechaRef.current === "ultima" ? fechaVista : primeraFechaVista) as string) : new Date()}
        mode="date"
        display="default"
        maximumDate={new Date()}
        onChange={(_event: any, fecha?: Date) => {
          setMostrarPicker(false);
          if (fecha) elegirFechaManual(fecha);
        }}
      />
    )}
    </>
  );
}

function EpisodiosTab({ tmdbId, userId, navigation, onSerieAgregada, onSerieCompletada }: { tmdbId: number; userId: string | null; navigation: any; onSerieAgregada?: () => void; onSerieCompletada?: () => void }) {
  const { t } = useT();
  const [porTemporada, setPorTemporada] = useState<Record<number, EpisodioConEstado[]>>({});
  const [temporadaAbierta, setTemporadaAbierta] = useState<number | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmDatos, setConfirmDatos] = useState<{ cantidad: number; marcarEste: (con: boolean) => void } | null>(null);
  const [temporadasFuturas, setTemporadasFuturas] = useState<{ season_number: number; air_date: string | null; name: string | null }[]>([]);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    if (!userId) return;
    const data = await listarEpisodiosPorTemporada(userId, tmdbId);
    setPorTemporada(data);
    const temporadas = Object.keys(data).map(Number);
    if (temporadas.length > 0 && temporadaAbierta === null) setTemporadaAbierta(temporadas[0]);

    const { data: cache } = await supabase.from("series_cache").select("seasons_meta").eq("tmdb_id", tmdbId).maybeSingle();
    const meta = (cache?.seasons_meta ?? []) as { season_number: number; air_date: string | null; episode_count: number; name: string | null }[];
    // Temporadas confirmadas por TMDB que todavía no tienen episodios cargados (sin salir).
    setTemporadasFuturas(meta.filter((s) => !data[s.season_number]).map((s) => ({ season_number: s.season_number, air_date: s.air_date, name: s.name })));
  }

  async function toggleEpisodio(ep: EpisodioConEstado) {
    if (!userId) return;
    const hoy = new Date().toISOString().slice(0, 10);
    if (!ep.visto && (!ep.air_date || ep.air_date > hoy)) return; // todavía no salió, no se puede marcar

    if (ep.visto) {
      await desmarcarEpisodio(userId, tmdbId, ep.season_number, ep.episode_number);
      cargar();
      return;
    }

    const anteriores = await episodiosAnterioresNoVistos(userId, tmdbId, ep.season_number, ep.episode_number);
    const marcarEste = async (conAnteriores: boolean) => {
      const lista = conAnteriores ? [...anteriores, { season_number: ep.season_number, episode_number: ep.episode_number }] : [{ season_number: ep.season_number, episode_number: ep.episode_number }];
      await marcarVariosEpisodios(userId, tmdbId, lista);
      onSerieAgregada?.();
      cargar();
      if (await serieRecienCompletada(userId, tmdbId)) onSerieCompletada?.();
    };

    if (anteriores.length > 0) {
      setConfirmDatos({ cantidad: anteriores.length, marcarEste });
      setConfirmVisible(true);
    } else {
      marcarEste(false);
    }
  }

  const temporadas = Object.keys(porTemporada).map(Number).sort((a, b) => a - b);
  const hoyStr = new Date().toISOString().slice(0, 10);
  const todosLosEpisodios = temporadas.flatMap((n) => porTemporada[n]);
  const episodiosYaEmitidos = todosLosEpisodios.filter((e) => e.air_date && e.air_date <= hoyStr);
  const totalVistos = episodiosYaEmitidos.filter((e) => e.visto).length;
  const totalEpisodios = episodiosYaEmitidos.length;
  const totalFaltan = totalEpisodios - totalVistos;

  return (
    <>
    <View style={styles.tabContainer}>
      {totalEpisodios > 0 && (
        <View style={styles.resumenVistosBox}>
          <Text style={styles.resumenVistosTexto}>
            {t("Viste")} {totalVistos}/{totalEpisodios} {t("capítulos")}
          </Text>
          {totalFaltan > 0 && (
            <Text style={styles.resumenFaltanTexto}>
              {t("Te faltan")} {totalFaltan} {t("capítulos")}
            </Text>
          )}
        </View>
      )}
      {temporadas.map((num) => {
        const episodios = porTemporada[num];
        const vistos = episodios.filter((e) => e.visto).length;
        const abierta = temporadaAbierta === num;
        return (
          <View key={num} style={{ marginBottom: 8 }}>
            <Pressable style={styles.temporadaHeader} onPress={() => setTemporadaAbierta(abierta ? null : num)}>
              <Text style={styles.temporadaTitulo}>{t("Temporada")} {num}</Text>
              <Text style={styles.temporadaProgreso}>{vistos}/{episodios.length}</Text>
            </Pressable>
            {abierta &&
              episodios.map((ep) => {
                const hoy = new Date().toISOString().slice(0, 10);
                const yaSalio = !!ep.air_date && ep.air_date <= hoy;
                return (
                  <Pressable
                    key={ep.episode_number}
                    style={styles.episodioRow}
                    onPress={() =>
                      navigation.navigate("EpisodioDetalle", {
                        seriesTmdbId: tmdbId,
                        seasonNumber: ep.season_number,
                        episodeNumber: ep.episode_number,
                        episodeName: ep.name,
                      })
                    }
                  >
                    <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
                      {ep.still_path ? (
                        <Image source={{ uri: posterUrl(ep.still_path, "w185")! }} style={styles.episodioFoto} />
                      ) : (
                        <View style={[styles.episodioFoto, { backgroundColor: theme.colors.surfaceAlt }]} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.episodioTitulo}>
                          T{ep.season_number} - E{ep.episode_number}
                        </Text>
                        {ep.name && <Text style={styles.episodioNombre}>{ep.name}</Text>}
                        {ep.air_date && <Text style={styles.episodioFecha}>{formatearFecha(ep.air_date)}</Text>}
                      </View>
                    </View>
                    <Pressable
                      style={[styles.tildeBtn, ep.visto && styles.tildeBtnMarcado, !yaSalio && !ep.visto && styles.tildeBtnDeshabilitado]}
                      onPress={() => toggleEpisodio(ep)}
                      disabled={!yaSalio && !ep.visto}
                      hitSlop={10}
                    >
                      <Text style={[styles.tildeTexto, ep.visto && styles.tildeTextoMarcado]}>✓</Text>
                    </Pressable>
                  </Pressable>
                );
              })}
          </View>
        );
      })}
      {temporadasFuturas.map((temp) => (
        <View key={temp.season_number} style={styles.temporadaFuturaRow}>
          <Text style={styles.temporadaTitulo}>{t("Temporada")} {temp.season_number}</Text>
          <Text style={styles.temporadaFuturaFecha}>{temp.air_date ? formatearFecha(temp.air_date) : t("Fecha por confirmar")}</Text>
        </View>
      ))}
    </View>
    <ConfirmModal
      visible={confirmVisible}
      onCerrar={() => setConfirmVisible(false)}
      titulo={t("¿Marcar los anteriores también?")}
      mensaje={confirmDatos ? `Hay ${confirmDatos.cantidad} episodios sin ver antes de este.` : ""}
      botones={[
        { label: t("Solo este"), onPress: () => confirmDatos?.marcarEste(false) },
        { label: t("Marcar todos"), onPress: () => confirmDatos?.marcarEste(true), destacado: true },
      ]}
    />
    </>
  );
}

const styles = StyleSheet.create({
  backdropWrap: { width: "100%", aspectRatio: 16 / 9, backgroundColor: theme.colors.surfaceAlt },
  backdrop: { width: "100%", height: "100%" },
  menuBtn: { position: "absolute", top: 12, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  recomendarBtnFlotante: { position: "absolute", top: 56, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  publicarBtnFlotante: { position: "absolute", top: 100, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  menuBtnTexto: { color: theme.colors.text, fontSize: 20, fontWeight: "700" },
  headerConTildeWrap: { backgroundColor: theme.colors.background },
  headerFlotante: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    elevation: 50,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  headerConTilde: { flexDirection: "row", alignItems: "center", paddingRight: 16, backgroundColor: theme.colors.background, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  nombre: { fontSize: 20, fontWeight: "700", padding: 16, paddingBottom: 0 },
  vistaRowHeader: { alignItems: "center", gap: 6 },
  vistaTextoHeader: { fontSize: 13, color: theme.colors.textMuted, fontWeight: "600" },
  subInfo: { fontSize: 13, color: theme.colors.textMuted, paddingHorizontal: 16, marginTop: 2 },
  agregarBtnGrande: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: theme.colors.primary, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  agregarBtnGrandeTexto: { color: "#000000", fontWeight: "800", fontSize: 15, letterSpacing: 0.5 },
  vistaCirculo: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" },
  vistaCirculoActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  vistaTilde: { color: theme.colors.textFaint, fontSize: 20, fontWeight: "700" },
  vistaTildeActivo: { color: theme.colors.text },
  tabContainer: { padding: 16 },
  puntajeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  puntajeLogo: { width: 26, height: 26 },
  puntajeNota: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  puntajeVotos: { fontSize: 14, color: theme.colors.textMuted },
  imdbLogo: { width: 30, height: 30 },
  puntajeTexto: { fontSize: 13, color: theme.colors.textMuted },
  popularidad: { fontSize: 13, color: theme.colors.textMuted, marginTop: 6 },
  tuCalificacion: { marginTop: 16 },
  label: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 10, fontWeight: "700", textTransform: "uppercase", textAlign: "center" },
  sinVer: { fontSize: 13, color: theme.colors.textFaint, marginTop: 16, fontStyle: "italic" },
  seccionTitulo: { fontSize: 16, fontWeight: "700", marginTop: 20, marginBottom: 8 },
  dato: { fontSize: 14 },
  plataformasRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  plataformaLogoBox: { width: 48, height: 48, borderRadius: 10, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt },
  plataformaLogo: { width: 48, height: 48 },
  overview: { fontSize: 14, lineHeight: 20 },
  trailerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    marginTop: 12,
  },
  trailerBtnTexto: { color: "#000000", fontWeight: "800", fontSize: 14 },
  recomendadoCard: { width: 100 },
  recomendadoPoster: { width: 100, height: 150, borderRadius: 8, backgroundColor: theme.colors.surfaceAlt },
  recomendadoTitulo: { fontSize: 12, marginTop: 4 },
  actorCard: { width: 90, marginRight: 10 },
  actorFoto: { width: 90, height: 120, borderRadius: 6, marginBottom: 4 },
  actorNombre: { fontSize: 12, fontWeight: "600" },
  actorPersonaje: { fontSize: 11, color: theme.colors.textMuted },
  atribucion: { fontSize: 10, color: theme.colors.textFaint, marginTop: 24, textAlign: "center" },
  comentariosRow: { flexDirection: "row", alignItems: "stretch", gap: 8, marginTop: 24 },
  favoritosBtn: { width: 58, backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center" },
  favoritosBtnNumero: { color: "#000000", fontWeight: "800", fontSize: 13, marginTop: 2 },
  comentariosBanner: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: 16, paddingHorizontal: 18 },
  comentariosBannerTexto: { color: "#000000", fontWeight: "800", fontSize: 15, letterSpacing: 0.5 },
  comentariosBannerFlecha: { color: "#000000", fontWeight: "800", fontSize: 22 },
  fechaVistaBox: { marginTop: 16, alignItems: "center" },
  fechaVistaTexto: { fontSize: 12, color: theme.colors.textFaint, marginTop: 2 },
  fechaVistaVeces: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700", marginTop: 6 },
  temporadaHeader: { flexDirection: "row", justifyContent: "space-between", backgroundColor: theme.colors.surface, padding: 12, borderRadius: theme.radius.md },
  temporadaTitulo: { fontSize: 15, fontWeight: "700" },
  temporadaProgreso: { fontSize: 13, color: theme.colors.textMuted },
  episodioRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 4 },
  episodioFoto: { width: 80, height: 50, borderRadius: 6, marginRight: 10 },
  episodioTitulo: { fontSize: 14, fontWeight: "700" },
  episodioNombre: { fontSize: 13, color: theme.colors.text, marginTop: 1 },
  episodioFecha: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  tildeBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.primary, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  tildeBtnMarcado: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  tildeBtnDeshabilitado: { borderColor: theme.colors.border, opacity: 0.4 },
  tildeTexto: { color: theme.colors.primary, fontSize: 14, fontWeight: "700" },
  tildeTextoMarcado: { color: theme.colors.text },
  resumenVistosBox: { marginBottom: 16, alignItems: "center" },
  resumenVistosTexto: { fontSize: 15, fontWeight: "700" },
  resumenFaltanTexto: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  temporadaFuturaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    padding: 12,
    borderRadius: theme.radius.md,
    marginBottom: 8,
    opacity: 0.6,
  },
  temporadaFuturaFecha: { fontSize: 13, color: theme.colors.textMuted },
});
