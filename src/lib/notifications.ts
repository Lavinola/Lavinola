import * as Notifications from "expo-notifications";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";

// En la web, expo-notifications no soporta esto de la misma forma que en el
// celular — si lo llamamos igual, puede tirar un error apenas se carga el
// archivo y tumbar toda la app (pantalla en blanco, antes de dibujar nada).
// Directamente no hace falta en la web: ahí no hay notificaciones push.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}

// Desde el SDK 53, Expo Go ya no soporta push notifications remotas — hace
// falta un "development build" para eso (ver README). Mientras se desarrolla
// con Expo Go, directamente no intentamos registrar el token: evita el error
// en rojo en la terminal y un posible cuelgue silencioso del login.
const corriendoEnExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Pide permiso de notificaciones y guarda el push token de Expo en el
 * perfil del usuario. Llamar una vez después del login (ej. en el useEffect
 * de RootNavigation cuando hay sesión). No hace nada si corre en Expo Go o
 * en la web (ahí no hay notificaciones push).
 */
export async function registrarPushToken(userId: string): Promise<void> {
  if (corriendoEnExpoGo || Platform.OS === "web") return;

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status: existente } = await Notifications.getPermissionsAsync();
    let status = existente;
    if (status !== "granted") {
      const { status: nuevo } = await Notifications.requestPermissionsAsync();
      status = nuevo;
    }
    if (status !== "granted") return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    await supabase.from("profiles").update({ push_token: tokenData.data }).eq("id", userId);
  } catch (e) {
    // No dejamos que un fallo de push notifications rompa el flujo de login.
    console.warn("No se pudo registrar el push token:", e);
  }
}
