import React, { useEffect, useState } from "react";
import { View, Image, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import { Encuesta, OpcionEncuesta, votarOpcion, eliminarEncuesta } from "../lib/polls";
import { supabase } from "../lib/supabase";
import { posterUrl, getMovieDetails, getSeriesDetails, getSeasonEpisodes, getTmdbLanguage } from "../lib/tmdb";
import { Alert } from "../lib/alert";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";
import VotantesEncuestaModal from "./VotantesEncuestaModal";

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
      const { data: cache } = await supabase.from(tabla).select("*").eq("tmdb_id", tmdbId).maybeSingle();
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

export default function EncuestaCard({ encuesta, userId, navigation, onCambio }: Props) {
  const { t } = useT();
  const [votando, setVotando] = useState<string | null>(null);
  const [votantesVisible, setVotantesVisible] = useState(false);

  async function votar(opcion: OpcionEncuesta) {
    if (!userId || votando) return;
    setVotando(opcion.id);
    try {
      await votarOpcion(encuesta.id, opcion.id, userId, encuesta.allowMultiple, opcion.yoVote);
      onCambio();
    } catch (e: any) {
      console.error("Error al votar:", e);
      Alert.alert(t("No se pudo votar"), e.message ?? "Probá de nuevo.");
    } finally {
      setVotando(null);
    }
  }

  function confirmarEliminar() {
    Alert.alert(t("Eliminar encuesta"), t("¿Seguro que querés eliminar esta encuesta?"), [
      { text: t("Cancelar"), style: "cancel" },
      {
        text: t("Eliminar"),
        style: "destructive",
        onPress: async () => {
          try {
            await eliminarEncuesta(encuesta.id);
            onCambio();
          } catch (e: any) {
            Alert.alert(t("No se pudo eliminar"), e.message);
          }
        },
      },
    ]);
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
          <Text style={styles.autorTexto}>{encuesta.autorUsername ?? t("Usuario")}</Text>
        </Pressable>
        {userId === encuesta.userId && (
          <Pressable onPress={confirmarEliminar} hitSlop={8}>
            <Ionicons name="trash-outline" size={16} color={theme.colors.textMuted} />
          </Pressable>
        )}
      </View>

      {!!encuesta.questionText && <Text style={styles.pregunta}>{encuesta.questionText}</Text>}
      <TituloInline
        itemType={encuesta.questionItemType}
        tmdbId={encuesta.questionTmdbId}
        seasonNumber={encuesta.questionSeasonNumber}
        episodeNumber={encuesta.questionEpisodeNumber}
      />
      <Text style={styles.ayudaTexto}>{encuesta.allowMultiple ? t("Selecciona una opción o más") : t("Selecciona una opción")}</Text>

      {encuesta.opciones.map((o) => (
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

      <VotantesEncuestaModal
        visible={votantesVisible}
        onCerrar={() => setVotantesVisible(false)}
        navigation={navigation}
        opciones={encuesta.opciones.map((o) => ({ id: o.id, etiqueta: o.optionText || t("(título)"), votos: o.votos }))}
      />
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
});
