import React from "react";
import { View, StyleSheet } from "react-native";
import { Text, AppButton } from "./Themed";
import { theme } from "../theme";
import { reportarError } from "../lib/errorReporting";

interface Props {
  children: React.ReactNode;
}

interface State {
  huboError: boolean;
}

/**
 * Si algo se rompe al renderizar CUALQUIER pantalla de la app (un error
 * inesperado que ni siquiera un try/catch podría atajar, porque pasa
 * durante el render de React), sin esto la app queda con una pantalla en
 * blanco o directamente se cierra — una experiencia pésima y sin ninguna
 * pista de qué pasó, ni para el usuario ni para nosotros.
 *
 * Con este componente envolviendo toda la app: se reporta el error a
 * Sentry (para que nos enteremos y lo podamos arreglar), y se le muestra
 * al usuario una pantalla prolija con la opción de reintentar, en vez de
 * quedar colgado sin poder hacer nada.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { huboError: false };

  static getDerivedStateFromError(): State {
    return { huboError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportarError(error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.huboError) {
      return (
        <View style={styles.contenedor}>
          <Text style={styles.emoji}>😕</Text>
          <Text style={styles.titulo}>Algo salió mal</Text>
          <Text style={styles.texto}>
            Tuvimos un problema inesperado. Ya nos enteramos y lo vamos a revisar — mientras tanto, probá volver a intentarlo.
          </Text>
          <AppButton title="Reintentar" onPress={() => this.setState({ huboError: false })} />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center", padding: 32 },
  emoji: { fontSize: 48, marginBottom: 16 },
  titulo: { fontSize: 20, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  texto: { fontSize: 14, color: theme.colors.textMuted, textAlign: "center", marginBottom: 24, lineHeight: 20 },
});
