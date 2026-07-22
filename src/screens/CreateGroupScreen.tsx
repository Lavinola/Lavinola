import React, { useState } from "react";
import { View, TextInput, Image, Pressable, StyleSheet, Alert, ScrollView } from "react-native";
import { supabase } from "../lib/supabase";
import { crearGrupo } from "../lib/groups";
import { posterUrl } from "../lib/tmdb";
import { Text, AppButton } from "../components/Themed";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

// Nota de seguridad: NO se permite subir fotos propias para la tapa/banner de
// un grupo (mismo criterio que en comentarios) — solo se puede elegir un
// backdrop real de una película/serie de TMDB (misma fuente que el banner
// de perfil), así no hay riesgo de que alguien suba contenido ilegal.
interface FotoElegida {
  path: string; // backdrop_path de TMDB
  referenciaTitulo: string;
}

export default function CreateGroupScreen({ navigation }: any) {
  const { t } = useT();
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tapaElegida, setTapaElegida] = useState<FotoElegida | null>(null);
  const [bannerElegido, setBannerElegido] = useState<FotoElegida | null>(null);
  const [creando, setCreando] = useState(false);
  const [visibilidad, setVisibilidad] = useState<"public" | "private">("public");

  function elegirTapa() {
    navigation.navigate("ElegirImagenTmdb", {
      titulo: "Elegí una película o serie de referencia para la TAPA del grupo",
      modo: "posters",
      onElegir: (path: string, ref: { titulo: string }) => setTapaElegida({ path, referenciaTitulo: ref.titulo }),
    });
  }

  function elegirBanner() {
    navigation.navigate("ElegirImagenTmdb", {
      titulo: "Elegí una película o serie de referencia para el BANNER del grupo",
      modo: "backdrops",
      onElegir: (path: string, ref: { titulo: string }) => setBannerElegido({ path, referenciaTitulo: ref.titulo }),
    });
  }

  async function confirmar() {
    if (!nombre.trim()) return;
    setCreando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      await crearGrupo({
        creatorId: userId,
        name: nombre.trim(),
        description: descripcion.trim() || null,
        photoUrl: tapaElegida ? posterUrl(tapaElegida.path, "w500") : null,
        bannerUrl: bannerElegido ? posterUrl(bannerElegido.path, "w780") : tapaElegida ? posterUrl(tapaElegida.path, "w780") : null,
        photoSource: "tmdb",
        visibility: visibilidad,
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("No se pudo crear el grupo", e.message);
    } finally {
      setCreando(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.label}>{t("Nombre del grupo")}</Text>
      <TextInput
        placeholderTextColor={theme.colors.textFaint}
        style={styles.input}
        placeholder={t("Ej: Sitcoms, Fans de Harry Potter...")}
        value={nombre}
        onChangeText={setNombre}
      />

      <Text style={styles.label}>{t("Descripción")}</Text>
      <TextInput
        placeholderTextColor={theme.colors.textFaint}
        style={[styles.input, styles.inputMultilinea]}
        placeholder={t("Contá de qué se trata el grupo...")}
        value={descripcion}
        onChangeText={setDescripcion}
        multiline
        maxLength={300}
      />

      <Text style={styles.label}>{t("¿Quién puede entrar?")}</Text>
      <View style={styles.visibilidadRow}>
        <Pressable style={[styles.visibilidadChip, visibilidad === "public" && styles.visibilidadChipActivo]} onPress={() => setVisibilidad("public")}>
          <Text style={[styles.visibilidadChipTexto, visibilidad === "public" && styles.visibilidadChipTextoActivo]}>{t("Público")}</Text>
        </Pressable>
        <Pressable style={[styles.visibilidadChip, visibilidad === "private" && styles.visibilidadChipActivo]} onPress={() => setVisibilidad("private")}>
          <Text style={[styles.visibilidadChipTexto, visibilidad === "private" && styles.visibilidadChipTextoActivo]}>{t("Privado")}</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>
        {visibilidad === "public" ? t("Cualquiera lo puede ver y unirse directo.") : t("Aparece en la lista con un candadito, pero hay que pedirte permiso para entrar.")}
      </Text>

      <Text style={styles.label}>{t("Tapa del grupo (se ve en la lista de grupos)")}</Text>
      <Text style={styles.hint}>{t("Buscá una película o serie de referencia y elegí una de sus imágenes.")}</Text>
      {tapaElegida && (
        <>
          <Image source={{ uri: posterUrl(tapaElegida.path, "w500")! }} style={styles.previaTapa} />
          <Text style={styles.referenciaTexto}>{t('De "{nombre}"').replace("{nombre}", tapaElegida.referenciaTitulo)}</Text>
        </>
      )}
      <AppButton title={tapaElegida ? t("Cambiar tapa") : t("Elegir tapa")} variant="outline" onPress={elegirTapa} />

      <Text style={styles.label}>{t("Banner del grupo (se ve grande arriba, al entrar)")}</Text>
      <Text style={styles.hint}>{t("Si no elegís uno, usamos la misma tapa.")}</Text>
      {bannerElegido && (
        <>
          <Image source={{ uri: posterUrl(bannerElegido.path, "w780")! }} style={styles.previaBanner} />
          <Text style={styles.referenciaTexto}>{t('De "{nombre}"').replace("{nombre}", bannerElegido.referenciaTitulo)}</Text>
        </>
      )}
      <AppButton title={bannerElegido ? t("Cambiar banner") : t("Elegir banner")} variant="outline" onPress={elegirBanner} />

      <View style={{ height: 20 }} />
      <AppButton title={creando ? t("Creando...") : t("Crear grupo")} onPress={confirmar} disabled={creando || !nombre.trim()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  label: { fontSize: 14, fontWeight: "700", marginTop: 16, marginBottom: 4 },
  hint: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 8 },
  visibilidadRow: { flexDirection: "row", gap: 8 },
  visibilidadChip: { flex: 1, paddingVertical: 10, borderRadius: theme.radius.pill, alignItems: "center", borderWidth: 1, borderColor: theme.colors.border },
  visibilidadChipActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  visibilidadChipTexto: { fontSize: 13, color: theme.colors.textMuted, fontWeight: "700" },
  visibilidadChipTextoActivo: { color: "#000000" },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 10, color: theme.colors.text, backgroundColor: theme.colors.surface },
  inputMultilinea: { minHeight: 70, textAlignVertical: "top" },
  previaTapa: { width: 100, height: 100, borderRadius: 8, marginBottom: 4, backgroundColor: theme.colors.surfaceAlt },
  previaBanner: { width: "100%", aspectRatio: 16 / 9, borderRadius: 8, marginBottom: 4, backgroundColor: theme.colors.surfaceAlt },
  referenciaTexto: { fontSize: 11, color: theme.colors.textFaint, marginBottom: 8 },
});
