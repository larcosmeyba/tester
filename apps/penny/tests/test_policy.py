"""The rules the model is given, and the things kept out of the logs."""

from __future__ import annotations

from penny.persona import voice
from penny.policy.redaction import preview, redact
from penny.policy.safety import HARD_RULES, system_prompt


def test_system_prompt_carries_persona_and_rules():
    prompt = system_prompt(persona=voice(), user_first_name="Sam", jurisdiction="US-OH")

    assert "Penny" in prompt
    assert "never decide who is eligible" in prompt.lower()
    assert "Sam" in prompt
    assert "US-OH" in prompt


def test_system_prompt_holds_no_program_facts():
    """The prompt is a page of rules, not fifty states of benefits guidance.

    Facts arrive per turn through knowledge.search. A prompt that started
    accumulating income limits would go stale silently and could never cover
    every jurisdiction, which is the whole reason retrieval exists.
    """
    prompt = system_prompt(persona=voice()).lower()

    # A dollar figure or a percentage in the prompt is a fact that will rot.
    assert "$" not in prompt
    assert "% of the federal poverty" not in prompt


def test_persona_and_business_rules_are_separate_files():
    """Editing Penny's warmth must not be able to change her permissions."""
    persona = voice().lower()

    assert "eligib" not in persona
    assert "knowledge.search" not in persona
    assert "tool" not in persona


def test_hard_rules_forbid_the_dangerous_claims():
    rules = HARD_RULES.lower()
    for phrase in ["eligible", "submitted", "medical", "citation", "estimates"]:
        assert phrase in rules


def test_redaction_removes_identifiers():
    text = "My SSN is 123-45-6789, email sam@example.com, phone 614-555-0100."
    cleaned = redact(text)

    assert "123-45-6789" not in cleaned
    assert "sam@example.com" not in cleaned
    assert "614-555-0100" not in cleaned
    assert "[ssn]" in cleaned


def test_preview_truncates():
    assert len(preview("x" * 500)) == 120
