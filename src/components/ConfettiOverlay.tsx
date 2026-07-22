import React, { useEffect, useMemo, useRef } from "react";
import { View, Animated, Easing, Dimensions, StyleSheet } from "react-native";
import { theme } from "../theme";

const { width: ANCHO_PANTALLA, height: ALTO_PANTALLA } = Dimensions.get("window");
const COLORES = [theme.colors.primary, "#FFFFFF", "#4C8DFF", "#FF7EC9"];
const CANTIDAD = 180;
const DURACION_TOTAL = 5200; // ms que dura todo el festejo (el último papelito termina más o menos acá)

interface Papelito {
  x: number;
  color: string;
  ancho: number;
  alto: number;
  demora: number; // cuándo arranca este papelito puntual, en ms
  subidaMs: number; // cuánto tarda en llegar arriba de todo
  caidaMs: number; // cuánto tarda en volver a bajar
  alturaMax: number; // qué tan arriba llega antes de empezar a caer
  derivaX: number;
  rotacionFinal: number;
}

/** Se dispara una vez; cada papelito sale disparado desde abajo en un momento distinto, sube, y cae por gravedad hasta desvanecerse — no todos juntos. */
export default function ConfettiOverlay({ onFin }: { onFin?: () => void }) {
  const papelitos: Papelito[] = useMemo(
    () =>
      Array.from({ length: CANTIDAD }).map(() => {
        const subidaMs = 1100 + Math.random() * 900;
        return {
          x: Math.random() * ANCHO_PANTALLA,
          color: COLORES[Math.floor(Math.random() * COLORES.length)],
          ancho: 6 + Math.random() * 6,
          alto: 10 + Math.random() * 8,
          demora: Math.random() * 2200,
          subidaMs,
          caidaMs: 2000 + Math.random() * 1300,
          alturaMax: ALTO_PANTALLA * (0.75 + Math.random() * 0.22), // llegan casi hasta arriba de todo
          derivaX: (Math.random() - 0.5) * 200,
          rotacionFinal: 360 + Math.random() * 900 * (Math.random() > 0.5 ? 1 : -1),
        };
      }),
    []
  );

  useEffect(() => {
    const timeout = setTimeout(() => onFin?.(), DURACION_TOTAL);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <View style={styles.contenedor} pointerEvents="none">
      {papelitos.map((p, i) => (
        <Papelito key={i} p={p} />
      ))}
    </View>
  );
}

function Papelito({ p }: { p: Papelito }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(p.demora),
      Animated.timing(anim, {
        toValue: 1,
        duration: p.subidaMs + p.caidaMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const puntoSubida = p.subidaMs / (p.subidaMs + p.caidaMs);

  const traduccionY = anim.interpolate({
    inputRange: [0, puntoSubida, 1],
    outputRange: [ALTO_PANTALLA + 20, ALTO_PANTALLA - p.alturaMax, ALTO_PANTALLA + 60],
  });
  const opacidad = anim.interpolate({
    inputRange: [0, 0.05, puntoSubida, 1],
    outputRange: [0, 1, 1, 0],
  });
  const deriva = anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.derivaX] });
  const rotar = anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.rotacionFinal}deg`] });

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: p.x,
        width: p.ancho,
        height: p.alto,
        backgroundColor: p.color,
        borderRadius: 1,
        opacity: opacidad,
        transform: [{ translateY: traduccionY }, { translateX: deriva }, { rotate: rotar }],
      }}
    />
  );
}

const styles = StyleSheet.create({
  contenedor: { ...StyleSheet.absoluteFillObject, zIndex: 999, elevation: 999 },
});
