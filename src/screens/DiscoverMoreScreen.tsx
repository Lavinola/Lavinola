import React, { useCallback, useEffect, useState } from "react";
import { View, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Alert } from "../lib/alert";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "../components/Themed";
import TopPills from "../components/TopPills";
import DiscoverFilterModal from "../components/DiscoverFilterModal";
import { supabase } from "../lib/supabase";
import { posterUrl, getWatchProvidersDisponibles, GrupoPlataforma } from "../lib/tmdb";
import { syncSeries, syncMovie, seguirSerie, agregarPelicula } from "../lib/sync";
import { descubrirPagina, idsYaAgregados, OrdenDescubrir, EstadoSerie, ItemDescubrir, ETIQUETAS_ORDEN } from "../lib/discover";
import { GENEROS_SERIES, GENEROS_PELICULAS } from "../lib/tmdbGenres";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  route: { params?: { tipoInicial?: "series" | "movie"; ordenInicial?: OrdenDescubrir } };
  navigation: any;
}

export default function DiscoverMoreScreen({ route, navigation }: Props) {
  const { t } = useT();
  const [tipo, setTipo] = useState<"series" | "movie">(route.params?.tipoInicial ?? "series");
  const [orden, setOrden] = useState<OrdenDescubrir>(route.params?.ordenInicial ?? "recomendado");
  const [generoId, setGeneroId] = useState<number | null>(null);
  const [estado, setEstado] = useState<EstadoSerie>("todo");
  const [plataformas, setPlataformas] = useState<string[]>([]);
  const [watchRegion, setWatchRegion] = useState("AR");
  const [todasLasPlataformas, setTodasLasPlataformas] = useState<GrupoPlataforma[]>([]);
  const [items, setItems] = useState<ItemDescubrir[]>([]);
  const [page, setPage] = useState(1);
  const [hayMas, setHayMas] = useState(true);
  const [loading, setLoading] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [filtroVisible, setFiltroVisible] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState<number | null>(null);
  const [agregados, setAgregados] = useState<Set<string>>(new Set());
  const [agregando, setAgregando] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUserId(data.user?.id ?? null);
      if (data.user?.id) {
        const { data: perfil } = await supabase.from("profiles").select("country").eq("id", data.user.id).maybeSingle();
        if (perfil?.country) setWatchRegion(perfil.country);
      }
    });
  }, []);

  useEffect(() => {
    idsYaAgregados(userId, tipo).then((ids) => {
      setAgregados(new Set([...ids].map((id) => `${tipo}-${id}`)));
    });
  }, [tipo, userId]);

  useEffect(() => {
    getWatchProvidersDisponibles(tipo, watchRegion).then(setTodasLasPlataformas);
  }, [tipo, watchRegion]);

  useEffect(() => {
    cargar(1, true);
  }, [tipo, orden, generoId, estado, plataformas, userId]);

  async function cargar(paginaAPedir: number, reiniciar: boolean) {
    if (reiniciar) setLoading(true);
    else setCargandoMas(true);
    try {
      const { items: nuevos, hayMas: masDisponibles } = await descubrirPagina({
        tipo,
        orden,
        generoId,
        estado,
        plataformasClaves: plataformas,
        todasLasPlataformas,
        watchRegion,
        page: paginaAPedir,
        userId,
      });
      setItems((prev) => (reiniciar ? nuevos : [...prev, ...nuevos]));
      setHayMas(masDisponibles);
      setPage(paginaAPedir);
    } catch (e: any) {
      console.error("Error al descubrir:", e);
    } finally {
      setLoading(false);
      setCargandoMas(false);
    }
  }

  function cargarMas() {
    if (cargandoMas || loading || !hayMas) return;
    cargar(page + 1, false);
  }

  async function abrir(item: ItemDescubrir) {
    setAbriendo(item.id);
    try {
      if (tipo === "series") await syncSeries(item.id);
      else await syncMovie(item.id);
      navigation.navigate("DetalleTitulo", { tmdbId: item.id, tipo });
    } catch (e: any) {
      Alert.alert("No se pudo abrir", e.message ?? "Revisá tu conexión y probá de nuevo.");
    } finally {
      setAbriendo(null);
    }
  }

  async function agregarRapido(item: ItemDescubrir) {
    if (!userId) return;
    const clave = `${item.tipo}-${item.id}`;
    setAgregando(item.id);
    try {
      if (item.tipo === "series") await seguirSerie(userId, item.id);
      else await agregarPelicula(userId, item.id);
      setAgregados((prev) => new Set(prev).add(clave));
    } catch (e: any) {
      Alert.alert("No se pudo agregar", e.message ?? "Revisá tu conexión y probá de nuevo.");
    } finally {
      setAgregando(null);
    }
  }

  const generos = tipo === "series" ? GENEROS_SERIES : GENEROS_PELICULAS;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TopPills
        opciones={[
          { key: "series", label: t("Series") },
          { key: "movie", label: t("Películas") },
        ]}
        valor={tipo}
        onCambiar={(v) => setTipo(v as "series" | "movie")}
      />

      <View style={styles.filtrosRow}>
        <Pressable style={styles.filtroBtn} onPress={() => setFiltroVisible(true)}>
          <Ionicons name="options" size={16} color="#000000" />
          <Text style={styles.filtroBtnTexto}>{t("Filtro")}</Text>
        </Pressable>
        <Text style={styles.ordenActual} numberOfLines={1}>
          {t(ETIQUETAS_ORDEN[orden])}
          {generoId ? ` · ${t(generos[generoId] ?? "")}` : ""}
          {plataformas.length > 0 ? ` · ${plataformas.length} ${plataformas.length === 1 ? t("plataforma") : t("plataformas")}` : ""}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => `${i.tipo}-${i.id}`}
          contentContainerStyle={{ padding: 12 }}
          onEndReachedThreshold={0.4}
          onEndReached={cargarMas}
          ListEmptyComponent={<Text style={styles.vacio}>{t("No encontramos nada con estos filtros.")}</Text>}
          ListFooterComponent={cargandoMas ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}
          renderItem={({ item }) => {
            const clave = `${item.tipo}-${item.id}`;
            const yaAgregado = agregados.has(clave);
            return (
              <Pressable style={styles.card} onPress={() => abrir(item)} disabled={abriendo === item.id}>
                {item.poster_path ? (
                  <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.poster} />
                ) : (
                  <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombre} numberOfLines={2}>
                    {item.titulo}
                  </Text>
                  {item.anio && <Text style={styles.sub}>{item.anio}</Text>}
                  {item.tipo === "movie" && item.genero_ids.length > 0 && (
                    <Text style={styles.sub}>{item.genero_ids.map((g) => t(GENEROS_PELICULAS[g])).filter(Boolean).slice(0, 2).join(", ")}</Text>
                  )}
                  {item.tipo === "series" && item.total_seasons ? (
                    <Text style={styles.sub}>{item.total_seasons} {item.total_seasons === 1 ? t("temporada") : t("temporadas")}</Text>
                  ) : null}
                </View>
                {abriendo === item.id ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Pressable
                    style={[styles.masBtn, yaAgregado && styles.masBtnAgregado]}
                    onPress={() => agregarRapido(item)}
                    disabled={yaAgregado || agregando === item.id}
                    hitSlop={8}
                  >
                    <Text style={[styles.masBtnTexto, yaAgregado && styles.masBtnTextoAgregado]}>{yaAgregado ? "✓" : "+"}</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          }}
        />
      )}

      <DiscoverFilterModal
        visible={filtroVisible}
        tipo={tipo}
        ordenActual={orden}
        generoActual={generoId}
        estadoActual={estado}
        watchRegion={watchRegion}
        plataformasActuales={plataformas}
        onCerrar={() => setFiltroVisible(false)}
        onAplicar={(params) => {
          setOrden(params.orden);
          setGeneroId(params.generoId);
          setEstado(params.estado);
          setPlataformas(params.plataformas);
          setFiltroVisible(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  filtrosRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, gap: 10 },
  filtroBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 8, paddingHorizontal: 16 },
  filtroBtnTexto: { color: "#000000", fontWeight: "700", fontSize: 13 },
  ordenActual: { flex: 1, fontSize: 12, color: theme.colors.textMuted },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 8, marginBottom: 10 },
  poster: { width: 60, height: 90, borderRadius: 6, marginRight: 12, backgroundColor: theme.colors.surfaceAlt },
  nombre: { fontSize: 14, fontWeight: "700" },
  sub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 3 },
  masBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1.5, borderColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  masBtnAgregado: { backgroundColor: theme.colors.primary },
  masBtnTexto: { color: theme.colors.primaryLight, fontSize: 16, fontWeight: "800" },
  masBtnTextoAgregado: { color: "#000000" },
});
