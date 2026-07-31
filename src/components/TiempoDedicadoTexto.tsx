import React from "react";
import { Text, TextStyle, StyleProp } from "react-native";
import { formatTiempo } from "../lib/stats";
import { theme } from "../theme";

interface Props {
  minutos: number;
  style?: StyleProp<TextStyle>; // estilo de los números (letras van un toque más chicas que esto)
}

/**
 * Muestra "1A 0M 3D 18H" (o "2M 18D 8H" si todavía no hay años) — los
 * números quedan al tamaño que se les pase, y las letras (A/M/D/H) van en
 * mayúscula pero un size menos que los números.
 */
export default function TiempoDedicadoTexto({ minutos, style }: Props) {
  const { anios, meses, dias, horas } = formatTiempo(minutos);
  const tamanoNumero = (planarizarEstilo(style)?.fontSize as number) ?? 15;
  const letra = { fontSize: Math.max(tamanoNumero - 2, 9), fontWeight: "700" as const, color: theme.colors.textMuted };

  return (
    <Text style={style}>
      {anios > 0 && (
        <>
          {anios}
          <Text style={letra}>A </Text>
        </>
      )}
      {meses}
      <Text style={letra}>M </Text>
      {dias}
      <Text style={letra}>D </Text>
      {horas}
      <Text style={letra}>H</Text>
    </Text>
  );
}

// Mini-helper para leer el fontSize del style pasado (puede venir como
// objeto, array de objetos, o undefined) sin depender de StyleSheet.flatten
// para no forzar un import extra acá.
function planarizarEstilo(style: StyleProp<TextStyle>): TextStyle | undefined {
  if (!style) return undefined;
  if (Array.isArray(style)) {
    return style.reduce<TextStyle>((acc, s) => ({ ...acc, ...(s as TextStyle) }), {});
  }
  return style as TextStyle;
}
