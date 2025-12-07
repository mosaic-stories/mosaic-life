"""Configuration module for the core API."""

from .settings import Settings, get_settings
from .personas import (
    PersonaConfig,
    build_system_prompt,
    get_base_rules,
    get_persona,
    get_personas,
    load_personas,
)

__all__ = [
    # Settings
    "Settings",
    "get_settings",
    # Personas
    "PersonaConfig",
    "build_system_prompt",
    "get_base_rules",
    "get_persona",
    "get_personas",
    "load_personas",
]
