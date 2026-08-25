import React, { useRef, useState } from "react";
import { View, Pressable, Animated, StyleSheet, LayoutChangeEvent } from "react-native";
import { Text } from "./Themed";
import { theme } from "../theme";

interface Props {
  opciones: { key: string; label: string }[];
  valor: string;
  onCambiar: (v: string) => void;
}

/**
 * Como UnderlineTabs (fondo negro, texto violeta, rayita violeta que se
 * desliza), pero para cuando las opciones NO tienen que repartirse el
 * ancho completo en partes iguales — acá cada pastilla mide lo que
 * necesite su propio texto, todas pegadas a la izquierda, como el resto
 * de los títulos de sección de esta pantalla (Sinopsis, Reparto, etc.).
 * Por eso se mide la posición y el ancho real de cada una (con onLayout)
 * en vez de calcularlo dividiendo el ancho total como hace UnderlineTabs.
 */
export default function TrailerIdiomaSelector({ opciones, valor, onCambiar }: Props) {
  const layouts = useRef<Record<string, { x: number; width: number }>>({});
  const [, forceRender] = useState(0);
  const animX = useRef(new Animated.Value(0)).current;
  const animAncho = useRef(new Animated.Value(0)).current;

  function medir(key: string, e: LayoutChangeEvent) {
    const { x, width } = e.nativeEvent.layout;
    const yaEstaba = layouts.current[key];
    layouts.current[key] = { x, width };
    if (!yaEstaba) forceRender((n) => n + 1); // para que la primera vez sí anime hacia la posición recién medida
    if (key === valor) animarHacia(key);
  }

  function animarHacia(key: string) {
    const l = layouts.current[key];
    if (!l) return;
    Animated.parallel([
      // Los dos en useNativeDriver: false a propósito — mezclar true/false
      // en el MISMO Animated.View (acá, width y transform juntos) causaba
      // "Attempting to run JS driven animation on animated node that has
      // been moved to native" y tildaba la pantalla entera al abrir
      // cualquier detalle de título.
      Animated.timing(animX, { toValue: l.x, duration: 220, useNativeDriver: false }),
      Animated.timing(animAncho, { toValue: l.width, duration: 220, useNativeDriver: false }),
    ]).start();
  }

  function elegir(key: string) {
    onCambiar(key);
    animarHacia(key);
  }

  return (
    <View style={styles.barra}>
      <View style={styles.filaBotones}>
        {opciones.map((o) => (
          <Pressable key={o.key} style={styles.boton} onPress={() => elegir(o.key)} onLayout={(e) => medir(o.key, e)}>
            <Text style={[styles.texto, valor === o.key && styles.textoActivo]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.riel}>
        <Animated.View style={[styles.subrayado, { width: animAncho, transform: [{ translateX: animX }] }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barra: { backgroundColor: "#000000" },
  filaBotones: { flexDirection: "row" },
  boton: { paddingVertical: 10, paddingHorizontal: 14 },
  texto: { fontSize: 14, fontWeight: "700", color: theme.colors.primaryLight, opacity: 0.55 },
  textoActivo: { opacity: 1 },
  riel: { height: 2, width: "100%" },
  subrayado: { height: 2, backgroundColor: theme.colors.primary, position: "absolute", left: 0 },
});
