import React, { useEffect, useState } from "react";
import { View, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { Alert } from "../lib/alert";
import EstadoVacio from "../components/EstadoVacio";
import RatingStars from "../components/RatingStars";
import SeriesProgressBar from "../components/SeriesProgressBar";
import UltimoCapituloBadge from "../components/UltimoCapituloBadge";
import OrdenTitulosPerfilModal from "../components/OrdenTitulosPerfilModal";
import ConfirmModal from "../components/ConfirmModal";
import CalificarModal from "../components/CalificarModal";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { listarSeriesEnCursoDeUsuario, SeriePerfilItem, OrdenTitulosPerfil } from "../lib/perfilTitulos";
import { progresoDeSeries, ProgresoSerie } from "../lib/seriesList";
import { seguirSerie } from "../lib/sync";
import { marcarTodaLaSerieVista } from "../lib/episodes";
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

export default function SeriesEnCursoPerfilScreen({ route, navigation }: any) {
  const { targetUserId } = route.params;
  const { t } = useT();
  const [items, setItems] = useState<SeriePerfilItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modoVista, setModoVista] = useState<"grilla" | "lista">("grilla");
  const [mostrarEstrellas, setMostrarEstrellas] = useState(true);
  const [ordenVisible, setOrdenVisible] = useState(false);
  const [orden, setOrden] = useState<OrdenTitulosPerfil>("ultima_vista");
  const [ascendente, setAscendente] = useState(false);

  // Tu propio progreso (no el de la persona cuyo perfil estás mirando)
  // para cada serie que aparece acá — así los botones de + y ojito
  // arrancan ya apretados si vos ya la seguís/la tenés vista.
  const [userId, setUserId] = useState<string | null>(null);
  const [progresoPropio, setProgresoPropio] = useState<Record<number, ProgresoSerie>>({});
  const [marcandoVisto, setMarcandoVisto] = useState<number | null>(null);
  const [confirmSerieVisible, setConfirmSerieVisible] = useState<SeriePerfilItem | null>(null);
  const [calificarModal, setCalificarModal] = useState<{ tmdbId: number; titulo: string; posterPath: string | null } | null>(null);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", targetUserId)
      .maybeSingle()
      .then(({ data }) => {
        navigation.setOptions({ title: `${t("Series de")} ${nombreOUsuario(data?.display_name, data?.username)}` });
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    listarSeriesEnCursoDeUsuario(targetUserId, orden, ascendente)
      .then(setItems)
      .catch((e) => console.error("Error al cargar series del perfil:", e))
      .finally(() => setLoading(false));
  }, [targetUserId, orden, ascendente]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      if (uid) progresoDeSeries(uid).then(setProgresoPropio);
    });
  }, []);

  function agregada(tmdbId: number) {
    return !!progresoPropio[tmdbId];
  }
  function vista(tmdbId: number) {
    const estado = progresoPropio[tmdbId]?.estado;
    return estado === "terminada" || estado === "al_dia";
  }

  async function agregarRapido(item: SeriePerfilItem) {
    if (!userId) return;
    try {
      await seguirSerie(userId, item.tmdb_id);
      setProgresoPropio((prev) => ({ ...prev, [item.tmdb_id]: prev[item.tmdb_id] ?? { estado: "sin_comenzar", porcentaje: 0, ultima_temporada_vista: null, ultimo_capitulo_visto: null, abandonada_manual: false } }));
    } catch (e: any) {
      Alert.alert(t("No se pudo agregar"), e.message ?? t("Revisá tu conexión y probá de nuevo."));
    }
  }

  function marcarVistaRapida(item: SeriePerfilItem) {
    if (!userId || vista(item.tmdb_id)) return;
    if (item.first_air_date && item.first_air_date > hoyLocalISO()) return; // todavía no se estrenó
    setConfirmSerieVisible(item);
  }

  async function confirmarMarcarSerieVista() {
    const item = confirmSerieVisible;
    setConfirmSerieVisible(null);
    if (!item || !userId) return;
    setMarcandoVisto(item.tmdb_id);
    try {
      await seguirSerie(userId, item.tmdb_id);
      await marcarTodaLaSerieVista(userId, item.tmdb_id);
      setProgresoPropio((prev) => ({ ...prev, [item.tmdb_id]: { estado: "terminada", porcentaje: 100, ultima_temporada_vista: prev[item.tmdb_id]?.ultima_temporada_vista ?? null, ultimo_capitulo_visto: prev[item.tmdb_id]?.ultimo_capitulo_visto ?? null, abandonada_manual: false } }));
      setCalificarModal({ tmdbId: item.tmdb_id, titulo: item.name, posterPath: item.poster_path });
    } catch (e: any) {
      Alert.alert(t("No se pudo marcar como vista"), e.message ?? t("Revisá tu conexión y probá de nuevo."));
    } finally {
      setMarcandoVisto(null);
    }
  }

  /** "No, no la vi toda": se agrega igual (para que quede en tus pendientes) y se abre directo en episodios, para marcar a mano hasta dónde viste. */
  async function noVistaCompleta() {
    const item = confirmSerieVisible;
    setConfirmSerieVisible(null);
    if (!item || !userId) return;
    try {
      await seguirSerie(userId, item.tmdb_id);
      setProgresoPropio((prev) => ({ ...prev, [item.tmdb_id]: prev[item.tmdb_id] ?? { estado: "sin_comenzar", porcentaje: 0, ultima_temporada_vista: null, ultimo_capitulo_visto: null, abandonada_manual: false } }));
      navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: "series", tabInicial: "episodios" });
    } catch (e: any) {
      Alert.alert(t("No se pudo agregar"), e.message ?? t("Revisá tu conexión y probá de nuevo."));
    }
  }

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
        <FlatList
          key="lista"
          data={items}
          keyExtractor={(s) => String(s.tmdb_id)}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={<EstadoVacio icono="tv-outline" titulo={t("Todavía no empezó ninguna serie.")} />}
          ListHeaderComponent={
            items.length > 0 ? (
              <View style={styles.seccionTituloWrap}>
                <Text style={styles.seccionTitulo}>{t("Vistas/Viendo/Abandonadas")}</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable style={styles.filaLista} onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: "series" })}>
              {item.poster_path ? (
                <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.miniPoster} />
              ) : (
                <View style={[styles.miniPoster, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.filaListaTitulo} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.filaListaSub}>
                  {item.total_seasons ? `${item.total_seasons} ${item.total_seasons === 1 ? t("temporada") : t("temporadas")}` : ""}
                  {item.first_air_date ? ` · ${item.first_air_date.slice(0, 4)}` : ""}
                </Text>
                {mostrarEstrellas && <RatingStars rating={item.rating} size={11} />}
                {(item.estado === "viendo" || item.estado === "abandonada") && item.ultimo_capitulo_visto != null && (
                  <View style={styles.capituloListaRow}>
                    <UltimoCapituloBadge temporada={item.ultima_temporada_vista!} capitulo={item.ultimo_capitulo_visto} />
                  </View>
                )}
                <SeriesProgressBar estado={item.estado} porcentaje={item.porcentaje} abandonadaManual={item.abandonada_manual} />
              </View>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          key="grilla"
          data={agruparDeATres(items)}
          keyExtractor={(fila) => fila.map((s) => s.tmdb_id).join("-")}
          contentContainerStyle={{ padding: 8 }}
          ListEmptyComponent={<EstadoVacio icono="tv-outline" titulo={t("Todavía no empezó ninguna serie.")} />}
          ListHeaderComponent={
            items.length > 0 ? (
              <View style={styles.seccionTituloWrap}>
                <Text style={styles.seccionTitulo}>{t("Vistas/Viendo/Abandonadas")}</Text>
              </View>
            ) : null
          }
          renderItem={({ item: fila }) => (
            <View style={{ flexDirection: "row" }}>
              {fila.map((item) => {
                const aunNoEstrena = !!item.first_air_date && item.first_air_date > hoyLocalISO();
                const yaVista = vista(item.tmdb_id);
                const yaAgregada = agregada(item.tmdb_id);
                return (
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
                      {(item.estado === "viendo" || item.estado === "abandonada") && item.ultimo_capitulo_visto != null && (
                        <UltimoCapituloBadge
                          temporada={item.ultima_temporada_vista!}
                          capitulo={item.ultimo_capitulo_visto}
                          style={styles.capituloOverlayGrilla}
                        />
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
                    <SeriesProgressBar estado={item.estado} porcentaje={item.porcentaje} abandonadaManual={item.abandonada_manual} />
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
          tipo="series"
          tmdbId={calificarModal.tmdbId}
          titulo={calificarModal.titulo}
          posterPath={calificarModal.posterPath}
          navigation={navigation}
        />
      )}
      <ConfirmModal
        visible={!!confirmSerieVisible}
        onCerrar={() => setConfirmSerieVisible(null)}
        titulo={t("¿Viste toda la serie?")}
        mensaje={t("Marcar todos los episodios como vistos")}
        botones={[
          { label: t("No"), onPress: noVistaCompleta },
          { label: t("Sí"), destacado: true, onPress: confirmarMarcarSerieVista },
        ]}
      />

      <OrdenTitulosPerfilModal
        visible={ordenVisible}
        onCerrar={() => setOrdenVisible(false)}
        orden={orden}
        ascendente={ascendente}
        onCambiar={(o, asc) => {
          setOrden(o);
          setAscendente(asc);
        }}
        labelUltimaVista={t("Lo último que ha visto")}
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
  capituloOverlayGrilla: { position: "absolute", top: 4, left: 4 },
  capituloListaRow: { alignItems: "flex-end", marginTop: 2 },
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
