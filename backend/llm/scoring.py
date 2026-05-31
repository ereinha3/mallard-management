"""
LLM scoring layer for scripted intake answers.

This module keeps Gemini calls narrowly scoped:
- score one free-text answer into the current instrument value;
- render one warm conversational question;
- assemble the final submit_profile payload for the engine.
"""

import json
import os
import re
from typing import Any, Generator

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None

from llm.instrument import SCRIPT

# Gemini model

GEMINI_MODEL = "gemini-3.5-flash"


# Tool definition copied from elicitation.py

def _debt_schema() -> Any:
    return types.Schema(
        type="OBJECT",
        properties={
            "balance": types.Schema(type="NUMBER", description="Outstanding balance in dollars"),
            "apr": types.Schema(type="NUMBER", description="Annual rate as decimal, e.g. 0.22 for 22%"),
            "kind": types.Schema(
                type="STRING",
                description="Debt type",
                enum=["credit_card", "student", "mortgage", "auto", "personal", "other"],
            ),
        },
        required=["balance", "apr", "kind"],
    )


def _build_submit_profile_tool() -> Any:
    if types is None:
        return None

    return types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="submit_profile",
                description=(
                    "Submit the completed user financial profile once all required fields "
                    "have been gathered through conversation."
                ),
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        # Financials
                        "household_income": types.Schema(type="NUMBER", description="Annual household income in dollars"),
                        "monthly_expenses": types.Schema(type="NUMBER", description="Total monthly essential expenses"),
                        "capital_on_hand": types.Schema(type="NUMBER", description="Liquid capital available to invest"),
                        "emergency_fund": types.Schema(type="NUMBER", description="Current emergency fund balance"),
                        "debts": types.Schema(
                            type="ARRAY",
                            items=_debt_schema(),
                            description="All debts; empty list if none",
                        ),
                        # Lifecycle
                        "age": types.Schema(type="INTEGER"),
                        "horizon_years": types.Schema(type="INTEGER", description="Years to retirement or primary goal"),
                        "goals": types.Schema(type="ARRAY", items=types.Schema(type="STRING")),
                        "goal_target": types.Schema(type="NUMBER", description="Target terminal wealth in dollars; 0 if unknown"),
                        "dependents": types.Schema(type="INTEGER"),
                        "filing_status": types.Schema(
                            type="STRING",
                            enum=["single", "married_joint", "married_separate", "head_of_household"],
                        ),
                        # Risk tolerance
                        "risk_instrument_responses": types.Schema(
                            type="ARRAY",
                            items=types.Schema(type="INTEGER"),
                            description="13 Grable-Lytton scores in order GL1-GL13, each 1-4",
                        ),
                        "loss_scenario_response": types.Schema(
                            type="STRING",
                            enum=["sell_all", "sell_some", "hold", "buy_more"],
                        ),
                        "dohmen_risk": types.Schema(
                            type="INTEGER",
                            description="Dohmen general willingness-to-take-risk response, integer 0-10",
                        ),
                        "loss_aversion_probe": types.Schema(
                            type="NUMBER",
                            description="Minimum $ win to accept 50/50 bet against $100 loss",
                        ),
                        # Capacity
                        "income_stability": types.Schema(
                            type="STRING",
                            enum=["bond_like", "mixed", "stock_like"],
                        ),
                        # Preferences
                        "universe_pref": types.Schema(type="STRING", enum=["etf", "stock", "mix"]),
                        "esg_exclusions": types.Schema(type="ARRAY", items=types.Schema(type="STRING")),
                        "sector_theme_tilts": types.Schema(type="ARRAY", items=types.Schema(type="STRING")),
                        # LLM metadata
                        "confidence": types.Schema(type="OBJECT", description="Per-field confidence 0-1"),
                        "uncertainty_flags": types.Schema(
                            type="ARRAY",
                            items=types.Schema(type="STRING"),
                            description="Fields with confidence < 0.6",
                        ),
                    },
                    required=[
                        "household_income", "monthly_expenses", "capital_on_hand",
                        "emergency_fund", "debts", "age", "horizon_years",
                        "filing_status", "risk_instrument_responses",
                        "loss_scenario_response", "dohmen_risk",
                        "loss_aversion_probe", "income_stability",
                    ],
                ),
            )
        ]
    )


SUBMIT_PROFILE_TOOL = _build_submit_profile_tool()


def _to_python(val: Any) -> Any:
    """Recursively convert proto MapComposite / RepeatedComposite to plain Python."""
    if val is None:
        return val
    cls = type(val).__name__
    if "Map" in cls or hasattr(val, "items"):
        return {k: _to_python(v) for k, v in val.items()}
    if "Repeated" in cls or (hasattr(val, "__iter__") and not isinstance(val, (str, bytes, int, float, bool))):
        return [_to_python(v) for v in val]
    return val


def _client() -> Any:
    if genai is None or types is None:
        raise RuntimeError("google-genai is not installed.")

    api_key = os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is not set.")

    return genai.Client(api_key=api_key)


def _get(obj: Any, name: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _message_role_content(message: Any) -> tuple[str, str]:
    if isinstance(message, dict):
        role = message.get("role", "user")
        content = message.get("content", "")
    else:
        role = getattr(message, "role", "user")
        content = getattr(message, "content", "")
    return str(role or "user"), str(content or "")


def _contents_from_messages(messages: list) -> list[Any]:
    contents: list[Any] = []
    for msg in messages:
        role, content = _message_role_content(msg)
        role = "model" if role == "assistant" else "user"
        contents.append(types.Content(role=role, parts=[types.Part(text=content)]))
    return contents


def _item_key(item: Any) -> str:
    return str(_get(item, "key", "") or "")


def _item_question(item: Any) -> str:
    ask = _get(item, "ask")
    if ask:
        return str(ask)

    text = str(_get(item, "text", "") or "")
    match = re.search(r"Ask:\s*(.+?)(?:\n\d+\s*=|\n[A-D]\s*[->=]|$)", text, re.DOTALL)
    if match:
        return re.sub(r"\s+", " ", match.group(1)).strip().strip('"')
    return text


def _item_rubric(item: Any) -> str:
    rubric = _get(item, "rubric")
    if rubric:
        return str(rubric)
    return str(_get(item, "text", "") or _item_question(item))


def _enum_values(item: Any) -> list[str]:
    values = _get(item, "enum_values")
    if values:
        return [str(value) for value in values]

    key = _item_key(item)
    if key in {"loss_scenario", "loss_scenario_response"}:
        return ["sell_all", "sell_some", "hold", "buy_more"]
    return []


def _score_kind(item: Any) -> str:
    kind = _get(item, "score_kind")
    if kind:
        return str(kind)

    key = _item_key(item)
    if re.fullmatch(r"GL\d+", key):
        return "scale4"
    if key in {"dohmen", "dohmen_risk"}:
        return "scale10"
    if key in {"loss_scenario", "loss_scenario_response"}:
        return "enum"
    if key in {"loss_aversion", "loss_aversion_probe", "goal_target"}:
        return "dollar"
    return "freeform"


def _score_value_schema(item: Any) -> Any:
    kind = _score_kind(item)
    if kind == "scale4":
        return types.Schema(type="INTEGER", description="Integer score from 1 to 4.")
    if kind == "scale10":
        return types.Schema(type="INTEGER", description="Integer score from 0 to 10.")
    if kind == "enum":
        values = _enum_values(item)
        if values:
            return types.Schema(type="STRING", enum=values)
        return types.Schema(type="STRING")
    if kind == "dollar":
        return types.Schema(type="NUMBER", description="Dollar amount as a number.")
    return types.Schema(
        type="OBJECT",
        description="Small JSON object containing only fields named or implied by the rubric.",
    )


def _build_score_tool(item: Any) -> Any:
    return types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="submit_score",
                description="Submit the parsed score for one answer, or mark it unaddressed.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "addressed": types.Schema(
                            type="BOOLEAN",
                            description="False when the answer is too vague, off-topic, or does not answer the item.",
                        ),
                        "value": _score_value_schema(item),
                    },
                    required=["addressed"],
                ),
            )
        ]
    )


def _function_call_args(response: Any, name: str) -> Any:
    function_calls = getattr(response, "function_calls", None)
    if function_calls:
        for fc in function_calls:
            if getattr(fc, "name", None) == name:
                return _to_python(getattr(fc, "args", None))

    for candidate in getattr(response, "candidates", []) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", []) or []:
            fc = getattr(part, "function_call", None)
            if fc and getattr(fc, "name", None) == name:
                return _to_python(getattr(fc, "args", None))

    return None


def _json_from_text(text: str) -> Any:
    text = text.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}|\[.*\]|null", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _normalize_score_value(item: Any, value: Any) -> object | None:
    kind = _score_kind(item)
    if value is None:
        return None

    if kind in {"scale4", "scale10"}:
        if isinstance(value, bool):
            return None
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return None
        if kind == "scale4" and 1 <= parsed <= 4:
            return parsed
        if kind == "scale10" and 0 <= parsed <= 10:
            return parsed
        return None

    if kind == "enum":
        parsed = str(value)
        values = _enum_values(item)
        if values and parsed not in values:
            return None
        return parsed

    if kind == "dollar":
        if isinstance(value, bool):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    if isinstance(value, dict):
        return value
    return None


def score_answer(item, answer: str, history: list) -> object | None:
    client = _client()
    tool = _build_score_tool(item)
    kind = _score_kind(item)

    system_instruction = (
        "Parse one Mallard Management intake answer into a typed score. "
        "Use only the item question, rubric, and user answer. "
        "Return submit_score(addressed=false) when the answer is too vague, "
        "off-topic, or does not actually answer the item. Be conservative; "
        "prefer addressed=false over guessing."
    )
    prompt = {
        "item_key": _item_key(item),
        "score_kind": kind,
        "question": _item_question(item),
        "rubric": _item_rubric(item),
        "typed_value_rules": {
            "scale4": "integer 1..4",
            "scale10": "integer 0..10",
            "enum": _enum_values(item),
            "dollar": "number",
            "freeform": "small object with only fields named in the rubric",
        },
        "user_answer": answer,
    }
    contents = [
        types.Content(
            role="user",
            parts=[types.Part(text=json.dumps(prompt, ensure_ascii=True, indent=2))],
        )
    ]

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        tools=[tool],
        temperature=0.0,
        max_output_tokens=512,
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=contents,
        config=config,
    )

    args = _function_call_args(response, "submit_score")
    if args is None:
        args = _json_from_text(getattr(response, "text", "") or "")
    if args is None:
        return None

    if args is None or args == "null":
        return None
    if isinstance(args, dict) and args.get("addressed") is False:
        return None
    value = args.get("value") if isinstance(args, dict) else args
    return _normalize_score_value(item, value)


def render_question(item, history: list) -> Generator[str, None, None]:
    client = _client()

    # Only the user's most recent answer is provided, purely for a natural lead-in.
    # We deliberately do NOT replay the whole transcript here — doing so lets the
    # model free-wheel and invent off-script questions (e.g. asking about 401k).
    last_user = ""
    for message in reversed(history):
        role, content = _message_role_content(message)
        if role == "user":
            last_user = content or ""
            break

    instruction = (
        "Ask ONLY the question below, rephrased warmly and conversationally as your entire "
        "reply. You may add at most one short, friendly lead-in clause reacting to the user's "
        "last message. Do NOT add, merge, substitute, or invent any other question, and do NOT "
        "ask about anything not contained in this exact question. Never show numbered options, "
        "letter choices, or scale anchors.\n\n"
        f"THE ONE QUESTION TO ASK: {_item_question(item)}"
    )
    contents: list[Any] = []
    if last_user:
        contents.append(
            types.Content(role="user", parts=[types.Part(text=f"(The user's last message was: {last_user})")])
        )
    contents.append(types.Content(role="user", parts=[types.Part(text=instruction)]))

    system_instruction = (
        "You are Mallard Management's intake specialist. You are handed EXACTLY ONE question to "
        "ask this turn. Your only job is to ask that single question, conversationally and warmly, "
        "in your own words. Never invent or substitute a different question. Never ask about any "
        "topic outside the given question. Never show numbered options, letter choices, or scale anchors."
    )
    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=0.4,
        max_output_tokens=300,
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )

    for chunk in client.models.generate_content_stream(
        model=GEMINI_MODEL,
        contents=contents,
        config=config,
    ):
        if chunk.text:
            yield chunk.text


def _first_user_seed(history: list) -> Any:
    for message in history:
        role, content = _message_role_content(message)
        if role == "user":
            if isinstance(message, dict):
                extra = {
                    key: value
                    for key, value in message.items()
                    if key not in {"role", "content"}
                }
                if extra:
                    return extra
            return content
    return {}


def _extract_json_object(text: str) -> dict[str, Any]:
    text = text.strip()
    if not text:
        return {}

    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            pass

    data: dict[str, Any] = {}
    for line in text.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip().lower().replace(" ", "_").replace("-", "_")
        if not key:
            continue
        data[key] = value.strip()
    return data


def _seed_data(history: list) -> dict[str, Any]:
    seed = _first_user_seed(history)
    if isinstance(seed, dict):
        return seed
    return _extract_json_object(str(seed or ""))


def _coerce_number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip().lower()
    if not text:
        return None
    multiplier = 1.0
    if text.endswith("k"):
        multiplier = 1000.0
        text = text[:-1]
    elif text.endswith("m"):
        multiplier = 1000000.0
        text = text[:-1]
    text = re.sub(r"[^0-9.\-]", "", text)
    if text in {"", ".", "-", "-."}:
        return None
    try:
        return float(text) * multiplier
    except ValueError:
        return None


def _coerce_int(value: Any) -> int | None:
    number = _coerce_number(value)
    if number is None:
        return None
    return int(round(number))


def _pick(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in data and data[key] not in (None, ""):
            return data[key]

    lowered = {str(key).lower(): value for key, value in data.items()}
    for key in keys:
        lowered_key = key.lower()
        if lowered_key in lowered and lowered[lowered_key] not in (None, ""):
            return lowered[lowered_key]
    return None


def _as_list(value: Any) -> list:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass
        return [part.strip() for part in re.split(r",|;", text) if part.strip()]
    return [value]


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        parsed = _extract_json_object(value)
        if parsed:
            return parsed
    return {}


def _score_at(scores: dict, *keys: str) -> Any:
    for key in keys:
        if key in scores and scores[key] is not None:
            return scores[key]
    return None


def _gl_index(item: Any) -> int | None:
    explicit = _get(item, "gl_index")
    if explicit is not None:
        try:
            return int(explicit)
        except (TypeError, ValueError):
            return None

    match = re.fullmatch(r"GL(\d+)", _item_key(item))
    if not match:
        return None
    return int(match.group(1)) - 1


def _risk_responses_from_scores(scores: dict, base: Any = None) -> list[Any]:
    responses = list(base) if isinstance(base, list) and len(base) == 13 else [None] * 13
    for item in SCRIPT:
        key = _item_key(item)
        if not re.fullmatch(r"GL\d+", key):
            continue
        if key not in scores or scores[key] is None:
            continue
        index = _gl_index(item)
        if index is None or not 0 <= index < 13:
            continue
        responses[index] = _coerce_int(scores[key])
    return responses


def _employment_blob(seed: dict[str, Any]) -> str:
    fields = [
        "employment",
        "employment_type",
        "employer",
        "job_title",
        "title",
        "industry",
        "company_size",
        "tenure",
        "tenure_years",
    ]
    return " ".join(str(_pick(seed, field) or "") for field in fields).lower()


def _infer_income_stability(seed: dict[str, Any]) -> str:
    blob = _employment_blob(seed)
    tenure = _coerce_number(_pick(seed, "tenure_years", "years_at_employer", "tenure"))
    company_size = _coerce_number(_pick(seed, "company_size", "employer_size"))

    stock_like = [
        "freelance",
        "self-employed",
        "self_employed",
        "commission",
        "startup",
        "founder",
        "gig",
        "seasonal",
        "part-time",
        "part_time",
        "temporary",
        "unemployed",
    ]
    if any(term in blob for term in stock_like):
        return "stock_like"
    if tenure is not None and tenure < 1:
        return "stock_like"

    bond_like = [
        "government",
        "public sector",
        "military",
        "tenured",
        "civil service",
    ]
    if any(term in blob for term in bond_like):
        return "bond_like"
    if (
        ("salary" in blob or "salaried" in blob or "full-time" in blob or "full_time" in blob)
        and tenure is not None
        and tenure >= 3
        and (company_size is None or company_size >= 500)
    ):
        return "bond_like"

    return "mixed"


def _draft_profile(seed: dict[str, Any], scores: dict) -> dict[str, Any]:
    goals_horizon = _as_dict(_score_at(scores, "goals_horizon"))
    debts_value = _score_at(scores, "debts")
    preferences = _as_dict(_score_at(scores, "preferences"))

    draft: dict[str, Any] = {
        "household_income": _coerce_number(_pick(seed, "household_income", "annual_household_income", "annual_income", "income")),
        "monthly_expenses": _coerce_number(_pick(seed, "monthly_expenses", "monthly_essential_expenses", "essential_expenses")),
        "capital_on_hand": _coerce_number(_pick(seed, "capital_on_hand", "liquid_capital", "available_capital", "cash_available")),
        "emergency_fund": _coerce_number(_pick(seed, "emergency_fund", "emergency_fund_balance")),
        "debts": _as_list(debts_value.get("debts") if isinstance(debts_value, dict) else debts_value),
        "age": _coerce_int(_pick(seed, "age")),
        "horizon_years": _coerce_int(_score_at(scores, "horizon_years") or goals_horizon.get("horizon_years")),
        "goals": _as_list(_score_at(scores, "goals") or goals_horizon.get("goals")),
        "goal_target": _coerce_number(_score_at(scores, "goal_target")),
        "dependents": _coerce_int(_pick(seed, "dependents", "number_of_dependents")) or 0,
        "filing_status": _pick(seed, "filing_status", "tax_filing_status"),
        "risk_instrument_responses": _risk_responses_from_scores(scores),
        "loss_scenario_response": _score_at(scores, "loss_scenario_response", "loss_scenario"),
        "dohmen_risk": _coerce_int(_score_at(scores, "dohmen_risk", "dohmen")),
        "loss_aversion_probe": _coerce_number(_score_at(scores, "loss_aversion_probe", "loss_aversion")),
        "income_stability": _infer_income_stability(seed),
        "universe_pref": _score_at(scores, "universe_pref") or preferences.get("universe_pref"),
        "esg_exclusions": _as_list(_score_at(scores, "esg_exclusions") or preferences.get("esg_exclusions") or preferences.get("esg")),
        "sector_theme_tilts": _as_list(
            _score_at(scores, "sector_theme_tilts", "sector_tilts")
            or preferences.get("sector_theme_tilts")
            or preferences.get("sector_tilts")
            or preferences.get("tilts")
        ),
        "confidence": {},
        "uncertainty_flags": [],
    }
    return draft


def _without_nones(data: dict[str, Any]) -> dict[str, Any]:
    cleaned: dict[str, Any] = {}
    for key, value in data.items():
        if value is None:
            continue
        if isinstance(value, list):
            cleaned[key] = [_without_nones(v) if isinstance(v, dict) else v for v in value if v is not None]
        elif isinstance(value, dict):
            cleaned[key] = _without_nones(value)
        else:
            cleaned[key] = value
    return cleaned


def _merge_profile_args(model_args: Any, draft: dict[str, Any], scores: dict) -> dict[str, Any]:
    merged = model_args if isinstance(model_args, dict) else {}
    merged = dict(merged)

    for key, value in _without_nones(draft).items():
        if key == "risk_instrument_responses":
            continue
        merged[key] = value

    merged["risk_instrument_responses"] = _risk_responses_from_scores(
        scores,
        merged.get("risk_instrument_responses"),
    )
    if "debts" not in merged:
        merged["debts"] = []
    if "goals" not in merged:
        merged["goals"] = []
    if "esg_exclusions" not in merged:
        merged["esg_exclusions"] = []
    if "sector_theme_tilts" not in merged:
        merged["sector_theme_tilts"] = []
    if "confidence" not in merged:
        merged["confidence"] = {}
    if "uncertainty_flags" not in merged:
        merged["uncertainty_flags"] = []
    return _without_nones(merged)


def assemble_profile(history: list, scores: dict) -> dict:
    client = _client()
    seed = _seed_data(history)
    draft = _draft_profile(seed, scores)
    payload = {
        "intake_form_seed": seed,
        "collected_scores": scores,
        "deterministic_profile_draft": draft,
        "instructions": (
            "Call submit_profile exactly once with a complete engine profile. "
            "Use intake_form_seed for form fields, collected_scores for chat-scored "
            "fields, and deterministic_profile_draft for income_stability and GL "
            "index mapping. Do not ask follow-up questions."
        ),
    }
    contents = [
        types.Content(
            role="user",
            parts=[types.Part(text=json.dumps(payload, ensure_ascii=True, indent=2, default=str))],
        )
    ]

    config = types.GenerateContentConfig(
        system_instruction=(
            "You assemble Mallard Management intake data into the submit_profile "
            "function schema. Use only the supplied seed data and scores. Do not "
            "invent missing facts."
        ),
        tools=[SUBMIT_PROFILE_TOOL],
        temperature=0.0,
        max_output_tokens=2048,
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=contents,
        config=config,
    )

    args = _function_call_args(response, "submit_profile")
    if args is None:
        args = _json_from_text(getattr(response, "text", "") or "")
    return _merge_profile_args(args, draft, scores)
