# app/logic/vogel.py

class MetodoVogel:
    def __init__(self, costos, oferta, demanda):
        self.costos = [fila[:] for fila in costos]  # copia profunda
        self.oferta = oferta[:]
        self.demanda = demanda[:]
        self.filas = len(oferta)
        self.columnas = len(demanda)
        
        self.asignaciones = [
            [0 for _ in range(self.columnas)]
            for _ in range(self.filas)
        ]
        
        self.pasos = []  # lista de pasos explicados

    def _is_available(self, i, j):
        # Celda disponible si costo no es None y oferta/demanda siguen > 0
        if self.costos[i][j] is None: 
            return False
        return (self.oferta[i] > 0) and (self.demanda[j] > 0)

    def calcular_penalizaciones(self):
        """
        Calcula penalizaciones fila y columna.
        Penalización = diferencia entre los dos costos más bajos disponibles.
        Ignora entradas None y filas/columnas con oferta/demanda == 0.
        Devuelve listas: [(penal, idx), ...] para filas y columnas.
        """
        penal_filas = []
        penal_columnas = []

        # Penalizaciones por fila
        for i in range(self.filas):
            if self.oferta[i] > 0:
                costos_validos = [self.costos[i][j] for j in range(self.columnas) if self._is_available(i, j)]
                costos_validos = [c for c in costos_validos if c is not None]
                if len(costos_validos) >= 2:
                    costos_validos.sort()
                    penal_filas.append((costos_validos[1] - costos_validos[0], i))
                elif len(costos_validos) == 1:
                    penal_filas.append((costos_validos[0], i))
                else:
                    penal_filas.append((-1, i))
            else:
                penal_filas.append((-1, i))

        # Penalizaciones por columna
        for j in range(self.columnas):
            if self.demanda[j] > 0:
                costos_validos = [self.costos[i][j] for i in range(self.filas) if self._is_available(i, j)]
                costos_validos = [c for c in costos_validos if c is not None]
                if len(costos_validos) >= 2:
                    costos_validos.sort()
                    penal_columnas.append((costos_validos[1] - costos_validos[0], j))
                elif len(costos_validos) == 1:
                    penal_columnas.append((costos_validos[0], j))
                else:
                    penal_columnas.append((-1, j))
            else:
                penal_columnas.append((-1, j))

        return penal_filas, penal_columnas

    def mayor_penalizacion(self, penal_filas, penal_columnas):
        """
        Devuelve (tipo, pos, tie_info)
        tipo = "fila" o "columna"
        pos  = índice elegido
        tie_info = dict con detalles si hubo empate
        REGLA: elegir la penalización más alta; si hay empate entre varias,
               escoger el candidato (fila o columna) cuyo menor costo disponible sea el menor.
               Si sigue empate, elegir el candidato con menor índice numérico.
        """
        # obtener valor máximo de penal
        max_fila_pen = max([p for p, _ in penal_filas])
        max_col_pen = max([p for p, _ in penal_columnas])
        max_pen = max(max_fila_pen, max_col_pen)

        # candidatos filas/columnas con esa penalización
        cand_filas = [i for p, i in penal_filas if p == max_pen]
        cand_cols = [j for p, j in penal_columnas if p == max_pen]

        # función para obtener el menor costo disponible dentro de una fila/col
        def min_cost_in_row(i):
            vals = [self.costos[i][j] for j in range(self.columnas) if self._is_available(i, j)]
            vals = [v for v in vals if v is not None]
            return min(vals) if vals else float("inf")

        def min_cost_in_col(j):
            vals = [self.costos[i][j] for i in range(self.filas) if self._is_available(i, j)]
            vals = [v for v in vals if v is not None]
            return min(vals) if vals else float("inf")

        # construir lista de candidatos (tipo, idx, min_cost, tie_index)
        candidates = []
        for i in cand_filas:
            candidates.append(("fila", i, min_cost_in_row(i), i))
        for j in cand_cols:
            candidates.append(("columna", j, min_cost_in_col(j), j))

        # si hay candidatos, elegir el que tiene min(min_cost); si empate, min(tie_index)
        if candidates:
            # ordenar por min_cost asc, then tie_index asc, tipo (fila before columna) to be deterministic
            candidates.sort(key=lambda x: (x[2], x[3], 0 if x[0]=="fila" else 1))
            tipo, pos, minc, _ = candidates[0]
            tie_info = {"tie": len(candidates) > 1, "reason": "min_cost_then_index", "candidates": [(c[0], c[1], c[2]) for c in candidates]}
            return tipo, pos, tie_info

        # fallback: si no hay candidatos (raro), devolver la máxima simple
        if max_fila_pen > max_col_pen:
            return "fila", penal_filas[0][1], {"tie": False}
        else:
            return "columna", penal_columnas[0][1], {"tie": False}

    def mejor_celda(self, tipo, pos):
        """
        Selecciona la celda de menor costo en la fila o columna seleccionada.
        Devuelve (fila, columna) o (None, None) si no hay celda válida.
        """
        if tipo == "fila":
            fila = pos
            min_valor = float("inf")
            min_col = None
            for j in range(self.columnas):
                if self._is_available(fila, j) and self.costos[fila][j] < min_valor:
                    min_valor = self.costos[fila][j]
                    min_col = j
            return (fila, min_col) if min_col is not None else (None, None)

        else:  # tipo columna
            col = pos
            min_valor = float("inf")
            min_fila = None
            for i in range(self.filas):
                if self._is_available(i, col) and self.costos[i][col] < min_valor:
                    min_valor = self.costos[i][col]
                    min_fila = i
            return (min_fila, col) if min_fila is not None else (None, None)

    def _eliminar_fila_o_col_si_cero(self, i_changed=None, j_changed=None):
        """
        Si una oferta llega a 0 -> marcar fila i con None (no borramos estructura).
        Si una demanda llega a 0 -> marcar columna j con None.
        Al marcar con None, esas celdas se ignoran para penalizaciones y selección.
        """
        if i_changed is not None and self.oferta[i_changed] == 0:
            for j in range(self.columnas):
                self.costos[i_changed][j] = None
        if j_changed is not None and self.demanda[j_changed] == 0:
            for i in range(self.filas):
                self.costos[i][j_changed] = None

    def resolver(self):
        """
        Método principal que resuelve usando VAM paso a paso.
        Registra paso a paso con estado ANTES y DESPUÉS y explicación textual.
        """
        iteraciones = 0
        max_iter = max(1000, (self.filas * self.columnas) * 50)

        while sum(self.oferta) > 0 and sum(self.demanda) > 0:
            if iteraciones > max_iter:
                self.pasos.append({
                    "error": "Límite de iteraciones alcanzado - posible estado inconsistente",
                    "oferta_restante": self.oferta[:],
                    "demanda_restante": self.demanda[:]
                })
                break

            # Estado antes de la asignación
            oferta_before = self.oferta[:]
            demanda_before = self.demanda[:]

            # calcular penalizaciones en este estado
            penal_filas, penal_columnas = self.calcular_penalizaciones()

            # representar penalizaciones legibles
            pen_filas_list = [{"fila": i, "penal": p} for p, i in penal_filas]
            pen_cols_list = [{"columna": j, "penal": p} for p, j in penal_columnas]

            # decidir tipo/posicion con información de desempate
            tipo, pos, tie_info = self.mayor_penalizacion(penal_filas, penal_columnas)

            # encontrar mejor celda en la fila/columna elegida
            fila, col = self.mejor_celda(tipo, pos)

            # si no existe celda válida, registrar y salir
            if fila is None or col is None:
                self.pasos.append({
                    "error": "No se encontró celda válida para asignar",
                    "tipo_penalizacion": tipo,
                    "posicion": pos,
                    "penalizaciones_filas": pen_filas_list,
                    "penalizaciones_columnas": pen_cols_list,
                    "tie_info": tie_info,
                    "oferta_restante": oferta_before,
                    "demanda_restante": demanda_before,
                    "explicacion": "No se encontró celda válida (todas las celdas disponibles están agotadas o marcadas)."
                })
                break

            asignacion = min(self.oferta[fila], self.demanda[col])

            # seguridad: si asignación inválida (0 o negativa), intentar avanzar o romper
            if asignacion <= 0:
                # registrar paso anomalía y continuar
                self.pasos.append({
                    "error": "Asignación no positiva detectada",
                    "celda": (fila, col),
                    "penalizaciones_filas": pen_filas_list,
                    "penalizaciones_columnas": pen_cols_list,
                    "tie_info": tie_info,
                    "oferta_restante": oferta_before,
                    "demanda_restante": demanda_before,
                    "explicacion": "La celda elegida resultó en asignación 0; se intenta continuar."
                })
                iteraciones += 1
                continue

            # Explicación textual clara antes de aplicar
            explicacion_pre = f"Penalización mayor = {max([p for p,_ in penal_filas]+[p for p,_ in penal_columnas])}. Se elige {tipo} {pos}, celda de menor costo en esa {tipo} -> ({fila},{col}). Se asignan {asignacion} unidades."

            # Registrar paso con estado antes (para construir tabla anterior), y datos de la decisión
            paso_reg = {
                "paso_num": len(self.pasos) + 1,
                "tipo_penalizacion": tipo,
                "posicion": pos,
                "penalizaciones_filas": pen_filas_list,
                "penalizaciones_columnas": pen_cols_list,
                "tie_info": tie_info,
                "celda_elegida": (fila, col),
                "costo_celda": self.costos[fila][col],
                "asignacion_realizada": asignacion,
                "oferta_restante": oferta_before,   # estado ANTES
                "demanda_restante": demanda_before, # estado ANTES
                "explicacion": explicacion_pre
            }

            # Realizar asignación (actualizar matriz de asignaciones y oferta/demanda)
            self.asignaciones[fila][col] = asignacion
            self.oferta[fila] -= asignacion
            self.demanda[col] -= asignacion

            # marcar filas/columnas que llegaron a 0 (eliminarlas lógicamente)
            self._eliminar_fila_o_col_si_cero(i_changed=fila if self.oferta[fila]==0 else None,
                                              j_changed=col if self.demanda[col]==0 else None)

            # Actualizar explicación con el estado posterior
            explicacion_post = f" Estado después: oferta={self.oferta[:]} demanda={self.demanda[:]}."
            paso_reg["explicacion"] += explicacion_post
            paso_reg["oferta_posterior"] = self.oferta[:]
            paso_reg["demanda_posterior"] = self.demanda[:]

            # Guardar el paso completo
            self.pasos.append(paso_reg)

            iteraciones += 1

        return {
            "asignaciones": self.asignaciones,
            "pasos": self.pasos
        }
