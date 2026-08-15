import React, { useEffect, useState } from "react";
import { View, ScrollView, Image, Pressable, StyleSheet, Dimensions } from "react-native";
import { Alert } from "../lib/alert";
import { Text } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import ConfettiOverlay from "../components/ConfettiOverlay";
import PublishActionModal from "../components/PublishActionModal";
import { serieRecienCompletada } from "../lib/celebration";
import { useT } from "../i18n/i18n";
import { traducirTexto } from "../lib/translate";
import StarRating from "../components/StarRating";
import WatchedPlatformPicker from "../components/WatchedPlatformPicker";
import MoodPicker from "../components/MoodPicker";
import ActionSheetModal from "../components/ActionSheetModal";
import ConfirmModal from "../components/ConfirmModal";
import CastVotePicker from "../components/CastVotePicker";
import { supabase } from "../lib/supabase";
import { calificarEpisodio, promedioEpisodio, guardarPlataformaEpisodio } from "../lib/ratings";
import { getSeriesWatchProviders, getSeriesCredits, getEpisodeExternalIds, posterUrl, obtenerOverviewLocalizado, getContentLanguageCruda } from "../lib/tmdb";
import { getNotaImdb, NotaImdb } from "../lib/imdb";
import { marcarVariosEpisodios, desmarcarEpisodio, episodiosAnterioresNoVistos, obtenerEpisodiosAdyacentes } from "../lib/episodes";
import { pedirReseñaSiCorresponde } from "../lib/storeReview";
import {
  volverAVerEpisodio,
  establecerFechaPrimeraVistaEpisodio,
  listarEventosVistaEpisodio,
  editarEventoVistaEpisodio,
  eliminarEventoVistaEpisodio,
  EventoVisto,
} from "../lib/watchStatus";
import HistorialVistas from "../components/HistorialVistas";
import FechaPickerNativo from "../components/FechaPickerNativo";
import { getMoodStats, elegirMood, MoodStats } from "../lib/moods";
import { getCastVoteStats, votarActor, CastVoteStats } from "../lib/castVotes";
import { theme } from "../theme";
import { formatearFecha } from "../lib/dates";

interface Props {
  route: {
    params: {
      seriesTmdbId: number;
      seasonNumber: number;
      episodeNumber: number;
      episodeName: string | null;
    };
  };
  navigation: any;
}

export default function EpisodeDetailScreen({ route, navigation }: Props) {
  const { t, idioma } = useT();
  const { seriesTmdbId, seasonNumber, episodeNumber, episodeName } = route.params;
  const [episodio, setEpisodio] = useState<any>(null);
  const [traduccionSinopsis, setTraduccionSinopsis] = useState<string | null>(null);
  const [traduciendoSinopsis, setTraduciendoSinopsis] = useState(false);
  const [overviewLocalizado, setOverviewLocalizado] = useState<string | null>(null);
  const [nombreSerieParaRecomendar, setNombreSerieParaRecomendar] = useState("esta serie");
  const [mostrarConfetti, setMostrarConfetti] = useState(false);

  function celebrarSerieCompletada() {
    setMostrarConfetti(true);
    setTimeout(() => pedirReseñaSiCorresponde(), 2500);
  }
  const [publishModalVisible, setPublishModalVisible] = useState(false);
  const [visto, setVisto] = useState(false);
  const [menuVistoVisible, setMenuVistoVisible] = useState(false);
  const [confirmAnterioresVisible, setConfirmAnterioresVisible] = useState(false);
  const [anteriores, setAnteriores] = useState<{ season_number: number; episode_number: number }[]>([]);
  const [miRating, setMiRating] = useState(0);
  const [miPlataforma, setMiPlataforma] = useState<string | null>(null);
  const [promedio, setPromedio] = useState<{ promedio: number | null; cantidad: number }>({ promedio: null, cantidad: 0 });
  const [scrollYEp, setScrollYEp] = useState(0);
  const [imdb, setImdb] = useState<NotaImdb | null>(null);
  const [providers, setProviders] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [eventosVista, setEventosVista] = useState<EventoVisto[]>([]);
  const [adyacentes, setAdyacentes] = useState<{
    anterior: { season_number: number; episode_number: number } | null;
    siguiente: { season_number: number; episode_number: number } | null;
  }>({ anterior: null, siguiente: null });
  const [moodStats, setMoodStats] = useState<MoodStats>({ miMood: null, porcentajes: {}, total: 0 });
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuFechaVisible, setMenuFechaVisible] = useState(false);
  const [mostrarPicker, setMostrarPicker] = useState(false);
  const [reparto, setReparto] = useState<any[]>([]);
  const [castStats, setCastStats] = useState<CastVoteStats>({ miVoto: null, porcentajes: {}, total: 0 });

  const targetId = `${seriesTmdbId}:${seasonNumber}:${episodeNumber}`;
  const hoyStr = new Date().toISOString().slice(0, 10);
  const noSalioTodavia = !episodio?.air_date || episodio.air_date > hoyStr;

  useEffect(() => {
    cargar();
  }, []);

  const [localizadaEncontrada, setLocalizadaEncontrada] = useState(false);

  useEffect(() => {
    setTraduccionSinopsis(null);
    setOverviewLocalizado(null);
    setLocalizadaEncontrada(false);
    obtenerOverviewLocalizado("episode", seriesTmdbId, getContentLanguageCruda(), seasonNumber, episodeNumber)
      .then((overview) => {
        setOverviewLocalizado(overview);
        setLocalizadaEncontrada(!!overview);
      })
      .catch((e) => console.error("No se pudo pedir la sinopsis del capítulo en el idioma configurado:", e));
  }, [seriesTmdbId, seasonNumber, episodeNumber]);

  // Se traduce sola solo cuando no se encontró la sinopsis en tu idioma
  // (localizadaEncontrada en false) y hay que mostrar el texto original,
  // que en ese caso probablemente esté en otro idioma. Si ya está en tu
  // idioma, no hace falta traducir nada.
  useEffect(() => {
    if (localizadaEncontrada) return;
    const base = episodio?.overview;
    if (!base || traduccionSinopsis || traduciendoSinopsis) return;
    setTraduciendoSinopsis(true);
    traducirTexto(base, idioma)
      .then(setTraduccionSinopsis)
      .catch((e) => console.error("No se pudo traducir la sinopsis del capítulo automáticamente:", e))
      .finally(() => setTraduciendoSinopsis(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodio, localizadaEncontrada]);

  async function traducirSinopsis() {
    if (traduccionSinopsis) {
      setTraduccionSinopsis(null);
      return;
    }
    const base = overviewLocalizado ?? episodio?.overview;
    if (!base) return;
    setTraduciendoSinopsis(true);
    try {
      setTraduccionSinopsis(await traducirTexto(base, idioma));
    } catch (e: any) {
      Alert.alert(t("No se pudo traducir"), e.message);
    } finally {
      setTraduciendoSinopsis(false);
    }
  }

  async function cargar() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);

    const { data: serieCache } = await supabase.from("series_cache").select("name").eq("tmdb_id", seriesTmdbId).maybeSingle();
    if (serieCache?.name) setNombreSerieParaRecomendar(serieCache.name);

    const { data: ep } = await supabase
      .from("episodes_cache")
      .select("*")
      .eq("series_tmdb_id", seriesTmdbId)
      .eq("season_number", seasonNumber)
      .eq("episode_number", episodeNumber)
      .maybeSingle();
    setEpisodio(ep);
    obtenerEpisodiosAdyacentes(seriesTmdbId, seasonNumber, episodeNumber).then(setAdyacentes);

    if (uid) {
      const { data: watched } = await supabase
        .from("user_episodes_watched")
        .select("rating, watched_platform")
        .eq("user_id", uid)
        .eq("series_tmdb_id", seriesTmdbId)
        .eq("season_number", seasonNumber)
        .eq("episode_number", episodeNumber)
        .maybeSingle();
      setVisto(!!watched);
      setMiRating(watched?.rating ?? 0);
      setMiPlataforma(watched?.watched_platform ?? null);

      setEventosVista(await listarEventosVistaEpisodio(uid, seriesTmdbId, seasonNumber, episodeNumber));

      setMoodStats(await getMoodStats("episode", targetId, uid));
      setCastStats(await getCastVoteStats("episode", targetId, uid));

      const { data: profile } = await supabase.from("profiles").select("country").eq("id", uid).maybeSingle();
      const p = await getSeriesWatchProviders(seriesTmdbId, profile?.country ?? "AR");
      setProviders(p);
    }

    const credits = await getSeriesCredits(seriesTmdbId);
    setReparto((credits.cast ?? []).slice(0, 15));

    setPromedio(await promedioEpisodio(seriesTmdbId, seasonNumber, episodeNumber));

    try {
      const externos = await getEpisodeExternalIds(seriesTmdbId, seasonNumber, episodeNumber);
      setImdb(await getNotaImdb(externos.imdb_id));
    } catch {
      setImdb(null);
    }
  }

  function toqueVisto() {
    if (!userId) return;
    if (visto) {
      setMenuVistoVisible(true);
      return;
    }
    const hoy = new Date().toISOString().slice(0, 10);
    if (!episodio?.air_date || episodio.air_date > hoy) return; // todavía no salió
    marcarComoVisto();
  }

  async function marcarComoVisto() {
    if (!userId) return;
    try {
      const previos = await episodiosAnterioresNoVistos(userId, seriesTmdbId, seasonNumber, episodeNumber);
      if (previos.length > 0) {
        setAnteriores(previos);
        setConfirmAnterioresVisible(true);
        return;
      }
      await marcarVariosEpisodios(userId, seriesTmdbId, [{ season_number: seasonNumber, episode_number: episodeNumber }]);
      cargar();
      if (await serieRecienCompletada(userId, seriesTmdbId)) celebrarSerieCompletada();
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message);
    }
  }

  async function confirmarConAnteriores(conAnteriores: boolean) {
    if (!userId) return;
    const lista = conAnteriores
      ? [...anteriores, { season_number: seasonNumber, episode_number: episodeNumber }]
      : [{ season_number: seasonNumber, episode_number: episodeNumber }];
    await marcarVariosEpisodios(userId, seriesTmdbId, lista);
    cargar();
    if (await serieRecienCompletada(userId, seriesTmdbId)) celebrarSerieCompletada();
  }

  async function marcarNoVisto() {
    if (!userId) return;
    await desmarcarEpisodio(userId, seriesTmdbId, seasonNumber, episodeNumber);
    setVisto(false);
    cargar();
  }

  async function marcarVolverAVer() {
    if (!userId) return;
    try {
      await volverAVerEpisodio(userId, seriesTmdbId, seasonNumber, episodeNumber);
      cargar();
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message);
    }
  }

  async function calificar(valor: number) {
    if (!userId) return;
    await calificarEpisodio(userId, seriesTmdbId, seasonNumber, episodeNumber, valor);
    setMiRating(valor);
    setPromedio(await promedioEpisodio(seriesTmdbId, seasonNumber, episodeNumber));
  }

  async function elegirPlataforma(plataforma: string) {
    if (!userId) return;
    await guardarPlataformaEpisodio(userId, seriesTmdbId, seasonNumber, episodeNumber, plataforma);
    setMiPlataforma(plataforma);
  }

  async function ponerFechaDeEstreno() {
    if (!userId || !episodio?.air_date) return;
    try {
      await establecerFechaPrimeraVistaEpisodio(userId, seriesTmdbId, seasonNumber, episodeNumber, new Date(episodio.air_date).toISOString());
      setEventosVista(await listarEventosVistaEpisodio(userId, seriesTmdbId, seasonNumber, episodeNumber));
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message);
    }
  }

  async function elegirFechaManual(fecha: Date) {
    if (!userId) return;
    try {
      await establecerFechaPrimeraVistaEpisodio(userId, seriesTmdbId, seasonNumber, episodeNumber, fecha.toISOString());
      setEventosVista(await listarEventosVistaEpisodio(userId, seriesTmdbId, seasonNumber, episodeNumber));
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message);
    }
  }

  async function editarEventoVista(eventoId: string, fechaISO: string) {
    if (!userId) return;
    try {
      await editarEventoVistaEpisodio(userId, eventoId, seriesTmdbId, seasonNumber, episodeNumber, fechaISO);
      setEventosVista(await listarEventosVistaEpisodio(userId, seriesTmdbId, seasonNumber, episodeNumber));
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message);
    }
  }

  async function eliminarEventoVista(eventoId: string) {
    if (!userId) return;
    try {
      await eliminarEventoVistaEpisodio(userId, eventoId, seriesTmdbId, seasonNumber, episodeNumber);
      setEventosVista(await listarEventosVistaEpisodio(userId, seriesTmdbId, seasonNumber, episodeNumber));
    } catch (e: any) {
      Alert.alert("No se pudo eliminar", e.message);
    }
  }

  function irAEpisodio(ep: { season_number: number; episode_number: number }) {
    navigation.replace("EpisodioDetalle", { seriesTmdbId, seasonNumber: ep.season_number, episodeNumber: ep.episode_number });
  }

  async function elegirMoodPropio(mood: string) {
    if (!userId) return;
    try {
      await elegirMood(userId, "episode", targetId, mood);
      setMoodStats(await getMoodStats("episode", targetId, userId));
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message);
    }
  }

  async function votarActorPropio(actor: any) {
    if (!userId) return;
    try {
      await votarActor(userId, "episode", targetId, actor.id, actor.name);
      setCastStats(await getCastVoteStats("episode", targetId, userId));
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message);
    }
  }

  const UMBRAL_ANCLADO_EP = Dimensions.get("window").width * (9 / 16) - 40;
  const headerAncladoEp = episodio?.still_path ? scrollYEp > UMBRAL_ANCLADO_EP : false;

  function renderHeaderEpisodio() {
    return (
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Pressable onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: seriesTmdbId, tipo: "series" })} hitSlop={4}>
            <Text style={styles.nombreSerie}>{nombreSerieParaRecomendar}</Text>
          </Pressable>
          <Text style={styles.titulo}>
            T{seasonNumber} - E{episodeNumber}: {episodio?.name ?? episodeName}
          </Text>
          {episodio?.air_date && <Text style={styles.fecha}>{t(noSalioTodavia ? "Saldrá el" : "Salió el")} {formatearFecha(episodio.air_date)}</Text>}
        </View>
        {userId && (
          <View style={styles.vistaRowHeader}>
            <Text style={styles.vistaTextoHeader}>{visto ? t("Vista") : t("No vista")}</Text>
            <Pressable
              style={[styles.vistaCirculo, visto && styles.vistaCirculoActivo, !visto && noSalioTodavia && styles.vistaCirculoDeshabilitado]}
              onPress={toqueVisto}
              disabled={!visto && noSalioTodavia}
              hitSlop={10}
            >
              <Text style={[styles.vistaTilde, visto && styles.vistaTildeActivo]}>✓</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => setScrollYEp(e.nativeEvent.contentOffset.y)}
      >
        {episodio?.still_path ? (
          <View style={styles.backdropWrap}>
            <Image source={{ uri: posterUrl(episodio.still_path, "w500")! }} style={styles.backdrop} />
            <Pressable style={styles.menuBtnFlotante} onPress={() => setMenuVisible(true)} hitSlop={12}>
              <Text style={styles.menuBtnFlotanteTexto}>⋯</Text>
            </Pressable>
            <Pressable style={styles.recomendarBtnFlotante} onPress={() => setPublishModalVisible(true)} hitSlop={12}>
              <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : (
          <View style={styles.botonesFilaSinBackdrop}>
            <Pressable style={styles.menuBtnSinBackdrop} onPress={() => setMenuVisible(true)} hitSlop={12}>
              <Text style={styles.menuBtnFlotanteTexto}>⋯</Text>
            </Pressable>
            <Pressable style={styles.recomendarBtnSinBackdrop} onPress={() => setPublishModalVisible(true)} hitSlop={12}>
              <Ionicons name="paper-plane" size={16} color="#FFFFFF" />
            </Pressable>
          </View>
        )}

        <View style={[styles.headerWrap, { opacity: headerAncladoEp ? 0 : 1 }]} pointerEvents={headerAncladoEp ? "none" : "auto"}>
          {renderHeaderEpisodio()}
        </View>

        {(adyacentes.anterior || adyacentes.siguiente) && (
          <View style={styles.flechasRow}>
            {adyacentes.anterior ? (
              <Pressable onPress={() => irAEpisodio(adyacentes.anterior!)} hitSlop={12}>
                <Ionicons name="chevron-back" size={28} color={theme.colors.primary} />
              </Pressable>
            ) : (
              <View />
            )}
            {adyacentes.siguiente ? (
              <Pressable onPress={() => irAEpisodio(adyacentes.siguiente!)} hitSlop={12}>
                <Ionicons name="chevron-forward" size={28} color={theme.colors.primary} />
              </Pressable>
            ) : (
              <View />
            )}
          </View>
        )}

        <View style={styles.container}>
          <View style={styles.puntajeRow}>
            <Image source={require("../../assets/logo-icon-only.png")} style={styles.puntajeLogo} resizeMode="contain" />
            <StarRating valor={promedio.promedio ?? 0} />
            <Text style={styles.puntajeTexto}>
              {promedio.promedio ? `${promedio.promedio.toFixed(1)}/5 (${promedio.cantidad})` : t("Sin calificar todavía")}
            </Text>
          </View>

          {imdb && (
            <View style={styles.puntajeRow}>
              <Image source={require("../../assets/imdb-logo-white.png")} style={styles.imdbLogo} resizeMode="contain" />
              <Text style={styles.puntajeTexto}>
                {imdb.rating}/10 ({imdb.votos})
              </Text>
            </View>
          )}

          {visto ? (
            <View style={styles.tuCalificacion}>
              <Text style={styles.label}>{t("Valorá este capítulo")}</Text>
              <StarRating valor={miRating} onCambiar={calificar} conEtiquetas size={40} />

              <Text style={[styles.label, { marginTop: 20 }]}>{t("¿Cómo te sentiste?")}</Text>
              <MoodPicker miMood={moodStats.miMood} porcentajes={moodStats.porcentajes} onElegir={elegirMoodPropio} />

              {reparto.length > 0 && (
                <>
                  <Text style={[styles.label, { marginTop: 20 }]}>{t("¿Quién te ha gustado más?")}</Text>
                  <CastVotePicker reparto={reparto} miVoto={castStats.miVoto} porcentajes={castStats.porcentajes} onVotar={votarActorPropio} />
                </>
              )}
            </View>
          ) : (
            <Text style={styles.sinVer}>{t("Marcá este capítulo como visto para poder calificarlo.")}</Text>
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

          {episodio?.overview && (
            <>
              <Text style={styles.seccionTitulo}>{t("Sinopsis")}</Text>
              <Text style={styles.overview}>{traduccionSinopsis ?? overviewLocalizado ?? episodio.overview}</Text>
              <Pressable onPress={traducirSinopsis} disabled={traduciendoSinopsis} style={styles.traducirSinopsisBtn}>
                <Text style={styles.traducirSinopsisTexto}>
                  {traduciendoSinopsis ? t("Traduciendo...") : traduccionSinopsis ? t("Ver original") : t("Traducir")}
                </Text>
              </Pressable>
            </>
          )}

          <Pressable
            style={styles.comentariosBanner}
            onPress={() => navigation.navigate("Comentarios", { targetType: "episode", targetId })}
          >
            <Text style={styles.comentariosBannerTexto}>{t("COMENTARIOS/POSTS")}</Text>
            <Text style={styles.comentariosBannerFlecha}>›</Text>
          </Pressable>

          {visto && eventosVista.length > 0 && (
            <HistorialVistas eventos={eventosVista} onEditarFecha={editarEventoVista} onEliminar={eliminarEventoVista} genero="m" fechaEstreno={episodio?.air_date ?? null} />
          )}
        </View>
      </ScrollView>

      {headerAncladoEp && (
        <View style={[styles.headerWrap, styles.headerFlotante]}>
          {renderHeaderEpisodio()}
        </View>
      )}

      <ActionSheetModal
        visible={menuVisible}
        onCerrar={() => setMenuVisible(false)}
        opciones={[
          {
            label: `${t("¿Cuándo lo viste?")}${visto && eventosVista[0] ? "  " + formatearFecha(eventosVista[0].watchedAt) : ""}`,
            icono: "calendar-outline",
            deshabilitado: !visto,
            onPress: () => setMenuFechaVisible(true),
          },
        ]}
      />

      <ActionSheetModal
        visible={menuVistoVisible}
        onCerrar={() => setMenuVistoVisible(false)}
        titulo={t("Ya lo marcaste como visto")}
        opciones={[
          { label: t("No visto (me equivoqué)"), icono: "eye-off-outline", onPress: marcarNoVisto },
          { label: t("Volví a verlo"), icono: "eye-outline", onPress: marcarVolverAVer },
        ]}
      />

      <ConfirmModal
        visible={confirmAnterioresVisible}
        onCerrar={() => setConfirmAnterioresVisible(false)}
        titulo="¿Marcar los anteriores también?"
        mensaje={`Hay ${anteriores.length} episodios sin ver antes de este.`}
        botones={[
          { label: t("Solo este"), onPress: () => confirmarConAnteriores(false) },
          { label: t("Marcar todos"), onPress: () => confirmarConAnteriores(true), destacado: true },
        ]}
      />

      <ActionSheetModal
        visible={menuFechaVisible}
        onCerrar={() => setMenuFechaVisible(false)}
        titulo={t("¿Cuándo lo viste?")}
        opciones={[
          ...(episodio?.air_date
            ? [{ label: t("Fue el día de estreno ({fecha})").replace("{fecha}", formatearFecha(episodio.air_date)), icono: "calendar-outline" as const, onPress: ponerFechaDeEstreno }]
            : []),
          { label: t("Elegir otra fecha"), icono: "create-outline", onPress: () => setMostrarPicker(true) },
        ]}
      />
      {mostrarPicker && (
        <FechaPickerNativo
          value={eventosVista[0] ? new Date(eventosVista[0].watchedAt) : new Date()}
          maximumDate={new Date()}
          onCerrar={() => setMostrarPicker(false)}
          onElegida={elegirFechaManual}
        />
      )}
      {mostrarConfetti && <ConfettiOverlay onFin={() => setMostrarConfetti(false)} />}
      <PublishActionModal
        visible={publishModalVisible}
        onCerrar={() => setPublishModalVisible(false)}
        navigation={navigation}
        recomendarParams={{
          kind: "title",
          itemType: "episode",
          tmdbId: seriesTmdbId,
          seasonNumber,
          episodeNumber,
          nombre: nombreSerieParaRecomendar,
        }}
        publicarParams={{ itemType: "episode", tmdbId: seriesTmdbId, seasonNumber, episodeNumber }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdropWrap: { width: "100%", aspectRatio: 16 / 9, backgroundColor: theme.colors.surfaceAlt },
  backdrop: { width: "100%", height: "100%" },
  headerWrap: { backgroundColor: theme.colors.background, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  headerFlotante: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 50, elevation: 50 },
  recomendarBtnFlotante: { position: "absolute", top: 56, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  menuBtnFlotante: { position: "absolute", top: 12, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center" },
  menuBtnSinBackdrop: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center" },
  menuBtnFlotanteTexto: { fontSize: 20, color: "#FFFFFF", fontWeight: "700" },
  publicarBtnFlotante: { position: "absolute", top: 56, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  botonesFilaSinBackdrop: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 12 },
  recomendarBtnSinBackdrop: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", padding: 16, paddingBottom: 0 },
  vistaRowHeader: { alignItems: "center", gap: 6 },
  vistaTextoHeader: { fontSize: 13, color: theme.colors.textMuted, fontWeight: "600" },
  vistaCirculo: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" },
  vistaCirculoActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  vistaCirculoDeshabilitado: { opacity: 0.35 },
  vistaTilde: { color: theme.colors.textFaint, fontSize: 20, fontWeight: "700" },
  vistaTildeActivo: { color: theme.colors.text },
  comentariosBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: 16, paddingHorizontal: 18, marginTop: 24 },
  comentariosBannerTexto: { color: "#000000", fontWeight: "800", fontSize: 15, letterSpacing: 0.5 },
  comentariosBannerFlecha: { color: "#000000", fontWeight: "800", fontSize: 22 },
  container: { padding: 16 },
  flechasRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 8, paddingTop: 4, marginBottom: -16 },
  nombreSerie: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 2 },
  titulo: { fontSize: 19, fontWeight: "700" },
  fecha: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  puntajeRow: { flexDirection: "row", alignItems: "center", marginTop: 16, gap: 8 },
  puntajeTexto: { fontSize: 13, color: theme.colors.textMuted },
  imdbLogo: { width: 30, height: 30 },
  puntajeLogo: { width: 26, height: 26 },
  tuCalificacion: { marginTop: 16 },
  label: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 10, fontWeight: "700", textTransform: "uppercase", textAlign: "center" },
  sinVer: { fontSize: 13, color: theme.colors.textFaint, marginTop: 16, fontStyle: "italic" },
  seccionTitulo: { fontSize: 15, fontWeight: "700", marginTop: 20, marginBottom: 6 },
  dato: { fontSize: 14, color: theme.colors.text },
  plataformasRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  plataformaLogoBox: { width: 48, height: 48, borderRadius: 10, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt },
  plataformaLogo: { width: 48, height: 48 },
  overview: { fontSize: 14, color: theme.colors.text, lineHeight: 20 },
  traducirSinopsisBtn: { alignSelf: "flex-end", marginTop: 6 },
  traducirSinopsisTexto: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },

});
