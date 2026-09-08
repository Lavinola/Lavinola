import React, { useEffect, useState, useCallback } from "react";
import { View, FlatList, Image, Pressable, Modal, ScrollView, TextInput, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaProvider, SafeAreaInsetsContext } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Text, AppButton } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { getSeriesWatchProviders, getMovieWatchProviders, getWatchProvidersDisponibles, posterUrl, GrupoPlataforma } from "../lib/tmdb";
import { topTitulosMensual, ItemTopMensual } from "../lib/topMensual";
import { seguirSerie, agregarPelicula } from "../lib/sync";
import { marcarTodaLaSerieVista } from "../lib/episodes";
import { toggleVistaPelicula } from "../lib/watchStatus";
import CalificarModal from "../components/CalificarModal";
import ConfirmModal from "../components/ConfirmModal";
import { PAISES } from "../lib/countries";
import { GENEROS_SERIES, GENEROS_PELICULAS } from "../lib/tmdbGenres";
import UnderlineTabs from "../components/UnderlineTabs";
import { Ionicons } from "@expo/vector-icons";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function TopMonthlyScreen({ navigation }: any) {
  const { t } = useT();
  const [miPais, setMiPais] = useState<string | null>(null);
  const [alcance, setAlcance] = useState<"pais" | "global">("global");
  const [tipo, setTipo] = useState<"movie" | "series">("movie");
  const [items, setItems] = useState<ItemTopMensual[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [agregados, setAgregados] = useState<Set<number>>(new Set());
  const [vistos, setVistos] = useState<Set<number>>(new Set());
  const [marcandoVisto, setMarcandoVisto] = useState<number | null>(null);
  const [confirmSerieVisible, setConfirmSerieVisible] = useState<ItemTopMensual | null>(null);
  const [calificarModal, setCalificarModal] = useState<{
    tipo: "movie" | "series";
    tmdbId: number;
    titulo: string;
    posterPath: string | null;
  } | null>(null);
  const [generoId, setGeneroId] = useState<number | null>(null);
  const [filtrosVisible, setFiltrosVisible] = useState(false);
  const [plataformas, setPlataformas] = useState<string[]>([]);
  const [plataformasDisponibles, setPlataformasDisponibles] = useState<GrupoPlataforma[]>([]);
  const [paisPickerVisible, setPaisPickerVisible] = useState(false);
  const [busquedaPais, setBusquedaPais] = useState("");

  const eligioManualRef = React.useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session?.user) return;
      setUserId(data.session?.user?.id);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (eligioManualRef.current) return; // ya eligió un país a mano en esta sesión, no lo pisamos
      supabase.auth.getSession().then(async ({ data }) => {
        if (!data.session?.user) return;
        const { data: perfil } = await supabase.from("profiles").select("country").eq("id", data.session?.user?.id).maybeSingle();
        const pais = perfil?.country ?? null;
        setMiPais((actual) => {
          if (actual === pais) return actual;
          setAlcance(pais ? "pais" : "global");
          return pais;
        });
      });
    }, [])
  );

  useEffect(() => {
    cargar();
  }, [alcance, tipo, miPais, userId, generoId, plataformas]);

  useEffect(() => {
    getWatchProvidersDisponibles(tipo, miPais ?? "AR").then(setPlataformasDisponibles);
    setPlataformas([]);
  }, [tipo, miPais]);

  async function cargar() {
    setLoading(true);
    setAgregados(new Set());
    try {
      const country = alcance === "pais" ? miPais : null;
      let lista = await topTitulosMensual(tipo, country, generoId);

      if (plataformas.length > 0 && lista.length > 0) {
        const watchRegion = miPais ?? "AR";
        const esOtras = plataformas.includes("otras");
        const universoIds = plataformasDisponibles.filter((g) => g.clave !== "otras").flatMap((g) => g.provider_ids);
        const idsElegidos = esOtras ? [] : plataformasDisponibles.filter((g) => plataformas.includes(g.clave)).flatMap((g) => g.provider_ids);
        const resultados = await Promise.all(
          lista.map(async (item) => {
            const p = tipo === "series" ? await getSeriesWatchProviders(item.tmdb_id, watchRegion) : await getMovieWatchProviders(item.tmdb_id, watchRegion);
            // No solo "flatrate" (suscripción) — algunas plataformas, sobre
            // todo Apple TV, ofrecen bastante contenido para alquilar o
            // comprar por fuera de su catálogo de suscripción. Contarlo
            // como "disponible ahí" es más fiel a lo que la persona
            // realmente ve al elegir ese logo.
            const idsDisponibles = [...(p?.flatrate ?? []), ...(p?.rent ?? []), ...(p?.buy ?? [])].map((prov: any) => prov.provider_id);
            const coincideCurada = idsDisponibles.some((id: number) => (esOtras ? universoIds : idsElegidos).includes(id));
            return { item, pasa: esOtras ? !coincideCurada : coincideCurada };
          })
        );
        lista = resultados.filter((r) => r.pasa).map((r) => r.item);
      }

      setItems(lista);

      if (userId && lista.length > 0) {
        const ids = lista.map((i) => i.tmdb_id);
        const tabla = tipo === "series" ? "user_series" : "user_movies";
        const columna = tipo === "series" ? "series_tmdb_id" : "movie_tmdb_id";
        const { data: yaTengo } = await supabase.from(tabla).select(columna).eq("user_id", userId).in(columna, ids);
        setAgregados(new Set((yaTengo ?? []).map((r: any) => r[columna])));

        // Vistas: para películas, watched=true. Para series no hay un
        // booleano único (se arma por episodio) — se usa last_watched_at,
        // que es justo lo que deja marcado marcarTodaLaSerieVista.
        const { data: yaVistas } =
          tipo === "series"
            ? await supabase.from("user_series").select("series_tmdb_id").eq("user_id", userId).in("series_tmdb_id", ids).not("last_watched_at", "is", null)
            : await supabase.from("user_movies").select("movie_tmdb_id").eq("user_id", userId).in("movie_tmdb_id", ids).eq("watched", true);
        setVistos(new Set((yaVistas ?? []).map((r: any) => r[columna])));
      }
    } finally {
      setLoading(false);
    }
  }

  async function agregarRapido(item: ItemTopMensual) {
    if (!userId) return;
    try {
      if (tipo === "series") await seguirSerie(userId, item.tmdb_id);
      else await agregarPelicula(userId, item.tmdb_id);
      setAgregados((prev) => new Set(prev).add(item.tmdb_id));
    } catch (e: any) {
      console.error("Error al agregar rápido desde Top mensual:", e);
    }
  }

  /**
   * Botón del ojito: agrega (si hace falta) y marca como vista directo,
   * sin tener que entrar al detalle. En películas es directo; en series,
   * como implica marcar TODOS los capítulos, primero se confirma.
   */
  async function marcarVistaRapida(item: ItemTopMensual) {
    if (!userId || vistos.has(item.tmdb_id)) return;
    if (tipo === "series") {
      setConfirmSerieVisible(item);
      return;
    }
    setMarcandoVisto(item.tmdb_id);
    try {
      await agregarPelicula(userId, item.tmdb_id);
      await toggleVistaPelicula(userId, item.tmdb_id, true);
      setAgregados((prev) => new Set(prev).add(item.tmdb_id));
      setVistos((prev) => new Set(prev).add(item.tmdb_id));
      setCalificarModal({ tipo: "movie", tmdbId: item.tmdb_id, titulo: item.nombre, posterPath: item.poster_path });
    } catch (e: any) {
      console.error("Error al marcar como vista desde Top mensual:", e);
    } finally {
      setMarcandoVisto(null);
    }
  }

  async function confirmarMarcarSerieVista() {
    const item = confirmSerieVisible;
    setConfirmSerieVisible(null);
    if (!item || !userId) return;
    setMarcandoVisto(item.tmdb_id);
    try {
      await seguirSerie(userId, item.tmdb_id);
      await marcarTodaLaSerieVista(userId, item.tmdb_id);
      setAgregados((prev) => new Set(prev).add(item.tmdb_id));
      setVistos((prev) => new Set(prev).add(item.tmdb_id));
      setCalificarModal({ tipo: "series", tmdbId: item.tmdb_id, titulo: item.nombre, posterPath: item.poster_path });
    } catch (e: any) {
      console.error("Error al marcar toda la serie vista desde Top mensual:", e);
    } finally {
      setMarcandoVisto(null);
    }
  }

  /**
   * "No, no la vi toda": se agrega la serie igual (para que quede en tu
   * lista de pendientes) y se abre directo en la solapa de episodios,
   * para que la persona marque a mano hasta dónde vio.
   */
  async function noVistaCompleta() {
    const item = confirmSerieVisible;
    setConfirmSerieVisible(null);
    if (!item || !userId) return;
    try {
      await seguirSerie(userId, item.tmdb_id);
      setAgregados((prev) => new Set(prev).add(item.tmdb_id));
      navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo: "series", tabInicial: "episodios" });
    } catch (e: any) {
      console.error("Error al agregar la serie desde Top mensual:", e);
    }
  }

  function togglePlataforma(clave: string) {
    if (clave === "otras") {
      setPlataformas((prev) => (prev.includes("otras") ? [] : ["otras"]));
      return;
    }
    setPlataformas((prev) => {
      const sinOtras = prev.filter((p) => p !== "otras");
      return sinOtras.includes(clave) ? sinOtras.filter((p) => p !== clave) : [...sinOtras, clave];
    });
  }

  function elegirPais(code: string) {
    eligioManualRef.current = true;
    setMiPais(code);
    setAlcance("pais");
    setPaisPickerVisible(false);
    setBusquedaPais("");
  }

  const paisesFiltrados = busquedaPais.trim()
    ? PAISES.filter((p) => p.label.toLowerCase().includes(busquedaPais.trim().toLowerCase()))
    : PAISES;

  const nombrePais = PAISES.find((p) => p.code === miPais)?.label ?? t("Tu país");

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ position: "relative" }}>
        <UnderlineTabs
          opciones={[
            { key: "pais", label: nombrePais },
            { key: "global", label: t("Global") },
          ]}
          valor={alcance}
          onCambiar={(v) => {
            if (v === "pais" && !miPais) return;
            setAlcance(v);
          }}
        />
        <Pressable style={styles.mundoBtn} onPress={() => setPaisPickerVisible(true)} hitSlop={8}>
          <Ionicons name="globe" size={16} color="#000000" />
        </Pressable>
      </View>
      <View style={styles.botonesRow}>
        <Pressable
          style={[styles.botonRect, tipo === "movie" && styles.botonRectActivo]}
          onPress={() => {
            setTipo("movie");
            setGeneroId(null);
          }}
        >
          <Text style={styles.botonRectTexto}>{t("Películas")}</Text>
        </Pressable>
        <Pressable style={styles.filtrosBtn} onPress={() => setFiltrosVisible(true)}>
          <Ionicons name="options" size={16} color="#000000" />
          {(generoId !== null || plataformas.length > 0) && <View style={styles.filtrosPuntito} />}
        </Pressable>
        <Pressable
          style={[styles.botonRect, tipo === "series" && styles.botonRectActivo]}
          onPress={() => {
            setTipo("series");
            setGeneroId(null);
          }}
        >
          <Text style={styles.botonRectTexto}>{t("Series")}</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={theme.colors.primary} />
      ) : (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={items}
          keyExtractor={(i) => String(i.tmdb_id)}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={
            <Text style={styles.vacio}>
              Todavía no hay suficientes {tipo === "movie" ? "películas" : "series"} agregadas {alcance === "pais" ? "en tu país" : ""} en los últimos 30
              días.
            </Text>
          }
          renderItem={({ item, index }) => (
            <Pressable style={styles.card} onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.tmdb_id, tipo })}>
              <Text style={styles.numero}>{index + 1}</Text>
              {item.poster_path ? (
                <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.poster} />
              ) : (
                <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.titulo} numberOfLines={2}>
                  {item.nombre}
                </Text>
                {item.subtitulo && <Text style={styles.subtitulo}>{item.subtitulo}</Text>}
              </View>
              <Pressable
                style={[styles.agregarBtn, agregados.has(item.tmdb_id) && styles.agregarBtnActivo]}
                onPress={() => agregarRapido(item)}
                disabled={agregados.has(item.tmdb_id)}
                hitSlop={8}
              >
                <Text style={[styles.agregarBtnTexto, agregados.has(item.tmdb_id) && styles.agregarBtnTextoActivo]}>
                  {agregados.has(item.tmdb_id) ? "✓" : "+"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.agregarBtn, vistos.has(item.tmdb_id) && styles.agregarBtnActivo, { marginLeft: 6 }]}
                onPress={() => marcarVistaRapida(item)}
                disabled={vistos.has(item.tmdb_id) || marcandoVisto === item.tmdb_id}
                hitSlop={8}
              >
                {marcandoVisto === item.tmdb_id ? (
                  <ActivityIndicator size="small" color={theme.colors.primaryLight} />
                ) : (
                  <Ionicons name="eye" size={16} color={vistos.has(item.tmdb_id) ? "#000000" : theme.colors.primaryLight} />
                )}
              </Pressable>
            </Pressable>
          )}
        />
      )}

      <Modal visible={filtrosVisible} transparent animationType="fade" onRequestClose={() => setFiltrosVisible(false)}>
        {/* Modal en árbol nativo aparte: SafeAreaProvider propio, mismo patrón que FiltroPeliculasModal */}
        <SafeAreaProvider>
          <SafeAreaInsetsContext.Consumer>
            {(insets) => (
        <Pressable style={styles.filtrosFondo} onPress={() => setFiltrosVisible(false)}>
          <Pressable style={[styles.filtrosBox, { paddingBottom: 20 + (insets?.bottom ?? 0) }]} onPress={() => {}}>
            <Text style={styles.filtrosTitulo}>{t("Filtrar por género")}</Text>
            <ScrollView contentContainerStyle={styles.chipsWrap}>
              <Pressable
                style={[styles.pillChico, generoId === null && styles.chipActivo]}
                onPress={() => setGeneroId(null)}
              >
                <Text style={[styles.pillTextoChico, generoId === null && styles.chipTextoActivo]}>{t("Todos")}</Text>
              </Pressable>
              {Object.entries(tipo === "series" ? GENEROS_SERIES : GENEROS_PELICULAS).map(([id, nombre]) => (
                <Pressable
                  key={id}
                  style={[styles.pillChico, generoId === Number(id) && styles.chipActivo]}
                  onPress={() => setGeneroId(Number(id))}
                >
                  <Text style={[styles.pillTextoChico, generoId === Number(id) && styles.chipTextoActivo]}>{nombre}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.filtrosTitulo}>{t("Plataforma")}</Text>
            <ScrollView contentContainerStyle={styles.chipsWrap}>
              <Pressable style={[styles.plataformaChip, plataformas.length === 0 && styles.chipActivo]} onPress={() => setPlataformas([])}>
                <Text style={[styles.chipTexto, plataformas.length === 0 && styles.chipTextoActivo]}>{t("Todas")}</Text>
              </Pressable>
              {plataformasDisponibles.map((p) =>
                p.clave === "otras" ? (
                  <Pressable
                    key={p.clave}
                    style={[styles.plataformaChip, plataformas.includes("otras") && styles.chipActivo]}
                    onPress={() => togglePlataforma("otras")}
                  >
                    <Text style={[styles.chipTexto, plataformas.includes("otras") && styles.chipTextoActivo]}>{t("Otras")}</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    key={p.clave}
                    onPress={() => togglePlataforma(p.clave)}
                    style={[styles.logoBox, plataformas.includes(p.clave) && styles.logoBoxActivo]}
                  >
                    {p.logo_path && <Image source={{ uri: posterUrl(p.logo_path, "w185")! }} style={styles.logoImg} />}
                  </Pressable>
                )
              )}
            </ScrollView>

            <View style={{ height: 8 }} />
            <AppButton title={t("Aplicar filtros")} onPress={() => setFiltrosVisible(false)} />
          </Pressable>
        </Pressable>
            )}
          </SafeAreaInsetsContext.Consumer>
        </SafeAreaProvider>
      </Modal>

      <Modal visible={paisPickerVisible} animationType="slide" onRequestClose={() => setPaisPickerVisible(false)}>
        <View style={styles.paisModalContainer}>
          <View style={styles.buscadorRow}>
            <TextInput
              style={styles.buscadorInput}
              placeholder={t("Buscar país...")}
              placeholderTextColor={theme.colors.textFaint}
              value={busquedaPais}
              onChangeText={setBusquedaPais}
              autoFocus
            />
            <Pressable onPress={() => setPaisPickerVisible(false)} hitSlop={10}>
              <Text style={styles.cerrar}>{t("Cerrar")}</Text>
            </Pressable>
          </View>
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={paisesFiltrados}
            keyExtractor={(p) => p.code}
            ListEmptyComponent={<Text style={styles.vacio}>{t("No encontramos ningún país con ese nombre.")}</Text>}
            renderItem={({ item }) => (
              <Pressable style={[styles.paisOpcion, item.code === miPais && styles.paisOpcionActiva]} onPress={() => elegirPais(item.code)}>
                <Text style={[styles.paisOpcionTexto, item.code === miPais && styles.paisOpcionTextoActivo]}>{item.label}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
      {calificarModal && (
        <CalificarModal
          visible={!!calificarModal}
          onCerrar={() => setCalificarModal(null)}
          tipo={calificarModal.tipo}
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
    </View>
  );
}

const styles = StyleSheet.create({
  botonesRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  botonRect: { flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: "center", backgroundColor: "#000000", borderWidth: 1, borderColor: "transparent" },
  botonRectActivo: { borderColor: theme.colors.primary },
  botonRectTexto: { fontSize: 13, fontWeight: "700", color: theme.colors.primaryLight },
  filtrosBtn: {
    width: 40,
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  filtrosPuntito: { position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: 4, backgroundColor: "#000000" },
  filtrosFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  filtrosBox: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, padding: 20, maxHeight: "70%" },
  filtrosTitulo: { fontSize: 16, fontWeight: "800", marginBottom: 14 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 20 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceAlt },
  chipActivo: { backgroundColor: theme.colors.primary },
  chipTexto: { fontSize: 13, color: theme.colors.text },
  chipTextoActivo: { color: "#000000", fontWeight: "700" },
  pillChico: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.pill, paddingVertical: 6, paddingHorizontal: 11, backgroundColor: theme.colors.surfaceAlt },
  pillTextoChico: { fontSize: 11, color: theme.colors.text },
  plataformaChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceAlt, justifyContent: "center" },
  logoBox: { width: 44, height: 44, borderRadius: 10, overflow: "hidden", borderWidth: 2, borderColor: "transparent", backgroundColor: theme.colors.surfaceAlt },
  logoBoxActivo: { borderColor: theme.colors.primary },
  logoImg: { width: "100%", height: "100%" },
  mundoBtn: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -14,
    marginTop: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#000000",
  },
  paisModalContainer: { flex: 1, backgroundColor: theme.colors.background, paddingTop: 50 },
  buscadorRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  buscadorInput: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: 10 },
  cerrar: { color: theme.colors.primaryLight, fontWeight: "700" },
  paisOpcion: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  paisOpcionActiva: { backgroundColor: theme.colors.surface },
  paisOpcionTexto: { fontSize: 15, color: theme.colors.text },
  paisOpcionTextoActivo: { color: theme.colors.primaryLight, fontWeight: "700" },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24, paddingHorizontal: 20 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 10, marginBottom: 8 },
  numero: { width: 28, fontSize: 16, fontWeight: "800", color: theme.colors.primaryLight, textAlign: "center" },
  poster: { width: 48, height: 72, borderRadius: 6, marginRight: 10, marginLeft: 6 },
  titulo: { fontSize: 14, fontWeight: "700" },
  subtitulo: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  cantidadBadge: { minWidth: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  cantidadBadgeTexto: { fontSize: 11, fontWeight: "800", color: "#000000" },
  agregarBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  agregarBtnActivo: { backgroundColor: theme.colors.primary },
  agregarBtnTexto: { fontSize: 16, fontWeight: "800", color: theme.colors.primaryLight, lineHeight: 16 },
  agregarBtnTextoActivo: { color: "#000000" },
});
