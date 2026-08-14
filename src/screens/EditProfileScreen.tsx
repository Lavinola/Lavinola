import React, { useEffect, useState, useRef } from "react";
import { View, TextInput, Image, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "../lib/alert";
import { Text, AppButton } from "../components/Themed";
import Avatar from "../components/Avatar";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { supabase } from "../lib/supabase";
import { getPerfil, actualizarPerfil, getCoverPosterPath, PerfilCompleto } from "../lib/profile";
import { posterUrl } from "../lib/tmdb";
import { useT } from "../i18n/i18n";
import { useDisponibilidadUsername } from "../lib/username";
import UsernameEstadoIndicador from "../components/UsernameEstadoIndicador";
import { theme } from "../theme";

const FRASE_MAX = 110; // aprox. lo que entra en dos renglones en el ancho del perfil

export default function EditProfileScreen({ navigation }: any) {
  const { t } = useT();
  const [perfil, setPerfil] = useState<PerfilCompleto | null>(null);
  const [username, setUsername] = useState("");
  const estadoUsername = useDisponibilidadUsername(username, perfil?.username);
  const [displayName, setDisplayName] = useState("");
  const [fraseFavorita, setFraseFavorita] = useState("");
  const [instagram, setInstagram] = useState("");
  const [twitter, setTwitter] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);
    if (!uid) return;
    const p = await getPerfil(uid);
    if (p) {
      setPerfil(p);
      setUsername(p.username ?? "");
      setDisplayName(p.display_name ?? "");
      setFraseFavorita(p.favorite_quote ?? "");
      setInstagram((p as any).social_instagram ?? "");
      setTwitter((p as any).social_twitter ?? "");
      setTiktok((p as any).social_tiktok ?? "");
      setCoverPath(await getCoverPosterPath(p));
    }
  }

  async function elegirAvatar() {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert(t("Sin permiso"), t("Necesitamos acceso a tus fotos para elegir un avatar."));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0] || !userId) return;

    try {
      const asset = res.assets[0];
      // OJO: NO usar fetch(uri).blob() acá — en Expo Go/Hermes eso tira
      // "Network request failed" con archivos locales en varios dispositivos
      // Android. Leemos el archivo como base64 (con expo-file-system, o el
      // que ya viene en el asset) y lo pasamos a ArrayBuffer, que es lo que
      // supabase-js necesita para subirlo a Storage de forma confiable.
      const base64 = asset.base64 ?? (await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }));
      const nombreArchivo = `${userId}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("avatars").upload(nombreArchivo, decode(base64), { contentType: "image/jpeg" });
      if (error) {
        Alert.alert(t("No se pudo subir la foto"), error.message);
        return;
      }
      const { data: publicUrl } = supabase.storage.from("avatars").getPublicUrl(nombreArchivo);
      setPerfil((p) => (p ? { ...p, avatar_url: publicUrl.publicUrl } : p));
    } catch (e: any) {
      Alert.alert(t("No se pudo subir la foto"), e.message ?? "Revisá tu conexión y probá de nuevo.");
    }
  }

  async function guardar() {
    if (!userId) return;
    if (estadoUsername === "ocupado") {
      Alert.alert(t("Usuario ocupado"), t("Ese nombre de usuario ya lo tiene otra persona, probá con otro."));
      return;
    }
    if (estadoUsername === "invalido") {
      Alert.alert(t("Usuario inválido"), t("Solo se permiten letras, números, puntos o guiones bajos."));
      return;
    }
    setGuardando(true);
    try {
      const usernameLimpio = username.trim().toLowerCase().replace(/\s/g, "");
      if (usernameLimpio && usernameLimpio !== (perfil?.username ?? "").toLowerCase()) {
        const { data: existente } = await supabase.from("profiles").select("id").ilike("username", usernameLimpio).neq("id", userId).maybeSingle();
        if (existente) {
          Alert.alert(t("Usuario ocupado"), t("Ese nombre de usuario ya lo tiene otra persona, probá con otro."));
          setGuardando(false);
          return;
        }
      }
      await actualizarPerfil(userId, {
        username: usernameLimpio || null,
        display_name: displayName.trim() || null,
        favorite_quote: fraseFavorita.trim() || null,
        social_instagram: instagram.trim() || null,
        social_twitter: twitter.trim() || null,
        social_tiktok: tiktok.trim() || null,
        avatar_url: perfil?.avatar_url ?? null,
        username_placeholder: false,
      } as any);
      navigation.goBack();
    } catch (e: any) {
      if (e.message?.includes("profiles_username_key") || e.message?.includes("duplicate key")) {
        Alert.alert(t("Usuario ocupado"), t("Ese nombre de usuario ya lo tiene otra persona, probá con otro."));
      } else {
        Alert.alert("Error", e.message);
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 110 : 24}>
    <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Pressable style={styles.avatarRow} onPress={elegirAvatar}>
        <Avatar uri={perfil?.avatar_url} size={56} style={styles.avatar} />
        <Text style={styles.link}>{t("Elegir foto de perfil")}</Text>
      </Pressable>

      <Pressable style={styles.avatarRow} onPress={() => navigation.navigate("ElegirPortada")}>
        {coverPath ? (
          <Image source={{ uri: posterUrl(coverPath, "w185")! }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.avatarPlaceholder]} />
        )}
        <Text style={styles.link}>{t("Elegir foto de portada")}</Text>
      </Pressable>

      <Text style={styles.label}>{t("Nombre de usuario (único, para que te busquen)")}</Text>
      <TextInput
        style={styles.input}
        value={username}
        onChangeText={(texto) => setUsername(texto.replace(/\s/g, "").toLowerCase().slice(0, 14))}
        placeholder={t("ej: marro")}
        placeholderTextColor={theme.colors.textFaint}
        autoCapitalize="none"
        maxLength={14}
      />
      <Text style={styles.contadorCaracteres}>{username.length}/14</Text>
      <UsernameEstadoIndicador estado={estadoUsername} />

      <Text style={styles.label}>{t("Nombre para mostrar")}</Text>
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={(texto) => setDisplayName(texto.slice(0, 15))}
        placeholder={t("Cómo querés que te vean")}
        placeholderTextColor={theme.colors.textFaint}
        maxLength={15}
      />
      <Text style={styles.contadorCaracteres}>{displayName.length}/15</Text>

      <Text style={styles.label}>{t("Tu frase (opcional)")}</Text>
      <TextInput
        style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
        value={fraseFavorita}
        onChangeText={setFraseFavorita}
        placeholder={t("Escribí tu frase favorita de alguna película o serie, o lo que quieras")}
        placeholderTextColor={theme.colors.textFaint}
        multiline
        maxLength={FRASE_MAX}
        onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200)}
      />
      <Text style={styles.contadorFrase}>
        {fraseFavorita.length}/{FRASE_MAX}
      </Text>

      <Text style={styles.seccionTitulo}>{t("Redes sociales")}</Text>
      <View style={styles.campoConIcono}>
        <Ionicons name="logo-instagram" size={20} color={theme.colors.primaryLight} style={styles.iconoRed} />
        <TextInput
          style={[styles.input, styles.inputConIcono]}
          placeholder={t("Instagram (usuario)")}
          placeholderTextColor={theme.colors.textFaint}
          value={instagram}
          onChangeText={setInstagram}
          autoCapitalize="none"
        />
      </View>
      <View style={styles.campoConIcono}>
        <Ionicons name="logo-x" size={20} color={theme.colors.primaryLight} style={styles.iconoRed} />
        <TextInput
          style={[styles.input, styles.inputConIcono]}
          placeholder={t("Twitter / X (usuario)")}
          placeholderTextColor={theme.colors.textFaint}
          value={twitter}
          onChangeText={setTwitter}
          autoCapitalize="none"
        />
      </View>
      <View style={styles.campoConIcono}>
        <Ionicons name="logo-tiktok" size={20} color={theme.colors.primaryLight} style={styles.iconoRed} />
        <TextInput
          style={[styles.input, styles.inputConIcono]}
          placeholder={t("TikTok (usuario)")}
          placeholderTextColor={theme.colors.textFaint}
          value={tiktok}
          onChangeText={setTiktok}
          autoCapitalize="none"
        />
      </View>

      <View style={{ height: 40 }} />
      <AppButton title={guardando ? t("Guardando...") : t("Guardar cambios")} onPress={guardar} disabled={guardando} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  seccionTitulo: { fontSize: 16, fontWeight: "700", marginTop: 24, marginBottom: 8 },
  campoConIcono: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  iconoRed: { width: 20 },
  inputConIcono: { flex: 1, marginBottom: 0 },
  contadorCaracteres: { fontSize: 11, color: theme.colors.textFaint, textAlign: "right", marginTop: 3, marginBottom: 6 },
  container: { padding: 16, paddingBottom: 100 },
  avatarRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  avatar: { width: 56, height: 56, borderRadius: 28, marginRight: 12, backgroundColor: theme.colors.surfaceAlt },
  cover: { width: 56, height: 56, borderRadius: 8, marginRight: 12, backgroundColor: theme.colors.surfaceAlt },
  avatarPlaceholder: {},
  link: { color: theme.colors.primaryLight, fontSize: 14 },
  label: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: 12 },
  contadorFrase: { fontSize: 11, color: theme.colors.textFaint, textAlign: "right", marginTop: 4 },
  pickerBox: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, overflow: "hidden" },
});
