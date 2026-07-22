import React, { useCallback, useState, useEffect, useRef } from "react";
import { View, Image, Pressable, StyleSheet, ScrollView, Share } from "react-native";
import { Text, AppButton } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../lib/pagination";
import { posterUrl } from "../lib/tmdb";
import { getPerfil, getStatsSociales, getCoverPosterPath, PerfilCompleto, StatsSociales } from "../lib/profile";
import { calcularEstadoRecap, calcularRecap, marcarRecapVisto, DatosRecap } from "../lib/recap";
import RecapModal from "../components/RecapModal";
import ConfirmModal from "../components/ConfirmModal";
import { listarFavoritos, Favorito } from "../lib/favorites";
import { listarListasDeUsuarioOrdenadasPorSeguidores, Lista } from "../lib/lists";
import ListPreviewCard from "../components/ListPreviewCard";
import AdminBadge from "../components/AdminBadge";
import { progresoDeSeries, ProgresoSerie } from "../lib/seriesList";
import FilaMiniTitulos from "../components/FilaMiniTitulos";
import ActionSheetModal from "../components/ActionSheetModal";
import { abrirRedSocial } from "../lib/social";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Stats {
  minutosSeriesVistas: number;
  capitulosVistos: number;
  minutosPeliculasVistas: number;
  peliculasVistas: number;
}

interface ItemMini {
  tmdb_id: number;
  nombre: string;
  poster_path: string | null;
}

export default function ProfileScreen({ navigation }: any) {
  const { t } = useT();
  const [perfil, setPerfil] = useState<PerfilCompleto | null>(null);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [social, setSocial] = useState<StatsSociales | null>(null);
  const [favoritos, setFavoritos] = useState<Favorito[]>([]);
  const [listas, setListas] = useState<Lista[]>([]);
  const [misSeries, setMisSeries] = useState<ItemMini[]>([]);
  const [progreso, setProgreso] = useState<Record<number, ProgresoSerie>>({});
  const [misPeliculas, setMisPeliculas] = useState<ItemMini[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reportesPendientes, setReportesPendientes] = useState(0);
  const [recapBannerVisible, setRecapBannerVisible] = useState(false);
  const [recapYear, setRecapYear] = useState<number | null>(null);
  const [recapModalVisible, setRecapModalVisible] = useState(false);
  const [recapDatos, setRecapDatos] = useState<DatosRecap | null>(null);
  const [recapCargando, setRecapCargando] = useState(false);
  const [recapUserId, setRecapUserId] = useState<string | null>(null);
  const [avisoUsernameVisible, setAvisoUsernameVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [])
  );

  const yaChequeoRecapRef = useRef(false);
  useEffect(() => {
    if (!perfil || yaChequeoRecapRef.current) return;
    yaChequeoRecapRef.current = true;
    const estado = calcularEstadoRecap(perfil);
    setRecapYear(estado.yearDisponible);
    setRecapBannerVisible(estado.debeMostrarBanner);
    if (estado.debeAutoAbrir && estado.yearDisponible) {
      abrirRecap(estado.yearDisponible, true);
    }
  }, [perfil]);

  const yaChequeoAvisoUsernameRef = useRef(false);
  useEffect(() => {
    if (!perfil || yaChequeoAvisoUsernameRef.current) return;
    if (perfil.username_placeholder && !perfil.vio_aviso_username) {
      yaChequeoAvisoUsernameRef.current = true;
      setAvisoUsernameVisible(true);
    }
  }, [perfil]);

  async function cerrarAvisoUsername() {
    setAvisoUsernameVisible(false);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (uid) await supabase.from("profiles").update({ vio_aviso_username: true }).eq("id", uid);
  }

  async function abrirRecap(year: number, esPrimeraVez: boolean) {
    setRecapModalVisible(true);
    setRecapCargando(true);
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      setRecapUserId(uid);
      const datos = await calcularRecap(uid, year);
      setRecapDatos(datos);
      if (esPrimeraVez) await marcarRecapVisto(uid, year);
    } catch (e) {
      console.error("Error al calcular el Recap:", e);
    } finally {
      setRecapCargando(false);
    }
  }

  function cerrarRecap() {
    setRecapModalVisible(false);
    setRecapBannerVisible(true);
  }

  async function cargar() {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;

    // Antes esto era una cadena de ~9 consultas, cada una esperando a que
    // termine la anterior — con una biblioteca grande (después de importar
    // de TV Time, por ejemplo), eso se sentía como una carga eterna con todo
    // en 0. Como estas consultas no dependen entre sí, las pedimos todas
    // juntas y esperamos lo que tarde la más lenta, no la suma de todas.
    const [p, soc, favs, listasOrdenadas, seriesRows, progresoSeries, movieRows, episodiosVistos, peliculasVistas] = await Promise.all([
      getPerfil(userId),
      getStatsSociales(userId),
      listarFavoritos(userId),
      listarListasDeUsuarioOrdenadasPorSeguidores(userId),
      fetchAllRows((desde, hasta) =>
        supabase
          .from("user_series")
          .select("series_tmdb_id, custom_poster_path, series_cache(name, poster_path)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .range(desde, hasta)
      ),
      progresoDeSeries(userId),
      fetchAllRows((desde, hasta) =>
        supabase
          .from("user_movies")
          .select("movie_tmdb_id, custom_poster_path, movies_cache(title, poster_path)")
          .eq("user_id", userId)
          .order("added_at", { ascending: false })
          .range(desde, hasta)
      ),
      fetchAllRows((desde, hasta) =>
        supabase
          .from("user_episodes_watched")
          .select("times_watched, episodes_cache(runtime_minutes)")
          .eq("user_id", userId)
          .range(desde, hasta)
      ),
      fetchAllRows((desde, hasta) =>
        supabase
          .from("user_movies")
          .select("times_watched, movies_cache(runtime_minutes)")
          .eq("user_id", userId)
          .eq("watched", true)
          .range(desde, hasta)
      ),
    ]);

    setPerfil(p);
    setIsAdmin(!!(p as any)?.is_admin);
    if ((p as any)?.is_admin) {
      const { count } = await supabase.from("reports").select("*", { count: "exact", head: true }).eq("status", "pending");
      setReportesPendientes(count ?? 0);
    }
    if (p) setCoverPath(await getCoverPosterPath(p));

    setListas(listasOrdenadas);
    setSocial(soc);
    setFavoritos(favs);

    setMisSeries(
      (seriesRows ?? []).map((r: any) => ({
        tmdb_id: r.series_tmdb_id,
        nombre: r.series_cache?.name ?? "—",
        poster_path: r.custom_poster_path ?? r.series_cache?.poster_path ?? null,
      }))
    );
    setProgreso(progresoSeries);

    setMisPeliculas(
      (movieRows ?? []).map((r: any) => ({
        tmdb_id: r.movie_tmdb_id,
        nombre: r.movies_cache?.title ?? "—",
        poster_path: r.custom_poster_path ?? r.movies_cache?.poster_path ?? null,
      }))
    );

    // Las revisitas suman: si volviste a ver algo, cuenta de nuevo en el total.
    setStats({
      minutosSeriesVistas: (episodiosVistos ?? []).reduce((acc: number, e: any) => acc + (e.episodes_cache?.runtime_minutes ?? 0) * (e.times_watched ?? 1), 0),
      capitulosVistos: (episodiosVistos ?? []).reduce((acc: number, e: any) => acc + (e.times_watched ?? 1), 0),
      minutosPeliculasVistas: (peliculasVistas ?? []).reduce((acc: number, p: any) => acc + (p.movies_cache?.runtime_minutes ?? 0) * (p.times_watched ?? 1), 0),
      peliculasVistas: (peliculasVistas ?? []).reduce((acc: number, p: any) => acc + (p.times_watched ?? 1), 0),
    });
  }

  function formatTiempo(minutos: number) {
    const meses = Math.floor(minutos / (60 * 24 * 30));
    const dias = Math.floor((minutos % (60 * 24 * 30)) / (60 * 24));
    const horas = Math.floor((minutos % (60 * 24)) / 60);
    return { meses, dias, horas };
  }

  const tSeries = formatTiempo(stats?.minutosSeriesVistas ?? 0);
  const tPelis = formatTiempo(stats?.minutosPeliculasVistas ?? 0);

  const [menuVisible, setMenuVisible] = useState(false);

  return (
    <>
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.coverWrap}>
        {coverPath ? (
          <Image source={{ uri: posterUrl(coverPath, "w780")! }} style={styles.cover} resizeMode="cover" />
        ) : (
          <View style={[styles.cover, { backgroundColor: theme.colors.surfaceAlt }]} />
        )}
        <Pressable style={styles.menuBtn} onPress={() => setMenuVisible(true)} hitSlop={12}>
          <Text style={styles.menuBtnTexto}>⋯</Text>
        </Pressable>
        {recapBannerVisible && recapYear && (
          <Pressable style={styles.recapBanner} onPress={() => abrirRecap(recapYear, false)}>
            <Text style={styles.recapBannerTexto}>LAVINOLA RECAP {recapYear}</Text>
            <Text style={styles.recapBannerSub}>Tocá para volver a verlo ›</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.headerRow}>
        <View style={styles.avatarNombreGrupo}>
          {perfil?.avatar_url ? (
            <Image source={{ uri: perfil.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]} />
          )}
          <View style={{ marginLeft: 12, justifyContent: "center" }}>
            <Text style={styles.nombre} numberOfLines={1}>{perfil?.display_name || perfil?.username || t("Vos")}</Text>
            {perfil?.username && (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={styles.username}>@{perfil.username}</Text>
                {isAdmin && <AdminBadge />}
              </View>
            )}
            <Pressable onPress={() => navigation.navigate("EditarPerfil")}>
              <Text style={styles.editar}>{t("Editar perfil")}</Text>
            </Pressable>
            {(perfil as any)?.is_moderator && <Text style={styles.moderadorTag}>{t("Moderador")}</Text>}
          </View>
        </View>
        <View style={styles.redesRow}>
          {perfil?.social_instagram && (
            <Pressable style={styles.redItem} onPress={() => abrirRedSocial(`https://instagram.com/${perfil.social_instagram}`)}>
              <Ionicons name="logo-instagram" size={15} color={theme.colors.primaryLight} />
              <Text style={styles.redTexto}>@{perfil.social_instagram}</Text>
            </Pressable>
          )}
          {perfil?.social_twitter && (
            <Pressable style={styles.redItem} onPress={() => abrirRedSocial(`https://x.com/${perfil.social_twitter}`)}>
              <Ionicons name="logo-x" size={15} color={theme.colors.primaryLight} />
              <Text style={styles.redTexto}>@{perfil.social_twitter}</Text>
            </Pressable>
          )}
          {(perfil as any)?.social_tiktok && (
            <Pressable style={styles.redItem} onPress={() => abrirRedSocial(`https://tiktok.com/@${(perfil as any).social_tiktok}`)}>
              <Ionicons name="logo-tiktok" size={15} color={theme.colors.primaryLight} />
              <Text style={styles.redTexto}>@{(perfil as any).social_tiktok}</Text>
            </Pressable>
          )}
        </View>
      </View>
      {perfil?.favorite_quote ? (
        <Text style={styles.frase} numberOfLines={2}>
          "{perfil.favorite_quote}"
        </Text>
      ) : null}

      {social && perfil && (
        <View style={styles.socialRow}>
          <Pressable style={styles.socialStat} onPress={() => navigation.navigate("ListaSeguidores", { userId: perfil.id, modo: "siguiendo" })}>
            <SocialStat label={t("Siguiendo")} valor={social.siguiendo} />
          </Pressable>
          <Pressable style={styles.socialStat} onPress={() => navigation.navigate("ListaSeguidores", { userId: perfil.id, modo: "seguidores" })}>
            <SocialStat label={t("Seguidores")} valor={social.seguidores} />
          </Pressable>
          <Pressable style={styles.socialStat} onPress={() => navigation.navigate("MisComentarios", { userId: perfil.id })}>
            <SocialStat label={`${t("Posts")}\n${t("Comentarios")}`} valor={social.comentarios} />
          </Pressable>
        </View>
      )}

      <Pressable style={styles.estadisticasHeader} onPress={() => navigation.navigate("Estadisticas")}>
        <Text style={[styles.seccionTitulo, { marginTop: 0, marginBottom: 0, paddingHorizontal: 0 }]}>{t("Estadísticas")}</Text>
        <Text style={styles.flechita}>›</Text>
      </Pressable>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Ionicons name="film" size={22} color={theme.colors.primaryLight} />
          <Text style={styles.statCardTitulo}>{t("Películas")}</Text>
          <Text style={styles.statCardLabel}>{t("Tiempo dedicado")}</Text>
          <Text style={styles.statValue}>
            {tPelis.meses}m {tPelis.dias}d {tPelis.horas}h
          </Text>
          <Text style={styles.statCardLabel}>{t("Películas vistas")}</Text>
          <Text style={styles.statValue}>{stats?.peliculasVistas ?? 0}</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="tv" size={22} color={theme.colors.primaryLight} />
          <Text style={styles.statCardTitulo}>{t("Series")}</Text>
          <Text style={styles.statCardLabel}>{t("Tiempo dedicado")}</Text>
          <Text style={styles.statValue}>
            {tSeries.meses}m {tSeries.dias}d {tSeries.horas}h
          </Text>
          <Text style={styles.statCardLabel}>{t("Episodios vistos")}</Text>
          <Text style={styles.statValue}>{stats?.capitulosVistos ?? 0}</Text>
        </View>
      </View>

      <FilaMiniTitulos titulo={t("Películas")} items={misPeliculas} tipo="movie" navigation={navigation} onVerTodo={() => navigation.navigate("TodasLasPeliculas")} />
      <FilaMiniTitulos
        titulo={t("Películas favoritas")}
        items={favoritos.filter((f) => f.item_type === "movie").map((f) => ({ tmdb_id: f.tmdb_id, nombre: f.nombre, poster_path: f.poster_path }))}
        tipo="movie"
        navigation={navigation}
        favoritas
        vacioTexto={t("Todavía no marcaste ninguna como favorita.")}
        onVerTodo={() => navigation.navigate("TodasLasPeliculas", { soloFavoritas: true })}
      />
      <FilaMiniTitulos titulo={t("Series")} items={misSeries} tipo="series" navigation={navigation} progreso={progreso} onVerTodo={() => navigation.navigate("TodasLasSeries")} />
      <FilaMiniTitulos
        titulo={t("Series favoritas")}
        items={favoritos.filter((f) => f.item_type === "series").map((f) => ({ tmdb_id: f.tmdb_id, nombre: f.nombre, poster_path: f.poster_path }))}
        tipo="series"
        navigation={navigation}
        progreso={progreso}
        favoritas
        vacioTexto={t("Todavía no marcaste ninguna como favorita.")}
        onVerTodo={() => navigation.navigate("TodasLasSeries", { soloFavoritas: true })}
      />

      <Pressable style={styles.listasBtn} onPress={() => navigation.navigate("Listas")}>
        <Text style={styles.listasBtnTexto}>{t("Listas")}</Text>
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
      </Pressable>
      {listas.length > 0 && (
        <View style={{ paddingHorizontal: 16 }}>
          {listas.slice(0, 5).map((lista) => (
            <ListPreviewCard
              key={lista.id}
              lista={lista}
              onPress={() => navigation.navigate("DetalleLista", { listId: lista.id, listTitle: lista.title, soloLectura: false })}
              subtitulo={[`${lista.cantidad} ${t("títulos")}`, lista.seguidores ? `${lista.seguidores} ${t("seguidores")}` : null].filter(Boolean).join(" · ")}
            />
          ))}
          {listas.length > 5 && (
            <Pressable onPress={() => navigation.navigate("Listas")} style={{ marginTop: 10, marginBottom: 6 }}>
              <Text style={styles.masListas}>{t("Más")}</Text>
            </Pressable>
          )}
        </View>
      )}
      {isAdmin && (
        <>
          <View style={styles.accionesRow}>
            <View style={{ flex: 1, position: "relative" }}>
              <AppButton title={t("Moderación (reportes)")} onPress={() => navigation.navigate("AdminReportes")} variant="danger" />
              {reportesPendientes > 0 && (
                <View style={styles.badgeReportes}>
                  <Text style={styles.badgeReportesTexto}>{reportesPendientes > 99 ? "99+" : reportesPendientes}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.accionesRow}>
            <AppButton title={t("Moderadores")} onPress={() => navigation.navigate("AdminModeradores")} variant="danger" />
          </View>
          <View style={styles.accionesRow}>
            <AppButton title="Sugerencias de la comunidad" onPress={() => navigation.navigate("AdminSugerencias")} variant="danger" />
          </View>
          <View style={styles.accionesRow}>
            <AppButton title="Anuncio para todos" onPress={() => navigation.navigate("AdminAnuncio")} variant="danger" />
          </View>
          <View style={styles.accionesRow}>
            <AppButton title="Métricas de la app" onPress={() => navigation.navigate("AdminMetricas")} variant="danger" />
          </View>
        </>
      )}

      <Text style={styles.atribucion}>
        This product uses the TMDB API but is not endorsed or certified by TMDB. Datos de streaming con atribución a
        JustWatch.
      </Text>
    </ScrollView>
    <ActionSheetModal
      visible={menuVisible}
      onCerrar={() => setMenuVisible(false)}
      opciones={[
        { label: t("Ajustes"), icono: "settings-outline", onPress: () => navigation.navigate("Ajustes") },
        {
          label: t("Compartir"),
          icono: "share-social-outline",
          onPress: () =>
            Share.share({
              message: t("Estoy usando Lavinola para trackear series y películas — Lavinola: Cine & Series 🎬"),
            }),
        },
        { label: t("Sugerir una mejora"), icono: "bulb-outline", onPress: () => navigation.navigate("Sugerir") },
      ]}
    />
    <RecapModal visible={recapModalVisible} onCerrar={cerrarRecap} datos={recapDatos} cargando={recapCargando} userId={recapUserId} />
    <ConfirmModal
      visible={avisoUsernameVisible}
      onCerrar={cerrarAvisoUsername}
      titulo={t("¡Bienvenido/a a Lavinola!")}
      mensaje={t("Entrá a Editar perfil y elegí tu nombre de usuario.")}
      botones={[
        { label: t("Después"), onPress: () => {} },
        {
          label: t("Editar perfil"),
          destacado: true,
          onPress: () => navigation.navigate("EditarPerfil"),
        },
      ]}
    />
    </>
  );
}

function SocialStat({ label, valor }: { label: string; valor: number }) {
  return (
    <>
      <Text style={styles.socialValor}>{valor}</Text>
      <Text style={styles.socialLabel}>{label}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  coverWrap: { width: "100%", aspectRatio: 16 / 9, backgroundColor: theme.colors.surfaceAlt },
  recapBanner: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "33%",
    backgroundColor: "rgba(20,8,28,0.72)",
    borderTopWidth: 1,
    borderColor: "rgba(166,63,224,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  recapBannerTexto: { color: "#FFFFFF", fontSize: 16, fontWeight: "900", letterSpacing: 1 },
  recapBannerSub: { color: theme.colors.primaryLight, fontSize: 11, fontWeight: "700", marginTop: 4 },
  estadisticasHeader: { flexDirection: "row", alignItems: "center", marginTop: 20, marginBottom: 8, paddingHorizontal: 16 },
  flechita: { fontSize: 20, color: theme.colors.textMuted, marginLeft: 6 },
  menuBtn: { position: "absolute", top: 12, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  menuBtnTexto: { color: theme.colors.text, fontSize: 20, fontWeight: "700" },
  cover: { width: "100%", height: "100%" },
  coverOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, height: 60, backgroundColor: theme.colors.background, opacity: 0.3 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  avatarNombreGrupo: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: theme.colors.background, transform: [{ translateY: -28 }] },
  avatarPlaceholder: { backgroundColor: theme.colors.surfaceAlt },
  redesRow: { flexDirection: "column", gap: 6, justifyContent: "center", alignSelf: "center" },
  redItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  redTexto: { fontSize: 12, color: theme.colors.primaryLight },
  nombre: { fontSize: 19, fontFamily: theme.fonts.logo, marginBottom: 2 },
  username: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 4 },
  editar: { fontSize: 12, color: theme.colors.primaryLight },
  frase: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontStyle: "italic",
    alignSelf: "center",
    maxWidth: "85%",
    textAlign: "center",
    marginBottom: 12,
  },
  moderadorTag: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700", marginTop: 2 },
  socialRow: { flexDirection: "row", justifyContent: "space-around", marginTop: 0, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  socialStat: { alignItems: "center" },
  socialValor: { fontSize: 17, fontWeight: "700" },
  socialLabel: { fontSize: 12, color: theme.colors.textMuted, textAlign: "center" },
  seccionTitulo: { fontSize: 16, fontWeight: "700", marginTop: 20, marginBottom: 10, paddingHorizontal: 16 },
  statsGrid: { flexDirection: "row", paddingHorizontal: 12, gap: 8 },
  statCard: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 14, alignItems: "center" },
  statCardTitulo: { fontSize: 15, fontWeight: "700", marginTop: 4, marginBottom: 10 },
  statCardLabel: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6 },
  statValue: { fontSize: 17, fontWeight: "700" },
  accionesRow: { flexDirection: "row", paddingHorizontal: 16, marginTop: 12 },
  listasBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.primary,
  },
  listasBtnTexto: { fontSize: 18, fontWeight: "700" },
  masListas: { fontSize: 14, color: theme.colors.primaryLight, fontWeight: "700" },
  badgeReportes: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  badgeReportesTexto: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  atribucion: { fontSize: 10, color: theme.colors.textFaint, marginTop: 24, marginHorizontal: 16, textAlign: "center" },
});
