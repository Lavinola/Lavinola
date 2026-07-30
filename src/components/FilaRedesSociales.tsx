import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Themed";
import { abrirRedSocial } from "../lib/social";
import { theme } from "../theme";

/**
 * Fila de redes sociales — no renderiza nada si no hay ninguna cargada, así
 * si no hay frase tampoco, no queda un hueco negro: el siguiente elemento
 * sube solo, sin necesidad de manejar alturas a mano.
 *
 * El acomodo cambia según cuántas redes haya: con 1 o 2, quedan centradas
 * como grupo; con 3, se reparten a lo ancho de toda la pantalla en partes
 * iguales. El ancho máximo de cada una también se ajusta según la
 * cantidad, para que con 3 no lleguen a superponerse — si el @usuario es
 * muy largo, se corta con "...".
 */
export default function FilaRedesSociales({ perfil }: { perfil: { social_instagram?: string | null; social_twitter?: string | null; social_tiktok?: string | null } | null }) {
  if (!perfil) return null;

  const redes: { key: string; icono: any; texto: string; url: string }[] = [];
  if (perfil.social_instagram) {
    redes.push({ key: "instagram", icono: "logo-instagram", texto: `@${perfil.social_instagram}`, url: `https://instagram.com/${perfil.social_instagram}` });
  }
  if (perfil.social_twitter) {
    redes.push({ key: "twitter", icono: "logo-x", texto: `@${perfil.social_twitter}`, url: `https://x.com/${perfil.social_twitter}` });
  }
  if (perfil.social_tiktok) {
    redes.push({ key: "tiktok", icono: "logo-tiktok", texto: `@${perfil.social_tiktok}`, url: `https://tiktok.com/@${perfil.social_tiktok}` });
  }

  if (redes.length === 0) return null;

  const anchoMaximo = redes.length === 1 ? "70%" : redes.length === 2 ? "44%" : "31%";

  return (
    <View style={[styles.redesRow, redes.length === 3 && { justifyContent: "space-evenly" }]}>
      {redes.map((r) => (
        <Pressable key={r.key} style={[styles.redItem, { maxWidth: anchoMaximo as any }]} onPress={() => abrirRedSocial(r.url)}>
          <Ionicons name={r.icono} size={15} color={theme.colors.primaryLight} />
          <Text style={styles.redTexto} numberOfLines={1} ellipsizeMode="tail">
            {r.texto}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  redesRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 20, paddingHorizontal: 16, marginTop: 8, marginBottom: 4 },
  redItem: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  redTexto: { fontSize: 12, color: theme.colors.primaryLight, flexShrink: 1 },
});
