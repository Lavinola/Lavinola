// src/lib/onboarding.ts
//
// Puente para abrir el cartel de bienvenida/ayuda desde cualquier lugar
// (el botón "?" del header, o el auto-mostrado la primera vez que alguien
// entra). Mismo patrón que src/lib/alert.ts: un componente se registra al
// montar (GlobalOnboardingHost), y cualquier otro archivo puede llamar a
// abrirAyuda() sin necesidad de pasar props/callbacks por toda la app.

import AsyncStorage from "@react-native-async-storage/async-storage";

const CLAVE_YA_VISTO = "onboarding_visto_v1";

type ShowFn = () => void;

let mostrarHandler: ShowFn | null = null;

export function registrarHandlerAyuda(fn: ShowFn | null) {
  mostrarHandler = fn;
}

export function abrirAyuda() {
  mostrarHandler?.();
}

/** Se llama una vez al arrancar sesión — si nunca se vio, lo muestra y guarda la marca. */
export async function mostrarAyudaSiEsPrimeraVez() {
  try {
    const yaVisto = await AsyncStorage.getItem(CLAVE_YA_VISTO);
    if (yaVisto) return;
    await AsyncStorage.setItem(CLAVE_YA_VISTO, "1");
    mostrarHandler?.();
  } catch {
    // Si falla el storage por algún motivo, no rompemos el arranque de la app.
  }
}
