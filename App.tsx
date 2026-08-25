import React from "react";
import { View, ActivityIndicator, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts, RobotoSlab_700Bold } from "@expo-google-fonts/roboto-slab";
import RootNavigation from "./src/navigation";
import { AppLanguageProvider } from "./src/i18n/i18n";
import { theme } from "./src/theme";
import GlobalAlertHost from "./src/components/GlobalAlertHost";
import ErrorBoundary from "./src/components/ErrorBoundary";
import OfflineBanner from "./src/components/OfflineBanner";
import UpdateGate from "./src/components/UpdateGate";
import { inicializarReporteDeErrores } from "./src/lib/errorReporting";

inicializarReporteDeErrores();

export default function App() {
  const [fontsLoaded] = useFonts({
    RobotoSlab_700Bold,
  });

  React.useEffect(() => {
    // El navegador le pone a los campos de texto un recuadro/borde de foco
    // por defecto (para accesibilidad) — como ya mostramos nuestro propio
    // estilo de foco (bordes violeta, etc.), sacamos ese recuadro extra del
    // navegador en toda la web, no solo en un campo puntual.
    if (Platform.OS === "web") {
      const style = document.createElement("style");
      style.textContent = `
        input, textarea, select { outline: none !important; }
        *:focus { outline: none !important; }
      `;
      document.head.appendChild(style);
    }
  }, []);

  if (!fontsLoaded) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaProvider>
    );
  }

  const contenido = (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AppLanguageProvider>
          <StatusBar style="auto" />
          <UpdateGate>
            <View style={{ flex: 1 }}>
              <OfflineBanner />
              <RootNavigation />
            </View>
          </UpdateGate>
          <GlobalAlertHost />
        </AppLanguageProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );

  // En la web, en pantallas anchas (compu), mostramos la app centrada con un
  // ancho tipo "celular" en vez de estirada por toda la pantalla — así se ve
  // intencional, no como una app de celular rota en una pantalla grande.
  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000", alignItems: "center" }}>
        <View style={{ flex: 1, width: "100%", maxWidth: 900 }}>{contenido}</View>
      </View>
    );
  }

  return contenido;
}
