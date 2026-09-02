import React from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { Text } from "../components/Themed";
import { theme } from "../theme";
import { useT } from "../i18n/i18n";

// Antes esto era un modal (OnboardingDetalleModal, abierto desde adentro
// del modal de bienvenida). Después de varias vueltas el scroll ahí adentro
// nunca terminó de andar bien en Android — algo específico de esa
// combinación de modal-dentro-de-modal/overlay rompía el gesto de scroll,
// pese a que la MISMA estructura (Pressable + ScrollView) funciona sin
// problema en el resto de la app. En vez de seguir peleando contra eso, se
// convirtió en una pantalla común de navegación (con su propio header y
// flecha de "atrás"), igual que cualquier otra pantalla donde el scroll sí
// anda bien siempre (como la del actor, o "Insignias").

interface Seccion {
  titulo: string;
  pasos: string[];
}

export default function ComoUsarLavinolaScreen() {
  const { t } = useT();

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  contenido: { padding: 20, paddingBottom: 40 },
  seccion: { marginBottom: 20 },
  seccionTitulo: { fontSize: 15, fontWeight: "800", color: theme.colors.primaryLight, marginBottom: 8 },
  pasoFila: { flexDirection: "row", marginBottom: 6, paddingRight: 4 },
  pasoPunto: { fontSize: 13, color: theme.colors.textMuted, marginRight: 8, lineHeight: 19 },
  pasoTexto: { flex: 1, fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 },
});
