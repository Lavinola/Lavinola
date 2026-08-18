import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { supabase } from "./supabase";

/**
 * Vibración/respuesta háptica — solo para los 3 lugares puntuales que se
 * pidió: marcar un capítulo/película como vista, reaccionar a un post o
 * comentario, y seguir una lista/usuario. En la web no hace nada (los
 * navegadores no tienen esto), y si el dispositivo no lo soporta por
 * algún motivo, falla en silencio sin romper la acción real.
 *
 * Se puede apagar desde Ajustes → Aplicación — guardamos la preferencia
 * en memoria (en vez de consultar la base cada vez que alguien toca
 * algo) para que sea instantáneo; se carga sola al iniciar sesión.
 */
let hapticsActivados = true;

export function setHapticsActivados(v: boolean) {
  hapticsActivados = v;
}

/** Se llama una vez al iniciar sesión (ver navigation/index.tsx), para que la preferencia guardada quede lista antes de que alguien toque algo. */
export async function cargarPreferenciaHaptics(userId: string) {
  try {
    const { data } = await supabase.from("profiles").select("haptics_enabled").eq("id", userId).maybeSingle();
    hapticsActivados = data?.haptics_enabled !== false;
  } catch (e) {
    console.error("No se pudo cargar la preferencia de vibración:", e);
  }
}

export function impactoLiviano() {
  if (Platform.OS === "web" || !hapticsActivados) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function seleccion() {
  if (Platform.OS === "web" || !hapticsActivados) return;
  Haptics.selectionAsync().catch(() => {});
}
