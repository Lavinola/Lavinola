import React, { useEffect, useState } from "react";
import { View, Image, TextInput, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import {
  Encuesta,
  OpcionEncuesta,
  votarOpcion,
  eliminarEncuesta,
  reaccionarEncuesta,
  quitarReaccionEncuesta,
  listarReaccionesDeEncuesta,
} from "../lib/polls";
import { Comentario, cargarComentariosRaiz, postearComentario, ReaccionConAutor } from "../lib/comments";
import { NodoComentario } from "./CommentThread";
import { supabase } from "../lib/supabase";
import { posterUrl, getMovieDetails, getSeriesDetails, getSeasonEpisodes, getTmdbLanguage } from "../lib/tmdb";
import { formatearTiempoRelativo } from "../lib/dates";
import { traducirTexto, idiomaCorto } from "../lib/translate";
import { Alert } from "../lib/alert";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";
import VotantesEncuestaModal from "./VotantesEncuestaModal";
import ActionSheetModal from "./ActionSheetModal";
import ConfirmModal from "./ConfirmModal";
import ReportModal from "./ReportModal";
import IconoReaccion, { REACCIONES_ICONO } from "./IconoReaccion";
import { MOODS } from "../lib/moods";
import ReaccionesListModal from "./ReaccionesListModal";
import NombreUsuario from "./NombreUsuario";

interface DatosTitulo {
  nombre: string;
  posterPath: string | null;
  episodeName?: string | null;
}

function useTitulo(itemType: "series" | "movie" | "episode" | null, tmdbId: number | null, seasonNumber?: number | null, episodeNumber?: number | null): DatosTitulo | null {
  const [datos, setDatos] = useState<DatosTitulo | null>(null);
  useEffect(() => {
    if (!itemType || !tmdbId) {
      setDatos(null);
      return;
    }
    let cancelado = false;
    (async () => {
      // El título puede no estar todavía en el caché de la app (se eligió
      // buscando en TMDB directo al armar la encuesta) — primero probamos
      // el caché rápido, y si no está, se lo pedimos a TMDB directamente.
      const tabla = itemType === "movie" ? "movies_cache" : "series_cache";
      const camposCache = itemType === "movie" ? "tmdb_id, title, poster_path" : "tmdb_id, name, poster_path";
      const { data: cache } = (await supabase.from(tabla).select(camposCache).eq("tmdb_id", tmdbId).maybeSingle()) as any;
      let nombre: string | null = cache ? (itemType === "movie" ? cache.title : cache.name) : null;
      let posterPath: string | null = cache?.poster_path ?? null;

      if (!nombre) {
        try {
          const detalle = itemType === "movie" ? await getMovieDetails(tmdbId, getTmdbLanguage()) : await getSeriesDetails(tmdbId, getTmdbLanguage());
          nombre = itemType === "movie" ? detalle?.title : detalle?.name;
          posterPath = detalle?.poster_path ?? null;
        } catch (e) {
          console.error("Error al pedirle el título a TMDB para la encuesta:", e);
        }
      }

      let episodeName: string | null = null;
      if (itemType === "episode" && seasonNumber && episodeNumber) {
        try {
          const { data: epCache } = await supabase
            .from("episodes_cache")
            .select("name")
            .eq("series_tmdb_id", tmdbId)
            .eq("season_number", seasonNumber)
            .eq("episode_number", episodeNumber)
            .maybeSingle();
          if (epCache?.name) {
            episodeName = epCache.name;
          } else {
            const temporada = await getSeasonEpisodes(tmdbId, seasonNumber);
            episodeName = (temporada?.episodes ?? []).find((e: any) => e.episode_number === episodeNumber)?.name ?? null;
          }
        } catch (e) {
          console.error("Error al pedirle el nombre del capítulo a TMDB para la encuesta:", e);
        }
      }

      if (!cancelado && nombre) setDatos({ nombre, posterPath, episodeName });
    })();
    return () => {
      cancelado = true;
    };
  }, [itemType, tmdbId, seasonNumber, episodeNumber]);
  return datos;
}

function TituloInline({ itemType, tmdbId, seasonNumber, episodeNumber }: { itemType: "series" | "movie" | "episode" | null; tmdbId: number | null; seasonNumber?: number | null; episodeNumber?: number | null }) {
  const datos = useTitulo(itemType, tmdbId, seasonNumber, episodeNumber);
  if (!datos) return null;
  return (
    <View style={styles.tituloInlineRow}>
      {datos.posterPath ? (
        <Image source={{ uri: posterUrl(datos.posterPath, "w185")! }} style={styles.tituloInlinePoster} />
      ) : (
        <View style={[styles.tituloInlinePoster, { backgroundColor: theme.colors.surfaceAlt }]} />
      )}
      <Text style={styles.tituloInlineTexto} numberOfLines={2}>
        {datos.nombre}
        {itemType === "episode" && seasonNumber && episodeNumber ? ` — T${seasonNumber} - E${episodeNumber}${datos.episodeName ? `: ${datos.episodeName}` : ""}` : ""}
      </Text>
    </View>
  );
}

interface Props {
  encuesta: Encuesta;
  userId: string | null;
  navigation?: any;
  onCambio: () => void;
}

/** Resuelve, para TODAS las opciones que tengan un título adjunto, un nombre para mostrar (con el capítulo si corresponde) — usado para "Ver votos", donde no tiene sentido decir "(título)" genérico. */
function useNombresDeOpciones(opciones: OpcionEncuesta[]): Record<string, string> {
  const [nombres, setNombres] = useState<Record<string, string>>({});
  useEffect(() => {
    const conTitulo = opciones.filter((o) => o.tmdbId);
    if (conTitulo.length === 0) return;
    let cancelado = false;
    Promise.all(
      conTitulo.map(async (o) => {
        const tabla = o.itemType === "movie" ? "movies_cache" : "series_cache";
        const camposCache = o.itemType === "movie" ? "tmdb_id, title" : "tmdb_id, name";
        const { data: cache } = (await supabase.from(tabla).select(camposCache).eq("tmdb_id", o.tmdbId!).maybeSingle()) as any;
        let nombre: string | null = cache ? (o.itemType === "movie" ? cache.title : cache.name) : null;
        if (!nombre) {
          try {
            const detalle = o.itemType === "movie" ? await getMovieDetails(o.tmdbId!, getTmdbLanguage()) : await getSeriesDetails(o.tmdbId!, getTmdbLanguage());
            nombre = o.itemType === "movie" ? detalle?.title : detalle?.name;
          } catch (e) {
            console.error("Error al resolver el nombre de una opción de encuesta:", e);
          }
        }
        if (!nombre) return null;
        const etiqueta = o.itemType === "episode" && o.seasonNumber && o.episodeNumber ? `${nombre} — T${o.seasonNumber} - E${o.episodeNumber}` : nombre;
        return [o.id, etiqueta] as const;
      })
    ).then((pares) => {
      if (cancelado) return;
      const mapa: Record<string, string> = {};
      pares.forEach((p) => {
        if (p) mapa[p[0]] = p[1];
      });
      setNombres(mapa);
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opciones.map((o) => o.id).join(",")]);
  return nombres;
}

export default function EncuestaCard({ encuesta, userId, navigation, onCambio }: Props) {
  const { t } = useT();
  const [votando, setVotando] = useState<string | null>(null);
  const [votantesVisible, setVotantesVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [confirmEliminarVisible, setConfirmEliminarVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  // Copia local de las opciones — así, al votar, se actualiza al toque
  // SOLO esta tarjetita (círculo + contador), sin tener que pedirle de
  // nuevo a la pantalla entera (Lobby o grupo) que recargue todo, lo que
  // hacía que se reiniciara el scroll. Si en algún momento la pantalla de
  // afuera SÍ trae datos frescos de la base (ej: tirás para refrescar),
  // acá se toman esos datos nuevos con normalidad.
  const [opciones, setOpciones] = useState(encuesta.opciones);
  useEffect(() => {
    setOpciones(encuesta.opciones);
  }, [encuesta.opciones]);

  const nombresDeOpciones = useNombresDeOpciones(opciones);

  // Mismo criterio que con las opciones: copia local de mi reacción, el
  // conteo de reacciones, y la cantidad de comentarios — así reaccionar o
  // comentar tampoco obliga a recargar toda la pantalla de afuera.
  const [miReaccion, setMiReaccion] = useState(encuesta.miReaccion);
  const [reaccionesConteo, setReaccionesConteo] = useState(encuesta.reacciones);
  const [cantidadComentarios, setCantidadComentarios] = useState(encuesta.cantidadComentarios);
  useEffect(() => setMiReaccion(encuesta.miReaccion), [encuesta.miReaccion]);
  useEffect(() => setReaccionesConteo(encuesta.reacciones), [encuesta.reacciones]);
  useEffect(() => setCantidadComentarios(encuesta.cantidadComentarios), [encuesta.cantidadComentarios]);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [reaccionesModalVisible, setReaccionesModalVisible] = useState(false);
  const [reacciones, setReacciones] = useState<ReaccionConAutor[]>([]);
  const [traduccion, setTraduccion] = useState<string | null>(null);
  const [traduciendo, setTraduciendo] = useState(false);

  const [mostrarLista, setMostrarLista] = useState(false);
  const [mostrarInput, setMostrarInput] = useState(false);
  const [respuestas, setRespuestas] = useState<Comentario[] | null>(null);
  const [cargandoRespuestas, setCargandoRespuestas] = useState(false);
  const [nuevaRespuesta, setNuevaRespuesta] = useState("");
  const [idiomaUsuario, setIdiomaUsuario] = useState("en");

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("profiles")
      .select("content_language")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }: any) => setIdiomaUsuario(idiomaCorto(data?.content_language)));
  }, [userId]);

  async function votar(opcion: OpcionEncuesta) {
    if (!userId || votando) return;
    const opcionesAnteriores = opciones;
    // Actualizamos la pantalla al toque, calculando nosotros mismos el
    // mismo resultado que va a quedar guardado en la base — no hace falta
    // esperar la respuesta del servidor para verlo reflejado.
    setOpciones((prev) =>
      prev.map((o) => {
        if (o.id === opcion.id) return { ...o, yoVote: !opcion.yoVote, votos: opcion.yoVote ? o.votos - 1 : o.votos + 1 };
        if (!encuesta.allowMultiple && !opcion.yoVote && o.yoVote) return { ...o, yoVote: false, votos: o.votos - 1 };
        return o;
      })
    );
    setVotando(opcion.id);
    try {
      await votarOpcion(encuesta.id, opcion.id, userId, encuesta.allowMultiple, opcion.yoVote);
    } catch (e: any) {
      console.error("Error al votar:", e);
      setOpciones(opcionesAnteriores); // no se pudo guardar — volvemos a como estaba
      Alert.alert(t("No se pudo votar"), e.message ?? t("Probá de nuevo."));
    } finally {
      setVotando(null);
    }
  }

  async function confirmarEliminar() {
    try {
      await eliminarEncuesta(encuesta.id);
      onCambio();
    } catch (e: any) {
      Alert.alert(t("No se pudo eliminar"), e.message);
    }
  }

  const esMiEncuesta = !!userId && userId === encuesta.userId;
  const totalReacciones = Object.values(reaccionesConteo ?? {}).reduce((a, b) => a + b, 0);

  function elegirReaccion(emoji: string) {
    if (!userId) return;
    setPickerVisible(false);
    const anteriorEmoji = miReaccion;
    const anteriorConteo = reaccionesConteo;
    const nuevoConteo = { ...reaccionesConteo };
    if (anteriorEmoji) nuevoConteo[anteriorEmoji] = Math.max(0, (nuevoConteo[anteriorEmoji] ?? 1) - 1);
    if (anteriorEmoji === emoji) {
      setMiReaccion(null);
    } else {
      nuevoConteo[emoji] = (nuevoConteo[emoji] ?? 0) + 1;
      setMiReaccion(emoji);
    }
    setReaccionesConteo(nuevoConteo);
    (async () => {
      try {
        if (anteriorEmoji === emoji) await quitarReaccionEncuesta(userId, encuesta.id);
        else await reaccionarEncuesta(userId, encuesta.id, emoji);
      } catch (e: any) {
        setMiReaccion(anteriorEmoji); // no se pudo guardar — volvemos a como estaba
        setReaccionesConteo(anteriorConteo);
        Alert.alert(t("No se pudo reaccionar"), e.message);
      }
    })();
  }

  async function tocarBotonReaccion() {
    if (esMiEncuesta) {
      if (totalReacciones === 0) return;
      try {
        setReacciones(await listarReaccionesDeEncuesta(encuesta.id));
        setReaccionesModalVisible(true);
      } catch (e: any) {
        Alert.alert(t("No se pudo cargar"), e.message);
      }
    } else {
      setPickerVisible((v) => !v);
    }
  }

  async function traducir() {
    if (traduccion) {
      setTraduccion(null);
      return;
    }
    if (!encuesta.questionText) return;
    setTraduciendo(true);
    try {
      setTraduccion(await traducirTexto(encuesta.questionText, idiomaUsuario));
    } catch (e: any) {
      Alert.alert(t("No se pudo traducir"), e.message);
    } finally {
      setTraduciendo(false);
    }
  }

  async function cargarRespuestas() {
    setCargandoRespuestas(true);
    try {
      setRespuestas(await cargarComentariosRaiz("poll", encuesta.id, "viejo", userId));
    } catch (e) {
      console.error("Error al cargar respuestas de la encuesta:", e);
    } finally {
      setCargandoRespuestas(false);
    }
  }

  function toggleLista() {
    const nuevoValor = !mostrarLista;
    setMostrarLista(nuevoValor);
    if (nuevoValor && respuestas === null) cargarRespuestas();
  }

  async function enviarRespuesta() {
    if (!nuevaRespuesta.trim() || !userId) return;
    try {
      await postearComentario({ userId, targetType: "poll", targetId: encuesta.id, content: nuevaRespuesta.trim() });
      setNuevaRespuesta("");
      setMostrarLista(true);
      setCantidadComentarios((c) => c + 1);
      await cargarRespuestas();
    } catch (e: any) {
      console.error("Error al postear respuesta:", e);
      Alert.alert(t("No se pudo publicar"), e.message ?? t("Revisá tu conexión y probá de nuevo."));
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Pressable style={styles.autorRow} onPress={() => navigation?.navigate("PerfilAjeno", { userId: encuesta.userId })}>
          {encuesta.autorAvatarUrl ? (
            <Image source={{ uri: encuesta.autorAvatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarVacio]} />
          )}
          <View style={{ flexDirection: "row", alignItems: "baseline", flexShrink: 1 }}>
            <NombreUsuario style={styles.autorTexto} displayName={encuesta.autorDisplayName} username={encuesta.autorUsername} numberOfLines={1} />
            <Text style={styles.fechaTexto}>{formatearTiempoRelativo(encuesta.createdAt)}</Text>
          </View>
        </Pressable>
        <Pressable onPress={() => setMenuVisible(true)} hitSlop={10}>
          <Text style={styles.menuPuntitos}>⋯</Text>
        </Pressable>
      </View>

      {!!encuesta.questionText && <Text style={styles.pregunta}>{traduccion ?? encuesta.questionText}</Text>}
      <TituloInline
        itemType={encuesta.questionItemType}
        tmdbId={encuesta.questionTmdbId}
        seasonNumber={encuesta.questionSeasonNumber}
        episodeNumber={encuesta.questionEpisodeNumber}
      />
      <Text style={styles.ayudaTexto}>{encuesta.allowMultiple ? t("Selecciona una opción o más") : t("Selecciona una opción")}</Text>

      {opciones.map((o) => (
        <Pressable key={o.id} style={styles.opcionRow} onPress={() => votar(o)} disabled={!!votando}>
          {votando === o.id ? (
            <ActivityIndicator size="small" color={theme.colors.primary} style={styles.circulo} />
          ) : (
            <View style={[styles.circulo, o.yoVote && styles.circuloActivo]}>{o.yoVote && <Ionicons name="checkmark" size={13} color="#000000" />}</View>
          )}
          <View style={{ flex: 1 }}>
            {!!o.optionText && (
              <Text style={styles.opcionTexto} numberOfLines={2}>
                {o.optionText}
              </Text>
            )}
            <TituloInline itemType={o.itemType} tmdbId={o.tmdbId} seasonNumber={o.seasonNumber} episodeNumber={o.episodeNumber} />
          </View>
          <Text style={styles.opcionVotos}>{o.votos}</Text>
        </Pressable>
      ))}

      <Pressable style={styles.verVotosBtn} onPress={() => setVotantesVisible(true)}>
        <Text style={styles.verVotosTexto}>{t("Ver votos")}</Text>
      </Pressable>

      {pickerVisible && (
        <View style={styles.reaccionPickerRow}>
          {REACCIONES_ICONO.map((r) => (
            <Pressable key={r.key} onPress={() => elegirReaccion(r.key)} style={styles.reaccionPickerBtn}>
              <Ionicons name={r.icono} size={22} color={theme.colors.primaryLight} />
            </Pressable>
          ))}
          {MOODS.map((m) => (
            <Pressable key={m.key} onPress={() => elegirReaccion(m.key)} style={styles.reaccionPickerBtn}>
              <Image source={m.imagen} style={{ width: 20, height: 20 }} resizeMode="contain" />
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.accionesRow}>
        <Pressable onPress={tocarBotonReaccion} style={styles.accionBtn}>
          <IconoReaccion reaccionKey={miReaccion ?? ""} size={16} />
          <Text style={styles.accionTexto}>{totalReacciones > 0 ? totalReacciones : ""}</Text>
        </Pressable>
        <Pressable onPress={toggleLista} style={styles.accionBtn}>
          <Ionicons name="chatbubble-outline" size={15} color={theme.colors.textMuted} />
          <Text style={styles.accionTexto}>{cantidadComentarios}</Text>
        </Pressable>
        <Pressable onPress={() => setMostrarInput((v) => !v)} style={styles.accionBtn}>
          <Text style={styles.accionTexto}>{t("Comentar")}</Text>
        </Pressable>
        {!!encuesta.questionText && (
          <Pressable onPress={traducir} disabled={traduciendo} style={styles.traducirBtn}>
            <Text style={styles.traducirTexto}>{traduciendo ? t("Traduciendo...") : traduccion ? t("Ver original") : t("Traducir")}</Text>
          </Pressable>
        )}
      </View>

      {mostrarInput && (
        <View style={styles.inputRow}>
          <TextInput
            placeholderTextColor={theme.colors.textFaint}
            style={styles.input}
            placeholder={t("Comentar...")}
            value={nuevaRespuesta}
            onChangeText={setNuevaRespuesta}
            multiline
            maxLength={2000}
          />
          <Pressable style={styles.enviarBtn} onPress={enviarRespuesta}>
            <Text style={styles.enviarBtnTexto}>{t("Enviar")}</Text>
          </Pressable>
        </View>
      )}

      {mostrarLista && (
        <View style={styles.respuestasBox}>
          {cargandoRespuestas ? (
            <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 10 }} />
          ) : !respuestas || respuestas.length === 0 ? (
            <Text style={styles.sinRespuestas}>{t("Todavía no hay comentarios.")}</Text>
          ) : (
            respuestas.map((r) => (
              <NodoComentario
                key={r.id}
                comentario={r}
                nivel={0}
                userId={userId}
                idiomaUsuario={idiomaUsuario}
                onReply={cargarRespuestas}
                targetType="poll"
                targetId={encuesta.id}
                navigation={navigation}
              />
            ))
          )}
        </View>
      )}

      <ReaccionesListModal
        visible={reaccionesModalVisible}
        onCerrar={() => setReaccionesModalVisible(false)}
        reacciones={reacciones}
        onVerPerfil={(uid) => {
          setReaccionesModalVisible(false);
          navigation?.navigate("PerfilAjeno", { userId: uid });
        }}
      />

      <VotantesEncuestaModal
        visible={votantesVisible}
        onCerrar={() => setVotantesVisible(false)}
        navigation={navigation}
        opciones={opciones.map((o) => ({ id: o.id, etiqueta: o.optionText || nombresDeOpciones[o.id] || t("(título)"), votos: o.votos }))}
      />

      <ActionSheetModal
        visible={menuVisible}
        onCerrar={() => setMenuVisible(false)}
        opciones={[
          ...(userId === encuesta.userId
            ? [{ label: t("Eliminar"), icono: "trash-outline" as const, destructivo: true, onPress: () => { setMenuVisible(false); setConfirmEliminarVisible(true); } }]
            : []),
          { label: t("Denunciar"), icono: "flag-outline", destructivo: true, onPress: () => { setMenuVisible(false); setReportModalVisible(true); } },
        ]}
      />
      <ConfirmModal
        visible={confirmEliminarVisible}
        onCerrar={() => setConfirmEliminarVisible(false)}
        titulo={t("Eliminar encuesta")}
        mensaje={t("¿Seguro que querés eliminarlo? No se puede deshacer.")}
        botones={[
          { label: t("Cancelar"), onPress: () => {} },
          { label: t("Eliminar"), destacado: true, onPress: confirmarEliminar },
        ]}
      />
      <ReportModal visible={reportModalVisible} onCerrar={() => setReportModalVisible(false)} reporterId={userId} targetType="poll" targetId={encuesta.id} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 12, marginBottom: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  autorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: { width: 26, height: 26, borderRadius: 13 },
  avatarVacio: { backgroundColor: theme.colors.surfaceAlt },
  autorTexto: { fontSize: 13, fontWeight: "700" },
  fechaTexto: { fontSize: 11, color: theme.colors.textMuted, marginLeft: 6 },
  menuPuntitos: { fontSize: 18, color: theme.colors.textMuted, paddingHorizontal: 6 },
  pregunta: { fontSize: 15, fontWeight: "700", marginBottom: 6 },
  ayudaTexto: { fontSize: 11, color: theme.colors.textMuted, marginBottom: 10, marginTop: 2 },
  tituloInlineRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  tituloInlinePoster: { width: 28, height: 40, borderRadius: 4 },
  tituloInlineTexto: { flex: 1, fontSize: 12, color: theme.colors.textMuted },
  opcionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  circulo: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" },
  circuloActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  opcionTexto: { fontSize: 13 },
  opcionVotos: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted, minWidth: 20, textAlign: "right" },
  verVotosBtn: { alignItems: "center", marginTop: 6 },
  verVotosTexto: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },
  reaccionPickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: 8, marginTop: 10 },
  reaccionPickerBtn: { padding: 2 },
  accionesRow: { flexDirection: "row", gap: 20, marginTop: 10 },
  accionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  accionTexto: { fontSize: 12, color: theme.colors.textMuted, fontWeight: "700" },
  traducirBtn: { marginLeft: "auto" },
  traducirTexto: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "stretch", marginTop: 10, gap: 6 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 112,
    fontSize: 14,
    lineHeight: 19,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceAlt,
  },
  enviarBtn: { justifyContent: "center", alignItems: "center", height: 40, backgroundColor: theme.colors.primary, borderRadius: 6, paddingHorizontal: 14 },
  enviarBtnTexto: { color: "#000000", fontSize: 12, fontWeight: "700" },
  respuestasBox: { marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, paddingTop: 10 },
  sinRespuestas: { fontSize: 12, color: theme.colors.textMuted, textAlign: "center", paddingVertical: 8 },
});
