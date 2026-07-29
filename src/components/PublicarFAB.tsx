import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

interface Props {
  visible: boolean;
  onPress: () => void;
}

/**
 * Botón flotante violeta con un "+" negro — para publicar en el Lobby desde
 * cualquier título/capítulo que ya tengas agregado, sin tener que entrar
 * primero a la ficha de esa película o serie.
 *
 * Se achica con fluidez hasta desaparecer cuando `visible` pasa a false (en
 * vez de aparecer/desaparecer de golpe), y vuelve a agrandarse al volver a
 * true.
 */
export default function PublicarFAB({ visible, onPress }: Props) {
  const escala = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(escala, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 60,
    }).start();
  }, [visible]);

  return (
    <Animated.View
      style={[styles.wrap, { transform: [{ scale: escala }], opacity: escala }]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <Pressable style={styles.boton} onPress={onPress} hitSlop={6}>
        <Ionicons name="add" size={30} color="#000000" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 16,
    bottom: 78, // justo arriba de la tab bar, sobre el botón de Perfil
  },
  boton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
  },
});
