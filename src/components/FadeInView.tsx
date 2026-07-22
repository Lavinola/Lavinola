import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { useIsFocused } from "@react-navigation/native";

/**
 * Envuelve una pantalla para que aparezca con un fundido suave (~180ms) cada
 * vez que se enfoca — le da un poco de "vida" al cambiar de pestaña, sin
 * agregar demora real a la navegación (el cambio de pestaña sigue siendo
 * instantáneo, esto solo anima el contenido de adentro).
 */
export default function FadeInView({ children }: { children: React.ReactNode }) {
  const isFocused = useIsFocused();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    if (isFocused) {
      opacity.setValue(0);
      translateY.setValue(10);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 380,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 380,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isFocused]);

  return <Animated.View style={{ flex: 1, opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}
