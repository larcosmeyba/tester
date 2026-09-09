"""The Standard HTH Recipe Object, as an import service can produce it.

Field names mirror `packages/api-contract/meals.graphql` exactly, in camelCase,
because that schema is the single source of truth on both sides of the wire.
The Go server maps this straight onto `UpsertRecipe`.

What this service never sets: `recipeId` (the server mints ids), `visibility`
and `reviewStatus` beyond the forced private/draft defaults, and
`ingredientId` (catalogue resolution is the server's job — it owns the
ingredients table).
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ValueConfidence(str, Enum):
    """How a single value was established. `missing` is never guessed away."""

    source = "source"
    human = "human"
    inferred = "inferred"
    missing = "missing"


class DataConfidence(str, Enum):
    high = "high"
    medium = "medium"
    low = "low"


class MealType(str, Enum):
    breakfast = "breakfast"
    lunch = "lunch"
    dinner = "dinner"
    snack = "snack"
    dessert = "dessert"
    side = "side"


class Equipment(str, Enum):
    stovetop = "stovetop"
    oven = "oven"
    microwave = "microwave"
    grill = "grill"
    blender = "blender"
    air_fryer = "air_fryer"
    slow_cooker = "slow_cooker"
    instant_pot = "instant_pot"


class TranscriptSource(str, Enum):
    """Where the words came from. Captions are the source of truth when they
    exist; Whisper output is a transcription of a transcription and is treated
    as slightly weaker evidence."""

    captions = "captions"
    audio = "audio"
    description_only = "description_only"


class HTHModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        use_enum_values=True,
    )


class IngredientLine(HTHModel):
    """One ingredient line.

    `quantity` is null when the video never stated one. It is never invented —
    `missingInformation` says so instead.
    """

    position: int
    raw_text: str
    display_name: str | None = None
    quantity: float | None = None
    unit: str | None = None
    preparation: str | None = None
    grams: float | None = None
    is_optional: bool = False
    is_to_taste: bool = False
    missing_information: str | None = None


class InstructionStep(HTHModel):
    step: int
    text: str
    minutes: int | None = None


class NutritionInfo(HTHModel):
    """Per-serving nutrition. Null where the source never stated it.

    A cooking video almost never states nutrition, so this is usually absent
    altogether. It is not estimated here: the server owns nutrition, and a
    guess dressed as data is worse than a null.
    """

    basis: str
    per_serving: bool = True
    calories_kcal: float | None = None
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None
    fiber_g: float | None = None
    sodium_mg: float | None = None
    coverage_pct: float | None = None
    confidence: DataConfidence | None = None


class SourceProvenance(HTHModel):
    """Everything about where this recipe came from.

    Kept as its own object so an import can always be audited, and so a
    takedown request can be answered by pointing at the original.
    """

    platform: str
    video_id: str | None = None
    canonical_url: str
    channel: str | None = None
    channel_url: str | None = None
    published_at: str | None = None
    duration_seconds: int | None = None
    transcript_source: TranscriptSource
    transcript_language: str | None = None
    used_description: bool = False
    model: str | None = None
    extracted_at: str


class ImportedRecipe(HTHModel):
    """A Recipe as far as a video can establish one.

    Always private, always a draft, always `video_import`: an import is a
    proposal to its owner, not library content.
    """

    title: str
    description: str | None = None
    source_type: str = "video_import"
    source_url: str
    source_name: str | None = None
    license_id: str | None = None
    attribution_text: str | None = None
    visibility: str = "private"
    review_status: str = "draft"

    servings: float | None = None
    servings_confidence: ValueConfidence = ValueConfidence.missing
    serving_size_text: str | None = None
    scalable: bool = True

    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    total_time_minutes: int | None = None
    time_confidence: ValueConfidence = ValueConfidence.missing

    meal_types: list[MealType] = Field(default_factory=list)
    cuisine: str | None = None
    difficulty: int | None = None
    equipment_required: list[Equipment] = Field(default_factory=list)
    is_component: bool = False
    tags: list[str] = Field(default_factory=list)

    ingredients: list[IngredientLine] = Field(default_factory=list)
    instructions: list[InstructionStep] = Field(default_factory=list)
    nutrition: NutritionInfo | None = None

    base_meal_plan_eligible: bool = False
    missing_information: list[str] = Field(default_factory=list)

    provenance: SourceProvenance | None = None


class ImportRequest(HTHModel):
    url: str
    language: str = "english"
    owner_user_id: str | None = None


class ImportStatus(str, Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


class ImportJobView(HTHModel):
    import_id: str
    status: ImportStatus
    url: str
    owner_user_id: str | None = None
    created_at: str
    updated_at: str
    stage: str | None = None
    recipe: ImportedRecipe | None = None
    error: dict | None = None
