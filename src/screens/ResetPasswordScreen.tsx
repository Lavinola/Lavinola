import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Alert } from "../lib/alert";
import { supabase } from "../lib/supabase";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

function passwordValida(pass: string): boolean {
  return pass.length >= 6 && /\d/.test(pass);
}

/** Se muestra cuando el usuario tocó el link de "recuperar contraseña" que le llegó por mail. */
export default function ResetPasswordScreen({ onListo }: { onListo: () => void }) {
  const { t } = useT();
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [loading, setLoading] = useState(false);

  async function guardar() {
    if (!passwordValida(pass1)) {
      Alert.alert("Contraseña débil", "Tiene que tener al menos 6 caracteres y un número.");
      return;
    }
    if (pass1 !== pass2) {
      Alert.alert("No coinciden", "Las dos contraseñas tienen que ser iguales.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pass1 });
      if (error) throw error;
      Alert.alert("Listo", "Tu contraseña se actualizó.");
      onListo();
    } catch (e: any) {
      Alert.alert("No se pudo actualizar", e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Elegí una contraseña nueva</Text>
      <TextInput
        style={styles.input}
        placeholder={t("Contraseña nueva")}
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
      <Text style={styles.hint}>Mínimo 6 caracteres, con al menos un número.</Text>
      <Pressable style={styles.boton} onPress={guardar} disabled={loading}>
        {loading ? <ActivityIndicator color={theme.colors.text} /> : <Text style={styles.botonTexto}>Guardar contraseña</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: theme.colors.background },
  titulo: { fontSize: 18, fontWeight: "700", color: theme.colors.text, marginBottom: 20, textAlign: "center" },
  input: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: 12, marginBottom: 12 },
  hint: { fontSize: 11, color: theme.colors.textFaint, marginTop: -8, marginBottom: 16 },
  boton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, padding: 14, alignItems: "center" },
  botonTexto: { color: "#000000", fontWeight: "700" },
});
