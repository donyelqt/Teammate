from workers import asgi

from server.main import app

Default = asgi.entrypoint(app)
