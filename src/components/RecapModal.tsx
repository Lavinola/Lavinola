import React, { useRef, useState } from "react";
import { Modal, View, Image, Pressable, TextInput, StyleSheet, Alert, ActivityIndicator, Dimensions, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ViewShot from "react-native-view-shot";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { Text, AppButton } from "./Themed";
import { DatosRecap } from "../lib/recap";
import { subirImagenRecap, publicarRecapEnLobby } from "../lib/recapShare";
import { posterUrl } from "../lib/tmdb";
import { theme } from "../theme";

interface Props {
  visible: boolean;
  onCerrar: () => void;
  datos: DatosRecap | null;
  cargando: boolean;
  userId: string | null;
}

const { width: ANCHO_PANTALLA } = Dimensions.get("window");
const ANCHO_TARJETA = Math.min(ANCHO_PANTALLA - 40, 340);
const ALTO_TARJETA = (ANCHO_TARJETA * 16) / 9;

export default function RecapModal({ visible, onCerrar, datos, cargando, userId }: Props) {
  const viewShotRef = useRef<ViewShot>(null);
  const [descargando, setDescargando] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const [publicarVisible, setPublicarVisible] = useState(false);
  const [mensajePost, setMensajePost] = useState("");
  const [publicando, setPublicando] = useState(false);

  async function capturar(): Promise<string | null> {
    try {
      const uri = await viewShotRef.current?.capture?.();
      return uri ?? null;
    } catch (e) {
      console.error("Error al capturar el Recap:", e);
      return null;
    }
  }

  async function descargar() {
    setDescargando(true);
    try {
      const uri = await capturar();
      if (!uri) throw new Error("No se pudo generar la imagen.");

      // En la web no existe "galería del celular" — en vez de eso, disparamos
      // la descarga normal del navegador.
      if (Platform.OS === "web") {
        const link = document.createElement("a");
        link.href = uri;
        link.download = "lavinola-recap.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const permiso = await MediaLibrary.requestPermissionsAsync();
      if (!permiso.granted) {
        Alert.alert("Sin permiso", "Necesitamos permiso para guardar la imagen en tu galería.");
        return;
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert("Listo", "Guardamos la imagen en tu galería.");
    } catch (e: any) {
      Alert.alert("No se pudo descargar", e.message);
    } finally {
      setDescargando(false);
    }
  }

  async function compartir() {
    setCompartiendo(true);
    try {
      const uri = await capturar();
      if (!uri) throw new Error("No se pudo generar la imagen.");

      if (Platform.OS === "web") {
        // Algunos navegadores (sobre todo en celular) sí tienen su propio
        // "compartir" nativo — si no está, bajamos el archivo directo.
        if ((navigator as any).share) {
          const blob = await (await fetch(uri)).blob();
          const file = new File([blob], "lavinola-recap.png", { type: blob.type });
          await (navigator as any).share({ files: [file] });
        } else {
          const link = document.createElement("a");
          link.href = uri;
          link.download = "lavinola-recap.png";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
        return;
      }

      const disponible = await Sharing.isAvailableAsync();
      if (!disponible) {
        Alert.alert("No disponible", "Tu dispositivo no permite compartir archivos.");
        return;
      }
      await Sharing.shareAsync(uri);
    } catch (e: any) {
      Alert.alert("No se pudo compartir", e.message);
    } finally {
      setCompartiendo(false);
    }
  }

  async function publicarEnLobby() {
    if (!userId) return;
    setPublicando(true);
    try {
      const uri = await capturar();
      if (!uri) throw new Error("No se pudo generar la imagen.");
      const imageUrl = await subirImagenRecap(userId, uri);
      await publicarRecapEnLobby(userId, imageUrl, mensajePost);
      setPublicarVisible(false);
      setMensajePost("");
      Alert.alert("¡Publicado!", "Tu Lavinola Recap ya está en el Lobby.");
    } catch (e: any) {
      Alert.alert("No se pudo publicar", e.message);
    } finally {
      setPublicando(false);
    }
  }

  const posterCollage = [...(datos?.topPeliculas ?? []), ...(datos?.topSeries ?? [])].map((t) => t.poster_path).filter(Boolean) as string[];

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onCerrar} transparent>
      <View style={styles.fondoModal}>
        <Pressable style={styles.cerrarBtn} onPress={onCerrar} hitSlop={12}>
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </Pressable>

        {cargando || !datos ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : (
          <>
            <ViewShot ref={viewShotRef} options={{ format: "png", quality: 1 }} style={{ width: ANCHO_TARJETA, height: ALTO_TARJETA }}>
              <View style={styles.tarjeta}>
                <View style={styles.collageFondo} pointerEvents="none">
                  {posterCollage.slice(0, 10).map((p, i) => (
                    <Image key={i} source={{ uri: posterUrl(p, "w185")! }} style={styles.collagePoster} />
                  ))}
                </View>
                <View style={styles.overlayOscuro} pointerEvents="none" />

                <View style={styles.contenido}>
                  <View style={styles.header}>
                    <Image source={require("../../assets/logo-icon-only.png")} style={styles.logo} resizeMode="contain" />
                    <Text style={styles.marca}>LAVINOLA</Text>
                  </View>

                  <Text style={styles.tituloRecap} numberOfLines={1} adjustsFontSizeToFit>
                    LAVINOLA RECAP {datos.year}
                  </Text>
                  <Text style={styles.subtitulo} numberOfLines={2}>
                    Fin de Temporada, aquí está tu Lavinola Recap {datos.year}
                  </Text>

                  <View style={styles.horasRow}>
                    <View style={styles.horasMitad}>
                      <Ionicons name="film" size={18} color={theme.colors.primaryLight} />
                      <Text style={styles.horasNumero}>{datos.horasPeliculas}h</Text>
                      <Text style={styles.horasLabel}>viendo películas</Text>
                    </View>
                    <View style={styles.horasDivisor} />
                    <View style={styles.horasMitad}>
                      <Ionicons name="tv" size={18} color={theme.colors.primaryLight} />
                      <Text style={styles.horasNumero}>{datos.horasSeries}h</Text>
                      <Text style={styles.horasLabel}>viendo series</Text>
                    </View>
                  </View>

                  {datos.topPeliculas.length > 0 && (
                    <View style={styles.seccion}>
                      <Text style={styles.seccionTitulo}>Tus películas favoritas</Text>
                      <View style={styles.tiraRow}>
                        {datos.topPeliculas.map((p, i) => (
                          <MiniPoster key={p.tmdb_id} numero={i + 1} posterPath={p.poster_path} />
                        ))}
                      </View>
                    </View>
                  )}

                  {datos.topSeries.length > 0 && (
                    <View style={styles.seccion}>
                      <Text style={styles.seccionTitulo}>Tus series favoritas</Text>
                      <View style={styles.tiraRow}>
                        {datos.topSeries.map((s, i) => (
                          <MiniPoster key={s.tmdb_id} numero={i + 1} posterPath={s.poster_path} />
                        ))}
                      </View>
                    </View>
                  )}

                  {datos.topGeneros.length > 0 && (
                    <View style={styles.seccion}>
                      <Text style={styles.seccionTitulo}>Tus géneros favoritos</Text>
                      <Text style={styles.generosTexto} numberOfLines={1}>
                        {datos.topGeneros.map((g, i) => `${i + 1}. ${g}`).join("   ")}
                      </Text>
                    </View>
                  )}

                  {datos.topEpisodios.length > 0 && (
                    <View style={styles.seccion}>
                      <Text style={styles.seccionTitulo}>Tus capítulos favoritos</Text>
                      <View style={styles.tiraRow}>
                        {datos.topEpisodios.map((e, i) => (
                          <MiniPoster key={`${e.series_tmdb_id}-${e.season_number}-${e.episode_number}`} numero={i + 1} posterPath={e.poster_path} />
                        ))}
                      </View>
                    </View>
                  )}

                  <Text style={styles.pie}>Gracias por acompañarnos este año 💜</Text>
                </View>
              </View>
            </ViewShot>

            <View style={styles.accionesRow}>
              <Pressable style={styles.accionBtn} onPress={descargar} disabled={descargando} hitSlop={8}>
                {descargando ? <ActivityIndicator size="small" color="#000000" /> : <Ionicons name="download-outline" size={22} color="#000000" />}
              </Pressable>
              <Pressable style={styles.accionBtn} onPress={() => setPublicarVisible(true)} hitSlop={8}>
                <Ionicons name="paper-plane" size={20} color="#000000" />
              </Pressable>
              <Pressable style={styles.accionBtn} onPress={compartir} disabled={compartiendo} hitSlop={8}>
                {compartiendo ? <ActivityIndicator size="small" color="#000000" /> : <Ionicons name="share-social-outline" size={22} color="#000000" />}
              </Pressable>
            </View>
          </>
        )}
      </View>

      <Modal visible={publicarVisible} transparent animationType="fade" onRequestClose={() => setPublicarVisible(false)}>
        <View style={styles.publicarFondo}>
          <View style={styles.publicarBox}>
            <Text style={styles.publicarTitulo}>Publicar en el Lobby</Text>
            <View style={styles.publicarPreview}>
              {posterCollage[0] && <Image source={{ uri: posterUrl(posterCollage[0], "w185")! }} style={{ width: 40, height: 60, borderRadius: 4, opacity: 0.5 }} />}
              <Text style={styles.publicarPreviewTexto}>Se va a ver la imagen de tu Recap, en buen tamaño, arriba del post</Text>
            </View>
            <TextInput
              style={styles.publicarInput}
              placeholder="Escribí algo (opcional)..."
              placeholderTextColor={theme.colors.textFaint}
              value={mensajePost}
              onChangeText={setMensajePost}
              multiline
              maxLength={280}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <View style={{ flex: 1 }}>
                <AppButton title="Cancelar" variant="outline" onPress={() => setPublicarVisible(false)} disabled={publicando} />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton title={publicando ? "Publicando..." : "Publicar"} onPress={publicarEnLobby} disabled={publicando} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

function MiniPoster({ numero, posterPath }: { numero: number; posterPath: string | null }) {
  return (
    <View style={styles.miniPosterBox}>
      {posterPath ? (
        <Image source={{ uri: posterUrl(posterPath, "w185")! }} style={styles.miniPoster} />
      ) : (
        <View style={[styles.miniPoster, { backgroundColor: "rgba(255,255,255,0.1)" }]} />
      )}
      <View style={styles.miniPosterBadge}>
        <Text style={styles.miniPosterBadgeTexto}>{numero}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fondoModal: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center" },
  cerrarBtn: {
    position: "absolute",
    top: 50,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  tarjeta: { flex: 1, backgroundColor: "#000000", borderRadius: 18, overflow: "hidden" },
  collageFondo: { ...StyleSheet.absoluteFillObject, flexDirection: "row", flexWrap: "wrap", opacity: 0.18 },
  collagePoster: { width: "20%", aspectRatio: 2 / 3 },
  overlayOscuro: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,5,8,0.85)" },
  contenido: { flex: 1, padding: 14, justifyContent: "space-between" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  logo: { width: 20, height: 20 },
  marca: { color: theme.colors.primaryLight, fontSize: 10, fontWeight: "800", letterSpacing: 3 },
  tituloRecap: { color: "#FFFFFF", fontSize: 19, fontWeight: "900", textAlign: "center", marginTop: 6 },
  subtitulo: { color: "rgba(255,255,255,0.75)", fontSize: 9.5, textAlign: "center", marginTop: 4, lineHeight: 12 },
  horasRow: {
    flexDirection: "row",
    backgroundColor: "rgba(166,63,224,0.14)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(166,63,224,0.4)",
    paddingVertical: 8,
    marginTop: 8,
  },
  horasMitad: { flex: 1, alignItems: "center", gap: 1 },
  horasDivisor: { width: 1, backgroundColor: "rgba(255,255,255,0.15)" },
  horasNumero: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  horasLabel: { color: "rgba(255,255,255,0.65)", fontSize: 8 },
  seccion: { marginTop: 8 },
  seccionTitulo: { color: theme.colors.primaryLight, fontSize: 9, fontWeight: "800", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 },
  tiraRow: { flexDirection: "row", gap: 5 },
  miniPosterBox: { flex: 1 },
  miniPoster: { width: "100%", aspectRatio: 2 / 3, borderRadius: 5 },
  miniPosterBadge: {
    position: "absolute",
    top: -3,
    left: -3,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  miniPosterBadgeTexto: { color: "#000000", fontSize: 9, fontWeight: "900" },
  generosTexto: { color: "#FFFFFF", fontSize: 9.5, fontWeight: "700" },
  pie: { color: "rgba(255,255,255,0.45)", fontSize: 8.5, textAlign: "center", marginTop: 8 },
  accionesRow: { flexDirection: "row", gap: 16, marginTop: 18 },
  accionBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  publicarFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 24 },
  publicarBox: { width: "100%", backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 20 },
  publicarTitulo: { fontSize: 16, fontWeight: "800", marginBottom: 14 },
  publicarPreview: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  publicarPreviewTexto: { flex: 1, fontSize: 12, color: theme.colors.textMuted },
  publicarInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    padding: 10,
    minHeight: 60,
    textAlignVertical: "top",
  },
});
