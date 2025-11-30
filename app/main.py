
from flask import Flask ,render_template

def create_app():
    app = Flask(__name__)
    @app.route("/")
    def home():
        return render_template("resolver.html")


    # Importar controladores
    from app.controllers.resolver_controller import resolver_bp
    app.register_blueprint(resolver_bp)
    from app.controllers.noroeste_controller import noroeste_bp
    app.register_blueprint(noroeste_bp)

    return app
