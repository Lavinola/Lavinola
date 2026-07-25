import React from "react";
import { ScrollView, View, StyleSheet, Linking } from "react-native";
import { Text } from "../components/Themed";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Seccion {
  titulo: string;
  parrafos: string[];
}

export default function PrivacyPolicyScreen() {
  const { t } = useT();

  const secciones: Seccion[] = [
    {
      titulo: t("1. Qué datos recolectamos"),
      parrafos: [
        t("Cuando creás una cuenta y usás la app, guardamos:"),
        t("• Datos de cuenta: tu dirección de email y la contraseña (encriptada), o tu cuenta de Google si elegís ingresar así."),
        t("• Datos de perfil: nombre de usuario, foto de perfil (opcional), banner (opcional), frase de perfil (opcional), y país."),
        t("• Actividad dentro de la app: series y películas que marcás como vistas o pendientes, capítulos vistos, calificaciones, listas, comentarios y reacciones, grupos, a quién seguís."),
        t("• Datos técnicos básicos para mantener tu sesión iniciada."),
      ],
    },
    {
      titulo: t("2. Cómo usamos tus datos"),
      parrafos: [
        t("• Para mostrarte tu propio historial, estadísticas y recomendaciones."),
        t("• Para las funciones sociales de la app: mostrar tu actividad a quienes te siguen, comentar, armar listas, participar en grupos."),
        t("• Para moderar contenido y mantener la comunidad segura."),
        t("• Nunca vendemos tus datos personales a terceros."),
      ],
    },
    {
      titulo: t("3. Servicios de terceros que usamos"),
      parrafos: [
        t("• Supabase — aloja nuestra base de datos, autenticación y almacenamiento de archivos."),
        t("• TMDB (The Movie Database) — posters, sinopsis, fechas de estreno y datos de episodios. Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB."),
        t("• OMDb — calificaciones de IMDb."),
        t("• Giphy — los GIFs que podés adjuntar en comentarios y chats."),
        t("• TMDB Watch Providers (con datos de JustWatch) — dónde ver cada título según tu país."),
        t("Estos servicios reciben únicamente la información necesaria para cumplir su función, no tu identidad completa."),
      ],
    },
    {
      titulo: t("4. Importación de datos de otras apps"),
      parrafos: [
        t("Si elegís importar tu historial desde TV Time o Letterboxd, el archivo que subís se procesa para identificar tus series y películas contra la base de TMDB, y solo se guarda el resultado en tu cuenta. El archivo original no se conserva una vez procesado."),
      ],
    },
    {
      titulo: t("5. Contenido generado por usuarios y moderación"),
      parrafos: [
        t("Los comentarios, listas y publicaciones que hacés son visibles según la configuración de privacidad de cada función. No permitimos subir fotos en comentarios, precisamente para minimizar riesgos de contenido inapropiado."),
        t("Lavinola no tiene mensajería libre entre usuarios: en su lugar, podés compartir un título puntual con una nota corta opcional. Este contenido se almacena igual que el resto de tu actividad."),
        t("Contamos con un sistema de reportes, filtros automáticos de texto, y moderación humana. El equipo de Lavinola puede revisar contenido (incluyendo notas de títulos compartidos) cuando: (a) fue reportado por otro usuario, (b) un filtro automático lo marcó como potencialmente problemático, o (c) existe sospecha razonable de actividad ilícita. No revisamos contenido de forma rutinaria o indiscriminada fuera de estos casos."),
      ],
    },
    {
      titulo: t("6. Tus opciones"),
      parrafos: [
        t("• Podés editar o eliminar tu perfil, listas y comentarios en cualquier momento desde la app."),
        t("• Podés eliminar tu cuenta por completo desde Ajustes."),
        t("• Podés dejar de seguir a alguien, silenciar notificaciones, o bloquear a otro usuario."),
      ],
    },
    {
      titulo: t("7. Menores de edad"),
      parrafos: [t("Lavinola no está dirigida a menores de 13 años, y no recolectamos intencionalmente datos de menores de esa edad.")],
    },
    {
      titulo: t("8. Cambios a esta política"),
      parrafos: [t("Si actualizamos esta política, publicamos la nueva versión en esta misma pantalla y en lavinola.vercel.app/privacidad.html.")],
    },
    {
      titulo: t("9. Contacto"),
      parrafos: [t("Ante cualquier duda sobre esta política o tus datos, escribinos a applavinola@gmail.com")],
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.h1}>{t("Política de Privacidad de Lavinola: Cine & Series")}</Text>
      <Text style={styles.fecha}>{t("Última actualización: julio de 2026")}</Text>

      {secciones.map((s, i) => (
        <View key={i} style={styles.seccion}>
          <Text style={styles.h2}>{s.titulo}</Text>
          {s.parrafos.map((p, j) => (
            <Text key={j} style={styles.parrafo}>
              {p}
            </Text>
          ))}
        </View>
      ))}

      <Text style={styles.link} onPress={() => Linking.openURL("https://lavinola.vercel.app/privacidad.html")}>
        {t("Ver esta política en el navegador →")}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  h1: { fontSize: 19, fontWeight: "800", color: theme.colors.text, marginBottom: 4 },
  fecha: { fontSize: 12, color: theme.colors.textFaint, marginBottom: 18 },
  seccion: { marginBottom: 18 },
  h2: { fontSize: 14.5, fontWeight: "700", color: theme.colors.primaryLight, marginBottom: 6 },
  parrafo: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 19, marginBottom: 6 },
  link: { fontSize: 13, color: theme.colors.primaryLight, fontWeight: "700", marginTop: 8 },
});
