import React, { useRef, useState } from "react";
import { View, TextInput, FlatList, Image, Pressable, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { Alert } from "../lib/alert";
import { Text } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import UnderlineTabs from "../components/UnderlineTabs";
import { searchSeries, searchMovies, searchPerson, posterUrl } from "../lib/tmdb";
import { seguirSerie, agregarPelicula, syncSeries, syncMovie } from "../lib/sync";
import { buscarUsuarios, listarUsuariosRecomendados, dejarDeSeguir, UsuarioBasico } from "../lib/follows";
import { seguirRespetandoPrivacidad } from "../lib/followRequests";
import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../lib/pagination";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type Tab = "titulos" | "personas" | "usuarios";

interface ResultadoTitulo {
  id: number;
  titulo: string;
  poster_path: string | null;
  tipo: "series" | "movie";
  anio: string | null;
  popularidad: number;
}

interface ResultadoPersona {
  id: number;
  nombre: string;
  foto: string | null;
  conocidoPor: string; // "Actor/Actriz" o "Dirección" — sale de known_for_department de TMDB
}

export default function GlobalSearchScreen({ route, navigation }: any) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>(route?.params?.tabInicial ?? "titulos");
  const [query, setQuery] = useState("");
  const idPedidoRef = useRef(0);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [titulos, setTitulos] = useState<ResultadoTitulo[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioBasico[]>([]);
  const [personas, setPersonas] = useState<ResultadoPersona[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [agregando, setAgregando] = useState<number | null>(null);
  const [agregados, setAgregados] = useState<Set<string>>(new Set());

  useState(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        await cargarAgregados(uid);
        if (tab === "usuarios") cargarRecomendaciones(uid, tab);
      }
    });
  });

  async function cargarRecomendaciones(uid: string, tabActual: Tab) {
    if (tabActual === "usuarios") {
      setUsuarios(await listarUsuariosRecomendados(uid));
    }
  }

  async function cargarAgregados(uid: string) {
    const [series, movies] = await Promise.all([
      fetchAllRows<any>((desde, hasta) => supabase.from("user_series").select("series_tmdb_id").eq("user_id", uid).range(desde, hasta)),
      fetchAllRows<any>((desde, hasta) => supabase.from("user_movies").select("movie_tmdb_id").eq("user_id", uid).range(desde, hasta)),
    ]);
    const set = new Set<string>();
    (series ?? []).forEach((s: any) => set.add(`series-${s.series_tmdb_id}`));
    (movies ?? []).forEach((m: any) => set.add(`movie-${m.movie_tmdb_id}`));
    setAgregados(set);
  }

  async function buscar(texto: string) {
    setQuery(texto);
    if (texto.trim().length < 2) {
      idPedidoRef.current++; // invalida cualquier búsqueda en vuelo
      setTitulos([]);
      setPersonas([]);
      if (userId && tab === "usuarios") {
        cargarRecomendaciones(userId, tab);
      } else {
        setUsuarios([]);
      }
      return;
    }
    const miId = ++idPedidoRef.current;
    setLoading(true);
    setErrorBusqueda(null);
    try {
      if (tab === "titulos") {
        const [series, movies] = await Promise.all([searchSeries(texto), searchMovies(texto)]);
        if (idPedidoRef.current !== miId) return; // llegó tarde, ya hay una búsqueda más nueva en curso
        const mezcla: ResultadoTitulo[] = [
          ...(series.results ?? []).map((s: any) => ({
            id: s.id,
            titulo: s.name,
            poster_path: s.poster_path,
            tipo: "series" as const,
            anio: s.first_air_date ? s.first_air_date.slice(0, 4) : null,
            popularidad: s.popularity ?? 0,
          })),
          ...(movies.results ?? []).map((p: any) => ({
            id: p.id,
            titulo: p.title,
            poster_path: p.poster_path,
            tipo: "movie" as const,
            anio: p.release_date ? p.release_date.slice(0, 4) : null,
            popularidad: p.popularity ?? 0,
          })),
        ];
        mezcla.sort((a, b) => b.popularidad - a.popularidad);
        setTitulos(mezcla);
      } else if (tab === "usuarios") {
        const data = await buscarUsuarios(texto.trim(), userId);
        if (idPedidoRef.current !== miId) return;
        setUsuarios(data);
      } else {
        const data = await searchPerson(texto);
        if (idPedidoRef.current !== miId) return;
        const resultados: ResultadoPersona[] = (data.results ?? [])
          .filter((p: any) => p.profile_path || p.known_for_department)
          .sort((a: any, b: any) => (b.popularity ?? 0) - (a.popularity ?? 0))
          .map((p: any) => ({
            id: p.id,
            nombre: p.name,
            foto: p.profile_path,
            conocidoPor: p.known_for_department === "Directing" ? t("Dirección") : t("Actor/Actriz"),
          }));
        setPersonas(resultados);
      }
    } catch (e: any) {
      console.error("Error al buscar:", e);
      if (idPedidoRef.current === miId) setErrorBusqueda(e?.message ?? "Error desconocido buscando en TMDB.");
    } finally {
      if (idPedidoRef.current === miId) setLoading(false);
    }
  }

  function cambiarTab(t: Tab) {
    setTab(t);
    if (query.trim().length >= 2) buscar(query);
    else if (userId && t === "usuarios") cargarRecomendaciones(userId, t);
  }

  async function agregarTitulo(item: ResultadoTitulo) {
    if (!userId) return;
    setAgregando(item.id);
    try {
      if (item.tipo === "series") await seguirSerie(userId, item.id);
      else await agregarPelicula(userId, item.id);
      setAgregados((prev) => new Set(prev).add(`${item.tipo}-${item.id}`));
    } finally {
      setAgregando(null);
    }
  }

  const [abriendo, setAbriendo] = useState<number | null>(null);

  async function abrirTitulo(item: ResultadoTitulo) {
    setAbriendo(item.id);
    try {
      if (item.tipo === "series") await syncSeries(item.id);
      else await syncMovie(item.id);
      navigation.navigate("DetalleTitulo", { tmdbId: item.id, tipo: item.tipo });
    } catch (e: any) {
      console.error("Error al abrir título desde el buscador:", e);
      Alert.alert("No se pudo abrir", e.message ?? "Revisá tu conexión y probá de nuevo.");
    } finally {
      setAbriendo(null);
    }
  }

  async function toggleFollow(u: UsuarioBasico) {
    if (!userId || u.solicitudPendiente) return;
    try {
      if (u.siguiendo) {
        await dejarDeSeguir(userId, u.id);
      } else {
        await seguirRespetandoPrivacidad(userId, u.id);
      }
      if (query.trim().length >= 2) buscar(query);
      else cargarRecomendaciones(userId, "usuarios");
    } catch (e: any) {
      Alert.alert("No se pudo actualizar", e.message);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.buscadorConLupa}>
        <Ionicons name="search" size={18} color={theme.colors.primaryLight} />
        <TextInput
          style={styles.input}
          placeholder={t("Buscar series, películas, actores, directores, usuarios...")}
          placeholderTextColor={theme.colors.textFaint}
          value={query}
          onChangeText={buscar}
          autoFocus
          autoComplete="off"
          autoCorrect={false}
        />
      </View>
      <UnderlineTabs
        opciones={[
          { key: "titulos", label: t("Series") + "\n" + t("Películas") },
          { key: "personas", label: t("Actores") + "\n" + t("Directores") },
          { key: "usuarios", label: t("Usuarios") },
        ]}
        valor={tab}
        onCambiar={cambiarTab}
        multilinea
      />

      {loading && <ActivityIndicator style={{ marginTop: 16 }} />}
      {errorBusqueda && !loading && (
        <Text style={{ color: "#FF6B6B", textAlign: "center", marginTop: 16, paddingHorizontal: 16 }}>
          No pudimos buscar en TMDB: {errorBusqueda}
        </Text>
      )}

      {tab === "titulos" && (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={titulos}
          keyExtractor={(i) => `${i.tipo}-${i.id}`}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => {
            const yaAgregado = agregados.has(`${item.tipo}-${item.id}`);
            return (
              <Pressable style={styles.card} onPress={() => abrirTitulo(item)} disabled={abriendo === item.id}>
                {item.poster_path ? (
                  <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.poster} />
                ) : (
                  <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombre}>{item.titulo}</Text>
                  {item.anio && <Text style={styles.anio}>{item.anio}</Text>}
                </View>
                {abriendo === item.id && <ActivityIndicator size="small" style={{ marginRight: 8 }} />}
                <Pressable
                  style={[styles.addBtn, yaAgregado && styles.addBtnAgregado]}
                  onPress={() => agregarTitulo(item)}
                  disabled={yaAgregado || agregando === item.id}
                  hitSlop={8}
                >
                  <Text style={[styles.addBtnTexto, yaAgregado && styles.addBtnTextoAgregado]}>
                    {agregando === item.id ? "..." : yaAgregado ? "✓" : "+"}
                  </Text>
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}

      {tab === "usuarios" && (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={usuarios}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Pressable style={styles.cardInfo} onPress={() => navigation.navigate("PerfilAjeno", { userId: item.id })}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: theme.colors.surfaceAlt }]} />
                )}
                <Text style={styles.nombre}>{item.username ?? "Usuario"}</Text>
              </Pressable>
              <Pressable
                style={[styles.followBtn, (item.siguiendo || item.solicitudPendiente) && styles.followBtnActivo]}
                onPress={() => toggleFollow(item)}
                disabled={item.solicitudPendiente}
                hitSlop={8}
              >
                <Text style={[styles.followBtnTexto, (item.siguiendo || item.solicitudPendiente) && styles.followBtnTextoActivo]}>
                  {item.solicitudPendiente ? t("Solicitud enviada") : item.siguiendo ? t("Siguiendo") : t("Seguir")}
                </Text>
              </Pressable>
            </View>
          )}
        />
      )}

      {tab === "personas" && (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={personas}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => navigation.navigate("Actor", { personId: item.id })}>
              {item.foto ? (
                <Image source={{ uri: posterUrl(item.foto, "w185")! }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.nombre}>{item.nombre}</Text>
                <Text style={styles.anio}>{item.conocidoPor}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  buscadorConLupa: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
  },
  input: { flex: 1, fontSize: 14, color: theme.colors.text, paddingVertical: 10, ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}) },
  card: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  cardInfo: { flexDirection: "row", alignItems: "center", flex: 1 },
  followBtn: { borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  followBtnTexto: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },
  followBtnActivo: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
  followBtnTextoActivo: { color: theme.colors.textMuted },
  poster: { width: 40, height: 60, borderRadius: 4, marginRight: 12, backgroundColor: theme.colors.surfaceAlt },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  nombre: { flex: 1, fontSize: 15 },
  anio: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  addBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  addBtnTexto: { color: "#000000", fontSize: 16, fontWeight: "700" },
  addBtnAgregado: { backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border },
  addBtnTextoAgregado: { color: theme.colors.textMuted },
  joinBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: 6, paddingHorizontal: 12 },
});
