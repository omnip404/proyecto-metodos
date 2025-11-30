# app/controllers/resolver_controller.py

from flask import Blueprint, request, jsonify
from app.logic.vogel import MetodoVogel
from app.utils.balanceador import balancear
import uuid
import logging
import traceback
import html

# configurar logger (escribirá en errors.log en el working dir)
logging.basicConfig(filename='errors.log', level=logging.ERROR, format='%(asctime)s %(levelname)s %(message)s')

resolver_bp = Blueprint("resolver", __name__)

def _error_response(message, status=400, detalle=None):
    error_id = str(uuid.uuid4())[:8]
    payload = {"error": message, "code": error_id}
    if detalle is not None:
        payload["detalle"] = str(detalle)
        # registrar detalle extenso en log junto al código
        logging.error(f"Error {error_id}: {detalle}")
    return jsonify(payload), status

def _calc_penalizaciones_local(costos, oferta, demanda):
    # devuelve listas de penalizaciones en formato [(penal, idx), ...] para filas y columnas
    filas = []
    columnas = []
    m = len(oferta)
    n = len(demanda)
    for i in range(m):
        if oferta[i] > 0:
            vals = [costos[i][j] for j in range(n) if demanda[j] > 0]
            if len(vals) >= 2:
                vals_sorted = sorted(vals)
                filas.append((vals_sorted[1] - vals_sorted[0], i))
            elif len(vals) == 1:
                filas.append((vals[0], i))
            else:
                filas.append((-1, i))
        else:
            filas.append((-1, i))
    for j in range(n):
        if demanda[j] > 0:
            vals = [costos[i][j] for i in range(m) if oferta[i] > 0]
            if len(vals) >= 2:
                vals_sorted = sorted(vals)
                columnas.append((vals_sorted[1] - vals_sorted[0], j))
            elif len(vals) == 1:
                columnas.append((vals[0], j))
            else:
                columnas.append((-1, j))
        else:
            columnas.append((-1, j))
    return filas, columnas

def _build_step_table_html(costos, oferta, demanda, paso, meta, paso_idx):
    """
    Construye HTML con dos tablas (Estado ANTES / Estado DESPUÉS) en el formato:
    |     | C1 | C2 | ... | Oferta | Penal Fila |
    ...
    Además incluye la explicación textual entre ambas tablas.
    Resalta la celda elegida (antes) con fondo negro y texto claro.
    """
    def render_table(costos_mat, oferta_state, demanda_state, pen_filas, pen_cols, meta, chosen=None):
        m = len(costos_mat)
        n = len(costos_mat[0]) if costos_mat else 0
        parts = []
        parts.append('<table class="tabla-visual" style="border-collapse:collapse;width:100%;margin-bottom:8px;">')
        # header
        parts.append('<thead><tr>')
        parts.append('<th style="background:#f0f0f0;border:1px solid #000;padding:6px;text-align:center;"></th>')
        for j in range(n):
            header = f"C{j+1}"
            if meta and meta.get("tipo") == "columna_ficticia" and j == n-1:
                header = f"{header} (Ficticia)"
            parts.append(f'<th style="background:#f0f0f0;border:1px solid #000;padding:6px;text-align:center;">{html.escape(header)}</th>')
        parts.append('<th style="background:#f0f0f0;border:1px solid #000;padding:6px;text-align:center;">Oferta</th>')
        parts.append('<th style="background:#f0f0f0;border:1px solid #000;padding:6px;text-align:center;">Penal Fila</th>')
        parts.append('</tr></thead>')

        # body rows
        parts.append('<tbody>')
        for i in range(m):
            row_label = f"F{i+1}"
            if meta and meta.get("tipo") == "fila_ficticia" and i == m-1:
                row_label = f"{row_label} (Ficticia)"
            parts.append('<tr>')
            parts.append(f'<th style="background:#f7f7f7;border:1px solid #000;padding:6px;text-align:center;">{html.escape(row_label)}</th>')
            for j in range(n):
                cell = costos_mat[i][j]
                display = "" if cell is None else str(cell)
                # highlight chosen cell
                if chosen and isinstance(chosen, (list, tuple)) and chosen[0] == i and chosen[1] == j:
                    parts.append(f'<td style="border:1px solid #000;padding:6px;text-align:center;background:#000;color:#fff;font-weight:700;">{html.escape(display)}</td>')
                else:
                    # mark ficticia with subtle red (keeps consistency)
                    if meta and meta.get("tipo") == "columna_ficticia" and j == n-1:
                        parts.append(f'<td style="border:1px solid #000;padding:6px;text-align:center;background:#fff2f2;color:{html.escape(meta.get("color",""))};">{html.escape(display)}</td>')
                    else:
                        parts.append(f'<td style="border:1px solid #000;padding:6px;text-align:center;">{html.escape(display)}</td>')
            oferta_val = oferta_state[i] if i < len(oferta_state) else ""
            penal_val = next((p for p, idx in pen_filas if idx == i), "")
            parts.append(f'<td style="border:1px solid #000;padding:6px;text-align:center;"><strong>{html.escape(str(oferta_val))}</strong></td>')
            parts.append(f'<td style="border:1px solid #000;padding:6px;text-align:center;">{html.escape(str(penal_val))}</td>')
            parts.append('</tr>')
        parts.append('</tbody>')

        # demanda row
        parts.append('<tfoot>')
        parts.append('<tr>')
        parts.append('<th style="background:#f0f0f0;border:1px solid #000;padding:6px;text-align:center;">Dem</th>')
        for j in range(n):
            dem_val = demanda_state[j] if j < len(demanda_state) else ""
            parts.append(f'<td style="border:1px solid #000;padding:6px;text-align:center;"><strong>{html.escape(str(dem_val))}</strong></td>')
        parts.append('<td style="border:1px solid #000;padding:6px;text-align:center;"></td>')
        parts.append('<td style="border:1px solid #000;padding:6px;text-align:center;">Penal Col</td>')
        parts.append('</tr>')

        # penal col row
        parts.append('<tr>')
        parts.append('<th style="background:#f0f0f0;border:1px solid #000;padding:6px;text-align:center;">Penal Col</th>')
        for j in range(n):
            penal_c = next((p for p, idx in pen_cols if idx == j), "")
            parts.append(f'<td style="border:1px solid #000;padding:6px;text-align:center;">{html.escape(str(penal_c))}</td>')
        parts.append('<td style="border:1px solid #000;padding:6px;text-align:center;"></td>')
        parts.append('<td style="border:1px solid #000;padding:6px;text-align:center;"></td>')
        parts.append('</tr>')
        parts.append('</tfoot>')

        parts.append('</table>')
        return ''.join(parts)

    # estado ANTES
    oferta_before = paso.get("oferta_restante") if paso and paso.get("oferta_restante") is not None else oferta
    demanda_before = paso.get("demanda_restante") if paso and paso.get("demanda_restante") is not None else demanda
    pen_filas_before, pen_cols_before = _calc_penalizaciones_local(costos, oferta_before, demanda_before)

    # elegir celda elegida (resaltar en BEFORE)
    chosen = None
    if paso:
        chosen = paso.get("celda_elegida") or paso.get("celda") or None

    html_parts = []
    html_parts.append(f'<div class="step-block" id="step-{paso_idx}" style="margin-bottom:18px;">')
    html_parts.append(f'<h3 style="margin:6px 0;color:var(--brand-blue);">Paso {paso_idx}</h3>')

    # tabla antes (resaltando celda elegida)
    html_parts.append('<div style="margin-bottom:8px;"><strong>Estado ANTES</strong></div>')
    html_parts.append(render_table(costos, oferta_before, demanda_before, pen_filas_before, pen_cols_before, meta, chosen))

    # explicación textual
    if paso:
        tipo = paso.get("tipo_penalizacion", "-")
        pos = paso.get("posicion", "-")
        cel = paso.get("celda_elegida") or paso.get("celda") or "-"
        asign = paso.get("asignacion_realizada") or paso.get("asignacion") or "-"
        reason = ""
        if paso.get("tie_info"):
            tie = paso["tie_info"]
            reason = f" Desempate: {html.escape(str(tie.get('reason', tie)))}."
        pen_vals = [p for p, _ in pen_filas_before] + [p for p, _ in pen_cols_before]
        max_pen = max(pen_vals) if pen_vals else ""
        explanation = f"Paso {paso_idx}: Penalización mayor = {html.escape(str(max_pen))} (tipo={html.escape(str(tipo))} pos={html.escape(str(pos))}). Se asignan {html.escape(str(asign))} unidades a {html.escape(str(cel))}.{reason}"
        html_parts.append(f"<div class='explanation' style='margin:8px 0;padding:10px;background:#fff8e1;border-radius:6px;border:1px solid #e6d8a7;'>{explanation}</div>")

    # tabla despues (si hay estado posterior), en caso contrario mostrar estado resultante actual
    oferta_after = paso.get("oferta_posterior") if paso and paso.get("oferta_posterior") is not None else None
    demanda_after = paso.get("demanda_posterior") if paso and paso.get("demanda_posterior") is not None else None
    if oferta_after is not None and demanda_after is not None:
        pen_filas_after, pen_cols_after = _calc_penalizaciones_local(costos, oferta_after, demanda_after)
        html_parts.append('<div style="margin-top:8px;margin-bottom:6px;"><strong>Estado DESPUÉS</strong></div>')
        html_parts.append(render_table(costos, oferta_after, demanda_after, pen_filas_after, pen_cols_after, meta, None))
    else:
        # Si no hay estado posterior, mostrar nota y el estado "actual" (oferta/demanda sin cambios)
        html_parts.append('<div style="margin-top:8px;margin-bottom:6px;color:#666;">(No hay estado posterior registrado.)</div>')

    html_parts.append('</div>')
    return ''.join(html_parts)

@resolver_bp.route("/resolver/vogel", methods=["POST"])
def resolver_vogel():
    try:
        data = request.get_json()
        if not data:
            return _error_response("No se recibió ningún dato.", 400)

        costos = data.get("costos")
        oferta = data.get("oferta")
        demanda = data.get("demanda")

        # validaciones básicas (dimensiones)
        if not isinstance(costos, list) or not isinstance(oferta, list) or not isinstance(demanda, list):
            return _error_response("costos, oferta y demanda deben ser listas.", 400)

        if len(costos) != len(oferta):
            return _error_response("Las filas de 'costos' deben coincidir con el tamaño de 'oferta'.", 400)

        for fila in costos:
            if len(fila) != len(demanda):
                return _error_response("Todas las filas de 'costos' deben coincidir con el tamaño de 'demanda'.", 400)

        # Balancear automáticamente si es necesario
        costos_b, oferta_b, demanda_b, meta = balancear(costos, oferta, demanda)

        # Ejecutar método sobre las estructuras balanceadas
        metodo = MetodoVogel(costos_b, oferta_b, demanda_b)
        resultado = metodo.resolver()

        # Construir HTML para cada paso (será devuelto en el JSON para mostrar tablas completas)
        pasos = resultado.get("pasos", [])
        pasos_html = []
        for idx, paso in enumerate(pasos, start=1):
            # use el estado almacenado en cada paso (oferta_restante / demanda_restante)
            html_step = _build_step_table_html(costos_b, oferta_b, demanda_b, paso, meta, idx)
            pasos_html.append(html_step)

        return jsonify({
            "status": "ok",
            "asignaciones": resultado["asignaciones"],
            "pasos": resultado["pasos"],
            "pasos_html": pasos_html,           # <-- nuevo: tablas HTML por paso
            "meta_balance": meta
        })
    except Exception:
        tb = traceback.format_exc()
        return _error_response("Error interno al resolver Vogel", 500, detalle=tb)
