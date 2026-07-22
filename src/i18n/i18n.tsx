import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { traducir, Idioma } from "./translations";

interface AppLanguageContextType {
  idioma: Idioma;
  locale: string;
  setIdiomaDesdeCodigo: (contentLanguage: string) => void;
  t: (texto: string) => string;
}

const LOCALE_POR_IDIOMA: Record<Idioma, string> = {
  es: "es-419",
  en: "en-US",
  pt: "pt-BR",
  it: "it-IT",
};

const AppLanguageContext = createContext<AppLanguageContextType>({
  idioma: "es",
  locale: "es-419",
  setIdiomaDesdeCodigo: () => {},
  t: (texto) => texto,
});

/** De "en-US" / "es-419" / "pt-BR" / "it-IT" (etc) a la familia que tenemos traducida. Cualquier idioma sin traducciones propias cae en inglés. */
function familiaDeIdioma(contentLanguage: string | null | undefined): Idioma {
  if (!contentLanguage) return "es";
  const base = contentLanguage.slice(0, 2).toLowerCase();
  if (base === "es") return "es";
  if (base === "pt") return "pt";
  if (base === "it") return "it";
  return "en";
}

export function AppLanguageProvider({ children }: { children: React.ReactNode }) {
  const [idioma, setIdioma] = useState<Idioma>("es");

  useEffect(() => {
    cargarIdiomaInicial();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) cargarIdiomaDelPerfil(session.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function cargarIdiomaInicial() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) cargarIdiomaDelPerfil(data.session.user.id);
  }

  async function cargarIdiomaDelPerfil(userId: string) {
    const { data } = await supabase.from("profiles").select("content_language").eq("id", userId).maybeSingle();
    setIdioma(familiaDeIdioma(data?.content_language));
  }

  function setIdiomaDesdeCodigo(contentLanguage: string) {
    setIdioma(familiaDeIdioma(contentLanguage));
  }

  function t(texto: string) {
    return traducir(texto, idioma);
  }

  return <AppLanguageContext.Provider value={{ idioma, locale: LOCALE_POR_IDIOMA[idioma], setIdiomaDesdeCodigo, t }}>{children}</AppLanguageContext.Provider>;
}

/** Hook para traducir texto de la interfaz: `const { t } = useT(); ... <Text>{t("Editar perfil")}</Text>` */
export function useT() {
  return useContext(AppLanguageContext);
}
