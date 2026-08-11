import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

/**
 * Reporte de errores en producción — cuando algo se rompe para un usuario
 * real (una pantalla que crashea, un pedido a la base que falla de forma
 * inesperada), esto lo manda a Sentry para que se entere el dueño de la
 * app, en vez de que quede un error silencioso que solo ve el usuario.
 *
 * Si no hay DSN configurado (variable de entorno EXPO_PUBLIC_SENTRY_DSN
 * vacía — típicamente en desarrollo local), Sentry.init no hace nada y
 * las llamadas a reportarError/reportarMensaje no rompen nada, solo no
 * mandan nada a ningún lado. Así el resto del código puede llamarlas
 * siempre, sin tener que chequear si Sentry está configurado o no.
 */

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function inicializarReporteDeErrores() {
  if (!DSN) {
    console.log("Sentry: no hay EXPO_PUBLIC_SENTRY_DSN configurado, el reporte de errores queda desactivado.");
    return;
  }
  Sentry.init({
    dsn: DSN,
    // Environment separa los errores de desarrollo/testing de los de
    // producción real en el dashboard de Sentry, para no mezclar ruido de
    // pruebas con errores de usuarios reales.
    environment: __DEV__ ? "development" : "production",
    release: Constants.expoConfig?.version ? `lavinola@${Constants.expoConfig.version}` : undefined,
    // Cuántos eventos de "traza de rendimiento" se mandan — 20% alcanza para
    // tener una idea de qué tan rápido/lenta anda la app sin generar
    // volumen de más (esto es aparte de los errores, que siempre se mandan
    // todos).
    tracesSampleRate: 0.2,
    enabled: !__DEV__, // en desarrollo local no tiene sentido mandar nada
  });
}

/** Identifica al usuario actual en los reportes — así, cuando aparece un error en el dashboard, se puede ver a quién le pasó (útil para ayudarlo puntualmente si hace falta). */
export function identificarUsuarioEnReportes(userId: string | null, username?: string | null) {
  if (!DSN) return;
  if (!userId) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: userId, username: username ?? undefined });
}

/** Reporta una excepción puntual — para usar en los catch de acciones importantes (guardar algo, pagar, etc.), además de mostrarle el error al usuario con Alert. */
export function reportarError(error: unknown, contexto?: Record<string, any>) {
  if (!DSN) {
    console.error("Error (Sentry desactivado):", error, contexto);
    return;
  }
  Sentry.captureException(error, contexto ? { extra: contexto } : undefined);
}

/** Para dejar una miga de pan en el reporte sin que sea un error en sí — por ejemplo, "el usuario tocó guardar" justo antes de que algo falle, para tener más contexto de qué llevó al error. */
export function dejarMigaDePan(mensaje: string, categoria?: string) {
  if (!DSN) return;
  Sentry.addBreadcrumb({ message: mensaje, category: categoria ?? "app", level: "info" });
}

export { Sentry };
