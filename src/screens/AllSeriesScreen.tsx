import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { View, FlatList, SectionList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { posterUrl } from "../lib/tmdb";
import { listarSeriesConEstado, progresoDeSeries, SerieListado, ProgresoSerie } from "../lib/seriesList";
import { listarFavoritos, moverFavorito, Favorito } from "../lib/favorites";
import SeriesProgressBar from "../components/SeriesProgressBar";
import RatingStars from "../components/RatingStars";
import FiltroSeriesModal, { OrdenSeries, CategoriaSerie, CATEGORIAS_SERIE } from "../components/FiltroSeriesModal";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type Orden = OrdenSeries | "personalizado";

/** "Sin ver por un tiempo" ya no es una categoría aparte para filtrar/agrupar acá — cuenta como "Viendo". */
function categoriaDe(s: SerieListado): CategoriaSerie {
  if (s.estado === "abandonada") return "viendo";
  return s.estado as CategoriaSerie;
}

function agruparDeATres<T>(lista: T[]): T[][] {
  const filas: T[][] = [];
  for (let i = 0; i < lista.length; i += 3) filas.push(lista.slice(i, i + 3));
  return filas;
}

export default function AllSeriesScreen({ route, navigation }: any) {
  const { t } = useT();
  const targetUserId: string | undefined = route.params?.targetUserId;
  const soloFavoritas = !!route.params?.soloFavoritas || !!targetUserId;
  const soloLectura = !!targetUserId;
  const [series, setSeries] = useState<SerieListado[]>([]);
  const [progreso, setProgreso] = useState<Record<number, ProgresoSerie>>({});
  const [favoritos, setFavoritos] = useState<Favorito[]>([]);
  const [loading, setLoading] = useState(true);
  const [categorias, setCategorias] = useState<CategoriaSerie[]>([]);
  const [orden, setOrden] = useState<Orden>(soloFavoritas ? "personalizado" : "visto");
  const [ascendente, setAscendente] = useState(false);
  const [generoId, setGeneroId] = useState<number | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [modoReordenar, setModoReordenar] = useState(false);
  const [vista, setVista] = useState<"grilla" | "lista">("grilla");
  const [mostrarEstrellas, setMostrarEstrellas] = useState(!soloLectura);
  const [ojoActivo, setOjoActivo] = useState(!soloFavoritas && !soloLectura);
  const [userId, setUserId] = useState<string | null>(null);
  const yaCargoRef = useRef(false);

  useEffect(() => {
    if (soloFavoritas) {
      navigation.setOptions({
        headerTitle: () => (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: theme.colors.text }}>{t("Series favoritas")}</Text>
            <Ionicons name="heart" size={16} color={theme.colors.primaryLight} style={{ marginLeft: 6 }} />
          </View>
        ),
      });
    }
  }, [soloFavoritas]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [])
  );

  async function cargar() {
    // Solo mostramos el spinner de carga completa la primera vez — en las
    // recargas de después (por ejemplo, al volver de ver el detalle de una
    // serie) lo hacemos calladito, para no reemplazar toda la lista por una
    // nueva y perder el lugar del scroll en el que estabas.
    const esPrimeraCarga = !yaCargoRef.current;
    if (esPrimeraCarga) setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = targetUserId ?? userData.user?.id;
    if (!uid) {
      setLoading(false);
      return;
    }
    setUserId(userData.user?.id ?? null);
    const [todas, prog] = await Promise.all([listarSeriesConEstado(uid), progresoDeSeries(uid)]);
    setSeries(todas);
    setProgreso(prog);

    if (soloFavoritas) {
      const favs = await listarFavoritos(uid);
      setFavoritos(favs.filter((f) => f.item_type === "series"));
    }
    yaCargoRef.current = true;
    setLoading(false);
  }

  async function mover(tmdbId: number, direccion: "arriba" | "abajo") {
    if (!userId || soloLectura) return;
    await moverFavorito(userId, "series", favoritos, tmdbId, direccion);
    cargar();
  }

  function ordenarSeries(lista: SerieListado[]): SerieListado[] {
    if (orden === "personalizado") {
      const posicion = new Map(favoritos.map((f, i) => [f.tmdb_id, i]));
      return [...lista].sort((a, b) => (posicion.get(a.tmdb_id) ?? 0) - (posicion.get(b.tmdb_id) ?? 0));
    }
    if (orden === "visto") return [...lista].sort((a, b) => (b.last_watched_at ?? "").localeCompare(a.last_watched_at ?? ""));
    if (orden === "alfabetico") return [...lista].sort((a, b) => (ascendente ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));
    if (orden === "tu_puntuacion") {
      const conPuntuacion = lista.filter((s) => s.rating != null);
      const sinPuntuacion = lista.filter((s) => s.rating == null);
      conPuntuacion.sort((a, b) => (ascendente ? (a.rating ?? 0) - (b.rating ?? 0) : (b.rating ?? 0) - (a.rating ?? 0)));
      return [...conPuntuacion, ...sinPuntuacion];
    }
    if (orden === "lanzamiento") {
      return [...lista].sort((a, b) => {
        const cmp = (a.primera_fecha ?? "").localeCompare(b.primera_fecha ?? "");
        return ascendente ? cmp : -cmp;
      });
    }
    return lista; // "añadido": ya viene ordenado así
  }

  let listado: SerieListado[];
  if (soloFavoritas) {
    const favIds = new Set(favoritos.map((f) => f.tmdb_id));
    listado = series.filter((s) => favIds.has(s.tmdb_id));
  } else {
    listado = series;
  }
  if (categorias.length > 0) listado = listado.filter((s) => categorias.includes(categoriaDe(s)));
  if (generoId !== null) listado = listado.filter((s) => s.genre_ids.includes(generoId));

  // Con el ojo activado, separamos en las 4 categorías (o solo las
  // seleccionadas en el filtro, si elegiste alguna puntual), cada una
  // titulada y ordenada según el criterio elegido. "Sin ver por un tiempo"
  // ya no es una categoría propia: esas series cuentan como "Viendo".
  //
  // Memoizado junto (useMemo): antes se recalculaba todo de cero en cada
  // render, aunque no tuviera nada que ver con la lista — con muchas
  // series, eso hacía que el scroll se empezara a trabar después de un rato.
  const categoriasDisponiblesAqui = soloFavoritas ? CATEGORIAS_SERIE.filter((c) => c.key !== "sin_comenzar") : CATEGORIAS_SERIE;
  const categoriasAMostrar = categorias.length > 0 ? categoriasDisponiblesAqui.filter((c) => categorias.includes(c.key)) : categoriasDisponiblesAqui;

  const { secciones, seccionesLista, seccionesGrilla } = useMemo(() => {
    const secc: { titulo: string | null; datos: SerieListado[] }[] = ojoActivo
      ? categoriasAMostrar
          .map((c) => ({ titulo: t(c.label), datos: ordenarSeries(listado.filter((s) => categoriaDe(s) === c.key)) }))
          .filter((s) => s.datos.length > 0)
      : [{ titulo: null, datos: ordenarSeries(listado) }];
    return {
      secciones: secc,
      seccionesLista: secc.map((s) => ({ title: s.titulo, data: s.datos })),
      seccionesGrilla: secc.map((s) => ({ title: s.titulo, data: agruparDeATres(s.datos) })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, favoritos, soloFavoritas, categorias, generoId, orden, ascendente, ojoActivo]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.topRow}>
        <Pressable style={styles.filtrosBtn} onPress={() => setMenuVisible(true)}>
          <Ionicons name="options" size={16} color={theme.colors.text} />
          <Text style={styles.filtrosBtnTexto}>{t("Filtros")}</Text>
        </Pressable>
        {!modoReordenar && (
          <Pressable style={styles.iconBtn} onPress={() => setVista(vista === "grilla" ? "lista" : "grilla")}>
            <Ionicons name={vista === "grilla" ? "list" : "grid"} size={20} color={theme.colors.text} />
          </Pressable>
        )}
        {!modoReordenar && (
          <Pressable style={styles.iconBtn} onPress={() => setMostrarEstrellas(!mostrarEstrellas)}>
            <Ionicons name="star" size={20} color={mostrarEstrellas ? theme.colors.primaryLight : theme.colors.textMuted} />
          </Pressable>
        )}
        {!modoReordenar && !soloLectura && (
          <Pressable style={styles.iconBtn} onPress={() => setOjoActivo(!ojoActivo)}>
            <Ionicons name={ojoActivo ? "eye" : "eye-outline"} size={20} color={ojoActivo ? theme.colors.primaryLight : theme.colors.textMuted} />
          </Pressable>
        )}
        {soloFavoritas && !soloLectura && (
          <>
            <Pressable style={styles.iconBtn} onPress={() => setModoReordenar(!modoReordenar)}>
              <Ionicons name={modoReordenar ? "checkmark" : "swap-vertical"} size={20} color={theme.colors.text} />
            </Pressable>
            <Pressable style={styles.agregarQuitarBtn} onPress={() => navigation.navigate("GestionarFavoritas", { tipo: "series" })}>
              <Text style={styles.agregarQuitarBtnTexto}>{t("Agregar/Quitar")}</Text>
            </Pressable>
          </>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : modoReordenar ? (
        <FlatList
          key="lista-reordenar"
          data={ordenarSeries(listado)}
          keyExtractor={(s) => String(s.tmdb_id)}
          ListEmptyComponent={<Text style={styles.vacio}>{t("No hay series acá todavía.")}</Text>}
          renderItem={({ item, index }) => (
            <View style={styles.filaReordenar}>
              {item.poster_path ? (
                <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.miniPoster} />
              ) : (
                <View style={[styles.miniPoster, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              <Text style={styles.filaReordenarTexto} numberOfLines={1}>
                {item.name}
              </Text>
              <Pressable onPress={() => mover(item.tmdb_id, "arriba")} disabled={index === 0} hitSlop={8} style={{ opacity: index === 0 ? 0.3 : 1 }}>
                <Ionicons name="chevron-up" size={22} color={theme.colors.text} />
              </Pressable>
              <Pressable onPress={() => mover(item.tmdb_id, "abajo")} disabled={index === listado.length - 1} hitSlop={8} style={{ opacity: index === listado.length - 1 ? 0.3 : 1, marginLeft: 8 }}>
                <Ionicons name="chevron-down" size={22} color={theme.colors.text} />
              </Pressable>
            </View>
          )}
        />
      ) : vista === "lista" ? (
        <SectionList
          key="lista"
          sections={seccionesLista}
          keyExtractor={(s) => String(s.tmdb_id)}
          contentContainerStyle={{ padding: 12 }}
          stickySectionHeadersEnabled={false}
          removeClippedSubviews
          maxToRenderPerBatch={12}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          initialNumToRender={12}
          ListEmptyComponent={<Text style={styles.vacio}>{t("No hay series acá todavía.")}</Text>}
          renderSectionHeader={({ section }) => (section.title ? <View style={styles.seccionTituloWrap}><Text style={styles.seccionTitulo}>{section.title}</Text></View> : null)}
          renderItem={({ item }) => (
            <Pressable style={styles.filaLista} onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: "series" })}>
              {item.poster_path ? (
                <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.miniPoster} />
              ) : (
                <View style={[styles.miniPoster, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.filaListaTitulo} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.filaListaSub}>
                  {item.total_seasons ? `${item.total_seasons} ${item.total_seasons === 1 ? t("temporada") : t("temporadas")}` : ""}
                  {item.anio ? ` · ${item.anio}` : ""}
                </Text>
                {mostrarEstrellas && <RatingStars rating={item.rating} size={11} />}
                {!soloLectura && <SeriesProgressBar estado={item.estado} porcentaje={progreso[item.tmdb_id]?.porcentaje ?? 0} />}
              </View>
            </Pressable>
          )}
        />
      ) : (
        <SectionList
          key="grilla"
          sections={seccionesGrilla}
          keyExtractor={(fila) => fila.map((s) => s.tmdb_id).join("-")}
          contentContainerStyle={{ padding: 8 }}
          stickySectionHeadersEnabled={false}
          removeClippedSubviews
          maxToRenderPerBatch={12}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          initialNumToRender={12}
          ListEmptyComponent={<Text style={styles.vacio}>{t("No hay series acá todavía.")}</Text>}
          renderSectionHeader={({ section }) => (section.title ? <View style={styles.seccionTituloWrap}><Text style={styles.seccionTitulo}>{section.title}</Text></View> : null)}
          renderItem={({ item: fila }) => (
            <View style={{ flexDirection: "row" }}>
              {fila.map((item) => (
                <Pressable key={item.tmdb_id} style={styles.item} onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: "series" })}>
                  <View style={{ position: "relative" }}>
                    {item.poster_path ? (
                      <Image source={{ uri: posterUrl(item.poster_path, "w342")! }} style={styles.poster} />
                    ) : (
                      <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
                    )}
                    {mostrarEstrellas && item.rating != null && (
                      <View style={styles.estrellasOverlay}>
                        <RatingStars rating={item.rating} size={11} />
                      </View>
                    )}
                  </View>
                  {!soloLectura && <SeriesProgressBar estado={item.estado} porcentaje={progreso[item.tmdb_id]?.porcentaje ?? 0} />}
                </Pressable>
              ))}
              {fila.length < 3 && Array.from({ length: 3 - fila.length }).map((_, i) => <View key={`vacio-${i}`} style={styles.item} />)}
            </View>
          )}
        />
      )}

      <FiltroSeriesModal
        visible={menuVisible}
        onCerrar={() => setMenuVisible(false)}
        ordenActual={orden}
        ascendenteActual={ascendente}
        categoriasActuales={categorias}
        generoActual={generoId}
        mostrarOrdenPropio={soloFavoritas}
        mostrarEstado={!soloLectura}
        soloOpcionesBasicas={soloLectura}
        categoriasDisponibles={soloFavoritas ? categoriasDisponiblesAqui.map((c) => c.key) : undefined}
        onAplicar={(o, cats, asc, g) => {
          setOrden(o);
          setCategorias(cats);
          setAscendente(asc);
          setGeneroId(g);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", padding: 12, gap: 6 },
  filtrosBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 8, paddingHorizontal: 12 },
  filtrosBtnTexto: { color: "#000000", fontWeight: "700", fontSize: 13 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  agregarQuitarBtn: { paddingHorizontal: 12, height: 36, borderRadius: 18, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  agregarQuitarBtnTexto: { fontSize: 12, fontWeight: "700", color: theme.colors.text },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24, width: "100%" },
  ayudaReordenar: { textAlign: "center", color: theme.colors.textMuted, fontSize: 12, paddingBottom: 8 },
  item: { flex: 1 / 3, padding: 4 },
  poster: { width: "100%", aspectRatio: 2 / 3, borderRadius: 6 },
  estrellasOverlay: {
    position: "absolute",
    bottom: 4,
    left: 0,
    right: 0,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingVertical: 2,
    marginHorizontal: 4,
    borderRadius: 4,
  },
  filaReordenar: { flexDirection: "row", alignItems: "center", padding: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, backgroundColor: theme.colors.background },
  filaReordenarActiva: { backgroundColor: theme.colors.surfaceAlt, opacity: 0.9 },
  miniPoster: { width: 40, height: 60, borderRadius: 4, marginRight: 10 },
  filaReordenarTexto: { flex: 1, fontSize: 14, marginRight: 8 },
  filaLista: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  filaListaTitulo: { fontSize: 15, fontWeight: "600" },
  filaListaSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  seccionTituloWrap: { width: "100%", alignItems: "center" },
  seccionTitulo: {
    backgroundColor: theme.colors.surfaceAlt,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: theme.radius.pill,
    marginVertical: 10,
  },
});
