import { Linking } from "react-native";
import { Alert } from "./alert";

/**
 * Abre una URL de red social. Para X en particular, algunos dispositivos
 * fallan al abrir "x.com" directamente (por cómo manejan los universal
 * links si no tenés la app instalada) — si pasa eso, reintenta con
 * "twitter.com", que redirige a x.com igual pero desde el navegador.
 */
export async function abrirRedSocial(url: string) {
  try {
    await Linking.openURL(url);
  } catch (e) {
    if (url.includes("x.com")) {
      try {
        await Linking.openURL(url.replace("x.com", "twitter.com"));
        return;
      } catch {}
    }
    console.error("No se pudo abrir el link:", url, e);
    Alert.alert("No se pudo abrir", "Revisá tu conexión y probá de nuevo.");
  }
}
