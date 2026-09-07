import React, { useRef, useState } from "react";
import { View, TextInput, FlatList, Image, Pressable, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { Alert } from "../lib/alert";
import { Text } from "../components/Themed";
import EstadoVacio from "../components/EstadoVacio";
import Avatar from "../components/Avatar";
import { seleccion } from "../lib/haptics";
import { Ionicons } from "@expo/vector-icons";
import UnderlineTabs from "../components/UnderlineTabs";
import { searchPerson, posterUrl } from "../lib/tmdb";
import { buscarTitulosTolerante, ResultadoTitulo } from "../lib/tituloSearch";
import { seguirSerie, agregarPelicula, syncSeries, syncMovie } from "../lib/sync";
import { marcarTodaLaSerieVista } from "../lib/episodes";
import { toggleVistaPelicula } from "../lib/watchStatus";
import CalificarModal from "../components/CalificarModal";
import ConfirmModal from "../components/ConfirmModal";
import { buscarUsuarios, dejarDeSeguir, UsuarioBasico } from "../lib/follows";
import { obtenerUsuariosRecomendados } from "../lib/recommendedUsersCache";
import { seguirRespetandoPrivacidad } from "../lib/followRequests";
import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../lib/pagination";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type Tab = "titulos" | "personas" | "usuarios";

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
  const [vistos, setVistos] = useState<Set<string>>(new Set());
  const [marcandoVisto, setMarcandoVisto] = useState<number | null>(null);
  const [confirmSerieVisible, setConfirmSerieVisible] = useState<ResultadoTitulo | null>(null);
  const [calificarModal, setCalificarModal] = useState<{
    tipo: "movie" | "episode" | "series";
    tmdbId: number;
    titulo: string;
    posterPath: string | null;
    temporada?: number;
    episodio?: number;
  } | null>(null);

  useState(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        await cargarAgregados(uid);
        if (tab === "usuarios") cargarRecomendaciones(uid, tab);
      }
    });
  });

  async function cargarRecomendaciones(uid: string, tabActual: Tab) {
    if (tabActual === "usuarios") {
      setUsuarios(await obtenerUsuariosRecomendados(uid));
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

    // Vistas: para películas, watched=true. Para series no hay un booleano
    // único (se arma por episodio) — se usa last_watched_at, que es
    // justo lo que deja marcado el botón del ojito al marcar el 1x1.
    const [seriesVistas, moviesVistas] = await Promise.all([
      fetchAllRows<any>((desde, hasta) =>
        supabase.from("user_series").select("series_tmdb_id").eq("user_id", uid).not("last_watched_at", "is", null).range(desde, hasta)
      ),
      fetchAllRows<any>((desde, hasta) =>
        supabase.from("user_movies").select("movie_tmdb_id").eq("user_id", uid).eq("watched", true).range(desde, hasta)
      ),
    ]);
    const setVistas = new Set<string>();
    (seriesVistas ?? []).forEach((s: any) => setVistas.add(`series-${s.series_tmdb_id}`));
    (moviesVistas ?? []).forEach((m: any) => setVistas.add(`movie-${m.movie_tmdb_id}`));
    setVistos(setVistas);
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Se llama en cada tecla — pero la búsqueda de verdad espera un
  // poquito (debounce) antes de disparar. Sin esto, cada letra que
  // escribías lanzaba de nuevo todos los pedidos a TMDB (hasta una
  // docena, contando los idiomas y el respaldo por errores de tipeo) sin
  // esperar a que terminen los anteriores — eso es lo que probablemente
  // causaba los "Failed to fetch" ocasionales al buscar rápido.
  function buscar(texto: string) {
    setQuery(texto);
    if (debounceRef.current) clearTimeout(debounceRef.current);
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
    debounceRef.current = setTimeout(() => ejecutarBusqueda(texto), 350);
  }

  async function ejecutarBusqueda(texto: string) {
    const miId = ++idPedidoRef.current;
    setLoading(true);
    setErrorBusqueda(null);
    try {
      if (tab === "titulos") {
        const mezcla = await buscarTitulosTolerante(texto, () => idPedidoRef.current === miId);
        if (idPedidoRef.current !== miId) return; // llegó tarde, ya hay una búsqueda más nueva en curso
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
      // "Failed to fetch" suele ser un hipo pasajero de red (más
      // probable ahora que se buscan varios idiomas a la vez) — antes de
      // mostrar error, probamos una vez más solos.
      if (e?.message === "Failed to fetch" && idPedidoRef.current === miId) {
        try {
          await new Promise((r) => setTimeout(r, 600));
          if (idPedidoRef.current !== miId) return;
          return await ejecutarBusqueda(texto);
        } catch (e2: any) {
          console.error("Error al buscar (tras reintentar):", e2);
          if (idPedidoRef.current === miId) setErrorBusqueda(e2?.message ?? t("Error desconocido buscando en TMDB."));
          return;
        }
      }
      console.error("Error al buscar:", e);
      if (idPedidoRef.current === miId) setErrorBusqueda(e?.message ?? t("Error desconocido buscando en TMDB."));
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

  /**
   * El botón del ojito: agrega el título (si hace falta) y lo marca como
   * visto directo, sin tener que entrar al detalle — para cuando estás
   * buscando y agregando muchos de una. En películas es directo; en
   * series, como implica marcar TODOS los capítulos, primero se confirma
   * (mismo cartel que ya existe en el detalle: "Ví toda la serie" /
   * "¿Viste todos los capítulos?").
   */
  async function marcarVistaRapida(item: ResultadoTitulo) {
    if (!userId) return;
    const clave = `${item.tipo}-${item.id}`;
    if (vistos.has(clave)) return;
    if (item.tipo === "series") {
      setConfirmSerieVisible(item);
      return;
    }
    setMarcandoVisto(item.id);
    try {
      await agregarPelicula(userId, item.id);
      await toggleVistaPelicula(userId, item.id, true);
      setAgregados((prev) => new Set(prev).add(clave));
      setVistos((prev) => new Set(prev).add(clave));
      setCalificarModal({ tipo: "movie", tmdbId: item.id, titulo: item.titulo, posterPath: item.poster_path });
    } catch (e: any) {
      Alert.alert(t("No se pudo marcar como vista"), e.message ?? t("Revisá tu conexión y probá de nuevo."));
    } finally {
      setMarcandoVisto(null);
    }
  }

  async function confirmarMarcarSerieVista() {
    const item = confirmSerieVisible;
    setConfirmSerieVisible(null);
    if (!item || !userId) return;
    const clave = `${item.tipo}-${item.id}`;
    setMarcandoVisto(item.id);
    try {
      await seguirSerie(userId, item.id);
      await marcarTodaLaSerieVista(userId, item.id);
      setAgregados((prev) => new Set(prev).add(clave));
      setVistos((prev) => new Set(prev).add(clave));
      setCalificarModal({ tipo: "series", tmdbId: item.id, titulo: item.titulo, posterPath: item.poster_path });
    } catch (e: any) {
      Alert.alert(t("No se pudo marcar como vista"), e.message ?? t("Revisá tu conexión y probá de nuevo."));
    } finally {
      setMarcandoVisto(null);
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
      Alert.alert(t("No se pudo abrir"), e.message ?? t("Revisá tu conexión y probá de nuevo."));
    } finally {
      setAbriendo(null);
    }
  }

  async function toggleFollow(u: UsuarioBasico) {
    if (!userId || u.solicitudPendiente) return;
    seleccion();
    try {
      if (u.siguiendo) {
        await dejarDeSeguir(userId, u.id);
      } else {
        await seguirRespetandoPrivacidad(userId, u.id);
      }
      if (query.trim().length >= 2) buscar(query);
      else cargarRecomendaciones(userId, "usuarios");
    } catch (e: any) {
      Alert.alert(t("No se pudo actualizar"), e.message);
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
          ListEmptyComponent={
            !loading && query.trim().length >= 2 ? <EstadoVacio icono="film-outline" titulo={t("No encontramos nada con ese nombre.")} /> : null
          }
          renderItem={({ item }) => {
            const yaAgregado = agregados.has(`${item.tipo}-${item.id}`);
            const yaVista = vistos.has(`${item.tipo}-${item.id}`);
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
                <Pressable
                  style={[styles.addBtn, yaVista && styles.addBtnAgregado, { marginLeft: 6 }]}
                  onPress={() => marcarVistaRapida(item)}
                  disabled={yaVista || marcandoVisto === item.id}
                  hitSlop={8}
                >
                  {marcandoVisto === item.id ? (
                    <ActivityIndicator size="small" color={theme.colors.primaryLight} />
                  ) : (
                    <Ionicons name="eye" size={16} color={yaVista ? "#000000" : theme.colors.primaryLight} />
                  )}
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
          ListHeaderComponent={query.trim().length < 2 && usuarios.length > 0 ? <Text style={styles.sugerenciasTitulo}>{t("Sugerencias para ti:")}</Text> : null}
          ListEmptyComponent={
            !loading && query.trim().length >= 2 ? <EstadoVacio icono="person-outline" titulo={t("No encontramos a nadie con ese nombre.")} /> : null
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Pressable style={styles.cardInfo} onPress={() => navigation.navigate("PerfilAjeno", { userId: item.id })}>
                <Avatar uri={item.avatar_url} size={40} style={{ marginRight: 12 }} />
                <Text style={styles.nombre}>{item.username ?? t("Usuario")}</Text>
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
          ListEmptyComponent={
            !loading && query.trim().length >= 2 ? <EstadoVacio icono="person-outline" titulo={t("No encontramos a nadie con ese nombre.")} /> : null
          }
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
      {calificarModal && (
        <CalificarModal
          visible={!!calificarModal}
          onCerrar={() => setCalificarModal(null)}
          tipo={calificarModal.tipo}
          tmdbId={calificarModal.tmdbId}
          temporada={calificarModal.temporada}
          episodio={calificarModal.episodio}
          titulo={calificarModal.titulo}
          posterPath={calificarModal.posterPath}
          navigation={navigation}
        />
      )}
      <ConfirmModal
        visible={!!confirmSerieVisible}
        onCerrar={() => setConfirmSerieVisible(null)}
        titulo={t("Ví toda la serie")}
        mensaje={t("¿Viste todos los capítulos?")}
        botones={[
          { label: t("No"), onPress: () => {} },
          { label: t("Sí"), destacado: true, onPress: confirmarMarcarSerieVista },
        ]}
      />
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
  input: { flex: 1, fontSize: 12.5, color: theme.colors.text, paddingVertical: 10, ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}) },
  card: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  cardInfo: { flexDirection: "row", alignItems: "center", flex: 1 },
  followBtn: { borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  followBtnTexto: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },
  followBtnActivo: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
  followBtnTextoActivo: { color: theme.colors.textMuted },
  poster: { width: 40, height: 60, borderRadius: 4, marginRight: 12, backgroundColor: theme.colors.surfaceAlt },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  nombre: { flex: 1, fontSize: 15 },
  sugerenciasTitulo: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 8 },
  anio: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  addBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  addBtnTexto: { color: "#000000", fontSize: 16, fontWeight: "700" },
  addBtnAgregado: { backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border },
  addBtnTextoAgregado: { color: theme.colors.textMuted },
  joinBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: 6, paddingHorizontal: 12 },
});
