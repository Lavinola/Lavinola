import React, { useRef, useState } from "react";
import { View, Pressable, StyleSheet, StyleProp, TextStyle, LayoutChangeEvent } from "react-native";
import { Text } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

interface Props {
  texto: string;
  style?: StyleProp<TextStyle>;
  maxLines?: number;
  indicador?: "flecha" | "puntos"; // "flecha" (por defecto) = chevron abajo a la derecha, como ya se usaba. "puntos" = "..." violeta después del texto (para la biografía de actores/directores).
}

/**
 * Texto que se corta a 5 renglones (configurable) si es muy largo, con una
 * flechita violeta abajo a la derecha del bloque para desplegarlo entero —
 * y volver a colapsarlo. Si el texto entra sin cortarse, no aparece nada.
 *
 * Para detectar si hace falta la flechita, comparamos la altura que
 * ocuparía el texto completo (medida con una copia invisible, sin límite
 * de renglones) contra la altura del texto ya recortado a `maxLines`. Esto
 * es más confiable entre plataformas que "onTextLayout" (que en la
 * versión web de la app no siempre avisa, y por eso el texto se veía
 * cortado sin que apareciera nunca la flechita para desplegarlo).
 */
export default function ExpandableText({ texto, style, maxLines = 5, indicador = "flecha" }: Props) {
  const [expandido, setExpandido] = useState(false);
  const [truncado, setTruncado] = useState(false);
  const alturaCompleta = useRef<number | null>(null);
  const alturaRecortada = useRef<number | null>(null);

  function chequearSiTruncado() {
    if (alturaCompleta.current == null || alturaRecortada.current == null) return;
    // Un par de píxeles de margen para no marcar como truncado por simples redondeos.
    setTruncado(alturaCompleta.current > alturaRecortada.current + 2);
  }

  return (
    <View>
      {/* Copia invisible (altura 0, no se ve ni ocupa lugar) solo para medir cuánto mediría el texto sin cortar. */}
      <View style={styles.medidorWrap} pointerEvents="none">
        <Text
          style={style}
          onLayout={(e: LayoutChangeEvent) => {
            alturaCompleta.current = e.nativeEvent.layout.height;
            chequearSiTruncado();
          }}
        >
          {texto}
        </Text>
      </View>
      <Text
        style={style}
        numberOfLines={expandido ? undefined : maxLines}
        onLayout={(e: LayoutChangeEvent) => {
          if (!expandido) {
            alturaRecortada.current = e.nativeEvent.layout.height;
            chequearSiTruncado();
          }
        }}
      >
        {texto}
      </Text>
      {truncado &&
        (indicador === "puntos" ? (
          <Pressable onPress={() => setExpandido((v) => !v)} hitSlop={8}>
            <Text style={styles.puntosTexto}>{expandido ? "▲" : "•••"}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setExpandido((v) => !v)} style={styles.flechaBtn} hitSlop={8}>
            <Ionicons name={expandido ? "chevron-up" : "chevron-down"} size={16} color={theme.colors.primaryLight} />
          </Pressable>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flechaBtn: { position: "absolute", right: 0, bottom: 0 },
  medidorWrap: { height: 0, overflow: "hidden" },
  puntosTexto: { color: theme.colors.primary, fontSize: 18, fontWeight: "800", letterSpacing: 2, marginTop: 2 },
});
