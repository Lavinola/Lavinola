// src/components/GlobalOnboardingHost.tsx
//
// Se monta una sola vez en la raíz de la app (App.tsx). Muestra el cartel
// de bienvenida automáticamente la primera vez que alguien entra (una sola
// vez por dispositivo), y también cuando se llama a abrirAyuda() desde
// cualquier lugar — por ejemplo el botón "?" del header.

import React, { useEffect, useState } from "react";
import OnboardingModal from "./OnboardingModal";
import { registrarHandlerAyuda, mostrarAyudaSiEsPrimeraVez } from "../lib/onboarding";

export default function GlobalOnboardingHost() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    registrarHandlerAyuda(() => setVisible(true));
    mostrarAyudaSiEsPrimeraVez();
    return () => registrarHandlerAyuda(null);
  }, []);

  return <OnboardingModal visible={visible} onCerrar={() => setVisible(false)} />;
}
