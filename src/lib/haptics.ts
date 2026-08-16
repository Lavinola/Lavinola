import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * Vibración/respuesta háptica — solo para los 3 lugares puntuales que se
 * pidió: marcar un capítulo/película como vista, reaccionar a un post o
 * comentario, y seguir una lista/usuario. En la web no hace nada (los
 * navegadores no tienen esto), y si el dispositivo no lo soporta por
 * algún motivo, falla en silencio sin romper la acción real.
 */
export function impactoLiviano() {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function seleccion() {
  if (Platform.OS === "web") return;
  Haptics.selectionAsync().catch(() => {});
}
