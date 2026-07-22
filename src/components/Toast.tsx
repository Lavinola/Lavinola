import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

interface Props {
  visible: boolean;
  mensaje: string;
  onOcultar: () => void;
  duracionMs?: number;
}

/**
 * Aviso chiquito tipo "toast" para confirmaciones simples (ej. "Guardado ✓"),
 * con la estética de la app en vez del cartel blanco nativo de Alert.
 * Se muestra flotando abajo y se cierra solo después de `duracionMs`.
 */
export default function Toast({ visible, mensaje, onOcultar, duracionMs = 2200 }: Props) {
  const opacidad = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.timing(opacidad, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const timeout = setTimeout(() => {
      Animated.timing(opacidad, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => onOcultar());
    }, duracionMs);
    return () => clearTimeout(timeout);
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.contenedor, { opacity: opacidad }]} pointerEvents="none">
      <Ionicons name="checkmark-circle" size={18} color={theme.colors.primaryLight} />
      <Text style={styles.texto}>{mensaje}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 999,
  },
  texto: { color: theme.colors.text, fontSize: 14, fontWeight: "600", flex: 1 },
});
