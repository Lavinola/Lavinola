import React, { useEffect, useState } from "react";
import { View, Image, TextInput, Switch, Pressable, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { Alert } from "../lib/alert";
import { Text, AppButton } from "../components/Themed";
import SelectField from "../components/SelectField";
import CountryPickerField from "../components/CountryPickerField";
import ConfirmModal from "../components/ConfirmModal";
import Toast from "../components/Toast";
import { supabase } from "../lib/supabase";
import { getPerfil, actualizarPerfil, PerfilCompleto } from "../lib/profile";
import { setTmdbLanguage } from "../lib/tmdb";
import { IDIOMAS } from "../lib/languages";
import { exportarDatosJSON, exportarDatosCSV } from "../lib/dataExport";
import TopPills from "../components/TopPills";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type SubTab = "cuenta" | "aplicacion";

export default function SettingsScreen({ navigation }: any) {
  const [subTab, setSubTab] = useState<SubTab>("cuenta");
  const { t } = useT();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TopPills
        opciones={[
          { key: "cuenta", label: t("Cuenta") },
          { key: "aplicacion", label: t("Aplicación") },
        ]}
        valor={subTab}
        onCambiar={setSubTab}
      />
      {subTab === "cuenta" && <TabCuenta navigation={navigation} />}
      {subTab === "aplicacion" && <TabAplicacion navigation={navigation} />}
    </View>
  );
}

// ============================================================
// CUENTA
// ============================================================
function TabCuenta({ navigation }: any) {
  const { t } = useT();
  const [perfil, setPerfil] = useState<PerfilCompleto | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [mostrarCambioPass, setMostrarCambioPass] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [instagram, setInstagram] = useState("");
  const [twitter, setTwitter] = useState("");
  const [tiktok, setTiktok] = useState("");

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    const { data: userData } = await supabase.auth.getUser();
    setEmail(userData.user?.email ?? null);
    const uid = userData.user?.id ?? null;
    setUserId(uid);
    if (!uid) return;
    const p = await getPerfil(uid);
    if (p) {
      setPerfil(p);
      setInstagram((p as any).social_instagram ?? "");
      setTwitter((p as any).social_twitter ?? "");
      setTiktok((p as any).social_tiktok ?? "");
    }
  }

  async function cambiarPassword() {
    if (pass1.length < 6) {
      Alert.alert(t("Contraseña muy corta"), t("Mínimo 6 caracteres."));
      return;
    }
    if (pass1 !== pass2) {
      Alert.alert(t("No coinciden"), t("Las dos contraseñas tienen que ser iguales."));
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: pass1 });
    if (error) {
      Alert.alert(t("Error"), error.message);
      return;
    }
    Alert.alert(t("Listo"), t("Tu contraseña se actualizó."));
    setMostrarCambioPass(false);
    setPass1("");
    setPass2("");
  }

  async function guardarRedes() {
    if (!userId) return;
    await actualizarPerfil(userId, {
      social_instagram: instagram.trim() || null,
      social_twitter: twitter.trim() || null,
      social_tiktok: tiktok.trim() || null,
    } as any);
    setToastVisible(true);
  }

  async function togglePrivado(valor: boolean) {
    if (!userId) return;
    await actualizarPerfil(userId, { is_private: valor } as any);
    setPerfil((p) => (p ? ({ ...p, is_private: valor } as any) : p));
  }

  const [confirmTipo, setConfirmTipo] = useState<"cerrar_sesion" | "eliminar_cuenta" | null>(null);

  function confirmarCerrarSesion() {
    setConfirmTipo("cerrar_sesion");
  }

  function confirmarEliminarCuenta() {
    setConfirmTipo("eliminar_cuenta");
  }

  async function eliminarCuentaDeVerdad() {
    let motivoError: string | null = null;
    try {
      const { data, error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      if (!data?.ok) motivoError = data?.motivo ?? t("No se pudo eliminar la cuenta. Probá de nuevo.");
    } catch (e: any) {
      console.error("Error al eliminar cuenta:", e);
      let detalle = e?.message ?? "";
      // Si el fetch a la función devolvió una respuesta con cuerpo (ej. un
      // error 401/500 con JSON), lo mostramos — así se sabe si es un problema
      // de autenticación, de que la función no está deployada, o algo interno.
      try {
        if (e?.context?.json) {
          const body = await e.context.json();
          if (body?.motivo) detalle = body.motivo;
        } else if (e?.context?.status) {
          detalle = `${detalle} (HTTP ${e.context.status})`;
        }
      } catch {
        // si no se pudo leer el cuerpo, nos quedamos con e.message tal cual
      }
      motivoError = detalle || t("Revisá tu conexión, o que la función 'delete-account' esté deployada en Supabase.");
    }

    // Pase lo que pase con la respuesta de arriba (éxito, error, o que se haya
    // cortado la conexión justo después de borrar), lo único que importa de
    // verdad es si la cuenta TODAVÍA existe. A veces el borrado del lado del
    // servidor termina bien pero la respuesta nunca llega completa al
    // celular — eso se veía como "error" acá aunque en los hechos ya estaba
    // borrada. Chequeamos la sesión real antes de decidir qué mostrar.
    const { data: sesionActual, error: errorSesion } = await supabase.auth.getUser();
    const cuentaSigueExistiendo = !errorSesion && !!sesionActual?.user;

    if (!cuentaSigueExistiendo) {
      await supabase.auth.signOut();
      return; // el listener de sesión del resto de la app ya se encarga de mandar a la pantalla de login
    }

    if (motivoError) Alert.alert(t("No se pudo eliminar la cuenta"), motivoError);
  }

  return (
    <>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container}>
      <Text style={styles.seccionTitulo}>{t("Identificación")}</Text>
      <Text style={styles.label}>{t("Nombre de usuario")}</Text>
      <Pressable onPress={() => navigation.navigate("EditarPerfil")}>
        <Text style={styles.valorLink}>{perfil?.username ?? t("Elegir uno")}</Text>
      </Pressable>

      <Text style={styles.label}>{t("Correo electrónico")}</Text>
      <Text style={styles.valor}>{email}</Text>

      <Pressable onPress={() => setMostrarCambioPass(!mostrarCambioPass)}>
        <Text style={styles.link}>{t("Cambiar contraseña")}</Text>
      </Pressable>
      {mostrarCambioPass && (
        <View style={{ marginTop: 8 }}>
          <TextInput
            style={styles.input}
            placeholder={t("Nueva contraseña")}
            placeholderTextColor={theme.colors.textFaint}
            secureTextEntry
            value={pass1}
            onChangeText={setPass1}
          />
          <TextInput
            style={styles.input}
            placeholder={t("Repetir contraseña")}
            placeholderTextColor={theme.colors.textFaint}
            secureTextEntry
            value={pass2}
            onChangeText={setPass2}
          />
          <AppButton title={t("Guardar")} onPress={cambiarPassword} />
        </View>
      )}

      <Text style={styles.seccionTitulo}>{t("Redes sociales")}</Text>
      <TextInput style={styles.input} placeholder={t("Instagram (usuario)")} placeholderTextColor={theme.colors.textFaint} value={instagram} onChangeText={setInstagram} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder={t("Twitter / X (usuario)")} placeholderTextColor={theme.colors.textFaint} value={twitter} onChangeText={setTwitter} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder={t("TikTok (usuario)")} placeholderTextColor={theme.colors.textFaint} value={tiktok} onChangeText={setTiktok} autoCapitalize="none" />
      <AppButton title={t("Guardar")} onPress={guardarRedes} variant="outline" />

      <Text style={styles.seccionTitulo}>{t("Privacidad")}</Text>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchLabel}>{t("Perfil privado")}</Text>
          <Text style={styles.switchHint}>
            {t("Si lo activás, vas a tener que aprobar cada solicitud de seguimiento. Solo tus seguidores van a poder ver tu actividad.")}
          </Text>
        </View>
        <Switch value={!!perfil?.is_private} onValueChange={togglePrivado} trackColor={{ false: "#555555", true: theme.colors.primary }} />
      </View>

      <View style={{ height: 24 }} />
      <AppButton title={t("Cerrar sesión")} variant="muted" onPress={confirmarCerrarSesion} />
      <View style={{ height: 12 }} />
      <AppButton title={t("Eliminar cuenta")} variant="danger" onPress={confirmarEliminarCuenta} />
    </ScrollView>
    <ConfirmModal
      visible={confirmTipo === "cerrar_sesion"}
      onCerrar={() => setConfirmTipo(null)}
      titulo={t("Cerrar sesión")}
      mensaje={t("¿Seguro?")}
      botones={[
        { label: t("Cancelar"), onPress: () => {} },
        { label: t("Cerrar sesión"), onPress: () => supabase.auth.signOut(), destacado: true },
      ]}
    />
    <ConfirmModal
      visible={confirmTipo === "eliminar_cuenta"}
      onCerrar={() => setConfirmTipo(null)}
      titulo={t("Eliminar cuenta")}
      mensaje={t("Esto borra tu cuenta y todos tus datos (series vistas, comentarios, listas) para siempre. No se puede deshacer.")}
      botones={[
        { label: t("Cancelar"), onPress: () => {} },
        { label: t("Eliminar cuenta"), onPress: eliminarCuentaDeVerdad, destacado: true },
      ]}
    />
    <Toast visible={toastVisible} mensaje={`${t("Guardado")} — ${t("Tus redes sociales se actualizaron.")}`} onOcultar={() => setToastVisible(false)} />
    </>
  );
}

// ============================================================
// APLICACIÓN
// ============================================================

function TabAplicacion({ navigation }: any) {
  const { t, setIdiomaDesdeCodigo } = useT();
  const OPCIONES_NOTIFY_EPISODIO = [
    { value: "none", label: t("No notificar") },
    { value: "10min", label: t("10 minutos antes") },
    { value: "1hora", label: t("1 hora antes") },
    { value: "1dia", label: t("1 día antes") },
  ];
  const [perfil, setPerfil] = useState<PerfilCompleto | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [exportando, setExportando] = useState<"json" | "csv" | null>(null);

  async function exportar(formato: "json" | "csv") {
    if (!userId) return;
    setExportando(formato);
    try {
      if (formato === "json") await exportarDatosJSON(userId);
      else await exportarDatosCSV(userId);
    } catch (e: any) {
      Alert.alert("No se pudo exportar", e.message ?? "Probá de nuevo.");
    } finally {
      setExportando(null);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    setError(false);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);
    if (!uid) {
      setCargando(false);
      return;
    }
    const p = await getPerfil(uid);
    if (!p) setError(true);
    setPerfil(p);
    setCargando(false);
  }

  async function actualizar(cambios: Record<string, any>) {
    if (!userId) return;
    await actualizarPerfil(userId, cambios as any);
    setPerfil((p) => (p ? ({ ...p, ...cambios } as any) : p));

    if ("content_language" in cambios || "show_titles_in_own_language" in cambios) {
      const mostrarEnPropio = "show_titles_in_own_language" in cambios ? cambios.show_titles_in_own_language : (perfil as any)?.show_titles_in_own_language;
      const idioma = "content_language" in cambios ? cambios.content_language : (perfil as any)?.content_language;
      setTmdbLanguage(mostrarEnPropio === false ? "en-US" : idioma ?? "en-US");
    }
    if ("content_language" in cambios) {
      setIdiomaDesdeCodigo(cambios.content_language ?? "en-US");
    }
  }

  if (cargando) return <ActivityIndicator style={{ marginTop: 32 }} />;
  if (!perfil || error) {
    return (
      <View style={{ padding: 24, alignItems: "center" }}>
        <Text style={{ color: theme.colors.textMuted, marginBottom: 12 }}>{t("No se pudo cargar")}</Text>
        <AppButton title={t("Reintentar")} onPress={cargar} variant="outline" />
      </View>
    );
  }
  const p = perfil as any;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container}>
      <Text style={styles.seccionTitulo}>{t("Idioma de la aplicación")}</Text>
      <Text style={styles.switchHint}>
        {t("Este es el idioma que se usa para toda la app: menús, botones, y (si lo activás abajo) los títulos de películas y series.")}
      </Text>
      <SelectField
        opciones={IDIOMAS.map((i) => ({ value: i.code, label: i.label }))}
        valor={p.content_language ?? "en-US"}
        onCambiar={(v) => actualizar({ content_language: v })}
        titulo={t("Idioma de la aplicación")}
      />

      <Text style={styles.seccionTitulo}>{t("País de residencia")}</Text>
      <Text style={styles.switchHint}>
        {t("Se usa para mostrarte dónde ver cada título en tu país. Si te mudaste, cambialo acá y se actualiza solo.")}
      </Text>
      <CountryPickerField valor={p.country ?? "AR"} onCambiar={(v) => actualizar({ country: v })} />

      <Text style={styles.seccionTitulo}>{t("Títulos")}</Text>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchLabel}>{t("Mostrar en tu idioma")}</Text>
          <Text style={styles.switchHint}>{t("Los títulos se muestran en inglés por defecto.")}</Text>
        </View>
        <Switch
          value={p.show_titles_in_own_language !== false}
          onValueChange={(v) => actualizar({ show_titles_in_own_language: v })}
          trackColor={{ false: "#555555", true: theme.colors.primary }}
        />
      </View>

      <Text style={styles.seccionTitulo}>{t("Notificaciones")}</Text>
      <Text style={styles.label}>{t("Cuando sale un episodio nuevo")}</Text>
      <SelectField
        opciones={OPCIONES_NOTIFY_EPISODIO}
        valor={p.notify_episode_timing ?? "none"}
        onCambiar={(v) => actualizar({ notify_episode_timing: v })}
        titulo={t("¿Cuándo avisar?")}
      />

      <Text style={styles.label}>{t("Actividad")}</Text>
      <SwitchLinea etiqueta={t("Me gusta en posts/comentarios")} valor={p.notify_likes} onCambiar={(v) => actualizar({ notify_likes: v })} />
      <SwitchLinea etiqueta={t("Respuestas en posts/comentarios")} valor={p.notify_replies} onCambiar={(v) => actualizar({ notify_replies: v })} />
      <SwitchLinea etiqueta={t("Solicitudes de seguimiento")} valor={p.notify_follow_requests} onCambiar={(v) => actualizar({ notify_follow_requests: v })} />
      <SwitchLinea etiqueta={t("Mensajes privados")} valor={p.notify_messages} onCambiar={(v) => actualizar({ notify_messages: v })} />
      <SwitchLinea etiqueta={t("Mensajes en grupos privados")} valor={p.notify_group_messages_private !== false} onCambiar={(v) => actualizar({ notify_group_messages_private: v })} />
      <SwitchLinea etiqueta={t("Mensajes en grupos públicos")} valor={p.notify_group_messages_public !== false} onCambiar={(v) => actualizar({ notify_group_messages_public: v })} />

      <Text style={styles.seccionTitulo}>{t("Qué ven las personas que te siguen")}</Text>
      <SwitchLinea etiqueta={t("Películas favoritas")} valor={p.show_favorite_movies} onCambiar={(v) => actualizar({ show_favorite_movies: v })} />
      <SwitchLinea etiqueta={t("Series favoritas")} valor={p.show_favorite_series} onCambiar={(v) => actualizar({ show_favorite_series: v })} />
      <SwitchLinea etiqueta={t("Grupos en los que estás")} valor={p.show_groups} onCambiar={(v) => actualizar({ show_groups: v })} />
      <SwitchLinea etiqueta={t("Posts/Comentarios")} valor={p.show_comments} onCambiar={(v) => actualizar({ show_comments: v })} />
      <SwitchLinea etiqueta={t("Tiempo de visualización")} valor={p.show_watch_time} onCambiar={(v) => actualizar({ show_watch_time: v })} />

      <Text style={styles.seccionTitulo}>{t("Importar Datos")}</Text>
      <Pressable onPress={() => navigation.navigate("ImportarTVTime")}>
        <Text style={styles.link}>{t("Importar mi historial de TV Time o Letterboxd")}</Text>
      </Pressable>

      <Text style={styles.seccionTitulo}>{t("Tus datos")}</Text>
      <Text style={styles.switchHint}>{t("Descargá una copia de todo lo que guardaste en Lavinola.")}</Text>
      <View style={{ height: 8 }} />
      <AppButton title={exportando === "json" ? t("Preparando...") : t("Descargar en JSON")} onPress={() => exportar("json")} variant="outline" disabled={!!exportando} />
      <View style={{ height: 8 }} />
      <AppButton title={exportando === "csv" ? t("Preparando...") : t("Descargar en CSV")} onPress={() => exportar("csv")} variant="outline" disabled={!!exportando} />

      <View style={styles.tmdbFooter}>
        <Image source={require("../../assets/tmdb-logo.png")} style={styles.tmdbFooterLogo} resizeMode="contain" />
        <Text style={styles.tmdbFooterTexto}>
          This product uses the TMDB API but is not endorsed or certified by TMDB.{"\n"}Datos de streaming con atribución a JustWatch.
        </Text>
      </View>
    </ScrollView>
  );
}

function SwitchLinea({ etiqueta, valor, onCambiar }: { etiqueta: string; valor: boolean; onCambiar: (v: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <Text style={[styles.switchLabel, { flex: 1 }]}>{etiqueta}</Text>
      <Switch value={!!valor} onValueChange={onCambiar} trackColor={{ false: "#555555", true: theme.colors.primary }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  seccionTitulo: { fontSize: 16, fontWeight: "700", marginTop: 24, marginBottom: 8 },
  label: { fontSize: 13, color: theme.colors.textMuted, marginTop: 12, marginBottom: 4 },
  valor: { fontSize: 15, marginBottom: 4 },
  valorLink: { fontSize: 15, color: theme.colors.primaryLight, marginBottom: 4 },
  link: { color: theme.colors.primaryLight, fontSize: 14, marginTop: 4 },
  input: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: 10, marginBottom: 8 },
  pickerBox: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, overflow: "hidden" },
  switchRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  switchLabel: { fontSize: 14 },
  switchHint: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  proximamente: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  proximamenteTexto: { color: theme.colors.textMuted, textAlign: "center" },
  tmdbFooter: { alignItems: "center", marginTop: 32, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  tmdbFooterLogo: { width: 140, height: 14, marginBottom: 8 },
  tmdbFooterTexto: { fontSize: 10, color: theme.colors.textMuted, textAlign: "center", lineHeight: 14 },
});
