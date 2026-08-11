import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, ViewStyle, DimensionValue } from "react-native";
import { theme } from "../theme";

/**
 * El bloque gris "pulsante" de base para armar cualquier skeleton —
 * imita la forma de lo que va a aparecer (un poster, un renglón de
 * texto, un avatar) mientras carga, en vez de un spinner circular
 * genérico. Da sensación de más velocidad aunque tarde lo mismo, porque
 * la persona ya ve la "forma" del contenido antes de que llegue.
 */
export default function SkeletonBox({
  width,
  height,
  borderRadius = 6,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle;
}) {
  const opacidad = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animacion = Animated.loop(
      Animated.sequence([
        Animated.timing(opacidad, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacidad, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    animacion.start();
    return () => animacion.stop();
  }, [opacidad]);

  return <Animated.View style={[styles.base, { width, height, borderRadius, opacity: opacidad }, style]} />;
}

const styles = StyleSheet.create({
  base: { backgroundColor: theme.colors.surfaceAlt },
});
