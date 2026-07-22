/**
 * Componentes base con el theme aplicado por default. `Text` reemplaza al
 * `Text` de react-native en todas las pantallas: sin esto, cualquier texto
 * sin color explícito se renderiza negro (default de RN) y queda invisible
 * sobre el fondo negro de la app.
 */
import React from "react";
import {
  Text as RNText,
  TextProps,
  Pressable,
  PressableProps,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { theme } from "../theme";

export function Text({ style, ...props }: TextProps) {
  return <RNText style={[styles.text, style]} {...props} />;
}

interface AppButtonProps extends Omit<PressableProps, "style"> {
  title: string;
  variant?: "primary" | "outline" | "danger" | "muted";
  disabled?: boolean;
  loading?: boolean; // muestra el spinner en vez del texto — usar SOLO mientras hay una acción en curso, no para "todavía no se puede apretar"
}

export function AppButton({ title, variant = "primary", disabled, loading, ...props }: AppButtonProps) {
  return (
    <Pressable
      {...props}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btnBase,
        variant === "primary" && styles.btnPrimary,
        variant === "outline" && styles.btnOutline,
        variant === "danger" && styles.btnDanger,
        variant === "muted" && styles.btnMuted,
        (disabled || loading) && styles.btnDisabled,
        pressed && !disabled && !loading && styles.btnPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.text} size="small" />
      ) : (
        <RNText
          style={[
            styles.btnText,
            variant === "primary" && styles.btnTextPrimary,
            variant === "outline" && styles.btnTextOutline,
            variant === "muted" && styles.btnTextOutline,
          ]}
        >
          {title}
        </RNText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: { color: theme.colors.text },
  btnBase: {
    borderRadius: theme.radius.md,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  btnPrimary: { backgroundColor: theme.colors.primary },
  btnOutline: { borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: "transparent" },
  btnDanger: { backgroundColor: theme.colors.danger },
  btnMuted: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: "transparent" },
  btnDisabled: { opacity: 0.6 },
  btnPressed: { opacity: 0.85 },
  btnText: { color: theme.colors.text, fontWeight: "700", fontSize: 14, textAlign: "center" },
  btnTextPrimary: { color: "#000000", fontWeight: "800" },
  btnTextOutline: { color: theme.colors.primaryLight },
});
