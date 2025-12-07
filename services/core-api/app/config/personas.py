"""Persona configuration loader."""

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).parent / "personas.yaml"


@dataclass
class PersonaConfig:
    """Configuration for an AI persona."""

    id: str
    name: str
    icon: str
    description: str
    model_id: str
    system_prompt: str
    max_tokens: int = field(default=1024)


_personas: dict[str, PersonaConfig] = {}
_base_rules: str = ""


def _reset_cache() -> None:
    """Reset the cached personas (for testing)."""
    global _personas, _base_rules
    _personas = {}
    _base_rules = ""


def load_personas() -> dict[str, PersonaConfig]:
    """Load persona configurations from YAML file.

    Returns:
        Dictionary mapping persona_id to PersonaConfig.
    """
    global _personas, _base_rules

    if _personas:
        return _personas

    with open(CONFIG_PATH) as f:
        config: dict[str, Any] = yaml.safe_load(f)

    _base_rules = config.get("base_rules", "")

    personas_config: dict[str, Any] = config.get("personas", {})
    for persona_id, data in personas_config.items():
        _personas[persona_id] = PersonaConfig(
            id=persona_id,
            name=data["name"],
            icon=data["icon"],
            description=data["description"],
            model_id=data["model_id"],
            system_prompt=data["system_prompt"],
            max_tokens=data.get("max_tokens", 1024),
        )

    logger.info(
        "personas.loaded",
        extra={"count": len(_personas), "ids": list(_personas.keys())},
    )

    return _personas


def get_persona(persona_id: str) -> PersonaConfig | None:
    """Get a specific persona by ID.

    Args:
        persona_id: The persona identifier.

    Returns:
        PersonaConfig if found, None otherwise.
    """
    personas = load_personas()
    return personas.get(persona_id)


def get_personas() -> list[PersonaConfig]:
    """Get all available personas.

    Returns:
        List of all persona configurations.
    """
    personas = load_personas()
    return list(personas.values())


def get_base_rules() -> str:
    """Get the base safety rules that apply to all personas.

    Returns:
        Base rules string.
    """
    load_personas()  # Ensure loaded
    return _base_rules


def build_system_prompt(persona_id: str, legacy_name: str) -> str | None:
    """Build complete system prompt for a persona with legacy context.

    Args:
        persona_id: The persona identifier.
        legacy_name: Name of the legacy being discussed.

    Returns:
        Complete system prompt with base rules and persona prompt,
        or None if persona not found.
    """
    persona = get_persona(persona_id)
    if not persona:
        return None

    base = get_base_rules()
    persona_prompt = persona.system_prompt.replace("{legacy_name}", legacy_name)

    return f"{base}\n\n{persona_prompt}"
