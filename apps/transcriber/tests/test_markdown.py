from hth_transcriber.markdown import to_markdown
from hth_transcriber.normalize import normalize
from tests.test_normalize import COMPLETE, _with


def test_markdown_renders_a_complete_recipe(bundle):
    text = to_markdown(normalize(COMPLETE, bundle))

    assert text.startswith("# Weeknight Dal")
    assert "**Servings:** 4.0" in text or "**Servings:** 4" in text
    assert "- 200g red lentils" in text
    assert "1. Simmer the lentils." in text
    assert "Hive Kitchen" in text


def test_markdown_says_what_the_video_left_out(bundle):
    recipe = normalize(_with(servings=None), bundle)
    text = to_markdown(recipe)

    assert "Not stated in the video" in text
    assert "how many it serves" in text
    assert "**Servings:** not stated" in text


def test_markdown_localises_headings(bundle):
    text = to_markdown(normalize(COMPLETE, bundle), "french")
    assert "## Ingrédients" in text
    assert "**Portions:**" in text
