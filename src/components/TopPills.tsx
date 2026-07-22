import React, { useEffect, useRef } from "react";
import { View, Pressable, StyleSheet, Animated, Text } from "react-native";
import { theme } from "../theme";

interface Props<T extends string> {
  opciones: { key: T; label: string; flex?: number; badge?: number }[];
  valor: T;
  onCambiar: (v: T) => void;
  variante?: "ovalo" | "rect"; // "rect" = rectángulo con esquinas redondeadas, en vez de óvalo completo
}

const DURACION_MS = 450;

/**
 * Barra de pestañas a todo el ancho, en forma de óvalos con aire entre sí.
 * El cambio de activa no es instantáneo: el color de FONDO de cada óvalo se
 * va desvaneciendo entre gris/violeta. El color de LETRA no se anima (queda
 * siempre 100% blanco o 100% negro, sin pasos intermedios) — animarlo podía
 * quedar "trabado" a mitad de camino en dispositivos con el hilo de JS
 * ocupado, y se veía grisáceo en vez de negro puro.
 */
export default function TopPills<T extends string>({ opciones, valor, onCambiar, variante = "ovalo" }: Props<T>) {
  // Un Animated.Value por opción (1 = activa, 0 = inactiva), arranca en el estado correcto.
  const valoresRef = useRef<Record<string, Animated.Value>>(
    Object.fromEntries(opciones.map((o) => [o.key, new Animated.Value(o.key === valor ? 1 : 0)]))
  );

  // Si en algún momento cambian las opciones (no debería pasar en la práctica,
  // pero por las dudas), completamos los que falten.
  for (const o of opciones) {
    if (!valoresRef.current[o.key]) valoresRef.current[o.key] = new Animated.Value(o.key === valor ? 1 : 0);
  }

  useEffect(() => {
    const animaciones = opciones.map((o) =>
      Animated.timing(valoresRef.current[o.key], {
        toValue: o.key === valor ? 1 : 0,
        duration: DURACION_MS,
        useNativeDriver: false, // interpolamos color de fondo, no se puede con el driver nativo
      })
    );
    Animated.parallel(animaciones).start();
  }, [valor]);

  return (
    <View style={styles.barra}>
      {opciones.map((o) => {
        const progreso = valoresRef.current[o.key];
        const backgroundColor = progreso.interpolate({
          inputRange: [0, 1],
          outputRange: [theme.colors.surfaceAlt, theme.colors.primary],
        });
        const activa = o.key === valor;
        return (
          <View key={o.key} style={[styles.segmento, { flex: o.flex ?? 1 }]}>
            <Pressable onPress={() => onCambiar(o.key)} style={{ width: "100%" }}>
              <Animated.View style={[styles.ovalo, variante === "rect" && styles.rect, { backgroundColor }]}>
                <Text
                  style={[styles.text, { color: activa ? "#000000" : theme.colors.text }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {o.label}
                </Text>
              </Animated.View>
              {!!o.badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeTexto}>{o.badge > 99 ? "99+" : o.badge}</Text>
                </View>
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  barra: { flexDirection: "row", backgroundColor: theme.colors.background, paddingVertical: 8, paddingHorizontal: 4 },
  segmento: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  ovalo: {
    width: "100%",
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rect: { borderRadius: 8 },
  text: { fontSize: 13, fontFamily: theme.fonts.logo, letterSpacing: 0.2, textTransform: "uppercase" },
  badge: {
    position: "absolute",
    top: -4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#E8E8E8",
    borderWidth: 1,
    borderColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeTexto: { fontSize: 9, fontWeight: "700", color: theme.colors.background },
});
