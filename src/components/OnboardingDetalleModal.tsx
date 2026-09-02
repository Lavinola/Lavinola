import React, { useEffect, useState } from "react";
import { View, Pressable, ScrollView, StyleSheet, BackHandler, NativeSyntheticEvent, NativeScrollEvent, useWindowDimensions } from "react-native";
import { Text } from "./Themed";
import { theme } from "../theme";
import { useT } from "../i18n/i18n";

interface Props {
  visible: boolean;
  onCerrar: () => void;
}

interface Seccion {
  titulo: string;
  pasos: string[];
}

export default function OnboardingDetalleModal({ visible, onCerrar }: Props) {
  const { t } = useT();
  const { height: alturaVentana } = useWindowDimensions();
  const [scrollY, setScrollY] = useState(0);

  // Este componente se abre desde ADENTRO del <Modal> de OnboardingModal.
  // Usar acá otro <Modal> de React Native crea dos ventanas nativas de Android
  // superpuestas al mismo tiempo, lo que rompe la captura de gestos de scroll.
  // Por eso esto es una capa superpuesta común (position: absolute) dentro del
  // mismo árbol nativo del modal padre, no un modal nativo nuevo.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onCerrar();
      return true;
    });
    return () => sub.remove();
  }, [visible, onCerrar]);

  const secciones: Seccion[] = [
    {
      titulo: t("Perfil"),
      pasos: [
        t("Editá tu foto de perfil, banner, nombre y una frase corta de alguna película que te represente."),
        t("Estadísticas: tiempo total dedicado a series y películas, cantidad de capítulos vistos, y más."),
        t("Guardá tus series y películas preferidas en Favoritos."),
        t("Armá listas propias para agrupar títulos, y compartilas con quien quieras."),
      ],
    },
    {
      titulo: t("Explorar"),
      pasos: [
        t("Descubrí películas y series en tendencia, y recomendaciones para vos."),
        t("Top mensual: lo más visto y mejor calificado del mes."),
        t("Noticias: enterate de estrenos y novedades del mundo del cine y las series."),
      ],
    },
    {
      titulo: t("Comunidad"),
      pasos: [
        t("Lobby: mirá lo que están comentando y compartiendo otros usuarios."),
        t("Grupos: creá o sumate a comunidades temáticas para hablar de tus series y películas favoritas."),
        t("Chats: compartí un título puntual con alguien que sigas."),
      ],
    },
    {
      titulo: t("Películas"),
      pasos: [
        t("Lista Pendiente: las películas que marcaste para ver, todavía no vistas."),
        t("Próximamente: películas marcadas que aún no se estrenaron, ordenadas por fecha."),
      ],
    },
    {
      titulo: t("Series"),
      pasos: [
        t("Lista Pendiente: tus series con capítulos por ver, con acceso directo al próximo."),
        t("Próximamente: calendario con los estrenos de los capítulos de las series que seguís."),
      ],
    },
    {
      titulo: t("Detalle de películas o series"),
      pasos: [
        t("Poder ver en qué plataforma verlo, el puntaje de Lavinola e IMDb, sinopsis, trailer y reparto. Podés cambiarle la tapa y el banner a tu gusto."),
        t("Podés comentar o leer comentarios de ese título. También podés ver quiénes tienen esa película o serie en sus favoritos."),
        t("Con la flechita violeta podés recomendarle la película o serie a alguien o publicar tu review en el Lobby."),
        t("Una vez que la terminás, la podés calificar, elegir cómo te sentiste y tu actor/actriz favorito. También podés modificar la fecha en que la viste."),
      ],
    },
    {
      titulo: t("Importar desde TV Time o Letterboxd"),
      pasos: [
        t("Perfil → Ajustes → Importar datos."),
        t("Subís el archivo (ZIP completo de TV Time, o los CSV sueltos de TV Time/Letterboxd)."),
        t("Lavinola identifica tus títulos solo contra TMDB — si hay dudas en algún caso puntual, te va a preguntar cuál es el correcto."),
      ],
    },
  ];

  if (!visible) return null;

  return (
    <View style={styles.overlayAbs} pointerEvents="box-none">
      <Pressable style={styles.fondo} onPress={onCerrar}>
        {/* "caja" es un View común, no un Pressable — se sacó el
        stopPropagation() de acá porque un Pressable ENVOLVIENDO al
        ScrollView es sospechoso de interceptar el gesto de scroll en
        Android. Como toda la caja está ocupada por contenido interactivo
        (ScrollView, botón), tocar el margen angosto sin contenido cierra
        el modal igual que tocar afuera — no se pierde nada importante. */}
        <View style={[styles.caja, { height: alturaVentana * 0.75 }]}>
          <Text style={{ backgroundColor: "red", color: "white", padding: 8, fontSize: 12, fontWeight: "700" }}>
            DEBUG onboarding: scrollY={Math.round(scrollY)} (deslizá el dedo arriba — si este número no cambia, avisame)
          </Text>
          <Text style={styles.titulo}>{t("Cómo usar Lavinola")}</Text>

          <ScrollView
            style={styles.lista}
            contentContainerStyle={styles.listaContenido}
            showsVerticalScrollIndicator={true}
            overScrollMode="always"
            onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => setScrollY(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={32}
          >
            {secciones.map((s, i) => (
              <View key={i} style={styles.seccion}>
                <Text style={styles.seccionTitulo}>{s.titulo}</Text>
                {s.pasos.map((p, j) => (
                  <View key={j} style={styles.pasoFila}>
                    <Text style={styles.pasoPunto}>•</Text>
                    <Text style={styles.pasoTexto}>{p}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          <Pressable style={styles.boton} onPress={onCerrar}>
            <Text style={styles.botonTexto}>{t("Cerrar")}</Text>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayAbs: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, elevation: 50 },
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 24 },
  caja: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 20,
    overflow: "hidden",
  },
  titulo: { fontSize: 17, fontWeight: "800", color: theme.colors.text, textAlign: "center", marginBottom: 12 },
  lista: { flexGrow: 1, flexShrink: 1, minHeight: 0, alignSelf: "stretch" },
  listaContenido: { paddingRight: 4 },
  seccion: { marginBottom: 14 },
  seccionTitulo: { fontSize: 13, fontWeight: "700", color: theme.colors.primaryLight, marginBottom: 5 },
  pasoFila: { flexDirection: "row", marginBottom: 3, paddingRight: 4 },
  pasoPunto: { fontSize: 11, color: theme.colors.textMuted, marginRight: 6, lineHeight: 16 },
  pasoTexto: { flex: 1, fontSize: 11, color: theme.colors.textMuted, lineHeight: 16 },
  boton: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 10,
  },
  botonTexto: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
});
