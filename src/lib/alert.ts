// src/lib/alert.ts
//
// Reemplazo drop-in de `Alert` de react-native. Misma firma exacta
// (Alert.alert(titulo, mensaje?, botones?)), así que en cualquier archivo
// alcanza con cambiar de dónde se importa — no hay que tocar la lógica.
//
// Por qué existe: `Alert.alert` de React Native no muestra nada en la web
// (react-native-web no lo implementa con una UI visible) — la llamada corre
// pero el usuario no ve ningún mensaje. En nativo (Android/iOS) seguimos
// usando el Alert real de React Native tal cual, sin cambios de
// comportamiento.

import { Alert as RNAlert, Platform } from "react-native";

export type AlertButtonStyle = "default" | "cancel" | "destructive";

export interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: AlertButtonStyle;
}

type ShowFn = (titulo: string, mensaje?: string, botones?: AlertButton[]) => void;

let mostrarEnWeb: ShowFn | null = null;

/** Lo llama GlobalAlertHost al montarse, para poder recibir los alerts. */
export function registrarHandlerWeb(fn: ShowFn | null) {
  mostrarEnWeb = fn;
}

export const Alert = {
  alert(titulo: string, mensaje?: string, botones?: AlertButton[]) {
    if (Platform.OS === "web") {
      if (mostrarEnWeb) {
        mostrarEnWeb(titulo, mensaje, botones);
      } else {
        // Red de seguridad por si se llama antes de que GlobalAlertHost
        // esté montado (no debería pasar en la práctica).
        console.warn("Alert.alert llamado en web antes de montar GlobalAlertHost:", titulo, mensaje);
      }
      return;
    }
    RNAlert.alert(titulo, mensaje, botones as any);
  },
};
