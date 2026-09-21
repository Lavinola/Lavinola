import React, { useEffect, useState } from "react";
import { View, SectionList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { Alert } from "../lib/alert";
import EstadoVacio from "../components/EstadoVacio";
import RatingStars from "../components/RatingStars";
import SeriesProgressBar from "../components/SeriesProgressBar";
import OrdenTitulosPerfilModal from "../components/OrdenTitulosPerfilModal";
import CalificarModal from "../components/CalificarModal";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { listarPeliculasVistasDeUsuario, PeliculaPerfilItem, OrdenTitulosPerfil } from "../lib/perfilTitulos";
import { agregarPelicula } from "../lib/sync";
import { toggleVistaPelicula } from "../lib/watchStatus";
import { hoyLocalISO } from "../lib/dates";
import { posterUrl } from "../lib/tmdb";
import { nombreOUsuario } from "../components/NombreUsuario";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

function agruparDeATres<T>(lista: T[]): T[][] {
  const filas: T[][] = [];
  for (let i = 0; i < lista.length; i += 3) filas.push(lista.slice(i, i + 3));
  return filas;
}

export default function PeliculasVistasPerfilScreen({ route, navigation }: any) {
  const { targetUserId } = route.params;
  const { t } = useT();
  const [items, setItems] = useState<PeliculaPerfilItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modoVista, setModoVista] = useState<"grilla" | "lista">("grilla");
  const [mostrarEstrellas, setMostrarEstrellas] = useState(true);
  const [ordenVisible, setOrdenVisible] = useState(false);
  const [orden, setOrden] = useState<OrdenTitulosPerfil>("ultima_vista");
  const [ascendente, setAscendente] = useState(false);

  // Tu propio estado (no el de la persona cuyo perfil estás mirando) para
  // cada título que aparece acá — así los botones de + y ojito arrancan
  // ya apretados si vos ya la tenés agregada/vista.
  const [userId, setUserId] = useState<string | null>(null);
  const [agregadasPropias, setAgregadasPropias] = useState<Set<number>>(new Set());
  const [vistasPropias, setVistasPropias] = useState<Set<number>>(new Set());
  const [marcandoVisto, setMarcandoVisto] = useState<number | null>(null);
  const [calificarModal, setCalificarModal] = useState<{ tmdbId: number; titulo: string; posterPath: string | null } | null>(null);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", targetUserId)
      .maybeSingle()
      .then(({ data }) => {
        navigation.setOptions({ title: `${t("Películas de")} ${nombreOUsuario(data?.display_name, data?.username)}` });
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([listarPeliculasVistasDeUsuario(targetUserId, orden, ascendente), supabase.auth.getSession()])
      .then(([lista, sesion]) => {
        setItems(lista);
        setUserId(sesion.data.session?.user?.id ?? null);
      })
      .catch((e) => console.error("Error al cargar películas vistas del perfil:", e))
      .finally(() => setLoading(false));
  }, [targetUserId, orden, ascendente]);

  // Una sola consulta para todas las películas que aparecen acá, en vez
  // de una por título.
  useEffect(() => {
    if (!userId || items.length === 0) return;
    let cancelado = false;
    supabase
      .from("user_movies")
      .select("movie_tmdb_id, watched")
      .eq("user_id", userId)
      .in(
        "movie_tmdb_id",
        items.map((i) => i.tmdb_id)
      )
      .then(({ data }) => {
        if (cancelado) return;
        setAgregadasPropias(new Set((data ?? []).map((r: any) => r.movie_tmdb_id)));
        setVistasPropias(new Set((data ?? []).filter((r: any) => r.watched).map((r: any) => r.movie_tmdb_id)));
      });
    return () => {
      cancelado = true;
    };
  }, [userId, items]);

  async function agregarRapido(item: PeliculaPerfilItem) {
    if (!userId) return;
    try {
      await agregarPelicula(userId, item.tmdb_id);
      setAgregadasPropias((prev) => new Set(prev).add(item.tmdb_id));
    } catch (e: any) {
      Alert.alert(t("No se pudo agregar"), e.message ?? t("Revisá tu conexión y probá de nuevo."));
    }
  }

  async function marcarVistaRapida(item: PeliculaPerfilItem) {
    if (!userId || vistasPropias.has(item.tmdb_id)) return;
    if (item.release_date && item.release_date > hoyLocalISO()) return; // todavía no se estrenó
    setMarcandoVisto(item.tmdb_id);
    try {
      await agregarPelicula(userId, item.tmdb_id);
      await toggleVistaPelicula(userId, item.tmdb_id, true);
      setAgregadasPropias((prev) => new Set(prev).add(item.tmdb_id));
      setVistasPropias((prev) => new Set(prev).add(item.tmdb_id));
      setCalificarModal({ tmdbId: item.tmdb_id, titulo: item.title, posterPath: item.poster_path });
    } catch (e: any) {
      Alert.alert(t("No se pudo marcar como vista"), e.message ?? t("Revisá tu conexión y probá de nuevo."));
    } finally {
      setMarcandoVisto(null);
    }
  }

  const seccionesLista = [{ title: t("Vistas"), data: items }];
  const seccionesGrilla = [{ title: t("Vistas"), data: agruparDeATres(items) }];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.topRow}>
        <Pressable style={styles.iconBtn} onPress={() => setOrdenVisible(true)}>
          <Ionicons name="swap-vertical" size={20} color={theme.colors.text} />
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => setModoVista(modoVista === "grilla" ? "lista" : "grilla")}>
          <Ionicons name={modoVista === "grilla" ? "list" : "grid"} size={20} color={theme.colors.text} />
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => setMostrarEstrellas(!mostrarEstrellas)}>
          <Ionicons name="star" size={20} color={mostrarEstrellas ? theme.colors.primaryLight : theme.colors.textMuted} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 32 }} />
      ) : modoVista === "lista" ? (
        <SectionList
          key="lista"
          sections={seccionesLista}
          keyExtractor={(m) => String(m.tmdb_id)}
          contentContainerStyle={{ padding: 12 }}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={<EstadoVacio icono="film-outline" titulo={t("Todavía no vio ninguna película.")} />}
          renderSectionHeader={({ section }) =>
            items.length > 0 ? (
              <View style={styles.seccionTituloWrap}>
                <Text style={styles.seccionTitulo}>{section.title}</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable style={styles.filaLista} onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: "movie" })}>
              {item.poster_path ? (
                <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.miniPoster} />
              ) : (
                <View style={[styles.miniPoster, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.filaListaTitulo} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.filaListaSub}>
                  {item.release_date ? item.release_date.slice(0, 4) : ""}
                  {item.runtime_minutes ? ` · ${Math.floor(item.runtime_minutes / 60)} h ${item.runtime_minutes % 60} min` : ""}
                </Text>
                {mostrarEstrellas && <RatingStars rating={item.rating} size={11} />}
                <SeriesProgressBar estado="terminada" porcentaje={100} />
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
          ListEmptyComponent={<EstadoVacio icono="film-outline" titulo={t("Todavía no vio ninguna película.")} />}
          renderSectionHeader={({ section }) =>
            items.length > 0 ? (
              <View style={styles.seccionTituloWrap}>
                <Text style={styles.seccionTitulo}>{section.title}</Text>
              </View>
            ) : null
          }
          renderItem={({ item: fila }) => (
            <View style={{ flexDirection: "row" }}>
              {fila.map((item) => {
                const aunNoEstrena = !!item.release_date && item.release_date > hoyLocalISO();
                const yaVista = vistasPropias.has(item.tmdb_id);
                const yaAgregada = agregadasPropias.has(item.tmdb_id);
                return (
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
                      {userId && (
                        <>
                          <Pressable
                            style={[styles.ojoBtn, yaVista && styles.botonActivo, aunNoEstrena && styles.ojoBtnApagado]}
                            onPress={() => marcarVistaRapida(item)}
                            disabled={yaVista || marcandoVisto === item.tmdb_id || aunNoEstrena}
                            hitSlop={6}
                          >
                            {marcandoVisto === item.tmdb_id ? (
                              <ActivityIndicator size="small" color={theme.colors.primaryLight} />
                            ) : (
                              <Ionicons name="eye" size={14} color={yaVista ? "#000000" : aunNoEstrena ? theme.colors.textFaint : theme.colors.primaryLight} />
                            )}
                          </Pressable>
                          <Pressable
                            style={[styles.masBtn, yaAgregada && styles.botonActivo]}
                            onPress={() => agregarRapido(item)}
                            disabled={yaAgregada}
                            hitSlop={6}
                          >
                            <Text style={[styles.masBtnTexto, yaAgregada && styles.masBtnTextoActivo]}>{yaAgregada ? "✓" : "+"}</Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                    <SeriesProgressBar estado="terminada" porcentaje={100} />
                  </Pressable>
                );
              })}
              {fila.length < 3 && Array.from({ length: 3 - fila.length }).map((_, i) => <View key={`vacio-${i}`} style={styles.item} />)}
            </View>
          )}
        />
      )}

      {calificarModal && (
        <CalificarModal
          visible={!!calificarModal}
          onCerrar={() => setCalificarModal(null)}
          tipo="movie"
          tmdbId={calificarModal.tmdbId}
          titulo={calificarModal.titulo}
          posterPath={calificarModal.posterPath}
          navigation={navigation}
        />
      )}

      <OrdenTitulosPerfilModal
        visible={ordenVisible}
        onCerrar={() => setOrdenVisible(false)}
        orden={orden}
        ascendente={ascendente}
        onCambiar={(o, asc) => {
          setOrden(o);
          setAscendente(asc);
        }}
        labelUltimaVista={t("Últimas vistas")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", padding: 12, gap: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
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
  miniPoster: { width: 40, height: 60, borderRadius: 4, marginRight: 10 },
  masBtn: {
    position: "absolute",
    top: 40,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    backgroundColor: "rgba(10,10,10,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  ojoBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    backgroundColor: "rgba(10,10,10,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  ojoBtnApagado: { borderColor: theme.colors.textFaint, opacity: 0.5 },
  botonActivo: { backgroundColor: theme.colors.primary },
  masBtnTexto: { color: theme.colors.primaryLight, fontSize: 15, fontWeight: "800", lineHeight: 15 },
  masBtnTextoActivo: { color: "#000000" },
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
