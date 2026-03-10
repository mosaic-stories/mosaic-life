import importlib


def test_session_cookie_name_defaults_to_prod_value(monkeypatch):
    monkeypatch.delenv("SESSION_COOKIE_NAME", raising=False)

    from app.config import settings as settings_module

    importlib.reload(settings_module)
    settings_module.get_settings.cache_clear()

    try:
        settings = settings_module.get_settings()
        assert settings.session_cookie_name == "mosaic_session"
    finally:
        settings_module.get_settings.cache_clear()
        importlib.reload(settings_module)


def test_session_cookie_name_can_be_overridden(monkeypatch):
    monkeypatch.setenv("SESSION_COOKIE_NAME", "mosaic_session_stage")

    from app.config import settings as settings_module

    importlib.reload(settings_module)
    settings_module.get_settings.cache_clear()

    try:
        settings = settings_module.get_settings()
        assert settings.session_cookie_name == "mosaic_session_stage"
    finally:
        monkeypatch.delenv("SESSION_COOKIE_NAME", raising=False)
        settings_module.get_settings.cache_clear()
        importlib.reload(settings_module)
