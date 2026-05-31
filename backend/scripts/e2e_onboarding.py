import argparse
import itertools
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid


DEFAULT_FALLBACK_ANSWERS = [
    "Retirement, about 30 years from now.",
    "No debts.",
    "I'd hold and stay invested.",
    "Some experience, comfortable with the basics.",
    "About a 6.",
    "A mix of ETFs and stocks, nothing to exclude.",
]

CONTRADICTORY_ANSWERS = [
    "I'd panic and sell everything.",
    "I'd go all-in, maximum risk.",
]


def _api_url(base, path, params=None):
    url = base.rstrip("/") + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    return url


def _json_request(url, body, accept=None):
    headers = {"Content-Type": "application/json"}
    if accept:
        headers["Accept"] = accept
    return urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )


def _iter_sse_events(response):
    for raw_line in iter(response.readline, b""):
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith(b"data:"):
            line = line[5:].strip()
        if not line or line == b"[DONE]":
            continue
        yield json.loads(line.decode("utf-8"))


def _stream_chat(base, messages, session_id):
    body = {"messages": messages}
    if session_id:
        body["session_id"] = session_id

    request = _json_request(
        _api_url(base, "/api/v1/chat"),
        body,
        accept="text/event-stream",
    )
    with urllib.request.urlopen(request) as response:
        for event in _iter_sse_events(response):
            yield event


def _post_json(url, body):
    request = _json_request(url, body)
    try:
        with urllib.request.urlopen(request) as response:
            status = response.getcode()
            raw_body = response.read()
    except urllib.error.HTTPError as exc:
        status = exc.code
        raw_body = exc.read()

    text = raw_body.decode("utf-8", "replace")
    if not text:
        return status, {}, text

    try:
        parsed = json.loads(text)
    except ValueError:
        parsed = None
    return status, parsed, text


def _one_line(text):
    return re.sub(r"\s+", " ", text).strip()


def _cooperative_answer(question, fallback_answers):
    text = question.lower()
    rules = [
        (
            ("goal", "horizon", "retire", "timeline"),
            "Retirement, about 30 years from now.",
        ),
        (("debt", "loan", "liabilit"), "No debts."),
        (
            ("drop", "crash", "decline", "market", "portfolio lose"),
            "I'd hold and stay invested.",
        ),
        (
            ("windfall", "inherit", "bonus", "lump sum"),
            "I'd put it in a diversified mix of stocks and bonds.",
        ),
        (
            ("experience", "familiar", "comfort", "knowledge"),
            "Some experience, comfortable with the basics.",
        ),
        (
            ("scale", "rate", "0 to 10", "zero to ten", "willingness"),
            "About a 6.",
        ),
        (
            ("bet", "lose", "win", "gamble", "wager"),
            "I'd want to win at least 50.",
        ),
        (
            ("amount", "target", "how much", "million"),
            "Around 1.5 million dollars.",
        ),
        (
            ("prefer", "etf", "stock", "bond", "exclude", "restrict"),
            "A mix of ETFs and stocks, nothing to exclude.",
        ),
    ]
    for keywords, answer in rules:
        if any(keyword in text for keyword in keywords):
            return answer
    return next(fallback_answers)


def _choose_answer(question, persona, fallback_answers, contradictory_answers):
    if persona == "contradictory":
        return next(contradictory_answers)
    return _cooperative_answer(question, fallback_answers)


def run_chat(base, answers, persona="cooperative"):
    fallback_seed = list(answers) if answers else list(DEFAULT_FALLBACK_ANSWERS)
    fallback_answers = itertools.cycle(fallback_seed)
    contradictory_answers = itertools.cycle(CONTRADICTORY_ANSWERS)
    session_id = None
    transcript = [
        {
            "role": "user",
            "content": "I want to complete onboarding and build an investment portfolio.",
        }
    ]

    for _turn in range(30):
        assistant_text = ""
        for event in _stream_chat(base, transcript, session_id):
            event_type = event.get("type")
            if event_type == "session":
                session_id = event.get("session_id") or session_id
            elif event_type == "token":
                assistant_text += event.get("content") or ""
            elif event_type == "profile_ready":
                return event.get("profile"), session_id, transcript
            elif event_type == "error":
                raise RuntimeError("chat error event: %s" % json.dumps(event))

        question = _one_line(assistant_text)
        if not question:
            raise RuntimeError("chat ended without assistant content or profile_ready")

        answer = _choose_answer(
            question,
            persona,
            fallback_answers,
            contradictory_answers,
        )
        print("Q: %s" % question)
        print("A: %s" % answer)
        transcript.append({"role": "assistant", "content": question})
        transcript.append({"role": "user", "content": answer})

    raise RuntimeError("chat exceeded 30 turns without profile_ready")


def _onboard(base, email, session_id, profile):
    params = {"user_email": email, "session_id": session_id or ""}
    return _post_json(_api_url(base, "/api/v1/onboard", params), profile)


def _evaluate_onboard(status, response, persona):
    if status != 200:
        return False, "onboard HTTP %s" % status
    if not isinstance(response, dict):
        return False, "onboard response was not JSON object"

    onboard_status = response.get("status")
    if persona == "contradictory":
        if onboard_status == "needs_clarification":
            return False, "onboard status was needs_clarification"
        return True, ""

    if onboard_status == "no_profile":
        return False, "onboard status was no_profile"
    if onboard_status == "needs_clarification":
        return False, "onboard status was needs_clarification"
    if onboard_status == "greenlight" and not response.get("portfolio"):
        return False, "greenlight response did not include portfolio"
    return True, ""


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Run the onboarding-to-portfolio end-to-end check."
    )
    parser.add_argument("--base", default="http://localhost:8000")
    parser.add_argument(
        "--email",
        default="test_%s@mallard-test.com" % uuid.uuid4().hex[:8],
    )
    parser.add_argument(
        "--persona",
        choices=["cooperative", "contradictory"],
        default="cooperative",
    )
    args = parser.parse_args(argv)

    try:
        profile, session_id, _transcript = run_chat(
            args.base,
            DEFAULT_FALLBACK_ANSWERS,
            persona=args.persona,
        )
        status, response, body_text = _onboard(
            args.base,
            args.email,
            session_id,
            profile,
        )
        passed, reason = _evaluate_onboard(status, response, args.persona)
        if not passed and body_text:
            reason = "%s: %s" % (reason, _one_line(body_text))
    except Exception as exc:
        print("E2E FAIL: %s" % exc)
        return 1

    if passed:
        print("E2E PASS")
        return 0

    print("E2E FAIL: %s" % reason)
    return 1


if __name__ == "__main__":
    sys.exit(main())
