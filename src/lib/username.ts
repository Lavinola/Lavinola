import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

export type EstadoUsername = "vacio" | "muy_corto" | "revisando" | "disponible" | "ocupado" | "invalido";

const MIN_LARGO = 3;
// Mismo criterio de "limpieza" que ya se usaba antes de crear la cuenta.
export function limpiarUsername(valor: string): string {
  return valor.trim().toLowerCase().replace(/\s/g, "");
}

/**
 * Chequea en vivo (con un pequeño debounce) si un nombre de usuario está
 * disponible, mientras la persona todavía lo está escribiendo — sin esperar
 * a que apriete Guardar/Registrarse.
 *
 * @param username texto tal cual lo escribe la persona
 * @param usernameActual si es edición de perfil, el username que la persona
 *   ya tenía antes — así no se marca como "ocupado" su propio nombre actual.
 */
export function useDisponibilidadUsername(username: string, usernameActual?: string | null): EstadoUsername {
  const [estado, setEstado] = useState<EstadoUsername>("vacio");
  const idPedidoRef = useRef(0);

  useEffect(() => {
    const limpio = limpiarUsername(username);

    if (!limpio) {
      setEstado("vacio");
      return;
    }
    if (limpio.length < MIN_LARGO) {
      setEstado("muy_corto");
      return;
    }
    if (!/^[a-z0-9._]+$/.test(limpio)) {
      setEstado("invalido");
      return;
    }
    if (usernameActual && limpio === limpiarUsername(usernameActual)) {
      setEstado("disponible"); // es el mismo que ya tenía, no hace falta chequear nada
      return;
    }

    setEstado("revisando");
    const miId = ++idPedidoRef.current;
    const timeout = setTimeout(async () => {
      try {
        const { data } = await supabase.from("profiles").select("id").ilike("username", limpio).maybeSingle();
        if (idPedidoRef.current !== miId) return; // llegó tarde, ya hay un chequeo más nuevo en curso
        setEstado(data ? "ocupado" : "disponible");
      } catch {
        if (idPedidoRef.current === miId) setEstado("vacio"); // no bloqueamos por un error de red puntual
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [username, usernameActual]);

  return estado;
}
