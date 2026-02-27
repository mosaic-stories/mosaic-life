"""Tests for colleague and family persona configurations."""

from __future__ import annotations

from app.config.personas import _reset_cache, get_persona, load_personas


class TestNewPersonas:
    """Verify colleague and family personas load correctly."""

    def setup_method(self) -> None:
        _reset_cache()

    def test_four_personas_loaded(self) -> None:
        personas = load_personas()
        assert len(personas) == 4
        assert "biographer" in personas
        assert "friend" in personas
        assert "colleague" in personas
        assert "family" in personas

    def test_colleague_persona_config(self) -> None:
        persona = get_persona("colleague")
        assert persona is not None
        assert persona.name == "The Colleague"
        assert "{legacy_name}" in persona.system_prompt

    def test_family_persona_config(self) -> None:
        persona = get_persona("family")
        assert persona is not None
        assert persona.name == "The Family Member"
        assert "{legacy_name}" in persona.system_prompt

    def test_all_personas_have_traversal_config(self) -> None:
        """Verify traversal config exists in the YAML (loaded separately)."""
        import yaml
        from pathlib import Path

        config_path = (
            Path(__file__).parent.parent.parent / "app" / "config" / "personas.yaml"
        )
        with open(config_path) as f:
            config = yaml.safe_load(f)

        for persona_id in ["biographer", "friend", "colleague", "family"]:
            assert "traversal" in config["personas"][persona_id], (
                f"Persona {persona_id} missing traversal config"
            )

    def teardown_method(self) -> None:
        _reset_cache()
