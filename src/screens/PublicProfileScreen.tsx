import React, { useCallback, useState } from "react";
import { View, Image, FlatList, Pressable, StyleSheet, ScrollView, Alert, Modal, TextInput } from "react-native";
import { Text, AppButton } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../lib/pagination";
import { posterUrl } from "../lib/tmdb";
import { getPerfilPublico, getCoverPosterPath, getStatsSociales, PerfilCompleto, StatsSociales } from "../lib/profile";
import { seguirRespetandoPrivacidad, tengoSolicitudPendiente } from "../lib/followRequests";
import { progresoDeSeries, ProgresoSerie } from "../lib/seriesList";
import FilaMiniTitulos, { ItemMiniTitulo } from "../components/FilaMiniTitulos";
import ActionSheetModal from "../components/ActionSheetModal";
import AdminBadge from "../components/AdminBadge";
import ConfirmModal from "../components/ConfirmModal";
import { dejarDeSeguir } from "../lib/follows";
import { listarMisGrupos, Grupo } from "../lib/groups";
import { obtenerOCrearChat } from "../lib/chats";
import { calcularCompatibilidad } from "../lib/favorites";
import { listarListasDeUsuarioOrdenadasPorSeguidores, seguirLista, dejarDeSeguirLista, sigoLista, Lista } from "../lib/lists";
import ListPreviewCard from "../components/ListPreviewCard";
import { suspenderUsuario, revocarSuspension, estaSuspendido, eliminarUsuarioComoAdmin, convertirEnModerador, quitarModerador, DuracionSuspension } from "../lib/adminModeration";
import { bloquearUsuario } from "../lib/reports";
import ReportModal from "../components/ReportModal";
import { abrirRedSocial } from "../lib/social";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";
import { formatearFecha } from "../lib/dates";

interface Props {
  route: { params: { userId: string } };
  navigation: any;
}

export default function PublicProfileScreen({ route, navigation }: Props) {
  function formatTiempo(minutos: number) {
    const meses = Math.floor(minutos / (60 * 24 * 30));
    const dias = Math.floor((minutos % (60 * 24 * 30)) / (60 * 24));
    const horas = Math.floor((minutos % (60 * 24)) / 60);
    return { meses, dias, horas };
  }
  const { t } = useT();
  const { userId: targetId } = route.params;
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<PerfilCompleto | null>(null);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [puedeVer, setPuedeVer] = useState(false);
  const [loSigo, setLoSigo] = useState(false);
  const [compatibilidad, setCompatibilidad] = useState<number | null>(null);
  const [statsTiempo, setStatsTiempo] = useState<{ minutosSeries: number; capitulos: number; minutosPeliculas: number; peliculasVistas: number } | null>(null);
  const [solicitudPendiente, setSolicitudPendiente] = useState(false);
  const [soyAdmin, setSoyAdmin] = useState(false);
  const [soyModerador, setSoyModerador] = useState(false);
  const [esModeradorTarget, setEsModeradorTarget] = useState(false);
  const [suspension, setSuspension] = useState<{ suspendido: boolean; hasta: string | null; motivo: string | null } | null>(null);
  const [suspensionModalVisible, setSuspensionModalVisible] = useState(false);
  const [mensajeSuspensionVisible, setMensajeSuspensionVisible] = useState(false);
  const [mensajeSuspension, setMensajeSuspension] = useState("");
  const [duracionPendiente, setDuracionPendiente] = useState<DuracionSuspension | null>(null);
  const [social, setSocial] = useState<StatsSociales | null>(null);
  const [favSeries, setFavSeries] = useState<ItemMiniTitulo[]>([]);
  const [favPeliculas, setFavPeliculas] = useState<ItemMiniTitulo[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [listas, setListas] = useState<Lista[]>([]);
  const [listasSeguidas, setListasSeguidas] = useState<Set<string>>(new Set());
  const [avatarAmpliado, setAvatarAmpliado] = useState(false);
  const [progreso, setProgreso] = useState<Record<number, ProgresoSerie>>({});
  const [confirmDejarDeSeguirVisible, setConfirmDejarDeSeguirVisible] = useState(false);
  const [menuOpcionesVisible, setMenuOpcionesVisible] = useState(false);
  const [confirmBloquearVisible, setConfirmBloquearVisible] = useState(false);
  const [denunciaVisible, setDenunciaVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [targetId])
  );

  async function cargar() {
    const { data: userData } = await supabase.auth.getUser();
    const vid = userData.user?.id ?? null;
    setViewerId(vid);
    if (!vid) return;

    setFavSeries([]);
    setFavPeliculas([]);
    setGrupos([]);
    setListas([]);

    const resultado = await getPerfilPublico(vid, targetId);
    if (!resultado) return;
    setPerfil(resultado.perfil);
    setEsModeradorTarget(!!(resultado.perfil as any).is_moderator);
    setLoSigo(resultado.loSigo);
    setPuedeVer(resultado.puedeVerActividad);
    setCoverPath(await getCoverPosterPath(resultado.perfil));
    setSocial(await getStatsSociales(targetId));
    if (resultado.loSigo && vid && vid !== targetId) {
      setCompatibilidad(await calcularCompatibilidad(vid, targetId));
    } else {
      setCompatibilidad(null);
    }

    if (!resultado.loSigo && vid !== targetId) {
      setSolicitudPendiente(await tengoSolicitudPendiente(vid, targetId));
    }

    const { data: viewerProfile } = await supabase.from("profiles").select("is_admin, is_moderator").eq("id", vid).single();
    setSoyAdmin(!!viewerProfile?.is_admin);
    setSoyModerador(!!viewerProfile?.is_moderator);
    if (viewerProfile?.is_admin || viewerProfile?.is_moderator) setSuspension(await estaSuspendido(targetId));

    if (!resultado.puedeVerActividad) return;

    const p = resultado.perfil;

    if (p.show_favorite_series) {
      setProgreso(await progresoDeSeries(targetId));
    }
    if (p.show_watch_time) {
      const [episodiosVistos, peliculasVistas] = await Promise.all([
        fetchAllRows((desde, hasta) =>
          supabase.from("user_episodes_watched").select("times_watched, episodes_cache(runtime_minutes)").eq("user_id", targetId).range(desde, hasta)
        ),
        fetchAllRows((desde, hasta) =>
          supabase.from("user_movies").select("times_watched, movies_cache(runtime_minutes)").eq("user_id", targetId).eq("watched", true).range(desde, hasta)
        ),
      ]);
      setStatsTiempo({
        minutosSeries: (episodiosVistos ?? []).reduce((acc: number, e: any) => acc + (e.episodes_cache?.runtime_minutes ?? 0) * (e.times_watched ?? 1), 0),
        capitulos: (episodiosVistos ?? []).reduce((acc: number, e: any) => acc + (e.times_watched ?? 1), 0),
        minutosPeliculas: (peliculasVistas ?? []).reduce((acc: number, p: any) => acc + (p.movies_cache?.runtime_minutes ?? 0) * (p.times_watched ?? 1), 0),
        peliculasVistas: (peliculasVistas ?? []).reduce((acc: number, p: any) => acc + (p.times_watched ?? 1), 0),
      });
    }
    if (p.show_favorite_series || p.show_favorite_movies) {
      const { data } = await supabase.from("user_favorites").select("item_type, tmdb_id").eq("user_id", targetId);
      for (const f of data ?? []) {
        const tabla = f.item_type === "series" ? "series_cache" : "movies_cache";
        const tablaUsuario = f.item_type === "series" ? "user_series" : "user_movies";
        const columnaId = f.item_type === "series" ? "series_tmdb_id" : "movie_tmdb_id";
        const [{ data: cache }, { data: custom }] = await Promise.all([
          supabase.from(tabla).select("*").eq("tmdb_id", f.tmdb_id).maybeSingle(),
          supabase.from(tablaUsuario).select("custom_poster_path").eq("user_id", targetId).eq(columnaId, f.tmdb_id).maybeSingle(),
        ]);
        const item = {
          tmdb_id: f.tmdb_id,
          nombre: cache ? (f.item_type === "series" ? cache.name : cache.title) : "—",
          poster_path: (custom as any)?.custom_poster_path ?? cache?.poster_path ?? null,
        };
        if (f.item_type === "series" && p.show_favorite_series) setFavSeries((prev) => [...prev, item]);
        if (f.item_type === "movie" && p.show_favorite_movies) setFavPeliculas((prev) => [...prev, item]);
      }
    }
    if (p.show_groups) {
      const todosLosGrupos = await listarMisGrupos(targetId);
      setGrupos(todosLosGrupos.filter((g) => g.visibility === "public"));
    }

    const listasVisibles = await listarListasDeUsuarioOrdenadasPorSeguidores(targetId);
    setListas(listasVisibles);
    if (vid !== targetId) {
      const seguidas = await Promise.all(listasVisibles.map(async (l) => ((await sigoLista(vid, l.id)) ? l.id : null)));
      setListasSeguidas(new Set(seguidas.filter(Boolean) as string[]));
    }
  }

  async function toggleFollow() {
    if (!viewerId || solicitudPendiente) return;
    if (loSigo) {
      setConfirmDejarDeSeguirVisible(true);
      return;
    }
    const resultado = await seguirRespetandoPrivacidad(viewerId, targetId);
    if (resultado === "solicitado") setSolicitudPendiente(true);
    else setLoSigo(true);
    cargar();
  }

  async function confirmarDejarDeSeguir() {
    if (!viewerId) return;
    await dejarDeSeguir(viewerId, targetId);
    setLoSigo(false);
    cargar();
  }

  async function confirmarBloqueo() {
    if (!viewerId) return;
    try {
      await bloquearUsuario(viewerId, targetId);
      setLoSigo(false);
      Alert.alert("Listo", "Bloqueaste a este usuario. No va a poder seguirte ni mandarte nada.");
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("No se pudo bloquear", e.message);
    }
  }

  async function abrirChat() {
    if (!viewerId) return;
    try {
      const chatId = await obtenerOCrearChat(targetId);
      navigation.navigate("HiloActividad", { chatId, otroUsername: perfil?.username ?? null, otroUserId: targetId });
    } catch (e: any) {
      Alert.alert("No se pudo abrir el chat", e.message);
    }
  }

  async function toggleSeguirLista(lista: Lista) {
    if (!viewerId) return;
    const yaSigo = listasSeguidas.has(lista.id);
    try {
      if (yaSigo) await dejarDeSeguirLista(viewerId, lista.id);
      else await seguirLista(viewerId, lista.id);
      setListasSeguidas((prev) => {
        const nuevo = new Set(prev);
        if (yaSigo) nuevo.delete(lista.id);
        else nuevo.add(lista.id);
        return nuevo;
      });
    } catch (e: any) {
      Alert.alert("No se pudo actualizar", e.message);
    }
  }

  function elegirSuspension() {
    setSuspensionModalVisible(true);
  }

  function elegirDuracionSuspension(duracion: DuracionSuspension) {
    setDuracionPendiente(duracion);
    setSuspensionModalVisible(false);
    setMensajeSuspension("");
    setMensajeSuspensionVisible(true);
  }

  async function confirmarSuspension() {
    if (!duracionPendiente) return;
    setMensajeSuspensionVisible(false);
    await suspenderUsuario(targetId, duracionPendiente, "Suspendido por un admin desde su perfil.", viewerId ?? undefined, mensajeSuspension);
    setSuspension(await estaSuspendido(targetId));
    Alert.alert(t("Listo"), t("El usuario ya no puede comentar por el tiempo elegido."));
  }

  async function quitarSuspension() {
    await revocarSuspension(targetId);
    setSuspension(await estaSuspendido(targetId));
  }

  async function toggleModerador() {
    try {
      if (esModeradorTarget) {
        await quitarModerador(targetId);
        setEsModeradorTarget(false);
      } else {
        await convertirEnModerador(targetId);
        setEsModeradorTarget(true);
      }
    } catch (e: any) {
      Alert.alert("No se pudo actualizar", e.message);
    }
  }

  function confirmarEliminarUsuario() {
    Alert.alert(
      t("Eliminar usuario"),
      `Esto borra la cuenta de "${perfil?.username ?? "este usuario"}" y todos sus datos, para siempre. No se puede deshacer.`,
      [
        { text: t("Cancelar"), style: "cancel" },
        {
          text: t("Eliminar"),
          style: "destructive",
          onPress: async () => {
            const resultado = await eliminarUsuarioComoAdmin(targetId);
            if (resultado.ok) {
              Alert.alert("Listo", "La cuenta fue eliminada.");
              navigation.goBack();
            } else {
              Alert.alert("Error", resultado.motivo ?? "No se pudo eliminar.");
            }
          },
        },
      ]
    );
  }

  if (!perfil) return null;

  const tituloBoton = solicitudPendiente ? t("Solicitud enviada") : loSigo ? t("Dejar de seguir") : t("Seguir");

  return (
    <>
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.coverWrap}>
        {coverPath ? (
          <Image source={{ uri: posterUrl(coverPath, "w780")! }} style={styles.cover} resizeMode="cover" />
        ) : (
          <View style={[styles.cover, { backgroundColor: theme.colors.surfaceAlt }]} />
        )}
        {viewerId !== targetId && (
          <Pressable style={styles.menuBtn} onPress={() => setMenuOpcionesVisible(true)} hitSlop={12}>
            <Text style={styles.menuBtnTexto}>⋯</Text>
          </Pressable>
        )}
        {viewerId !== targetId && (!perfil.is_private || loSigo || soyAdmin) && (
          <Pressable style={styles.mensajeBtn} onPress={abrirChat} hitSlop={12}>
            <Ionicons name="mail" size={18} color="#FFFFFF" />
          </Pressable>
        )}
      </View>

      <View style={styles.headerRow}>
        <View style={styles.avatarNombreGrupo}>
          <Pressable disabled={!puedeVer} onPress={() => setAvatarAmpliado(true)}>
            {perfil.avatar_url ? (
              <Image source={{ uri: perfil.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]} />
            )}
          </Pressable>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={styles.nombre} numberOfLines={1}>{perfil.display_name || perfil.username || t("Usuario")}</Text>
              {perfil.is_admin && <AdminBadge />}
            </View>
            {perfil.username && perfil.display_name && <Text style={styles.username}>@{perfil.username}</Text>}
            {loSigo && compatibilidad !== null && <Text style={styles.compatibilidad}>{compatibilidad}% {t("de Gustos en común")}</Text>}
            {esModeradorTarget && <Text style={styles.moderadorTag}>{t("Moderador")}</Text>}
            {viewerId !== targetId && !loSigo && (
              <Pressable onPress={toggleFollow} disabled={solicitudPendiente}>
                <Text style={styles.editar}>{tituloBoton}</Text>
              </Pressable>
            )}
          </View>
        </View>
        {puedeVer && (
          <View style={styles.redesRow}>
            {perfil.social_instagram && (
              <Pressable style={styles.redItem} onPress={() => abrirRedSocial(`https://instagram.com/${perfil.social_instagram}`)}>
                <Ionicons name="logo-instagram" size={15} color={theme.colors.primaryLight} />
                <Text style={styles.redTexto}>@{perfil.social_instagram}</Text>
              </Pressable>
            )}
            {perfil.social_twitter && (
              <Pressable style={styles.redItem} onPress={() => abrirRedSocial(`https://x.com/${perfil.social_twitter}`)}>
                <Ionicons name="logo-x" size={15} color={theme.colors.primaryLight} />
                <Text style={styles.redTexto}>@{perfil.social_twitter}</Text>
              </Pressable>
            )}
            {(perfil as any).social_tiktok && (
              <Pressable style={styles.redItem} onPress={() => abrirRedSocial(`https://tiktok.com/@${(perfil as any).social_tiktok}`)}>
                <Ionicons name="logo-tiktok" size={15} color={theme.colors.primaryLight} />
                <Text style={styles.redTexto}>@{(perfil as any).social_tiktok}</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
      {puedeVer && (perfil as any).favorite_quote ? (
        <Text style={styles.frase} numberOfLines={2}>
          "{(perfil as any).favorite_quote}"
        </Text>
      ) : null}

      {(soyAdmin || soyModerador) && viewerId !== targetId && (
        <View style={styles.adminBox}>
          <Text style={styles.adminTitulo}>{soyAdmin ? t("Panel de admin") : t("Panel de moderador")}</Text>
          {suspension?.suspendido && (
            <Text style={styles.adminDato}>
              Suspendido hasta {suspension.hasta ? formatearFecha(suspension.hasta) : ""}
            </Text>
          )}
          <AppButton title={t("Suspender comentarios")} onPress={elegirSuspension} variant="outline" />
          {soyAdmin && (
            <>
              <View style={{ height: 8 }} />
              <AppButton title={t("Eliminar usuario")} onPress={confirmarEliminarUsuario} variant="danger" />
            </>
          )}
        </View>
      )}

      {puedeVer && social && (
        <View style={styles.socialRow}>
          <Pressable style={styles.socialStat} onPress={() => navigation.navigate("ListaSeguidores", { userId: targetId, modo: "siguiendo" })}>
            <Text style={styles.socialValor}>{social.siguiendo}</Text>
            <Text style={styles.socialLabel}>{t("Siguiendo")}</Text>
          </Pressable>
          <Pressable style={styles.socialStat} onPress={() => navigation.navigate("ListaSeguidores", { userId: targetId, modo: "seguidores" })}>
            <Text style={styles.socialValor}>{social.seguidores}</Text>
            <Text style={styles.socialLabel}>{t("Seguidores")}</Text>
          </Pressable>
          <Pressable
            style={styles.socialStat}
            disabled={!perfil.show_comments}
            onPress={() => navigation.navigate("MisComentarios", { userId: targetId })}
          >
            <Text style={styles.socialValor}>{social.comentarios}</Text>
            <Text style={styles.socialLabel}>{`${t("Posts")}\n${t("Comentarios")}`}</Text>
          </Pressable>
        </View>
      )}

      {!puedeVer ? (
        <View style={styles.privadoBox}>
          <Ionicons name="lock-closed-outline" size={28} color={theme.colors.textMuted} />
          <Text style={styles.privadoTexto}>Esta cuenta es privada. Seguila para ver su actividad.</Text>
        </View>
      ) : (
        <>
          {perfil.show_watch_time && statsTiempo && (
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Ionicons name="film" size={22} color={theme.colors.primaryLight} />
                <Text style={styles.statCardTitulo}>{t("Películas")}</Text>
                <Text style={styles.statCardLabel}>{t("Tiempo dedicado")}</Text>
                <Text style={styles.statValue}>
                  {formatTiempo(statsTiempo.minutosPeliculas).meses}m {formatTiempo(statsTiempo.minutosPeliculas).dias}d{" "}
                  {formatTiempo(statsTiempo.minutosPeliculas).horas}h
                </Text>
                <Text style={styles.statCardLabel}>{t("Películas vistas")}</Text>
                <Text style={styles.statValue}>{statsTiempo.peliculasVistas}</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="tv" size={22} color={theme.colors.primaryLight} />
                <Text style={styles.statCardTitulo}>{t("Series")}</Text>
                <Text style={styles.statCardLabel}>{t("Tiempo dedicado")}</Text>
                <Text style={styles.statValue}>
                  {formatTiempo(statsTiempo.minutosSeries).meses}m {formatTiempo(statsTiempo.minutosSeries).dias}d{" "}
                  {formatTiempo(statsTiempo.minutosSeries).horas}h
                </Text>
                <Text style={styles.statCardLabel}>{t("Episodios vistos")}</Text>
                <Text style={styles.statValue}>{statsTiempo.capitulos}</Text>
              </View>
            </View>
          )}

          {perfil.show_favorite_movies && favPeliculas.length > 0 && (
            <FilaMiniTitulos
              titulo={t("Películas favoritas")}
              items={favPeliculas}
              tipo="movie"
              navigation={navigation}
              favoritas
              onVerTodo={() => navigation.navigate("TodasLasPeliculas", { targetUserId: targetId })}
            />
          )}
          {perfil.show_favorite_series && favSeries.length > 0 && (
            <FilaMiniTitulos
              titulo={t("Series favoritas")}
              items={favSeries}
              tipo="series"
              navigation={navigation}
              progreso={progreso}
              favoritas
              onVerTodo={() => navigation.navigate("TodasLasSeries", { targetUserId: targetId })}
            />
          )}
          {grupos.length > 0 && (
            <View style={styles.filaMiniWrap}>
              <View style={styles.filaMiniHeader}>
                <Text style={styles.seccionTitulo}>{t("Grupos")}</Text>
              </View>
              <FlatList
                horizontal
                data={grupos}
                keyExtractor={(g) => g.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 10 }}
                renderItem={({ item }) => (
                  <Pressable style={styles.grupoCard} onPress={() => navigation.navigate("DetalleGrupo", { groupId: item.id, groupName: item.name })}>
                    {item.photo_url ? (
                      <Image source={{ uri: item.photo_url }} style={styles.grupoFoto} />
                    ) : (
                      <View style={[styles.grupoFoto, { backgroundColor: theme.colors.surfaceAlt }]} />
                    )}
                    <Text numberOfLines={1} style={styles.grupoNombre}>{item.name}</Text>
                  </Pressable>
                )}
              />
            </View>
          )}

          {listas.length > 0 && (
            <View style={styles.filaMiniWrap}>
              <View style={styles.filaMiniHeader}>
                <Pressable onPress={() => navigation.navigate("ListasDeUsuario", { userId: targetId, username: perfil.username })}>
                  <Text style={styles.seccionTitulo}>{t("Listas")}</Text>
                </Pressable>
              </View>
              {listas.slice(0, 5).map((lista) => (
                <ListPreviewCard
                  key={lista.id}
                  lista={lista}
                  onPress={() => navigation.navigate("DetalleLista", { listId: lista.id, listTitle: lista.title, soloLectura: true })}
                  subtitulo={[`${lista.cantidad} ${t("títulos")}`, lista.seguidores ? `${lista.seguidores} ${t("seguidores")}` : null].filter(Boolean).join(" · ")}
                  accionesDerecha={
                    viewerId !== targetId ? (
                      <Pressable onPress={() => toggleSeguirLista(lista)} hitSlop={8}>
                        <Text style={styles.listaSeguir}>{listasSeguidas.has(lista.id) ? t("Siguiendo") : t("Seguir")}</Text>
                      </Pressable>
                    ) : undefined
                  }
                />
              ))}
              {listas.length > 5 && (
                <Pressable onPress={() => navigation.navigate("ListasDeUsuario", { userId: targetId, username: perfil.username })} style={{ marginTop: 10 }}>
                  <Text style={styles.masListas}>{t("Más")}</Text>
                </Pressable>
              )}
            </View>
          )}
        </>
      )}
    </ScrollView>
    <Modal visible={avatarAmpliado} transparent animationType="fade" onRequestClose={() => setAvatarAmpliado(false)}>
      <Pressable style={styles.avatarModalFondo} onPress={() => setAvatarAmpliado(false)}>
        {perfil.avatar_url && <Image source={{ uri: perfil.avatar_url }} style={styles.avatarAmpliado} />}
      </Pressable>
    </Modal>
    <ActionSheetModal
      visible={suspensionModalVisible}
      onCerrar={() => setSuspensionModalVisible(false)}
      titulo={suspension?.suspendido ? t("Comentarios suspendidos") : t("¿Por cuánto tiempo?")}
      opciones={[
        ...(suspension?.suspendido
          ? [{ label: t("Permitir comentarios"), icono: "checkmark-circle-outline" as const, onPress: () => { setSuspensionModalVisible(false); quitarSuspension(); } }]
          : []),
        { label: t("1 día"), icono: "time-outline", onPress: () => elegirDuracionSuspension("1dia") },
        { label: t("1 semana"), icono: "time-outline", onPress: () => elegirDuracionSuspension("1semana") },
        { label: t("1 mes"), icono: "time-outline", onPress: () => elegirDuracionSuspension("1mes") },
        { label: t("1 año"), icono: "time-outline", onPress: () => elegirDuracionSuspension("1anio") },
        { label: t("Para siempre"), icono: "ban-outline", onPress: () => elegirDuracionSuspension("para_siempre"), destructivo: true },
      ]}
    />

    <Modal visible={mensajeSuspensionVisible} transparent animationType="fade" onRequestClose={() => setMensajeSuspensionVisible(false)}>
      <Pressable style={styles.avatarModalFondo} onPress={() => setMensajeSuspensionVisible(false)}>
        <Pressable style={styles.mensajeSuspensionHoja} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.mensajeSuspensionTitulo}>{t("Mensaje para el usuario (opcional)")}</Text>
          <TextInput
            style={styles.mensajeSuspensionInput}
            value={mensajeSuspension}
            onChangeText={setMensajeSuspension}
            placeholder={t("Contale la causa, si querés...")}
            placeholderTextColor={theme.colors.textFaint}
            multiline
            maxLength={500}
          />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <AppButton title={t("Cancelar")} variant="muted" onPress={() => setMensajeSuspensionVisible(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton title={t("Suspender")} onPress={confirmarSuspension} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>

    <ConfirmModal
      visible={confirmDejarDeSeguirVisible}
      onCerrar={() => setConfirmDejarDeSeguirVisible(false)}
      titulo={t("Dejar de seguir")}
      mensaje={t("¿Seguro que querés dejar de seguir a {nombre}?").replace("{nombre}", perfil.username ?? t("este usuario"))}
      botones={[
        { label: t("Cancelar"), onPress: () => {} },
        { label: t("Dejar de seguir"), destacado: true, onPress: confirmarDejarDeSeguir },
      ]}
    />

    <ActionSheetModal
      visible={menuOpcionesVisible}
      onCerrar={() => setMenuOpcionesVisible(false)}
      opciones={[
        ...(loSigo ? [{ label: t("Dejar de seguir"), icono: "person-remove-outline" as const, violeta: true, onPress: toggleFollow }] : []),
        ...(soyAdmin
          ? [
              {
                label: esModeradorTarget ? t("Quitar de moderador") : t("Convertir en moderador"),
                icono: "shield-checkmark-outline" as const,
                onPress: toggleModerador,
              },
            ]
          : []),
        ...(soyAdmin || soyModerador
          ? [
              {
                label: t("Denuncias realizadas"),
                icono: "document-text-outline" as const,
                onPress: () => navigation.navigate("DenunciasUsuario", { userId: targetId, username: perfil.username, modo: "hechas" }),
              },
              {
                label: t("Denuncias recibidas"),
                icono: "document-text-outline" as const,
                onPress: () => navigation.navigate("DenunciasUsuario", { userId: targetId, username: perfil.username, modo: "recibidas" }),
              },
            ]
          : []),
        { label: t("Bloquear"), icono: "ban-outline", destructivo: true, onPress: () => setConfirmBloquearVisible(true) },
        { label: t("Denunciar"), icono: "flag-outline", destructivo: true, onPress: () => setDenunciaVisible(true) },
      ]}
    />

    <ConfirmModal
      visible={confirmBloquearVisible}
      onCerrar={() => setConfirmBloquearVisible(false)}
      titulo={t("Bloquear usuario")}
      mensaje={t("{nombre} no va a poder seguirte, mandarte solicitudes ni compartirte nada. Si te seguía, deja de seguirte.").replace("{nombre}", perfil.username ?? t("Este usuario"))}
      botones={[
        { label: t("Cancelar"), onPress: () => {} },
        { label: t("Bloquear"), destacado: true, onPress: confirmarBloqueo },
      ]}
    />

    <ReportModal visible={denunciaVisible} onCerrar={() => setDenunciaVisible(false)} reporterId={viewerId} targetType="user" targetId={targetId} />
    </>
  );
}

const styles = StyleSheet.create({
  statsGrid: { flexDirection: "row", paddingHorizontal: 12, gap: 8, marginTop: 16, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 14, alignItems: "center" },
  statCardTitulo: { fontSize: 15, fontWeight: "700", marginTop: 4, marginBottom: 10 },
  statCardLabel: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6 },
  statValue: { fontSize: 17, fontWeight: "700" },
  coverWrap: { width: "100%", aspectRatio: 16 / 9, backgroundColor: theme.colors.surfaceAlt },
  cover: { width: "100%", height: "100%" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  avatarNombreGrupo: { flexDirection: "row", alignItems: "center", flex: 1 },
  avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: theme.colors.background, transform: [{ translateY: -28 }] },
  avatarPlaceholder: { backgroundColor: theme.colors.surfaceAlt },
  redesRow: { flexDirection: "column", gap: 6, justifyContent: "center", alignSelf: "center" },
  redItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  redTexto: { fontSize: 12, color: theme.colors.primaryLight },
  nombre: { fontSize: 19, fontFamily: theme.fonts.logo, marginBottom: 4 },
  username: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 4 },
  compatibilidad: { fontSize: 14, color: theme.colors.primaryLight, fontWeight: "700", marginBottom: 4 },
  frase: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontStyle: "italic",
    alignSelf: "center",
    maxWidth: "85%",
    textAlign: "center",
    marginBottom: 12,
  },
  moderadorTag: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700", marginBottom: 4 },
  editar: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },
  adminBox: { margin: 16, padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.danger },
  adminTitulo: { fontSize: 12, fontWeight: "700", color: theme.colors.danger, marginBottom: 8, textTransform: "uppercase" },
  adminDato: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 8 },
  socialRow: { flexDirection: "row", justifyContent: "space-around", marginTop: 0, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  socialStat: { alignItems: "center" },
  socialValor: { fontSize: 17, fontWeight: "700" },
  socialLabel: { fontSize: 12, color: theme.colors.textMuted, textAlign: "center" },
  privadoBox: { padding: 32, alignItems: "center", gap: 10 },
  privadoTexto: { color: theme.colors.textMuted, textAlign: "center" },
  filaMiniWrap: { marginTop: 0, paddingHorizontal: 16 },
  filaMiniHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.primary,
  },
  seccionTitulo: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  grupoCard: { width: 90, marginRight: 10, alignItems: "center" },
  grupoFoto: { width: 90, height: 90, borderRadius: 8, marginBottom: 4 },
  grupoNombre: { fontSize: 12, fontWeight: "600", textAlign: "center" },
  listaRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  listaTitulo: { fontSize: 14, fontWeight: "600" },
  listaSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  listaSeguir: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },
  masListas: { fontSize: 14, color: theme.colors.primaryLight, fontWeight: "700" },
  avatarModalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center" },
  menuBtn: { position: "absolute", top: 12, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  mensajeBtn: { position: "absolute", top: 56, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  menuBtnTexto: { color: theme.colors.text, fontSize: 20, fontWeight: "700" },
  denunciaBox: { width: "85%", backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 20 },
  denunciaTitulo: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  denunciaInput: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 10, color: theme.colors.text, backgroundColor: theme.colors.background, minHeight: 80, textAlignVertical: "top", marginBottom: 14 },
  avatarAmpliado: { width: 260, height: 260, borderRadius: 130, borderWidth: 3, borderColor: theme.colors.border },
  mensajeSuspensionHoja: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 20, width: "88%" },
  mensajeSuspensionTitulo: { fontSize: 15, fontWeight: "700", marginBottom: 10 },
  mensajeSuspensionInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
  },
});
