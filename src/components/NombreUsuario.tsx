import React from "react";
import { StyleProp, TextStyle, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { theme } from "../theme";

/**
 * "Juanjo @juan" — el nombre para mostrar en blanco y negrita, el
 * @usuario en gris y más finito al lado (como en X/Twitter). Si no tiene
 * nombre para mostrar cargado, se ve solo el @usuario en el estilo
 * "principal" (blanco/negrita), como era antes de tener esta función.
 * Se usa en cualquier lugar que muestre quién publicó/comentó/escribió
 * algo: posts, encuestas, comentarios, respuestas, chats.
 */
export default function NombreUsuario({
  displayName,
  username,
  style,
  numberOfLines,
}: {
  displayName?: string | null;
  username?: string | null;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const nombre = displayName?.trim();
  const arroba = username ? `@${username}` : "";

  if (!nombre) {
    return (
      <Text style={[styles.nombre, style]} numberOfLines={numberOfLines}>
        {arroba || "Usuario"}
      </Text>
    );
  }

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      <Text style={styles.nombre}>{nombre}</Text>
      {!!arroba && <Text style={styles.usuario}> {arroba}</Text>}
    </Text>
  );
}

/** Para los lugares que solo necesitan UN texto (notificaciones, listas seguidas): nombre para mostrar si tiene, si no el @usuario sin arroba. */
export function nombreOUsuario(displayName?: string | null, username?: string | null): string {
  return displayName?.trim() || username?.trim() || "Usuario";
}

const styles = StyleSheet.create({
  nombre: { color: "#FFFFFF", fontWeight: "700" },
  usuario: { color: theme.colors.textMuted, fontWeight: "400" },
});
