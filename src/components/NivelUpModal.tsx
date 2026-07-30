import React, { useEffect, useRef } from "react";
import { View, Image, Pressable, Animated, Easing, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import { NivelInsignia } from "../lib/badges";
import { IMAGENES_INSIGNIAS_GRANDES } from "../lib/badgeImages";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  nivel: NivelInsignia | null; // null = no se muestra nada
  onCerrar: () => void;
}

/**
 * La insignia entra girando y agrandándose hasta el centro de la pantalla,
 * con un fondo oscuro y unas chispitas alrededor — se dispara cuando
 * alguien sube de nivel (progreso normal, puntos "de antes" que se
 * reconocen al abrir la app, o un salto grande por importar TV Time).
 */
export default function NivelUpModal({ nivel, onCerrar }: Props) {
  const { t, idioma } = useT();
  const escala = useRef(new Animated.Value(0)).current;
  const rotacion = useRef(new Animated.Value(0)).current;
  const fondoOpacidad = useRef(new Animated.Value(0)).current;
  const textoOpacidad = useRef(new Animated.Value(0)).current;
  const chispasOpacidad = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!nivel) return;

    escala.setValue(0);
    rotacion.setValue(0);
    fondoOpacidad.setValue(0);
    textoOpacidad.setValue(0);
    chispasOpacidad.setValue(0);

    Animated.sequence([
      Animated.timing(fondoOpacidad, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(rotacion, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.spring(escala, { toValue: 1.15, friction: 4, tension: 60, useNativeDriver: true }),
          Animated.spring(escala, { toValue: 1, friction: 6, useNativeDriver: true }),
        ]),
        Animated.timing(chispasOpacidad, { toValue: 1, duration: 700, delay: 300, useNativeDriver: true }),
      ]),
      Animated.timing(textoOpacidad, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [nivel]);

  if (!nivel) return null;

  const giro = rotacion.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "1080deg"] });

  return (
    <Animated.View style={[styles.fondo, { opacity: fondoOpacidad }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCerrar} />
      <Animated.View style={[styles.chispa, styles.chispa1, { opacity: chispasOpacidad }]}>
        <Ionicons name="sparkles" size={26} color={theme.colors.primaryLight} />
      </Animated.View>
      <Animated.View style={[styles.chispa, styles.chispa2, { opacity: chispasOpacidad }]}>
        <Ionicons name="sparkles" size={18} color={theme.colors.primaryLight} />
      </Animated.View>
      <Animated.View style={[styles.chispa, styles.chispa3, { opacity: chispasOpacidad }]}>
        <Ionicons name="sparkles" size={22} color={theme.colors.primaryLight} />
      </Animated.View>

      <Animated.View style={{ transform: [{ scale: escala }, { rotate: giro }] }} pointerEvents="none">
        <Image source={IMAGENES_INSIGNIAS_GRANDES[idioma][nivel.nivel]} style={styles.imagen} resizeMode="contain" />
      </Animated.View>

      <Animated.View style={{ opacity: textoOpacidad, alignItems: "center" }}>
        <Text style={styles.subiste}>{t("¡Subiste de nivel!")}</Text>
        <Pressable style={styles.cerrarBtn} onPress={onCerrar}>
          <Text style={styles.cerrarBtnTexto}>{t("Genial")}</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fondo: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.88)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
  },
  imagen: { width: 280, aspectRatio: 463 / 260, marginBottom: 24 },
  subiste: { fontSize: 20, fontWeight: "800", color: theme.colors.text, marginBottom: 18 },
  cerrarBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 10, paddingHorizontal: 28 },
  cerrarBtnTexto: { color: "#000000", fontWeight: "800", fontSize: 14 },
  chispa: { position: "absolute" },
  chispa1: { top: "22%", left: "18%" },
  chispa2: { top: "30%", right: "16%" },
  chispa3: { bottom: "30%", left: "22%" },
});
