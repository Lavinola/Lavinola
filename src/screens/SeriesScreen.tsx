import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, FlatList, SectionList, Image, StyleSheet, Pressable, ActivityIndicator, ScrollView, Alert, Animated } from "react-native";
import { Text } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { posterUrl } from "../lib/tmdb";
import { marcarEpisodioVisto, episodiosAnterioresNoVistos, marcarVariosEpisodios, getProximoEpisodio } from "../lib/episodes";
import ConfirmModal from "../components/ConfirmModal";
import CalificarModal from "../components/CalificarModal";
import { listarSeriesConEstado, historialReciente, SerieListado, EventoHistorial } from "../lib/seriesList";
import TopPills from "../components/TopPills";
import CalendarScreen from "./CalendarScreen";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type SubTab = "pendiente" | "proximamente";

export default function SeriesScreen({ navigation }: any) {
  const [subTab, setSubTab] = useState<SubTab>("pendiente");
  const { t } = useT();

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
      {subTab === "pendiente" ? <ListaPendiente navigation={navigation} /> : <CalendarScreen navigation={navigation} />}
    </View>
  );
}

function ListaPendiente({ navigation }: any) {
  const { t } = useT();
  const [series, setSeries] = useState<SerieListado[]>([]);
  const [historial, setHistorial] = useState<EventoHistorial[]>([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<SectionList>(null);
  const yaScrolleoRef = useRef(false);
  const indiceVerARef = useRef(0);
  const idCargaRef = useRef(0);
  // Orden "congelado" de Ver a continuación: en vez de recalcularlo desde
  // cero en cada recarga (lo que puede reordenar todo por pequeñas
  // diferencias entre cómo se computa cada vez), guardamos acá el orden
  // actual y solo lo tocamos cuando pasa algo puntual: marcás un capítulo
  // (esa serie sube al tope), se agrega una serie nueva (entra al final), o
  // una serie deja de calificar para esta sección (sale, sin mover al resto).
  const ordenViendoRef = useRef<number[]>([]);
  const [abandonadaAbierta, setAbandonadaAbierta] = useState(false);
  const [sinComenzarAbierta, setSinComenzarAbierta] = useState(false);
  const [confirmAnteriores, setConfirmAnteriores] = useState<{
    item: SerieListado;
    anteriores: { season_number: number; episode_number: number }[];
    resolver: () => void;
  } | null>(null);
  const [calificarModal, setCalificarModal] = useState<{
    tmdbId: number;
    nombreSerie: string;
    temporada: number;
    episodio: number;
    nombreEpisodio: string | null;
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [])
  );

  async function cargar(silencioso = false) {
    const miId = ++idCargaRef.current;
    if (!silencioso) setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;

      const [todas, hist] = await Promise.all([listarSeriesConEstado(userId), historialReciente(userId, 60)]);
      if (miId !== idCargaRef.current) return; // llegó una recarga más nueva mientras esperábamos — descartamos esta
      setSeries(todas);
      setHistorial(hist);
      if (!silencioso) {
        yaScrolleoRef.current = false;
        const hayHistorial = hist.length > 0;
        indiceVerARef.current = hayHistorial ? 1 : 0;
        setTimeout(() => scrollAVerAContinuacion(), 60);
      }
    } catch (e: any) {
      console.error("Error al cargar tus series:", e);
      Alert.alert(t("No se pudieron cargar tus series"), e.message ?? "Probá de nuevo.");
    } finally {
      if (!silencioso) setLoading(false);
    }
  }

  /**
   * En vez de recargar la lista COMPLETA (que puede tardar con muchas series,
   * y encima puede pisarse con otra recarga en curso — la causa real del bug
   * de "la serie desaparece de Ver a continuación"), esto actualiza SOLO la
   * serie puntual que acabás de marcar: mucho más rápido, y sin la carrera.
   * El resto de la lista (Historial, que es chico) sí se refresca entero.
   */
  async function actualizarSerieLocal(userId: string, seriesTmdbId: number) {
    const [proximo, hist] = await Promise.all([getProximoEpisodio(userId, seriesTmdbId), historialReciente(userId, 60)]);
    setHistorial(hist);

    setSeries((prev) =>
      prev.map((s) => {
        if (s.tmdb_id !== seriesTmdbId) return s;
        return {
          ...s,
          last_watched_at: new Date().toISOString(),
          // Si hay un próximo capítulo ya emitido para ver, sigue "viendo" (y
          // por lo tanto en Ver a continuación). Si no, la sacamos de ahí —
          // está al día con todo lo que salió, hasta que salga algo nuevo.
          estado: proximo ? "viendo" : "al_dia",
          next_episode_season: proximo?.season_number ?? null,
          next_episode_number: proximo?.episode_number ?? null,
          next_episode_name: proximo?.name ?? null,
          next_episode_label: proximo ? `T${proximo.season_number} - E${proximo.episode_number}${proximo.name ? `: ${proximo.name}` : ""}` : null,
          episodios_restantes: Math.max(0, s.episodios_restantes - 1),
        };
      })
    );

    // Acción puntual del usuario -> esta serie sube al tope de Ver a
    // continuación (si sigue calificando; si no, simplemente sale de ahí la
    // próxima vez que se recalcule, sin arrastrar al resto con ella).
    if (proximo) {
      ordenViendoRef.current = [seriesTmdbId, ...ordenViendoRef.current.filter((id) => id !== seriesTmdbId)];
    } else {
      ordenViendoRef.current = ordenViendoRef.current.filter((id) => id !== seriesTmdbId);
    }
  }

  async function tocarSiguienteCapitulo(item: SerieListado) {
    if (item.next_episode_season == null || item.next_episode_number == null) return;
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;

    const previos = await episodiosAnterioresNoVistos(userId, item.tmdb_id, item.next_episode_season, item.next_episode_number);
    if (previos.length > 0) {
      await new Promise<void>((resolve) => {
        setConfirmAnteriores({ item, anteriores: previos, resolver: resolve });
      });
      return;
    }

    await marcarEpisodioVisto(userId, item.tmdb_id, item.next_episode_season, item.next_episode_number);
    await actualizarSerieLocal(userId, item.tmdb_id);
    setCalificarModal({
      tmdbId: item.tmdb_id,
      nombreSerie: item.name,
      temporada: item.next_episode_season,
      episodio: item.next_episode_number,
      nombreEpisodio: item.next_episode_name,
    });
  }

  async function resolverConAnteriores(conAnteriores: boolean) {
    if (!confirmAnteriores) return;
    const { item, anteriores, resolver } = confirmAnteriores;
    setConfirmAnteriores(null);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (userId && item.next_episode_season != null && item.next_episode_number != null) {
      const lista = conAnteriores
        ? [...anteriores, { season_number: item.next_episode_season, episode_number: item.next_episode_number }]
        : [{ season_number: item.next_episode_season, episode_number: item.next_episode_number }];
      await marcarVariosEpisodios(userId, item.tmdb_id, lista);
    }
    resolver();
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 32 }} />;

  const viendoSinOrdenar = series.filter((s) => s.estado === "viendo" && s.next_episode_season != null);
  // Reordenamos según el orden congelado (ordenViendoRef). Lo que ya
  // estaba, se queda donde estaba. Lo nuevo (recién agregado, o que recién
  // pasa a calificar para esta sección) se agrega al final — nunca
  // reordenamos todo de nuevo solo porque se recargó la pantalla.
  const porId = new Map(viendoSinOrdenar.map((s) => [s.tmdb_id, s]));
  const yaOrdenados = ordenViendoRef.current.filter((id) => porId.has(id)).map((id) => porId.get(id)!);
  const nuevos = viendoSinOrdenar
    .filter((s) => !ordenViendoRef.current.includes(s.tmdb_id))
    .sort((a, b) => {
      if (a.temporada_nueva !== b.temporada_nueva) return a.temporada_nueva ? -1 : 1;
      return (b.last_watched_at ?? "").localeCompare(a.last_watched_at ?? "");
    });
  const viendo = [...yaOrdenados, ...nuevos];
  ordenViendoRef.current = viendo.map((s) => s.tmdb_id);

  const abandonadas = series.filter((s) => s.estado === "abandonada").sort((a, b) => (b.last_watched_at ?? "").localeCompare(a.last_watched_at ?? ""));
  const sinComenzar = series.filter((s) => s.estado === "sin_comenzar").sort((a, b) => b.added_at.localeCompare(a.added_at));

  // El historial va ordenado del más viejo (arriba) al más nuevo (justo antes de "Ver a continuación"),
  // así al scrollear para arriba vas viendo hacia atrás en el tiempo.
  const historialOrdenado = [...historial].reverse();

  const secciones = [
    { titulo: t("Historial de visualización"), tipo: "historial" as const, esconderSiVacia: true, colapsable: false },
    { titulo: t("Ver a continuación"), tipo: "viendo" as const, esconderSiVacia: false, colapsable: false },
    { titulo: t("Sin ver por un tiempo"), tipo: "abandonada" as const, esconderSiVacia: true, colapsable: true },
    { titulo: t("Sin comenzar"), tipo: "sin_comenzar" as const, esconderSiVacia: true, colapsable: true },
  ].filter(
    (s) =>
      !s.esconderSiVacia ||
      (s.tipo === "historial" ? historialOrdenado.length > 0 : s.tipo === "abandonada" ? abandonadas.length > 0 : sinComenzar.length > 0)
  );

  function scrollAVerAContinuacion(intentos = 6) {
    if (indiceVerARef.current <= 0) return;
    try {
      listRef.current?.scrollToLocation({ sectionIndex: indiceVerARef.current, itemIndex: 0, animated: false, viewOffset: 0 });
      yaScrolleoRef.current = true;
    } catch {
      // todavía no terminó de medir, reintentamos
    }
    if (intentos > 0) setTimeout(() => scrollAVerAContinuacion(intentos - 1), 120);
  }

  return (
    <>
    <SectionList
      ref={listRef}
      sections={secciones.map((s) => {
        const abierta = s.tipo === "abandonada" ? abandonadaAbierta : s.tipo === "sin_comenzar" ? sinComenzarAbierta : true;
        const datosCompletos = s.tipo === "historial" ? historialOrdenado : s.tipo === "viendo" ? viendo : s.tipo === "abandonada" ? abandonadas : sinComenzar;
        return { ...s, data: s.colapsable && !abierta ? [] : datosCompletos, cantidad: datosCompletos.length };
      })}
      keyExtractor={(item: any, i) => `${item.tmdb_id ?? item.series_tmdb_id}-${i}`}
      onContentSizeChange={() => {
        if (!yaScrolleoRef.current) scrollAVerAContinuacion(2);
      }}
      renderSectionHeader={({ section }) =>
        section.colapsable ? (
          <Pressable
            style={styles.seccionTituloBtn}
            onPress={() => {
              if (section.tipo === "abandonada") setAbandonadaAbierta((v) => !v);
              else setSinComenzarAbierta((v) => !v);
            }}
          >
            <Text style={styles.seccionTituloEnBoton}>
              {section.titulo} ({(section as any).cantidad})
            </Text>
            <Ionicons
              name={(section.tipo === "abandonada" ? abandonadaAbierta : sinComenzarAbierta) ? "chevron-up" : "chevron-down"}
              size={18}
              color={theme.colors.textMuted}
            />
          </Pressable>
        ) : (
          <Text style={styles.seccionTitulo}>{section.titulo}</Text>
        )
      }
      renderItem={({ item, section }) => {
        if (section.tipo === "historial") {
          const h = item as EventoHistorial;
          return (
            <Pressable
              style={styles.filaHistorial}
              onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: h.series_tmdb_id, tipo: "series" })}
            >
              {h.poster_path && <Image source={{ uri: posterUrl(h.poster_path, "w185")! }} style={styles.filaPosterHistorial} />}
              <View style={styles.filaInfo}>
                <Text style={styles.filaTituloHistorial}>{h.series_name}</Text>
                <Text style={styles.filaSubHistorial} numberOfLines={1}>
                  {`T${String(h.season_number).padStart(2, "0")} - E${String(h.episode_number).padStart(2, "0")}${h.episode_name ? `: ${h.episode_name}` : ""}`}
                </Text>
              </View>
              <View style={styles.tildeHistorial}>
                <Text style={styles.tildeHistorialTexto}>✓</Text>
              </View>
            </Pressable>
          );
        }
        const s = item as SerieListado;
        if (section.tipo === "viendo" && viendo.length === 0) {
          return <Text style={styles.vacio}>{t("Agregá series para empezar a trackear.")}</Text>;
        }
        return <FilaSerie item={s} onTocarTilde={() => tocarSiguienteCapitulo(s)} navigation={navigation} />;
      }}
    />
    <ConfirmModal
      visible={!!confirmAnteriores}
      onCerrar={() => resolverConAnteriores(false)}
      titulo={t("¿Marcar los anteriores también?")}
      mensaje={confirmAnteriores ? t("Hay {n} episodios sin ver antes de este.").replace("{n}", String(confirmAnteriores.anteriores.length)) : ""}
      botones={[
        { label: t("Solo este"), onPress: () => resolverConAnteriores(false) },
        { label: t("Marcar todos"), destacado: true, onPress: () => resolverConAnteriores(true) },
      ]}
    />
    {calificarModal && (
      <CalificarModal
        visible={!!calificarModal}
        onCerrar={() => setCalificarModal(null)}
        tipo="episode"
        tmdbId={calificarModal.tmdbId}
        temporada={calificarModal.temporada}
        episodio={calificarModal.episodio}
        titulo={calificarModal.nombreSerie}
        nombreEpisodio={calificarModal.nombreEpisodio}
      />
    )}
    </>
  );
}

function FilaSerie({
  item,
  onTocarTilde,
  navigation,
}: {
  item: SerieListado;
  onTocarTilde: () => Promise<void>;
  navigation: any;
}) {
  const { t } = useT();
  const [marcando, setMarcando] = useState(false);
  const opacidad = useRef(new Animated.Value(0)).current;

  function handleTilde() {
    setMarcando(true);
    const mutacion = onTocarTilde().catch((e) => console.error("Error al marcar el capítulo:", e));
    const animacion = new Promise<void>((resolve) => {
      Animated.sequence([
        Animated.timing(opacidad, { toValue: 1, duration: 350, useNativeDriver: false }),
        Animated.delay(900),
        Animated.timing(opacidad, { toValue: 0, duration: 400, useNativeDriver: false }),
      ]).start(() => resolve());
    });
    Promise.all([mutacion, animacion]).then(() => {
      setMarcando(false);
      // La serie ya se actualizó al toque en tocarSiguienteCapitulo — no
      // hace falta (ni conviene) recargar TODA la lista de nuevo acá.
    });
  }

  const episodiosRestantes = Math.max(0, (item.episodios_restantes ?? 1) - 1);
  const colorFondo = opacidad.interpolate({ inputRange: [0, 1], outputRange: [theme.colors.background, theme.colors.primary] });

  return (
    <Pressable
      style={styles.filaSerie}
      onPress={() =>
        item.next_episode_season != null &&
        navigation.navigate("EpisodioDetalle", {
          seriesTmdbId: item.tmdb_id,
          seasonNumber: item.next_episode_season,
          episodeNumber: item.next_episode_number,
          episodeName: null,
        })
      }
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colorFondo }]} />
      {item.poster_path && <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.filaPoster} />}
      <View style={styles.filaInfo}>
        <Pressable
          style={styles.filaTituloRow}
          onPress={(e) => {
            e.stopPropagation();
            navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: "series" });
          }}
        >
          <Text style={styles.filaTitulo} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.filaFlecha}>›</Text>
        </Pressable>
        {marcando ? (
          <Animated.Text style={[styles.filaSubMarcada, { opacity: opacidad }]}>
            {episodiosRestantes > 0 ? t("Te quedan {n} episodios").replace("{n}", String(episodiosRestantes)) : t("¡Terminaste la serie!")}
          </Animated.Text>
        ) : (
          item.next_episode_label && (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={styles.filaSub} numberOfLines={1}>
                {item.next_episode_label}
              </Text>
              {episodiosRestantes > 0 && <Text style={styles.filaMasCapitulos}> +{episodiosRestantes}</Text>}
            </View>
          )
        )}
      </View>
      <Pressable style={[styles.tildeBtn, marcando && styles.tildeBtnMarcado]} onPress={handleTilde} hitSlop={10} disabled={marcando}>
        <Text style={[styles.tildeTexto, marcando && styles.tildeTextoMarcado]}>✓</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topRow: { padding: 8 },
  seccion: { marginTop: 8, marginBottom: 4 },
  seccionTituloBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.surface,
    paddingVertical: 10,
  },
  seccionTitulo: { fontSize: 13, fontWeight: "700", backgroundColor: theme.colors.surface, padding: 10, textTransform: "uppercase", color: theme.colors.textMuted, letterSpacing: 0.5, textAlign: "center" },
  seccionTituloEnBoton: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", color: theme.colors.textMuted, letterSpacing: 0.5 },
  filaHistorial: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, opacity: 0.55 },
  filaPosterHistorial: { width: 40, height: 60, borderRadius: 4, marginRight: 12, backgroundColor: theme.colors.surfaceAlt },
  filaTituloHistorial: { fontSize: 14, fontWeight: "600", color: theme.colors.textMuted },
  filaSubHistorial: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  tildeHistorial: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.success, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  tildeHistorialTexto: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
  vacio: { color: theme.colors.textMuted, paddingHorizontal: 12 },
  historialCard: { width: 90, marginRight: 10 },
  historialPoster: { width: 90, height: 135, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt },
  historialTexto: { fontSize: 12, marginTop: 4, fontWeight: "600" },
  historialSub: { fontSize: 11, color: theme.colors.textMuted },
  filaSerie: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, position: "relative", overflow: "hidden" },
  filaSerieMarcada: { backgroundColor: theme.colors.primary },
  filaPoster: { width: 46, height: 69, borderRadius: 4, marginRight: 12, backgroundColor: theme.colors.surfaceAlt },
  filaInfo: { flex: 1 },
  filaTituloRow: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  filaTitulo: { fontSize: 15, fontWeight: "600", flexShrink: 1 },
  filaFlecha: { fontSize: 18, color: theme.colors.textMuted, marginLeft: 3 },
  filaSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2, flexShrink: 1 },
  filaMasCapitulos: { fontSize: 11, color: theme.colors.textFaint, marginTop: 2 },
  filaSubMarcada: { fontSize: 13, color: theme.colors.text, fontWeight: "700", marginTop: 2 },
  tildeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  tildeBtnMarcado: { backgroundColor: theme.colors.text, borderColor: theme.colors.text },
  tildeTexto: { color: theme.colors.primary, fontSize: 16, fontWeight: "700" },
  tildeTextoMarcado: { color: theme.colors.primary },
});
