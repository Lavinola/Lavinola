import * as StoreReview from "expo-store-review";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CLAVE_ULTIMA_VEZ = "lavinola_review_ultima_vez";
const DIAS_ENTRE_PEDIDOS = 90; // no insistir más de una vez cada 3 meses

/**
 * Pide la reseña de la tienda en un momento donde la persona está
 * contenta (por ejemplo, justo después de terminar una serie) — en vez de
 * un pedido genérico apenas abre la app. Usa el cartel NATIVO de
 * "calificar" (no saca a la persona de la app), y no insiste más de una
 * vez cada 3 meses, para no ser pesados.
 *
 * iOS/Android además tienen su propio límite de cuántas veces al año se
 * puede mostrar este cartel — nosotros no controlamos eso, solo evitamos
 * pedirlo de más de nuestro lado.
 */
export async function pedirReseñaSiCorresponde() {
  try {
    const disponible = await StoreReview.isAvailableAsync();
    if (!disponible) return;

    const ultima = await AsyncStorage.getItem(CLAVE_ULTIMA_VEZ);
    if (ultima) {
      const diasPasados = (Date.now() - Number(ultima)) / (1000 * 60 * 60 * 24);
      if (diasPasados < DIAS_ENTRE_PEDIDOS) return;
    }

    await AsyncStorage.setItem(CLAVE_ULTIMA_VEZ, String(Date.now()));
    await StoreReview.requestReview();
  } catch (e) {
    console.error("No se pudo pedir la reseña:", e);
  }
}
