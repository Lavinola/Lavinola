import React, { useEffect, useRef, useState } from "react";
import { View, Pressable, Animated, StyleSheet, LayoutChangeEvent } from "react-native";
import { Text } from "./Themed";
import { theme } from "../theme";

interface Props<T extends string> {
  opciones: { key: T; label: string }[];
  valor: T;
  onCambiar: (v: T) => void;
}

/**
 * Como TopPills, pero con otra identidad visual a propósito: fondo negro,
 * texto violeta en las dos opciones, y una rayita violeta abajo que se
 * desliza hacia la que está activa — para que Para ti/Siguiendo no se
 * confundan con el resto de los selectores de la app (que son óvalos
 * violeta llenos).
 */
export default function UnderlineTabs<T extends string>({ opciones, valor, onCambiar }: Props<T>) {
  const [anchoTotal, setAnchoTotal] = useState(0);
  const indiceActivo = Math.max(0, opciones.findIndex((o) => o.key === valor));
  const anim = useRef(new Animated.Value(indiceActivo)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: indiceActivo, duration: 220, useNativeDriver: true }).start();
  }, [indiceActivo]);

  function onLayout(e: LayoutChangeEvent) {
    setAnchoTotal(e.nativeEvent.layout.width);
  }

  const anchoBoton = anchoTotal / opciones.length;

  return (
    <View style={styles.barra} onLayout={onLayout}>
      <View style={styles.filaBotones}>
        {opciones.map((o) => (
          <Pressable key={o.key} style={styles.boton} onPress={() => onCambiar(o.key)}>
            <Text style={[styles.texto, valor === o.key && styles.textoActivo]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {anchoTotal > 0 && (
        <View style={styles.rielSubrayado}>
          <Animated.View
            style={[
              styles.subrayado,
              {
                width: anchoBoton,
                transform: [{ translateX: Animated.multiply(anim, anchoBoton) }],
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  barra: { backgroundColor: "#000000" },
  filaBotones: { flexDirection: "row" },
  boton: { flex: 1, paddingVertical: 12, paddingHorizontal: 4, alignItems: "center" },
  texto: { fontSize: 14, fontWeight: "700", color: theme.colors.primaryLight, opacity: 0.55 },
  textoActivo: { opacity: 1 },
  rielSubrayado: { height: 2, width: "100%" },
  subrayado: { height: 2, backgroundColor: theme.colors.primary, position: "absolute", left: 0 },
});
