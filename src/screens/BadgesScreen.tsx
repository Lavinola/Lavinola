import React, { useEffect, useState } from "react";
import { View, FlatList, Image, Pressable, Modal, StyleSheet, Platform, ActivityIndicator, useWindowDimensions } from "react-native";
import { Text } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { NIVELES_INSIGNIAS, NivelInsignia, obtenerPuntosInsignias } from "../lib/badges";
import { IMAGENES_INSIGNIAS_GRANDES } from "../lib/badgeImages";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

// Proporción real de las tarjetas (ancho x alto en px de la imagen).
const RATIO_TARJETA = 463 / 260;
const COLUMNAS = 2;
const FILAS = 5;
const PADDING_GRILLA = 12;
const GAP_H = 10;
const GAP_V = 8;
const ALTURA_ENCABEZADO_APROX = 76;

export default function BadgesScreen() {
  const { t, idioma } = useT();
  const { width: anchoPantalla, height: altoPantalla } = useWindowDimensions();
  const [puntos, setPuntos] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<NivelInsignia | null>(null);
  const [ayudaVisible, setAyudaVisible] = useState(false);

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

  // Se calcula el tamaño de cada tarjeta para que las 10 (2 columnas, 5
  // filas) entren siempre de una sola vez en la pantalla, sin scrollear —
  // el límite real puede ser el ancho (2 por fila) o el alto (5 filas), así
  // que se usa el que más achique, y el otro lado sale solo por la
  // proporción real de la imagen.
  const anchoDisponible = anchoPantalla - PADDING_GRILLA * 2 - GAP_H * (COLUMNAS - 1);
  const anchoPorAncho = anchoDisponible / COLUMNAS;
  const altoDisponible = altoPantalla - ALTURA_ENCABEZADO_APROX - PADDING_GRILLA * 2 - GAP_V * (FILAS - 1);
  const altoPorAlto = altoDisponible / FILAS;
  const anchoPorAlto = altoPorAlto * RATIO_TARJETA;
  const anchoTarjeta = Math.min(anchoPorAncho, anchoPorAlto);
  const altoTarjeta = anchoTarjeta / RATIO_TARJETA;

  return (
    <View style={styles.container}>
      <View style={styles.encabezado}>
        <View style={{ flex: 1 }}>
          <Text style={styles.encabezadoTitulo} numberOfLines={1}>
            {nivelActualNumero > 0
              ? t("Nivel {n}: {nombre}").replace("{n}", String(nivelActualNumero)).replace("{nombre}", NIVELES_INSIGNIAS[nivelActualNumero - 1].nombre)
              : t("Todavía sin nivel")}
          </Text>
          <Text style={styles.encabezadoPuntos}>{t("{puntos} puntos").replace("{puntos}", puntos.toLocaleString("es-AR"))}</Text>
        </View>
        <Pressable style={styles.ayudaBoton} onPress={() => setAyudaVisible(true)} hitSlop={8}>
          <Text style={styles.ayudaBotonTexto}>?</Text>
        </Pressable>
      </View>

      <FlatList
        data={NIVELES_INSIGNIAS}
        keyExtractor={(n) => String(n.nivel)}
        numColumns={COLUMNAS}
        scrollEnabled={false}
        contentContainerStyle={{ padding: PADDING_GRILLA }}
        columnWrapperStyle={{ justifyContent: "space-between", marginBottom: GAP_V }}
        renderItem={({ item }) => {
          const desbloqueada = puntos >= item.puntos;
          return (
            <Pressable onPress={() => setSeleccionado(item)}>
              <Image
                source={IMAGENES_INSIGNIAS_GRANDES[idioma][item.nivel]}
                style={[{ width: anchoTarjeta, height: altoTarjeta }, !desbloqueada && styles.tarjetaBloqueada]}
                resizeMode="contain"
              />
            </Pressable>
          );
        }}
      />

      <Modal visible={ayudaVisible} transparent animationType="fade" onRequestClose={() => setAyudaVisible(false)}>
        <Pressable style={styles.fondo} onPress={() => setAyudaVisible(false)}>
          <Pressable style={styles.caja} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.ayudaTitulo}>{t("Cómo sumar puntos")}</Text>
            <View style={styles.ayudaFila}>
              <Text style={styles.ayudaFilaTexto}>{t("Película vista")}</Text>
              <Text style={styles.ayudaFilaPuntos}>+3</Text>
            </View>
            <View style={styles.ayudaFila}>
              <Text style={styles.ayudaFilaTexto}>{t("Capítulo visto")}</Text>
              <Text style={styles.ayudaFilaPuntos}>+1</Text>
            </View>
            <View style={styles.ayudaFila}>
              <Text style={styles.ayudaFilaTexto}>{t("Post/Comentario")}</Text>
              <Text style={styles.ayudaFilaPuntos}>+5</Text>
            </View>
            <Pressable style={styles.cerrarBtn} onPress={() => setAyudaVisible(false)}>
              <Text style={styles.cerrarBtnTexto}>{t("Cerrar")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!seleccionado} transparent animationType="fade" onRequestClose={() => setSeleccionado(null)}>
        <Pressable style={styles.fondo} onPress={() => setSeleccionado(null)}>
          <Pressable style={styles.caja} onPress={(e) => e.stopPropagation()}>
            {seleccionado && (
              <>
                <Image
                  source={IMAGENES_INSIGNIAS_GRANDES[idioma][seleccionado.nivel]}
                  style={[{ width: "100%", aspectRatio: RATIO_TARJETA }, puntos < seleccionado.puntos && styles.tarjetaBloqueada]}
                  resizeMode="contain"
                />
                {puntos >= seleccionado.puntos ? (
                  <Text style={styles.cajaLogrado}>{t("¡Ya la tenés! 🎉")}</Text>
                ) : (
                  <>
                    <Text style={styles.cajaPuntosGrandes}>
                      {t("{puntos}/{necesarios} puntos")
                        .replace("{puntos}", puntos.toLocaleString("es-AR"))
                        .replace("{necesarios}", seleccionado.puntos.toLocaleString("es-AR"))}
                    </Text>
                    <Text style={styles.cajaTexto}>
                      {t("Faltan {resto} puntos").replace("{resto}", (seleccionado.puntos - puntos).toLocaleString("es-AR"))}
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
  encabezado: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  encabezadoTitulo: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  encabezadoPuntos: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  ayudaBoton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  ayudaBotonTexto: { color: theme.colors.primaryLight, fontWeight: "800", fontSize: 14 },
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
  cajaLogrado: { fontSize: 14, color: theme.colors.primaryLight, fontWeight: "700", marginTop: 14 },
  cajaPuntosGrandes: { fontSize: 16, color: theme.colors.text, fontWeight: "800", marginTop: 14 },
  cajaTexto: { fontSize: 13, color: theme.colors.textMuted, marginTop: 8, textAlign: "center" },
  cerrarBtn: { marginTop: 18, paddingVertical: 10, paddingHorizontal: 24 },
  cerrarBtnTexto: { fontSize: 14, fontWeight: "700", color: theme.colors.primaryLight },
  ayudaTitulo: { fontSize: 16, fontWeight: "800", color: theme.colors.text, marginBottom: 14 },
  ayudaFila: { flexDirection: "row", justifyContent: "space-between", width: "100%", paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  ayudaFilaTexto: { fontSize: 14, color: theme.colors.text },
  ayudaFilaPuntos: { fontSize: 14, fontWeight: "800", color: theme.colors.primaryLight },
});
