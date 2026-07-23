// src/components/GlobalAlertHost.tsx
//
// Se monta una sola vez, en la raíz de la app (App.tsx). Se conecta con
// src/lib/alert.ts para mostrar en web, con la estética de Lavinola
// (ConfirmModal), cualquier llamada a Alert.alert hecha desde cualquier
// pantalla del proyecto. En nativo no hace nada (ahí Alert.alert sigue
// usando el Alert real de React Native).

import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import ConfirmModal from "./ConfirmModal";
import { registrarHandlerWeb, AlertButton } from "../lib/alert";

interface EstadoAlert {
  titulo: string;
  mensaje?: string;
  botones?: AlertButton[];
}

export default function GlobalAlertHost() {
  const [estado, setEstado] = useState<EstadoAlert | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    registrarHandlerWeb((titulo, mensaje, botones) => {
      setEstado({ titulo, mensaje, botones });
    });
    return () => registrarHandlerWeb(null);
  }, []);

  if (Platform.OS !== "web") return null;

  const botonesBase = estado?.botones && estado.botones.length > 0 ? estado.botones : [{ text: "OK" }];

  const botones = botonesBase.map((b) => ({
    label: b.text || "OK",
    onPress: () => b.onPress?.(),
    // El único botón que no es "cancel" queda destacado (violeta); si hay
    // varios no-cancel, el último (normalmente la acción principal).
    destacado: b.style !== "cancel" && b === botonesBase.filter((x) => x.style !== "cancel").slice(-1)[0],
  }));

  return (
    <ConfirmModal
      visible={!!estado}
      onCerrar={() => setEstado(null)}
      titulo={estado?.titulo ?? ""}
      mensaje={estado?.mensaje}
      botones={botones}
    />
  );
}
