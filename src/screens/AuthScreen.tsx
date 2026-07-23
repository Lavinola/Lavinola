import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Image, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import CountryPickerField from "../components/CountryPickerField";
import SelectField from "../components/SelectField";
import { supabase } from "../lib/supabase";
import { idiomaSugeridoPorPais, IDIOMAS } from "../lib/languages";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

// Si Supabase no responde en este tiempo, avisamos en vez de dejar el botón
// girando para siempre (causa más común: URL/key mal copiada en el .env, o
// sin conexión a internet real aunque el WiFi esté "conectado").
const TIMEOUT_MS = 15000;

function conTimeout<T>(promesa: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promesa),
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error("No hay respuesta del servidor. Revisá tu conexión a internet y que las claves en el archivo .env estén bien copiadas.")),
        ms
      )
    ),
  ]);
}

// Mínimo 6 caracteres y al menos un número.
function passwordValida(pass: string): boolean {
  return pass.length >= 6 && /\d/.test(pass);
}

export default function AuthScreen() {
  const { t, setIdiomaDesdeCodigo } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [country, setCountry] = useState("AR");
  const [idiomaElegido, setIdiomaElegido] = useState("es-419");
  const [idiomaTocadoAMano, setIdiomaTocadoAMano] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [enviandoReset, setEnviandoReset] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [errorLogin, setErrorLogin] = useState("");

  async function iniciarConGoogle() {
    setLoadingGoogle(true);

    // En la web, el mecanismo de "abrir una ventana y volver por un link
    // especial" (pensado para el celular) no funciona igual — ahí es más
    // simple: mandamos la misma pestaña directo a Google, y cuando vuelve,
    // Supabase detecta la sesión sola desde la URL (ver supabase.ts).
    if (Platform.OS === "web") {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) {
        Alert.alert(t("No se pudo iniciar sesión con Google"), error.message);
        setLoadingGoogle(false);
      }
      // Si no hubo error, el navegador ya está yendo hacia Google — no hay
      // nada más para hacer acá, la página se va a recargar sola al volver.
      return;
    }

    try {
      const redirectTo = Linking.createURL("auth-callback");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No se pudo iniciar el login con Google.");

      const resultado = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (resultado.type !== "success" || !resultado.url) {
        setLoadingGoogle(false);
        return; // el usuario canceló o cerró la ventana, no es un error
      }

      // El link de vuelta trae los tokens en el fragmento (#access_token=...&refresh_token=...).
      const params = new URLSearchParams(resultado.url.split("#")[1] ?? resultado.url.split("?")[1] ?? "");
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (!access_token || !refresh_token) throw new Error("No pudimos completar el login con Google. Probá de nuevo.");

      const { error: sesionError } = await supabase.auth.setSession({ access_token, refresh_token });
      if (sesionError) throw sesionError;
      // A partir de acá, el listener de sesión del resto de la app (App.tsx)
      // detecta la sesión activa y navega adentro solo — no hace falta nada más.
    } catch (e: any) {
      Alert.alert(t("No se pudo iniciar sesión con Google"), e.message ?? t("Probá de nuevo en un rato."));
    } finally {
      setLoadingGoogle(false);
    }
  }

  function elegirPais(codigoPais: string) {
    setCountry(codigoPais);
    if (!idiomaTocadoAMano) {
      const sugerido = idiomaSugeridoPorPais(codigoPais);
      setIdiomaElegido(sugerido);
      setIdiomaDesdeCodigo(sugerido);
    }
  }

  async function olvideContrasena() {
    if (!email.trim()) {
      Alert.alert("Escribí tu email", "Poné tu email arriba y volvé a tocar el link para recuperar tu contraseña.");
      return;
    }
    setEnviandoReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: "lavinola://reset-password" });
      if (error) throw error;
      Alert.alert("Listo", "Te mandamos un mail para elegir una contraseña nueva. Revisá tu bandeja de entrada (y spam).");
    } catch (e: any) {
      Alert.alert("No se pudo enviar", e.message);
    } finally {
      setEnviandoReset(false);
    }
  }

  async function handleSubmit() {
    setErrorLogin("");
    if (!email.trim() || !password) {
      Alert.alert("Faltan datos", "Completá el email y la contraseña.");
      return;
    }

    if (isSignUp) {
      if (!username.trim()) {
        Alert.alert("Falta el usuario", "Elegí un nombre de usuario.");
        return;
      }
      if (!passwordValida(password)) {
        Alert.alert("Contraseña débil", "Tiene que tener al menos 6 caracteres y un número.");
        return;
      }
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const usernameLimpio = username.trim().toLowerCase().replace(/\s/g, "");

        // Chequeo de disponibilidad ANTES de crear la cuenta, para no dejar
        // una cuenta de auth creada si el usuario ya está tomado.
        const { data: existente } = await conTimeout(
          supabase.from("profiles").select("id").ilike("username", usernameLimpio).maybeSingle(),
          TIMEOUT_MS
        );
        if (existente) {
          Alert.alert("Usuario ocupado", "Ese nombre de usuario ya lo tiene otra persona, probá con otro.");
          setLoading(false);
          return;
        }

        const { data, error } = await conTimeout(
          supabase.auth.signUp({
            email,
            password,
            options: { data: { username: usernameLimpio, country, content_language: idiomaElegido } },
          }),
          TIMEOUT_MS
        );
        if (error) throw error;
        // El perfil (profiles) se crea solo, del lado del servidor, con un
        // trigger en auth.users — así funciona aunque todavía no haya
        // sesión activa (caso típico: falta confirmar el mail).

        if (!data.session) {
          Alert.alert(
            "Cuenta creada",
            "Te mandamos un mail para confirmar la cuenta. Abrilo, tocá el link de confirmación, y después volvé acá para iniciar sesión."
          );
          setIsSignUp(false);
        }
      } else {
        const { error } = await conTimeout(supabase.auth.signInWithPassword({ email, password }), TIMEOUT_MS);
        if (error) {
          const mensaje = error.message.toLowerCase();
          if (mensaje.includes("email not confirmed")) {
            Alert.alert("Falta confirmar el mail", "Revisá tu casilla y tocá el link de confirmación antes de entrar.");
          } else if (mensaje.includes("invalid login credentials") || mensaje.includes("invalid_credentials")) {
            setErrorLogin(t("Email o contraseña inválida."));
          } else {
            throw error;
          }
          return;
        }
      }
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Algo salió mal, probá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#000000" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Image source={require("../../assets/logo-full.png")} style={[styles.logo, isSignUp && styles.logoChico]} resizeMode="contain" />

      <Pressable style={styles.googleBtn} onPress={iniciarConGoogle} disabled={loadingGoogle}>
        {loadingGoogle ? (
          <ActivityIndicator color="#1F1F1F" />
        ) : (
          <>
            <Image source={require("../../assets/google-logo.png")} style={styles.googleLogo} resizeMode="contain" />
            <Text style={styles.googleBtnText}>{isSignUp ? t("Registrarte con Google") : t("Continuar con Google")}</Text>
          </>
        )}
      </Pressable>

      <View style={styles.divisorRow}>
        <View style={styles.divisorLinea} />
        <Text style={styles.divisorTexto}>{t("o con tu mail")}</Text>
        <View style={styles.divisorLinea} />
      </View>

      {isSignUp && (
        <TextInput
          style={styles.input}
          placeholder={t("Nombre de usuario")}
          placeholderTextColor={theme.colors.textFaint}
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
        />
      )}

      <TextInput
        style={styles.input}
        placeholder={t("Email")}
        placeholderTextColor={theme.colors.textFaint}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (errorLogin) setErrorLogin("");
        }}
      />
      <View style={styles.passwordWrap}>
        <TextInput
          style={[styles.input, styles.passwordInput]}
          placeholder={t("Contraseña")}
          placeholderTextColor={theme.colors.textFaint}
          secureTextEntry={!mostrarPassword}
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (errorLogin) setErrorLogin("");
          }}
        />
        <Pressable style={styles.ojitoBtn} onPress={() => setMostrarPassword((v) => !v)} hitSlop={10}>
          <Ionicons name={mostrarPassword ? "eye-off" : "eye"} size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>
      {!!errorLogin && <Text style={styles.errorText}>{errorLogin}</Text>}
      {isSignUp && <Text style={styles.hint}>{t("Mínimo 6 caracteres, con al menos un número.")}</Text>}

      {!isSignUp && (
        <Pressable onPress={olvideContrasena} disabled={enviandoReset} style={{ alignSelf: "flex-end", marginTop: -6, marginBottom: 12 }}>
          <Text style={styles.olvideTexto}>{enviandoReset ? "Enviando..." : t("¿Olvidaste tu contraseña?")}</Text>
        </Pressable>
      )}

      {isSignUp && (
        <View style={styles.paisWrapper}>
          <Text style={styles.label}>{t("País de residencia")}</Text>
          <CountryPickerField valor={country} onCambiar={elegirPais} />
        </View>
      )}

      {isSignUp && (
        <View style={styles.paisWrapper}>
          <Text style={styles.label}>{t("Idioma")}</Text>
          <SelectField
            opciones={IDIOMAS.map((i) => ({ value: i.code, label: i.label }))}
            valor={idiomaElegido}
            onCambiar={(v) => {
              setIdiomaElegido(v);
              setIdiomaTocadoAMano(true);
              setIdiomaDesdeCodigo(v);
            }}
            titulo={t("Idioma")}
          />
        </View>
      )}

      <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
        {loading ? (
          <ActivityIndicator color={theme.colors.text} />
        ) : (
          <Text style={styles.submitBtnText}>{isSignUp ? t("Crear cuenta") : t("Iniciar sesión")}</Text>
        )}
      </Pressable>

      <Text style={styles.toggle} onPress={() => setIsSignUp(!isSignUp)}>
        {isSignUp ? t("¿Ya tenés cuenta? Iniciá sesión") : t("¿No tenés cuenta? Registrate")}
      </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#000000" },
  logo: { width: 220, height: 220, alignSelf: "center", marginBottom: 32 },
  logoChico: { width: 130, height: 130, marginBottom: 16 },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    marginBottom: 14,
  },
  googleLogo: { width: 20, height: 20 },
  googleBtnText: { color: "#1F1F1F", fontWeight: "700", fontSize: 15 },
  divisorRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  divisorLinea: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },
  divisorTexto: { color: theme.colors.textFaint, fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    padding: 11,
    marginBottom: 10,
  },
  passwordWrap: { position: "relative", justifyContent: "center" },
  passwordInput: { paddingRight: 44 },
  ojitoBtn: { position: "absolute", right: 12, top: 0, bottom: 10, justifyContent: "center" },
  hint: { fontSize: 11, color: theme.colors.textFaint, marginTop: -6, marginBottom: 10 },
  errorText: { fontSize: 12, color: "#FF6B6B", marginTop: -4, marginBottom: 10 },
  label: { marginBottom: 6, color: theme.colors.textMuted, fontSize: 13 },
  paisWrapper: { marginBottom: 12 },
  pickerBox: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  picker: { color: theme.colors.text },
  pickerItem: { color: theme.colors.text },
  submitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitBtnText: { color: "#000000", fontWeight: "700", fontSize: 15 },
  toggle: { textAlign: "center", marginTop: 14, color: theme.colors.primaryLight },
  olvideTexto: { color: theme.colors.primaryLight, fontSize: 12 },
});
