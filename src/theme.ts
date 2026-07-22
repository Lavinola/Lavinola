/**
 * Paleta de Lavinola, extraída del logo (fondo negro, violeta degradé,
 * blanco). Todas las pantallas importan de acá en vez de hardcodear colores,
 * así la identidad visual queda coherente en toda la app.
 */
export const theme = {
  colors: {
    background: "#0A0A0A", // negro del logo
    surface: "#161616", // cards, inputs
    surfaceAlt: "#1F1F1F", // cards sobre cards, chips inactivos
    border: "#2E2E2E",

    primary: "#A63FE0", // violeta medio (tono principal de acento)
    primaryLight: "#C066F0", // violeta claro (highlights, gradiente superior)
    primaryDark: "#6D257E", // violeta oscuro (gradiente inferior, pressed state)

    text: "#FFFFFF",
    textMuted: "#9A9A9A",
    textFaint: "#6B6B6B",

    danger: "#E05252", // reportes/borrar — rojo suave, no compite con el violeta
    success: "#4CAF7D",

    // La "X" gris del logo (mitad derecha del book) — usada para estados neutros/negativos
    neutralPanel: "#333333",
  },
  fonts: {
    logo: "RobotoSlab_700Bold", // misma tipografía "slab serif" del logo (LAVINOLA)
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 16,
    pill: 999,
  },
  spacing: (n: number) => n * 4,
};

export type Theme = typeof theme;
