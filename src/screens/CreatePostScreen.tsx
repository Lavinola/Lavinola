import React, { useState } from "react";
import { useT } from "../i18n/i18n";
import { View, TextInput, Image, Pressable, StyleSheet, ScrollView } from "react-native";
import { AvoidSoftInputView, useSoftInputState } from "react-native-avoid-softinput";
import { Alert } from "../lib/alert";
import { Text, AppButton } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { crearPost } from "../lib/posts";
import { posterUrl } from "../lib/tmdb";
import { theme } from "../theme";

interface Props {
  route: {
    params: {
      itemType: "series" | "movie" | "episode";
      tmdbId: number;
      seasonNumber?: number;
      episodeNumber?: number;
      nombre: string;
      subtitulo?: string | null;
      posterPath?: string | null;
    };
  };
  navigation: any;
}

export default function CreatePostScreen({ route, navigation }: Props) {
  const { t } = useT();
  const { itemType, tmdbId, seasonNumber, episodeNumber, nombre, subtitulo, posterPath } = route.params;
  const [texto, setTexto] = useState("");
  const [esSpoiler, setEsSpoiler] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const estadoTeclado = useSoftInputState();

  async function publicar() {
    if (!texto.trim()) return;
    setPublicando(true);
    try {
      const { data: userData } = await supabase.auth.getSession();
      const userId = userData.session?.user?.id;
      if (!userId) return;
      await crearPost({
        userId,
        itemType,
        tmdbId,
        seasonNumber: seasonNumber ?? null,
        episodeNumber: episodeNumber ?? null,
        content: texto,
        hasSpoiler: esSpoiler,
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert(t("No se pudo publicar"), e.message);
    } finally {
      setPublicando(false);
    }
  }

  return (
    <AvoidSoftInputView style={{ flex: 1 }} avoidOffset={16}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <View style={styles.tituloRow}>
          {posterPath && <Image source={{ uri: posterUrl(posterPath, "w185")! }} style={styles.poster} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.tituloNombre} numberOfLines={2}>
              {nombre}
            </Text>
            {subtitulo && <Text style={styles.subtitulo}>{subtitulo}</Text>}
          </View>
        </View>

        <TextInput
          style={styles.input}
          placeholder={t("¿Qué querés contar sobre esto?")}
          placeholderTextColor={theme.colors.textFaint}
          value={texto}
          onChangeText={setTexto}
          multiline
          maxLength={2000}
          autoFocus
        />

        <Pressable style={styles.spoilerRow} onPress={() => setEsSpoiler(!esSpoiler)}>
          <View style={[styles.checkbox, esSpoiler && styles.checkboxActivo]}>{esSpoiler && <Text style={styles.checkboxTilde}>✓</Text>}</View>
          <View style={{ flex: 1 }}>
            <Text style={styles.spoilerLabel}>{t("¿Tiene spoiler?")}</Text>
            <Text style={styles.spoilerHint}>{t('Si decís que sí, tu mensaje aparece oculto hasta que alguien toque "Ver".')}</Text>
          </View>
        </Pressable>

        <View style={{ height: 16 }} />
        <AppButton title={publicando ? t("Publicando...") : t("Publicar en el Lobby")} onPress={publicar} disabled={publicando || !texto.trim()} />
      </ScrollView>
    </AvoidSoftInputView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  tituloRow: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 8, marginBottom: 16 },
  poster: { width: 48, height: 48, borderRadius: 6, marginRight: 10, backgroundColor: theme.colors.surfaceAlt },
  tituloNombre: { fontSize: 14, fontWeight: "700" },
  subtitulo: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    padding: 12,
    minHeight: 144,
    lineHeight: 20,
    textAlignVertical: "top",
    fontSize: 15,
  },
  spoilerRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 16, gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center", marginTop: 2 },
  checkboxActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  checkboxTilde: { color: "#000000", fontWeight: "800", fontSize: 13 },
  spoilerLabel: { fontSize: 14, fontWeight: "700" },
  spoilerHint: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
});
