import React, { useEffect, useState } from "react";
import { View, FlatList, Image, Pressable, Modal, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { NIVELES_INSIGNIAS, NivelInsignia, obtenerPuntosInsignias } from "../lib/badges";
import { IMAGENES_INSIGNIAS_GRANDES } from "../lib/badgeImages";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function BadgesScreen() {
  const { t, idioma } = useT();
  const [puntos, setPuntos] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<NivelInsignia | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) {
      setCargando(false);
      return;
    }
    try {
      setPuntos(await obtenerPuntosInsignias(uid));
    } catch (e: any) {
      console.error("Error al cargar los puntos de insignias:", e);
      setError(e.message ?? "No se pudo cargar.");
    } finally {
      setCargando(false);
    }
  }

  if (error) {
    return (
      <View style={styles.centro}>
        <Text style={styles.errorTexto}>{t("No se pudieron cargar tus insignias.")}</Text>
        <Pressable onPress={cargar} style={{ marginTop: 12 }}>
          <Text style={styles.cerrarBtnTexto}>{t("Reintentar")}</Text>
        </Pressable>
      </View>
    );
  }

  if (cargando || puntos === null) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator />
      </View>
    );
  }

  const nivelActualIndex = [...NIVELES_INSIGNIAS].reverse().findIndex((n) => puntos >= n.puntos);
  const nivelActualNumero = nivelActualIndex === -1 ? 0 : NIVELES_INSIGNIAS.length - nivelActualIndex;

  return (
    <View style={styles.container}>
      <View style={styles.encabezado}>
        <Text style={styles.encabezadoTitulo}>
          {nivelActualNumero > 0
            ? t("Nivel {n}: {nombre}").replace("{n}", String(nivelActualNumero)).replace("{nombre}", NIVELES_INSIGNIAS[nivelActualNumero - 1].nombre)
            : t("Todavía sin nivel")}
        </Text>
        <Text style={styles.encabezadoPuntos}>{t("{puntos} puntos de actividad").replace("{puntos}", puntos.toLocaleString("es-AR"))}</Text>
      </View>

      <FlatList
        data={NIVELES_INSIGNIAS}
        keyExtractor={(n) => String(n.nivel)}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const desbloqueada = puntos >= item.puntos;
          return (
            <Pressable onPress={() => setSeleccionado(item)} style={styles.celda}>
              <Image
                source={IMAGENES_INSIGNIAS_GRANDES[idioma][item.nivel]}
                style={[styles.tarjetaImagen, !desbloqueada && styles.tarjetaBloqueada]}
                resizeMode="contain"
              />
            </Pressable>
          );
        }}
      />

      <Modal visible={!!seleccionado} transparent animationType="fade" onRequestClose={() => setSeleccionado(null)}>
        <Pressable style={styles.fondo} onPress={() => setSeleccionado(null)}>
          <Pressable style={styles.caja} onPress={(e) => e.stopPropagation()}>
            {seleccionado && (
              <>
                <Image source={IMAGENES_INSIGNIAS_GRANDES[idioma][seleccionado.nivel]} style={styles.cajaImagen} resizeMode="contain" />
                {puntos >= seleccionado.puntos ? (
                  <Text style={styles.cajaLogrado}>{t("¡Ya la tenés! 🎉")}</Text>
                ) : (
                  <>
                    <Text style={styles.cajaTexto}>
                      {t("Necesitás {puntos} puntos de actividad.").replace("{puntos}", seleccionado.puntos.toLocaleString("es-AR"))}
                    </Text>
                    <Text style={styles.cajaTexto}>
                      {t("Vas con {puntos} — te faltan {resto}.")
                        .replace("{puntos}", puntos.toLocaleString("es-AR"))
                        .replace("{resto}", (seleccionado.puntos - puntos).toLocaleString("es-AR"))}
                    </Text>
                  </>
                )}
                <Pressable style={styles.cerrarBtn} onPress={() => setSeleccionado(null)}>
                  <Text style={styles.cerrarBtnTexto}>{t("Cerrar")}</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background },
  errorTexto: { fontSize: 14, color: theme.colors.textMuted, textAlign: "center", paddingHorizontal: 24 },
  encabezado: { padding: 16, alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  encabezadoTitulo: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  encabezadoPuntos: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  celda: { marginBottom: 14 },
  // La tarjeta ya viene con el nivel, el nombre y el ícono dibujados adentro
  // de la imagen (512x307 aprox, 1.67:1) — solo hay que respetar esa
  // proporción para que no se vea estirada.
  tarjetaImagen: { width: "100%", aspectRatio: 512 / 307 },
  // El "bloqueado" (gris + desenfocado) se logra distinto según la plataforma:
  // en la web (donde se prueba/usa esta app principalmente) el filter de CSS
  // sí funciona a través de react-native-web; en nativo no hay blur real sin
  // agregar una librería nueva, así que ahí queda solo la opacidad baja como
  // aproximación (se nota igual que está bloqueada, aunque no desenfocada).
  tarjetaBloqueada: Platform.select({
    web: { opacity: 0.45, filter: "grayscale(1) blur(2px)" } as any,
    default: { opacity: 0.35 },
  }),
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 24 },
  caja: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 20, alignItems: "center", width: "100%", maxWidth: 360 },
  cajaImagen: { width: "100%", aspectRatio: 512 / 307 },
  cajaLogrado: { fontSize: 14, color: theme.colors.primaryLight, fontWeight: "700", marginTop: 14 },
  cajaTexto: { fontSize: 13, color: theme.colors.textMuted, marginTop: 8, textAlign: "center" },
  cerrarBtn: { marginTop: 18, paddingVertical: 10, paddingHorizontal: 24 },
  cerrarBtnTexto: { fontSize: 14, fontWeight: "700", color: theme.colors.primaryLight },
});
