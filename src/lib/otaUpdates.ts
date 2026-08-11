import * as Updates from "expo-updates";

/**
 * Actualizaciones OTA (over-the-air) — para la mayoría de los cambios de
 * este chat (que son JS puro, sin tocar nada nativo), esto permite que le
 * lleguen a la gente en minutos, sin depender de que Apple/Google aprueben
 * una nueva versión en la tienda. Necesita que el proyecto esté configurado
 * con `eas update:configure` (un comando que se corre una sola vez).
 *
 * Si el proyecto todavía no tiene EAS Update configurado, `Updates.isEnabled`
 * es false y esto no hace nada — no rompe nada en desarrollo local ni antes
 * de configurarlo.
 */
export async function chequearActualizacionOTA(): Promise<boolean> {
  if (__DEV__ || !Updates.isEnabled) return false;
  try {
    const resultado = await Updates.checkForUpdateAsync();
    if (resultado.isAvailable) {
      await Updates.fetchUpdateAsync();
      return true; // ya está descargada, lista para aplicar
    }
  } catch (e) {
    console.error("No se pudo chequear actualizaciones OTA:", e);
  }
  return false;
}

export async function aplicarActualizacionOTA() {
  await Updates.reloadAsync();
}
