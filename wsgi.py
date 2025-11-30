from app.main import create_app

# Gunicorn buscará "app" en este módulo: gunicorn wsgi:app
app = create_app()
