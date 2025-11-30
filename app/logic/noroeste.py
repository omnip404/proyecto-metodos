# app/logic/noroeste.py

class MetodoNoroeste:
    def __init__(self, costos, oferta, demanda):
        self.costos = [fila[:] for fila in costos]
        self.oferta = oferta[:]
        self.demanda = demanda[:]
        self.filas = len(oferta)
        self.columnas = len(demanda)

        self.asignaciones = [
            [0 for _ in range(self.columnas)]
            for _ in range(self.filas)
        ]

        self.pasos = []  # Registro de todos los pasos

    def resolver(self):
        i = 0
        j = 0

        # contador de seguridad para evitar loops infinitos
        iteraciones = 0
        max_iter = (self.filas + self.columnas) * 100

        while i < self.filas and j < self.columnas:
            # seguridad: evitar bucle si algo quedó en 0 y no avanzamos
            if iteraciones > max_iter:
                # registrar paso de error/escape y romper
                self.pasos.append({
                    "error": "Límite de iteraciones alcanzado - posible estado inconsistente",
                    "oferta_restante": self.oferta[:],
                    "demanda_restante": self.demanda[:]
                })
                break

            # saltar filas/columnas agotadas para avanzar correctamente
            if self.oferta[i] == 0:
                i += 1
                iteraciones += 1
                continue
            if self.demanda[j] == 0:
                j += 1
                iteraciones += 1
                continue

            asignar = min(self.oferta[i], self.demanda[j])

            # en caso anómalo de asignación 0, avanzar para evitar estancamiento
            if asignar <= 0:
                if self.oferta[i] == 0:
                    i += 1
                if self.demanda[j] == 0:
                    j += 1
                iteraciones += 1
                continue

            self.asignaciones[i][j] = asignar

            # Registrar paso (guardar estado después de la asignación para claridad)
            self.pasos.append({
                "celda": (i, j),
                "costo": self.costos[i][j],
                "asignacion": asignar,
                "oferta_restante": None,  # se rellenará tras la actualización
                "demanda_restante": None
            })

            # Actualizar oferta y demanda
            self.oferta[i] -= asignar
            self.demanda[j] -= asignar

            # actualizar los últimos pasos registrados con el estado real
            self.pasos[-1]["oferta_restante"] = self.oferta[:]
            self.pasos[-1]["demanda_restante"] = self.demanda[:]

            # Avanzar fila o columna
            if self.oferta[i] == 0:
                i += 1
            if self.demanda[j] == 0:
                j += 1

            iteraciones += 1

        return {
            "asignaciones": self.asignaciones,
            "pasos": self.pasos
        }
