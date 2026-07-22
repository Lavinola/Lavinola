import React from "react";
import { View, ActivityIndicator, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts, RobotoSlab_700Bold } from "@expo-google-fonts/roboto-slab";
import RootNavigation from "./src/navigation";
import { AppLanguageProvider } from "./src/i18n/i18n";
import { theme } from "./src/theme";

export default function App() {
  const [fontsLoaded] = useFonts({
    RobotoSlab_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const contenido = (
    <AppLanguageProvider>
      <StatusBar style="auto" />
      <RootNavigation />
    </AppLanguageProvider>
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
