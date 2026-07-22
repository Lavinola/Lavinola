import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { View, FlatList, SectionList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../lib/pagination";
import { posterUrl } from "../lib/tmdb";
import { listarFavoritos, moverFavorito, Favorito } from "../lib/favorites";
import FiltroPeliculasModal, { OrdenPeliculas, FiltroEstadoPelicula } from "../components/FiltroPeliculasModal";
import RatingStars from "../components/RatingStars";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type Orden = OrdenPeliculas | "personalizado";

function agruparDeATres<T>(lista: T[]): T[][] {
  const filas: T[][] = [];
  for (let i = 0; i < lista.length; i += 3) filas.push(lista.slice(i, i + 3));
  return filas;
}

interface PeliculaRow {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  watched: boolean;
  watched_at: string | null;
  runtime_minutes: number | null;
  release_date: string | null;
  rating: number | null;
  genre_ids: number[];
}

export default function AllMoviesScreen({ route, navigation }: any) {
  const { t } = useT();
  const targetUserId: string | undefined = route.params?.targetUserId;
  const soloFavoritas = !!route.params?.soloFavoritas || !!targetUserId;
  const soloLectura = !!targetUserId;
  const [movies, setMovies] = useState<PeliculaRow[]>([]);
  const [favoritos, setFavoritos] = useState<Favorito[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<FiltroEstadoPelicula>("todo");
  const [orden, setOrden] = useState<Orden>(soloFavoritas ? "personalizado" : "añadida");
  const [ascendente, setAscendente] = useState(false);
  const [generoId, setGeneroId] = useState<number | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [modoReordenar, setModoReordenar] = useState(false);
  const [vista, setVista] = useState<"grilla" | "lista">("grilla");
  const [mostrarEstrellas, setMostrarEstrellas] = useState(!soloLectura);
  const [ojoActivo, setOjoActivo] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const yaCargoRef = useRef(false);

  useEffect(() => {
    if (soloFavoritas) {
      navigation.setOptions({
        headerTitle: () => (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: theme.colors.text }}>{t("Películas favoritas")}</Text>
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
    // película) lo hacemos calladito, para no reemplazar toda la lista por
    // una nueva y perder el lugar del scroll en el que estabas.
    const esPrimeraCarga = !yaCargoRef.current;
    if (esPrimeraCarga) setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = targetUserId ?? userData.user?.id;
    if (!uid) {
      setLoading(false);
      return;
    }
    setUserId(userData.user?.id ?? null);
    const data = await fetchAllRows((desde, hasta) =>
      supabase
        .from("user_movies")
        .select("watched, watched_at, custom_poster_path, rating, movies_cache(*)")
        .eq("user_id", uid)
        .order("added_at", { ascending: false })
        .range(desde, hasta)
    );

    const rows: PeliculaRow[] = (data ?? [])
      .filter((r: any) => r.movies_cache)
      .map((r: any) => ({
        tmdb_id: r.movies_cache.tmdb_id,
        title: r.movies_cache.title,
        poster_path: r.custom_poster_path ?? r.movies_cache.poster_path,
        watched: r.watched,
        watched_at: r.watched_at,
        runtime_minutes: r.movies_cache.runtime_minutes ?? null,
        release_date: r.movies_cache.release_date ?? null,
        rating: r.rating ?? null,
        genre_ids: r.movies_cache.genre_ids ?? [],
      }));
    setMovies(rows);

    if (soloFavoritas) {
      const favs = await listarFavoritos(uid);
      setFavoritos(favs.filter((f) => f.item_type === "movie"));
    }
    yaCargoRef.current = true;
    setLoading(false);
  }

  async function mover(tmdbId: number, direccion: "arriba" | "abajo") {
    if (!userId || soloLectura) return;
    await moverFavorito(userId, "movie", favoritos, tmdbId, direccion);
    cargar();
  }

  function ordenarPeliculas(lista: PeliculaRow[]): PeliculaRow[] {
    if (orden === "personalizado") {
      const posicion = new Map(favoritos.map((f, i) => [f.tmdb_id, i]));
      return [...lista].sort((a, b) => (posicion.get(a.tmdb_id) ?? 0) - (posicion.get(b.tmdb_id) ?? 0));
    }
    if (orden === "alfabetico") return [...lista].sort((a, b) => a.title.localeCompare(b.title));
    if (orden === "vista") return [...lista].sort((a, b) => (b.watched_at ?? "").localeCompare(a.watched_at ?? ""));
    if (orden === "lanzamiento") {
      return [...lista].sort((a, b) => {
        const cmp = (a.release_date ?? "").localeCompare(b.release_date ?? "");
        return ascendente ? cmp : -cmp;
      });
    }
    if (orden === "tu_puntuacion") {
      const conPuntuacion = lista.filter((m) => m.rating != null);
      const sinPuntuacion = lista.filter((m) => m.rating == null);
      conPuntuacion.sort((a, b) => (ascendente ? (a.rating ?? 0) - (b.rating ?? 0) : (b.rating ?? 0) - (a.rating ?? 0)));
      return [...conPuntuacion, ...sinPuntuacion];
    }
    return lista; // "añadida": ya viene ordenado así de la consulta
  }

  let listado: PeliculaRow[];
  if (soloFavoritas) {
    const favIds = new Set(favoritos.map((f) => f.tmdb_id));
    listado = movies.filter((m) => favIds.has(m.tmdb_id));
  } else {
    listado = movies;
  }
  if (filtro === "vista") listado = listado.filter((m) => m.watched);
  if (filtro === "no_vista") listado = listado.filter((m) => !m.watched);
  if (generoId !== null) listado = listado.filter((m) => m.genre_ids.includes(generoId));

  // Con el ojo activado, separamos en dos secciones tituladas (Vistas / No
  // vistas), cada una ordenada según el criterio elegido. Con el ojo
  // apagado, es una sola lista mezclada con ese mismo orden.
  //
  // Todo esto se memoiza junto (useMemo): antes se recalculaba de cero en
  // CADA render, incluso los que no tenían nada que ver con la lista (por
  // ejemplo, solo tocar el scroll) — con muchas películas, eso se sentía
  // como el scroll trabándose después de un rato.
  const { secciones, seccionesLista, seccionesGrilla } = useMemo(() => {
    const secc: { titulo: string | null; datos: PeliculaRow[] }[] =
      ojoActivo && !soloFavoritas
        ? [
            { titulo: t("Vistas"), datos: ordenarPeliculas(listado.filter((m) => m.watched)) },
            { titulo: t("No vistas"), datos: ordenarPeliculas(listado.filter((m) => !m.watched)) },
          ].filter((s) => s.datos.length > 0)
        : [{ titulo: null, datos: ordenarPeliculas(listado) }];
    return {
      secciones: secc,
      seccionesLista: secc.map((s) => ({ title: s.titulo, data: s.datos })),
      seccionesGrilla: secc.map((s) => ({ title: s.titulo, data: agruparDeATres(s.datos) })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies, favoritos, soloFavoritas, filtro, generoId, orden, ascendente, ojoActivo]);

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
        {!modoReordenar && !soloFavoritas && (
          <Pressable style={styles.iconBtn} onPress={() => setOjoActivo(!ojoActivo)}>
            <Ionicons name={ojoActivo ? "eye" : "eye-outline"} size={20} color={ojoActivo ? theme.colors.primaryLight : theme.colors.textMuted} />
          </Pressable>
        )}
        {soloFavoritas && !soloLectura && (
          <>
            <Pressable style={styles.iconBtn} onPress={() => setModoReordenar(!modoReordenar)}>
              <Ionicons name={modoReordenar ? "checkmark" : "swap-vertical"} size={20} color={theme.colors.text} />
            </Pressable>
            <Pressable style={styles.agregarQuitarBtn} onPress={() => navigation.navigate("GestionarFavoritas", { tipo: "movie" })}>
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
          data={ordenarPeliculas(listado)}
          keyExtractor={(m) => String(m.tmdb_id)}
          ListEmptyComponent={<Text style={styles.vacio}>{t("No hay películas acá todavía.")}</Text>}
          renderItem={({ item, index }) => (
            <View style={styles.filaReordenar}>
              {item.poster_path ? (
                <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.miniPoster} />
              ) : (
                <View style={[styles.miniPoster, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              <Text style={styles.filaReordenarTexto} numberOfLines={1}>
                {item.title}
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
          keyExtractor={(m) => String(m.tmdb_id)}
          contentContainerStyle={{ padding: 12 }}
          stickySectionHeadersEnabled={false}
          removeClippedSubviews
          maxToRenderPerBatch={12}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          initialNumToRender={12}
          ListEmptyComponent={<Text style={styles.vacio}>{t("No hay películas acá todavía.")}</Text>}
          renderSectionHeader={({ section }) => (section.title ? <View style={styles.seccionTituloWrap}><Text style={styles.seccionTitulo}>{section.title}</Text></View> : null)}
          renderItem={({ item }) => (
            <Pressable style={styles.filaLista} onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: "movie" })}>
              {item.poster_path ? (
                <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.miniPoster} />
              ) : (
                <View style={[styles.miniPoster, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.filaListaTitulo} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.filaListaSub}>
                  {item.release_date ? item.release_date.slice(0, 4) : ""}
                  {item.runtime_minutes ? ` · ${Math.floor(item.runtime_minutes / 60)} h ${item.runtime_minutes % 60} min` : ""}
                </Text>
                {mostrarEstrellas && <RatingStars rating={item.rating} size={11} />}
              </View>
            </Pressable>
          )}
        />
      ) : (
        <SectionList
          key="grilla"
          sections={seccionesGrilla}
          keyExtractor={(fila) => fila.map((m) => m.tmdb_id).join("-")}
          contentContainerStyle={{ padding: 8 }}
          stickySectionHeadersEnabled={false}
          removeClippedSubviews
          maxToRenderPerBatch={12}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          initialNumToRender={12}
          ListEmptyComponent={<Text style={styles.vacio}>{t("No hay películas acá todavía.")}</Text>}
          renderSectionHeader={({ section }) => (section.title ? <View style={styles.seccionTituloWrap}><Text style={styles.seccionTitulo}>{section.title}</Text></View> : null)}
          renderItem={({ item: fila }) => (
            <View style={{ flexDirection: "row" }}>
              {fila.map((item) => (
                <Pressable key={item.tmdb_id} style={styles.item} onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: "movie" })}>
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
                </Pressable>
              ))}
              {fila.length < 3 && Array.from({ length: 3 - fila.length }).map((_, i) => <View key={`vacio-${i}`} style={styles.item} />)}
            </View>
          )}
        />
      )}

      <FiltroPeliculasModal
        visible={menuVisible}
        onCerrar={() => setMenuVisible(false)}
        ordenActual={orden}
        ascendenteActual={ascendente}
        filtroActual={filtro}
        generoActual={generoId}
        mostrarOrdenPropio={soloFavoritas}
        mostrarEstado={!soloFavoritas}
        soloOpcionesBasicas={soloLectura}
        onAplicar={(o, f, asc, g) => {
          setOrden(o);
          setFiltro(f);
          setAscendente(asc);
          setGeneroId(g);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", padding: 12, gap: 10 },
  filtrosBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 8, paddingHorizontal: 18 },
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
