"""Persona configuration loader."""

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

ELICITATION_PROMPT_PATH = Path(__file__).parent / "elicitation_mode.txt"
_elicitation_directive: str | None = None


def _load_elicitation_directive() -> str:
    global _elicitation_directive
    if _elicitation_directive is None:
        _elicitation_directive = ELICITATION_PROMPT_PATH.read_text().strip()
    return _elicitation_directive


logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).parent / "personas.yaml"


@dataclass
class TraversalConfig:
    """Graph traversal configuration for a persona."""

    max_hops: int = 1
    relationship_weights: dict[str, float] = field(default_factory=dict)
    max_graph_results: int = 15
    include_cross_legacy: bool = True
    temporal_range: str = "full"


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
    traversal: TraversalConfig = field(default_factory=TraversalConfig)


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
        traversal_data = data.get("traversal", {})
        traversal = TraversalConfig(
            max_hops=traversal_data.get("max_hops", 1),
            relationship_weights=traversal_data.get("relationship_weights", {}),
            max_graph_results=traversal_data.get("max_graph_results", 15),
            include_cross_legacy=traversal_data.get("include_cross_legacy", True),
            temporal_range=traversal_data.get("temporal_range", "full"),
        )
        _personas[persona_id] = PersonaConfig(
            id=persona_id,
            name=data["name"],
            icon=data["icon"],
            description=data["description"],
            model_id=data["model_id"],
            system_prompt=data["system_prompt"],
            max_tokens=data.get("max_tokens", 1024),
            traversal=traversal,
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


def build_system_prompt(
    persona_id: str,
    legacy_name: str,
    story_context: str = "",
    facts: list[Any] | None = None,
    elicitation_mode: bool = False,
    original_story_text: str | None = None,
) -> str | None:
    """Build complete system prompt for a persona with legacy context.

    Args:
        persona_id: The persona identifier.
        legacy_name: Name of the legacy being discussed.
        story_context: Retrieved story context to include in prompt.
        facts: Optional list of LegacyFact objects to inject.
        elicitation_mode: Whether to append elicitation mode directive.
        original_story_text: The story text being evolved (used in elicitation mode).

    Returns:
        Complete system prompt with base rules, persona prompt, story context,
        and known facts, or None if persona not found.
    """
    persona = get_persona(persona_id)
    if not persona:
        return None

    base = get_base_rules()
    persona_prompt = persona.system_prompt.replace("{legacy_name}", legacy_name)

    prompt = f"{base}\n\n{persona_prompt}"

    if story_context:
        prompt = f"{prompt}\n\n{story_context}"

    if facts:
        facts_section = f"\n\nKnown facts about {legacy_name} from conversations:\n"
        for fact in facts:
            source = "(shared)" if fact.visibility == "shared" else "(personal)"
            facts_section += f"- [{fact.category}] {fact.content} {source}\n"
        prompt = f"{prompt}{facts_section}"

    if elicitation_mode:
        prompt = f"{prompt}\n\n{_load_elicitation_directive()}"
        if original_story_text:
            prompt = f"{prompt}\n\n## Story Being Evolved\n\n{original_story_text}"

    return prompt
