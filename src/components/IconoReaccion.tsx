import React from "react";
import { Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MOODS } from "../lib/moods";
import { theme } from "../theme";

/**
 * Compartido entre PostCard, CommentThread y ReaccionesListModal — antes
 * estaba duplicado en cada uno. La clave guardada en la base (post_reactions
 * / likes_comentario) no es un emoji de verdad, es esta clave interna
 * ("like", "love", o la clave de un mood) que acá se convierte en ícono o
 * imagen.
 */
export const REACCIONES_ICONO: { key: string; icono: "thumbs-up" | "heart" }[] = [
  { key: "like", icono: "thumbs-up" },
  { key: "love", icono: "heart" },
];

export default function IconoReaccion({ reaccionKey, size = 16 }: { reaccionKey: string; size?: number }) {
  if (reaccionKey === "like") return <Ionicons name="thumbs-up" size={size} color={theme.colors.primaryLight} />;
  if (reaccionKey === "love") return <Ionicons name="heart" size={size} color={theme.colors.primaryLight} />;
  const mood = MOODS.find((m) => m.key === reaccionKey);
  if (mood) return <Image source={mood.imagen} style={{ width: size, height: size }} resizeMode="contain" />;
  return <Ionicons name="happy-outline" size={size} color={theme.colors.textMuted} />;
}
