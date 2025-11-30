# app/utils/balanceador.py

def balancear(costos, oferta, demanda):
    """
    Balancea el problema de transporte agregando una fila o columna ficticia
    con costo 0 si la suma de oferta y demanda no coincide.

    Devuelve: (costos_nuevos, oferta_nueva, demanda_nueva, meta_info)
    meta_info: dict con keys:
      - tipo: "balanceado", "columna_ficticia", "fila_ficticia"
      - diferencia: cantidad añadida (0 si balanceado)
    """
    # Hacer copias para no mutar entradas externas
    costos = [fila[:] for fila in costos]
    oferta = oferta[:]
    demanda = demanda[:]

    sum_oferta = sum(oferta)
    sum_demanda = sum(demanda)

    if sum_oferta > sum_demanda:
        diferencia = sum_oferta - sum_demanda
        # agregar columna ficticia (costos 0)
        for fila in costos:
            fila.append(0)
        demanda.append(diferencia)
        meta = {"tipo": "columna_ficticia", "diferencia": diferencia}
        return costos, oferta, demanda, meta

    elif sum_demanda > sum_oferta:
        diferencia = sum_demanda - sum_oferta
        # agregar fila ficticia (costos 0)
        nueva_fila = [0] * len(demanda)
        costos.append(nueva_fila)
        oferta.append(diferencia)
        meta = {"tipo": "fila_ficticia", "diferencia": diferencia}
        return costos, oferta, demanda, meta

    else:
        meta = {"tipo": "balanceado", "diferencia": 0}
        return costos, oferta, demanda, meta
