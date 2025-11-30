import os

from app.main import create_app

app = create_app()

if __name__ == "__main__":
    # Usar variables de entorno para compatibilidad con plataformas (e.g. Render)
    port = int(os.environ.get("PORT", 5000))
    # DEBUG puede activarse con DEBUG=1 o APP_DEBUG=1
    debug_env = os.environ.get("DEBUG") or os.environ.get("APP_DEBUG") or ""
    debug = True if str(debug_env) in ("1", "true", "True") else False

    # Bind a 0.0.0.0 para que la app sea accesible externamente en el entorno de Render
    app.run(host="0.0.0.0", port=port, debug=debug)
