import Constants from "expo-constants";
import { supabase } from "./supabase";

/**
 * Versión mínima obligatoria — un mecanismo aparte de las actualizaciones
 * OTA, para cuando SÍ hace falta que la gente baje una versión nueva de la
 * tienda (por ejemplo, un cambio que toca algo nativo, o un bug tan grave
 * que no alcanza con esperar a que la gente actualice sola). Se controla
 * con una fila en la tabla `app_config` de Supabase — cambiarla ahí alcanza,
 * sin tocar código ni hacer un build nuevo.
 *
 * Por default, `min_app_version` apunta a la versión actual del build, así
 * que esto nunca bloquea a nadie hasta que decidas subir el número a mano
 * en Supabase.
 */
function compararVersiones(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

export async function chequearVersionMinima(): Promise<{ bloqueada: boolean; storeUrl?: string }> {
  try {
    const versionActual = Constants.expoConfig?.version ?? "0.0.0";
    const { data } = await supabase.from("app_config").select("value").eq("key", "min_app_version").maybeSingle();
    const minima = data?.value;
    if (!minima) return { bloqueada: false };

    if (compararVersiones(versionActual, minima) < 0) {
      const { data: urlRow } = await supabase.from("app_config").select("value").eq("key", "store_url").maybeSingle();
      return { bloqueada: true, storeUrl: urlRow?.value };
    }
  } catch (e) {
    // Si falla el chequeo (sin conexión, etc.), no bloqueamos a nadie por
    // las dudas — mejor dejar entrar de más que trabar la app sin motivo.
    console.error("No se pudo chequear la versión mínima:", e);
  }
  return { bloqueada: false };
}
