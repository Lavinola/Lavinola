import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Lavinola] Faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Copiá .env.example a .env y completá."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // En el celular usamos nuestro propio manejo del link de vuelta (ver
    // AuthScreen). En la web, en cambio, esto SÍ tiene que estar prendido —
    // es lo que hace que, apenas Google te redirige de vuelta a la página,
    // Supabase detecte la sesión sola desde la URL.
    detectSessionInUrl: Platform.OS === "web",
  },
});
