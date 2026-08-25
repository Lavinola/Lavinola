import React from "react";
import { View, Platform, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { theme } from "../theme";

/**
 * El tráiler insertado directo en la pantalla, con el reproductor OFICIAL
 * de YouTube (no descargamos ni reproducimos el video nosotros, solo lo
 * mostramos con su propio player embebido) — así la persona le da play
 * sin salir de la app, en vez de que la mande a abrir YouTube aparte.
 */
export default function TrailerEmbed({ youtubeKey }: { youtubeKey: string }) {
  // El "origin" y el header "Referer" son necesarios para que YouTube
  // autorice la reproducción embebida — sin ellos, el reproductor
  // rechaza el video con el "Error 153: Error de configuración del
  // reproductor de video" (un problema documentado y común al mostrar
  // YouTube dentro de un WebView nativo, no algo propio de esta app).
  const origen = "https://lavinola.app";
  const src = `https://www.youtube.com/embed/${youtubeKey}?playsinline=1&rel=0&origin=${encodeURIComponent(origen)}`;

  return (
    <View style={styles.wrap}>
      {Platform.OS === "web" ? (
        // @ts-ignore — en web, react-native-web deja pasar elementos de HTML nativos como children de View
        <iframe
          src={src}
          style={{ width: "100%", height: "100%", border: "none" }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <WebView
          source={{ uri: src, headers: { Referer: origen } }}
          style={{ flex: 1, backgroundColor: "#000000" }}
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", aspectRatio: 16 / 9, borderRadius: theme.radius.md, overflow: "hidden", backgroundColor: "#000000" },
});
