import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Pressable, Image, ScrollView, Animated, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import StarRating from "./StarRating";
import MoodPicker from "./MoodPicker";
import CastVotePicker from "./CastVotePicker";
import { supabase } from "../lib/supabase";
import { getMovieCredits, getSeriesCredits, posterUrl } from "../lib/tmdb";
import { calificarPelicula, calificarSerie, calificarEpisodio } from "../lib/ratings";
import { getMoodStats, elegirMood, MoodStats } from "../lib/moods";
import { getCastVoteStats, votarActor, CastVoteStats } from "../lib/castVotes";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  visible: boolean;
  onCerrar: () => void;
  tipo: "movie" | "series" | "episode";
  tmdbId: number; // para movie/series es el propio id; para episode, el id de la SERIE
  temporada?: number; // solo episode
  episodio?: number; // solo episode
  titulo: string; // movie/series: el nombre. episode: el nombre de la serie (se muestra gris arriba)
  nombreEpisodio?: string | null; // solo episode
  posterPath?: string | null; // solo se usa en movie/series
}

/**
 * Bottom sheet para valorar algo (estrellas + cómo te sentiste + quién te
 * gustó más) justo después de marcarlo como visto, sin tener que navegar al
 * detalle completo. Es la misma lógica y las mismas tablas que usa la ficha
 * del título/episodio — acá solo se muestra en una ventanita.
 */
export default function CalificarModal({ visible, onCerrar, tipo, tmdbId, temporada, episodio, titulo, nombreEpisodio, posterPath }: Props) {
  const { t } = useT();
  const [userId, setUserId] = useState<string | null>(null);
  const [miRating, setMiRating] = useState(0);
  const [reparto, setReparto] = useState<any[]>([]);
  const [moodStats, setMoodStats] = useState<MoodStats>({ miMood: null, porcentajes: {}, total: 0 });
  const [castStats, setCastStats] = useState<CastVoteStats>({ miVoto: null, porcentajes: {}, total: 0 });
  const animacion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      animacion.setValue(0);
      Animated.timing(animacion, { toValue: 1, duration: 420, useNativeDriver: true }).start();
    }
  }, [visible]);

  const targetType = tipo;
  const targetId = tipo === "episode" ? `${tmdbId}:${temporada}:${episodio}` : String(tmdbId);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      setMiRating(0);
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);

      const credits = tipo === "movie" ? await getMovieCredits(tmdbId) : await getSeriesCredits(tmdbId);
      setReparto((credits.cast ?? []).slice(0, 15));

      setMoodStats(await getMoodStats(targetType, targetId, uid));
      setCastStats(await getCastVoteStats(targetType, targetId, uid));

      if (uid) {
        if (tipo === "movie") {
          const { data: fila } = await supabase.from("user_movies").select("rating").eq("user_id", uid).eq("movie_tmdb_id", tmdbId).maybeSingle();
          setMiRating(fila?.rating ?? 0);
        } else if (tipo === "series") {
          const { data: fila } = await supabase.from("user_series").select("rating").eq("user_id", uid).eq("series_tmdb_id", tmdbId).maybeSingle();
          setMiRating(fila?.rating ?? 0);
        } else {
          const { data: fila } = await supabase
            .from("user_episodes_watched")
            .select("rating")
            .eq("user_id", uid)
            .eq("series_tmdb_id", tmdbId)
            .eq("season_number", temporada)
            .eq("episode_number", episodio)
            .maybeSingle();
          setMiRating(fila?.rating ?? 0);
        }
      }
    })();
  }, [visible]);

  async function calificar(valor: number) {
    if (!userId) return;
    setMiRating(valor);
    try {
      if (tipo === "movie") await calificarPelicula(userId, tmdbId, valor);
      else if (tipo === "series") await calificarSerie(userId, tmdbId, valor);
      else await calificarEpisodio(userId, tmdbId, temporada!, episodio!, valor);
    } catch (e: any) {
      console.error("Error al calificar:", e);
    }
  }

  async function elegirMoodPropio(mood: string) {
    if (!userId) return;
    try {
      await elegirMood(userId, targetType, targetId, mood);
      setMoodStats(await getMoodStats(targetType, targetId, userId));
    } catch (e: any) {
      console.error("Error al elegir mood:", e);
    }
  }

  async function votarActorPropio(actor: any) {
    if (!userId) return;
    try {
      await votarActor(userId, targetType, targetId, actor.id, actor.name);
      setCastStats(await getCastVoteStats(targetType, targetId, userId));
    } catch (e: any) {
      console.error("Error al votar actor:", e);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Animated.View
          style={[
            styles.hoja,
            {
              opacity: animacion,
              transform: [
                {
                  translateY: animacion.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }),
                },
              ],
            },
          ]}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <Pressable style={styles.cerrarBtn} onPress={onCerrar} hitSlop={10}>
              <Ionicons name="close" size={22} color={theme.colors.text} />
            </Pressable>

            <ScrollView contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
              {tipo === "episode" ? (
                <View style={styles.headerEpisodio}>
                  <Text style={styles.headerSerieNombre}>{titulo}</Text>
                  <Text style={styles.headerEpisodioNombre} numberOfLines={2}>
                    {t("T{temporada} - E{episodio}: {nombre}")
                      .replace("{temporada}", String(temporada))
                      .replace("{episodio}", String(episodio))
                      .replace("{nombre}", nombreEpisodio ?? "")}
                  </Text>
                </View>
              ) : (
                <View style={styles.headerMovie}>
                  {posterPath ? (
                    <Image source={{ uri: posterUrl(posterPath, "w185")! }} style={styles.poster} />
                  ) : (
                    <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
                  )}
                  <Text style={styles.headerTitulo} numberOfLines={2}>
                    {titulo}
                  </Text>
                </View>
              )}

              <View style={styles.seccion}>
                <Text style={styles.label}>{tipo === "episode" ? t("Valorá este capítulo") : tipo === "series" ? t("Valorá esta serie") : t("Valorá esta película")}</Text>
                <StarRating valor={miRating} onCambiar={calificar} size={30} />
              </View>

              <View style={styles.seccion}>
                <Text style={styles.label}>{t("¿Cómo te sentiste?")}</Text>
                <MoodPicker miMood={moodStats.miMood} porcentajes={moodStats.porcentajes} onElegir={elegirMoodPropio} />
              </View>

              {reparto.length > 0 && (
                <View style={styles.seccion}>
                  <Text style={styles.label}>{t("¿Quién te ha gustado más?")}</Text>
                  <CastVotePicker reparto={reparto} miVoto={castStats.miVoto} porcentajes={castStats.porcentajes} onVotar={votarActorPropio} />
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  hoja: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: 16,
    paddingTop: 10,
    maxHeight: "94%",
  },
  cerrarBtn: { alignSelf: "flex-end", marginBottom: 2 },
  headerMovie: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  poster: { width: 50, height: 75, borderRadius: 7, marginRight: 12 },
  headerTitulo: { flex: 1, fontSize: 17, fontWeight: "800", color: theme.colors.text },
  headerEpisodio: { marginBottom: 6 },
  headerSerieNombre: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 1 },
  headerEpisodioNombre: { fontSize: 17, fontWeight: "800", color: theme.colors.text },
  seccion: { marginTop: 8, alignItems: "center" },
  label: { fontSize: 13, fontWeight: "700", color: theme.colors.text, marginBottom: 6, textAlign: "center" },
});
