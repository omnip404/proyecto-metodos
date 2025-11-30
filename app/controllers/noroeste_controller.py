# app/controllers/noroeste_controller.py

from flask import Blueprint, request, jsonify
from app.logic.noroeste import MetodoNoroeste
from app.utils.balanceador import balancear
import uuid
import logging
import traceback

logging.basicConfig(filename='errors.log', level=logging.ERROR, format='%(asctime)s %(levelname)s %(message)s')

noroeste_bp = Blueprint("noroeste", __name__)

def _error_response(message, status=400, detalle=None):
    error_id = str(uuid.uuid4())[:8]
    payload = {"error": message, "code": error_id}
    if detalle is not None:
        payload["detalle"] = str(detalle)
        logging.error(f"Error {error_id}: {detalle}")
    return jsonify(payload), status

@noroeste_bp.route("/resolver/noroeste", methods=["POST"])
def resolver_noroeste():
    try:
        data = request.get_json()
        if not data:
            return _error_response("No se recibió ningún dato.", 400)

        costos = data.get("costos")
        oferta = data.get("oferta")
        demanda = data.get("demanda")

        # validaciones mínimas
        if not isinstance(costos, list) or not isinstance(oferta, list) or not isinstance(demanda, list):
            return _error_response("costos, oferta y demanda deben ser listas.", 400)

        if len(costos) != len(oferta):
            return _error_response("Las filas de 'costos' deben coincidir con el tamaño de 'oferta'.", 400)

        for fila in costos:
            if len(fila) != len(demanda):
                return _error_response("Todas las filas de 'costos' deben coincidir con el tamaño de 'demanda'.", 400)

        # Balanceo automático
        costos_b, oferta_b, demanda_b, meta = balancear(costos, oferta, demanda)

        metodo = MetodoNoroeste(costos_b, oferta_b, demanda_b)
        resultado = metodo.resolver()

        return jsonify({
            "status": "ok",
            "asignaciones": resultado["asignaciones"],
            "pasos": resultado["pasos"],
            "meta_balance": meta
        })
    except Exception:
        tb = traceback.format_exc()
        return _error_response("Error interno al resolver Noroeste", 500, detalle=tb)

