"""Tests for persona configuration loader."""

from app.config.personas import (
    PersonaConfig,
    build_system_prompt,
    get_base_rules,
    get_persona,
    get_personas,
    load_personas,
)


class TestLoadPersonas:
    """Tests for load_personas function."""

    def test_load_personas_returns_dict(self) -> None:
        """Test that load_personas returns persona dict."""
        personas = load_personas()
        assert isinstance(personas, dict)
        assert "biographer" in personas
        assert "friend" in personas

    def test_persona_has_required_fields(self) -> None:
        """Test that each persona has required fields."""
        personas = load_personas()
        for persona_id, persona in personas.items():
            assert isinstance(persona, PersonaConfig)
            assert persona.id == persona_id
            assert persona.name
            assert persona.icon
            assert persona.description
            assert persona.model_id
            assert persona.system_prompt
            assert persona.max_tokens > 0


class TestGetPersona:
    """Tests for get_persona function."""

    def test_get_persona_returns_biographer(self) -> None:
        """Test get_persona returns biographer persona."""
        persona = get_persona("biographer")
        assert persona is not None
        assert persona.name == "The Biographer"
        assert persona.icon == "BookOpen"
        assert "life story curator" in persona.description.lower()

    def test_get_persona_returns_friend(self) -> None:
        """Test get_persona returns friend persona."""
        persona = get_persona("friend")
        assert persona is not None
        assert persona.name == "The Friend"
        assert persona.icon == "Heart"
        assert "empathetic" in persona.description.lower()

    def test_get_persona_returns_none_for_unknown(self) -> None:
        """Test get_persona returns None for unknown persona."""
        persona = get_persona("unknown_persona")
        assert persona is None


class TestGetPersonas:
    """Tests for get_personas function."""

    def test_get_personas_returns_all(self) -> None:
        """Test get_personas returns all personas."""
        personas = get_personas()
        assert len(personas) >= 2
        persona_ids = [p.id for p in personas]
        assert "biographer" in persona_ids
        assert "friend" in persona_ids


class TestGetBaseRules:
    """Tests for get_base_rules function."""

    def test_base_rules_exist(self) -> None:
        """Test base rules are loaded."""
        rules = get_base_rules()
        assert "grief-aware" in rules.lower()
        assert "impersonate" in rules.lower()

    def test_base_rules_contain_safety_content(self) -> None:
        """Test base rules contain expected safety content."""
        rules = get_base_rules()
        assert "memorial" in rules.lower() or "legacy" in rules.lower()
        assert "never" in rules.lower()


class TestBuildSystemPrompt:
    """Tests for build_system_prompt function."""

    def test_build_system_prompt_with_biographer(self) -> None:
        """Test building system prompt for biographer."""
        prompt = build_system_prompt("biographer", "John Doe")
        assert prompt is not None
        assert "John Doe" in prompt
        assert "grief-aware" in prompt.lower()
        assert "biographer" in prompt.lower()

    def test_build_system_prompt_with_friend(self) -> None:
        """Test building system prompt for friend."""
        prompt = build_system_prompt("friend", "Jane Smith")
        assert prompt is not None
        assert "Jane Smith" in prompt
        assert "grief-aware" in prompt.lower()
        assert "friend" in prompt.lower()

    def test_build_system_prompt_replaces_placeholder(self) -> None:
        """Test that legacy_name placeholder is replaced."""
        prompt = build_system_prompt("biographer", "Test Person")
        assert prompt is not None
        assert "{legacy_name}" not in prompt
        assert "Test Person" in prompt

    def test_build_system_prompt_returns_none_for_unknown(self) -> None:
        """Test build_system_prompt returns None for unknown persona."""
        prompt = build_system_prompt("unknown_persona", "John Doe")
        assert prompt is None

    def test_build_system_prompt_contains_base_rules(self) -> None:
        """Test that built prompt contains base rules."""
        base_rules = get_base_rules()
        prompt = build_system_prompt("biographer", "Test Person")
        assert prompt is not None
        # The base rules should be at the beginning of the prompt
        assert base_rules.strip() in prompt


class TestPersonaConfig:
    """Tests for PersonaConfig dataclass."""

    def test_persona_config_fields(self) -> None:
        """Test PersonaConfig has expected fields."""
        persona = PersonaConfig(
            id="test",
            name="Test Persona",
            icon="TestIcon",
            description="A test persona",
            model_id="test-model-id",
            system_prompt="Test prompt",
            max_tokens=512,
        )
        assert persona.id == "test"
        assert persona.name == "Test Persona"
        assert persona.icon == "TestIcon"
        assert persona.description == "A test persona"
        assert persona.model_id == "test-model-id"
        assert persona.system_prompt == "Test prompt"
        assert persona.max_tokens == 512

    def test_persona_config_default_max_tokens(self) -> None:
        """Test PersonaConfig default max_tokens value."""
        persona = PersonaConfig(
            id="test",
            name="Test Persona",
            icon="TestIcon",
            description="A test persona",
            model_id="test-model-id",
            system_prompt="Test prompt",
        )
        assert persona.max_tokens == 1024


class TestBuildSystemPromptWithStoryContext:
    """Tests for build_system_prompt with story_context parameter."""

    def test_build_system_prompt_includes_story_context(self) -> None:
        """Test that story_context is appended to system prompt."""
        story_context = "\n## Relevant stories:\n[Story 1]\nGrandma loved gardening."
        prompt = build_system_prompt("biographer", "Jane Doe", story_context)

        assert prompt is not None
        assert "Jane Doe" in prompt
        assert "Relevant stories" in prompt
        assert "Grandma loved gardening" in prompt

    def test_build_system_prompt_without_story_context(self) -> None:
        """Test that prompt works without story_context (backward compatible)."""
        prompt = build_system_prompt("biographer", "John Smith")

        assert prompt is not None
        assert "John Smith" in prompt
        # Should not have story context section
        assert "Relevant stories" not in prompt

    def test_build_system_prompt_with_empty_story_context(self) -> None:
        """Test that empty story_context doesn't add anything."""
        prompt_no_context = build_system_prompt("biographer", "Test Person")
        prompt_empty_context = build_system_prompt("biographer", "Test Person", "")

        # Both should be identical
        assert prompt_no_context == prompt_empty_context

    def test_build_system_prompt_story_context_comes_after_persona(self) -> None:
        """Test that story_context is appended at the end."""
        story_context = "\n## Story context here"
        prompt = build_system_prompt("biographer", "Jane", story_context)

        assert prompt is not None
        # Story context should come after persona prompt (at the end)
        base_rules = get_base_rules()
        assert prompt.index(base_rules) < prompt.index("Story context here")
