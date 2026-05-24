"""Rubric-based Feynman accuracy scoring (Plan G.4).

Pipeline
--------
1. Extract 5–10 key concepts from the chosen source via one strict-JSON LLM
   call. Cached per (cache_key, model) so the same source always yields the
   same concept list within the process.
2. For each concept, judge the student explanation as `covered` | `partial`
   | `missing` (one narrow LLM call per concept; safer than free-form
   judgment of the whole explanation).
3. Compose:
       accuracy = Σ (weight[status] × importance) / Σ importance
       weight   = {covered: 1.0, partial: 0.5, missing: 0.0}

The per-concept status list IS the CoverageMap surfaced in UX_v3 §6.6.

Why this is defensible
----------------------
- Concepts are concrete (importance-weighted), not subjective.
- Each concept is independently judged; LLM noise averages out across N.
- Same source + explanation → same concept list (cache) → same score.
- The rubric is documented; users can challenge individual concepts.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from typing import Iterable

import redis.asyncio as aredis
from langchain_core.messages import HumanMessage, SystemMessage

from app.config import settings
from app.ingestion.chroma_store import query_chunks
from app.llm.providers import get_llm

_VALID_STATUS = {'covered', 'partial', 'missing'}

# In-process cache keyed by (source_fingerprint, model) → concept list.
# Bounded so a long-running ai-engine doesn't accrete forever.
_CONCEPT_CACHE: dict[tuple[str, str], list[dict]] = {}
_CONCEPT_CACHE_MAX = 256

# Per-concept verdict cache keyed by (concept_label, explanation_hash, model).
# Even with temperature=0, OpenAI is not bit-exact across runs (GPU
# non-determinism). Memoizing the verdict pins the score to whatever the
# first call returned for a given input triple — so the same explanation
# always grades the same way within a process lifetime.
_VERDICT_CACHE: dict[tuple[str, str, str], str] = {}
_VERDICT_CACHE_MAX = 2048

# ── Redis L2 cache ───────────────────────────────────────────────────────────
# Cross-restart determinism: the in-process dicts above are wiped when ai-engine
# restarts, which means the first grade of any given explanation after restart
# is unpinned. Redis pins it across restarts (and across worker processes).
#
# Failure model: every Redis call is wrapped in try/except. If Redis is down,
# we fall through to the in-process cache and the LLM — grading still works.
# v4: concept extraction now rejects pedagogical scaffolding (Sample Problems,
# Exercises, Summary, etc.) — those are textbook section headings, not
# first-class concepts. Previously these were being extracted and trivially
# marked covered, inflating scores.
_REDIS_KEY_PREFIX = 'rubric:v4'
_REDIS_TTL_SECONDS = 30 * 24 * 3600  # 30 days; bump the prefix above to invalidate

_REDIS_CLIENT: aredis.Redis | None = None
_REDIS_INIT_TRIED = False
# Tests flip this to False to skip the network entirely.
_REDIS_ENABLED = True


async def _redis() -> aredis.Redis | None:
    """Lazy singleton. Returns None if Redis is unreachable (one-shot probe)."""
    global _REDIS_CLIENT, _REDIS_INIT_TRIED
    if not _REDIS_ENABLED:
        return None
    if _REDIS_INIT_TRIED:
        return _REDIS_CLIENT
    _REDIS_INIT_TRIED = True
    try:
        client = aredis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        await client.ping()
        _REDIS_CLIENT = client
        logging.info('rubric: redis cache enabled (%s)', settings.redis_url)
    except Exception as exc:
        logging.warning('rubric: redis unavailable, in-process cache only: %s', exc)
        _REDIS_CLIENT = None
    return _REDIS_CLIENT


def _stable_hash(s: str) -> str:
    # sha1 is salt-free across processes (unlike Python's hash()), which is
    # required for the Redis key to be reproducible.
    return hashlib.sha1(s.encode('utf-8'), usedforsecurity=False).hexdigest()[:16]


def _verdict_redis_key(label: str, explanation: str, model_name: str) -> str:
    return (f'{_REDIS_KEY_PREFIX}:verdict:{model_name or "_"}:'
            f'{_stable_hash(label)}:{_stable_hash(explanation[:4000])}')


def _concepts_redis_key(source_text: str, model_name: str) -> str:
    return (f'{_REDIS_KEY_PREFIX}:concepts:{model_name or "_"}:'
            f'{_stable_hash(source_text[:8000])}')


def _concepts_topic_redis_key(topic: str, model_name: str) -> str:
    # Topic-only concepts live in a separate Redis namespace so they never
    # collide with source-grounded concepts (different prompts → different
    # expected outputs).
    return (f'{_REDIS_KEY_PREFIX}:concepts_topic:{model_name or "_"}:'
            f'{_stable_hash(topic.strip().lower()[:200])}')


def _cache_key(source_text: str, model: str) -> tuple[str, str]:
    # Uses the same stable hash as the Redis key so L1 and L2 stay aligned.
    return (_stable_hash(source_text[:8000]), model or '')


def _truncate_for_concepts(chunks: Iterable[str], max_chars: int = 8000) -> str:
    out: list[str] = []
    total = 0
    for c in chunks:
        if not c:
            continue
        remaining = max_chars - total
        if remaining <= 0:
            break
        out.append(c[:remaining])
        total += min(len(c), remaining)
    return '\n\n---\n\n'.join(out)


_CONCEPT_PROMPT = """You extract concepts for a study-aid rubric.

SOURCE TEXT:
{source}

Return ONLY a JSON array (no prose) of 5-10 key concepts:
[
  {{"id": "c1", "label": "<short label, 2-5 words>", "importance": <1|2|3>}},
  ...
]

Rules:
- A "concept" is a definable idea, principle, law, equation, property, or
  mechanism that a student would need to UNDERSTAND. Things that have
  substance worth grading.
- DO NOT extract pedagogical scaffolding or section headings as concepts —
  these are NOT graded:
    * "Sample Problems", "Worked Examples", "Practice Problems"
    * "Exercises", "Review Questions", "Quiz Questions"
    * "Summary", "Overview", "Introduction", "Conclusion"
    * "Further Reading", "References", "Bibliography"
    * Chapter/section numbers or titles ("Chapter 3", "Section 2.1")
  If the source text contains these, skip them — extract only the substantive
  concepts being taught.
- importance: 3 = central / definitional, 2 = important, 1 = nice-to-know.
- Concepts must be distinct (no near-duplicates).
- Use simple labels a student would recognise.
- Output MUST be valid JSON. No markdown fences."""


# Used when the user has no source material that matches the topic. The
# rubric falls back to the LLM's general knowledge of the topic. The
# resulting concept list is what any well-rounded explanation would need
# to cover — *not* anchored to the user's textbook, so the FE should
# label this as a generic grading mode (no source attached).
_CONCEPT_PROMPT_TOPIC_ONLY = """You extract concepts for a study-aid rubric.

The student picked the topic below but has not attached source material,
so use your general knowledge of the topic to enumerate the key concepts
any thorough explanation would need to cover.

TOPIC: {topic}

Return ONLY a JSON array (no prose) of 5-10 key concepts:
[
  {{"id": "c1", "label": "<short label, 2-5 words>", "importance": <1|2|3>}},
  ...
]

Rules:
- A "concept" is a definable idea, principle, law, equation, property, or
  mechanism that a student would need to UNDERSTAND.
- Stick to concepts that are CANONICAL to the topic across standard
  textbooks. Avoid niche specialisations or your own opinions.
- importance: 3 = central / definitional, 2 = important, 1 = nice-to-know.
- Concepts must be distinct (no near-duplicates).
- Use simple labels a student would recognise.
- Output MUST be valid JSON. No markdown fences."""


def _parse_json(raw: str) -> object | None:
    if not raw:
        return None
    # Strip markdown fences if a model adds them despite instructions.
    cleaned = raw.strip()
    cleaned = re.sub(r'^```(?:json)?', '', cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r'```$', '', cleaned).strip()
    try:
        return json.loads(cleaned)
    except Exception:
        # Try to slice the first array/object out.
        for opener, closer in (('[', ']'), ('{', '}')):
            i = cleaned.find(opener)
            j = cleaned.rfind(closer)
            if i != -1 and j != -1 and j > i:
                try:
                    return json.loads(cleaned[i:j + 1])
                except Exception:
                    continue
    return None


def _store_concepts_l1(key: tuple[str, str], concepts: list[dict]) -> None:
    if len(_CONCEPT_CACHE) >= _CONCEPT_CACHE_MAX:
        _CONCEPT_CACHE.pop(next(iter(_CONCEPT_CACHE)))
    _CONCEPT_CACHE[key] = concepts


# Section-heading / scaffolding labels that aren't real concepts. Belt-and-
# braces with the prompt — if the LLM slips one in, we drop it here too.
_SCAFFOLDING_PATTERNS = (
    'sample problem', 'worked example', 'practice problem',
    'exercise', 'review question', 'quiz question',
    'summary', 'overview', 'introduction', 'conclusion',
    'further reading', 'reference', 'bibliography',
)


def _is_scaffolding(label: str) -> bool:
    lo = label.lower().strip()
    return any(pat in lo for pat in _SCAFFOLDING_PATTERNS)


def _normalise_concepts(parsed: object) -> list[dict]:
    """Coerce LLM output (or Redis-decoded JSON) into the canonical shape."""
    concepts: list[dict] = []
    if not isinstance(parsed, list):
        return concepts
    for i, item in enumerate(parsed):
        if not isinstance(item, dict):
            continue
        label = str(item.get('label') or '').strip()
        if not label:
            continue
        if _is_scaffolding(label):
            continue
        try:
            importance = int(item.get('importance', 2))
        except (TypeError, ValueError):
            importance = 2
        importance = max(1, min(3, importance))
        cid = str(item.get('id') or f'c{i + 1}').strip() or f'c{i + 1}'
        concepts.append({'id': cid, 'label': label, 'importance': importance})
    return concepts[:10]


async def _extract_concepts_from_topic(
    topic: str,
    model_name: str,
    provider: str | None,
    model: str | None,
) -> list[dict]:
    """LLM-only concept extraction. Used when no source material matches.

    Cached per (topic, model) so the same topic always yields the same list.
    """
    key = (f'topic|{topic.strip().lower()}', model_name)
    cached = _CONCEPT_CACHE.get(key)
    if cached is not None:
        return cached

    rkey = _concepts_topic_redis_key(topic, model_name)
    client = await _redis()
    if client is not None:
        try:
            raw = await client.get(rkey)
            if isinstance(raw, str) and raw:
                concepts = _normalise_concepts(json.loads(raw))
                if concepts:
                    _store_concepts_l1(key, concepts)
                    return concepts
        except Exception as exc:
            logging.warning('rubric: redis topic-concepts read failed: %s', exc)

    llm = get_llm(provider, model, temperature=0.0)
    prompt = _CONCEPT_PROMPT_TOPIC_ONLY.format(topic=topic.strip())
    try:
        resp = await llm.ainvoke([
            SystemMessage(content='You output strictly valid JSON.'),
            HumanMessage(content=prompt),
        ])
        parsed = _parse_json(resp.content)
    except Exception as exc:
        logging.warning('rubric: topic-concept extraction failed: %s', exc)
        parsed = None

    concepts = _normalise_concepts(parsed)
    _store_concepts_l1(key, concepts)
    if client is not None and concepts:
        try:
            await client.set(rkey, json.dumps(concepts), ex=_REDIS_TTL_SECONDS)
        except Exception as exc:
            logging.warning('rubric: redis topic-concepts write failed: %s', exc)
    return concepts


async def _extract_concepts(
    source_text: str,
    cache_key: str,
    model_name: str,
    provider: str | None,
    model: str | None,
) -> list[dict]:
    key = (cache_key, model_name)

    # L1: in-process dict.
    cached = _CONCEPT_CACHE.get(key)
    if cached is not None:
        return cached

    # L2: Redis — concept lists persist across restarts so a given source
    # always yields the same concepts (without re-paying the extraction call).
    rkey = _concepts_redis_key(source_text, model_name)
    client = await _redis()
    if client is not None:
        try:
            raw = await client.get(rkey)
            if isinstance(raw, str) and raw:
                concepts = _normalise_concepts(json.loads(raw))
                if concepts:
                    _store_concepts_l1(key, concepts)
                    return concepts
        except Exception as exc:
            logging.warning('rubric: redis concepts read failed: %s', exc)

    # temperature=0 makes the rubric reproducible — same source + same model
    # always returns the same concept list (even on a cache miss).
    llm = get_llm(provider, model, temperature=0.0)
    prompt = _CONCEPT_PROMPT.format(source=source_text)
    try:
        resp = await llm.ainvoke([
            SystemMessage(content='You output strictly valid JSON.'),
            HumanMessage(content=prompt),
        ])
        parsed = _parse_json(resp.content)
    except Exception as exc:
        logging.warning('rubric: concept extraction failed: %s', exc)
        parsed = None

    concepts = _normalise_concepts(parsed)
    _store_concepts_l1(key, concepts)
    if client is not None and concepts:
        try:
            await client.set(rkey, json.dumps(concepts), ex=_REDIS_TTL_SECONDS)
        except Exception as exc:
            logging.warning('rubric: redis concepts write failed: %s', exc)
    return concepts


_JUDGE_PROMPT = """A student is being graded on ONE concept from their study material.

CONCEPT: {label}

REFERENCE PASSAGE (for context on what this concept means — the student is
NOT required to mirror its exact wording, examples, or framing):
{passage}

STUDENT EXPLANATION:
{explanation}

Decide whether the student actually EXPLAINED the concept, not just used the
words. The distinction is strict:

- Using the term in passing ("electrostatic force of attraction") is NOT
  explaining what electrostatic force is.
- Saying "the charges" is NOT explaining what electric charge is.
- Naming a unit ("in coulombs") is NOT explaining the unit.

To count as explained, the student must DEFINE, DERIVE, ILLUSTRATE, or
unpack the concept — give it substance a reader could learn from.
Equivalent reformulations and alternate textbook framings are fine, as long
as the substance is there.

Reply with EXACTLY ONE word, lower-case, no punctuation:
- covered   — the concept is actually unpacked or defined, and what's said
              about it is factually correct (any valid framing counts).
- partial   — the concept is touched on with some substance but is vague,
              incomplete, gives only a partial definition, or has a minor
              factual error.
- missing   — the concept is not addressed, or only name-checked in
              passing without being explained, or the explanation is
              substantively wrong.

Worked examples for calibration:

  Concept: "Electric Charge"
  Explanation: "Two charged objects repel or attract."
  → missing  (uses "charged" but never explains what charge is)

  Concept: "Electric Charge"
  Explanation: "Charge is a property of matter; it comes in positive and
                negative types and like charges repel."
  → covered  (defines what charge is)

  Concept: "Coulomb's Law"
  Explanation: "Force is proportional to the product of charges and
                inversely proportional to the square of the distance."
  → covered  (unpacks the law itself)

  Concept: "Quantization of Charge"
  Explanation: "Charges interact via Coulomb's Law."
  → missing  (never mentions that charge comes in discrete units of e)

Output: the single word."""


def _store_verdict_l1(cache_key: tuple[str, str, str], verdict: str) -> None:
    if len(_VERDICT_CACHE) >= _VERDICT_CACHE_MAX:
        _VERDICT_CACHE.pop(next(iter(_VERDICT_CACHE)))
    _VERDICT_CACHE[cache_key] = verdict


_DIFFICULTY_DIRECTIVES = {
    'easy': (
        "STRICTNESS: LENIENT (recall-level mastery).\n"
        "You are grading a beginner's first attempt. Credit sincere "
        "engagement that shows the student has begun to reason about the "
        "concept, even if their phrasing is rough.\n"
        "- covered: ANY substantive description of what the concept is or "
        "what it does — a single accurate sentence is enough. Minor "
        "imprecision is fine.\n"
        "- partial: gestures at the concept in a related context, names "
        "it but does not describe, or describes it with a clear factual "
        "slip.\n"
        "- missing: concept does not appear at all.\n"
        "When borderline between two levels, ROUND UP."
    ),
    'medium': (
        "STRICTNESS: STANDARD (working understanding).\n"
        "Apply the rules above as written. Hold the line in both "
        "directions: do not round up to encourage; do not round down "
        "to be strict. A real explanation gets covered; a vague mention "
        "gets partial; a name-only reference gets missing."
    ),
    'hard': (
        "STRICTNESS: STRICT (exam-prep mastery).\n"
        "Treat this like an oral exam in a senior undergraduate course. "
        "A concept counts as covered ONLY when the explanation is BOTH "
        "factually correct AND complete enough that another student "
        "could learn the concept from it alone — including mechanism or "
        "definition, conditions of applicability, and at least one "
        "concrete example, implication, or limit.\n"
        "- partial: correct but missing depth, qualifiers, examples, or "
        "the *why* behind the *what*.\n"
        "- missing: anything below partial, OR any factual error, even "
        "if the surrounding prose looks fluent.\n"
        "When borderline between two levels, ROUND DOWN. Be sparing "
        "with 'covered'."
    ),
}


# Partial-credit weights per difficulty. The rubric directives push the LLM
# toward different verdict distributions, but identical weights meant the
# numeric score only shifted via the verdict mix; "partial" weighed the same
# whether the student was on easy or hard. Tightening the partial weight on
# hard makes strictness mean something at the score level too.
_STATUS_WEIGHTS_BY_DIFFICULTY = {
    'easy':   {'covered': 1.0, 'partial': 0.7, 'missing': 0.0},
    'medium': {'covered': 1.0, 'partial': 0.5, 'missing': 0.0},
    'hard':   {'covered': 1.0, 'partial': 0.3, 'missing': 0.0},
}


def _weights_for(difficulty: str) -> dict:
    return _STATUS_WEIGHTS_BY_DIFFICULTY.get(
        difficulty if difficulty in _STATUS_WEIGHTS_BY_DIFFICULTY else 'medium',
        _STATUS_WEIGHTS_BY_DIFFICULTY['medium'],
    )


def _parse_judge_response(raw: str) -> str:
    """Parse the LLM verdict deterministically.

    The judge prompt asks for ONE WORD, but in practice models prepend
    qualifiers ("partially covered.", "I'd say missing", "covered (mostly)").
    Previous implementation iterated a set and used `status in text`, which:
      - had non-deterministic order (Python sets aren't ordered)
      - returned 'covered' for "partially covered" because 'covered' is a
        substring of 'partially covered'

    Priority order is fixed: `partial` is checked first so "partially covered"
    parses as partial, then `missing` (catches "almost missing"), then
    `covered`. Leading word-boundary only (no trailing one) so prefix
    inflections — "partially", "missingly" — still match the intended verdict.
    """
    text = (raw or '').strip().lower()
    if not text:
        return 'missing'
    for status in ('partial', 'missing', 'covered'):
        if re.search(rf'\b{status}', text):
            return status
    return 'missing'


async def _judge_concept(
    concept: dict,
    explanation: str,
    source_text: str,
    provider: str | None,
    model: str | None,
    difficulty: str = 'medium',
) -> str:
    model_name = (model or '') if isinstance(model, str) else ''
    label = str(concept.get('label') or '')
    # Cache key includes difficulty — changing it must not return a verdict
    # graded under a different strictness setting.
    diff_key = difficulty if difficulty in _DIFFICULTY_DIRECTIVES else 'medium'
    expl_key = _stable_hash(explanation[:4000])
    cache_key = (f'{label}|{diff_key}', expl_key, model_name)

    # L1: in-process dict.
    cached = _VERDICT_CACHE.get(cache_key)
    if cached is not None:
        return cached

    # L2: Redis. Survives ai-engine restarts so grading-review jitter is gone.
    # The Redis key also segments by difficulty for the same reason as L1.
    rkey = _verdict_redis_key(f'{label}|{diff_key}', explanation, model_name)
    client = await _redis()
    if client is not None:
        try:
            rcached = await client.get(rkey)
            if isinstance(rcached, str) and rcached in _VALID_STATUS:
                _store_verdict_l1(cache_key, rcached)
                return rcached
        except Exception as exc:
            logging.warning('rubric: redis verdict read failed: %s', exc)

    # temperature=0 narrows variance; the cache pins the rest.
    llm = get_llm(provider, model, temperature=0.0)
    prompt = _JUDGE_PROMPT.format(
        label=label,
        passage=source_text[:2000],
        explanation=explanation[:4000],
    ) + '\n\n' + _DIFFICULTY_DIRECTIVES[diff_key]
    verdict = 'missing'
    try:
        resp = await llm.ainvoke([HumanMessage(content=prompt)])
        verdict = _parse_judge_response(resp.content or '')
    except Exception as exc:
        logging.warning('rubric: judge call failed for %s: %s', concept.get('id'), exc)

    _store_verdict_l1(cache_key, verdict)
    if client is not None:
        try:
            await client.set(rkey, verdict, ex=_REDIS_TTL_SECONDS)
        except Exception as exc:
            logging.warning('rubric: redis verdict write failed: %s', exc)
    return verdict


def _compose_score(judgements: list[dict], difficulty: str = 'medium') -> float:
    if not judgements:
        return 0.0
    weights = _weights_for(difficulty)
    num = 0.0
    den = 0.0
    for j in judgements:
        importance = float(j.get('importance', 1))
        weight = weights.get(j.get('status', 'missing'), 0.0)
        num += weight * importance
        den += importance
    if den <= 0:
        return 0.0
    return round(num / den, 4)


# Chunk relevance bar. Calibrated against OpenAI text-embedding-3-small,
# which returns *cosine distance* (not similarity) in roughly:
#   0.7–1.0  → strongly on-topic chunks for a short query
#   1.0–1.2  → adjacent / related material
#   1.4+     → off-topic
# A *relative* cap keeps only chunks within MULTIPLIER × best_distance,
# and an absolute ceiling discards anything above ~1.2 so a topic with
# no real match (best_dist itself > 1.2) yields no chunks at all and the
# rubric flips to generic mode.
_TOPIC_RELEVANCE_MULTIPLIER = 1.5
_TOPIC_RELEVANCE_ABSOLUTE_MAX = 1.2


def _topic_relevant_chunks(
    results: dict,
    multiplier: float = _TOPIC_RELEVANCE_MULTIPLIER,
    absolute_max: float = _TOPIC_RELEVANCE_ABSOLUTE_MAX,
) -> list[str]:
    """Filter chroma query results to chunks tightly clustered with the best
    hit. Returns the filtered list of chunk *documents*. Empty means the
    caller should fall back to topic-only generic mode.

    Two-stage filter:
      1. drop chunks beyond `absolute_max` (clearly unrelated material)
      2. drop chunks more than `multiplier × best_distance` away from the
         closest hit (dilution control — keeps the corpus on-topic)
    """
    docs = results.get('documents') or [[]]
    distances = results.get('distances') or [[]]
    if not docs or not docs[0]:
        return []
    raw_docs: list[str] = docs[0]
    raw_dists_in = distances[0] if distances and distances[0] else []

    if not raw_dists_in:
        # No distances returned — only possible from the legacy col.get()
        # codepath. We no longer call that path; if a caller somehow lands
        # here, accept all chunks since there's nothing to filter on.
        return [d for d in raw_docs if d]

    paired: list[tuple[str, float]] = []
    for doc, dist in zip(raw_docs, raw_dists_in):
        if not doc:
            continue
        try:
            paired.append((doc, float(dist)))
        except (TypeError, ValueError):
            continue
    if not paired:
        return []

    valid = [p for p in paired if p[1] <= absolute_max]
    if not valid:
        return []
    best = min(d for _, d in valid)
    bar = best * multiplier
    return [doc for doc, d in valid if d <= bar]


async def score_accuracy(
    explanation: str,
    *,
    user_id: str,
    study_set_id: str,
    document_id: str | None = None,
    difficulty: str = 'medium',
    topic: str | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> dict:
    """Return {score, concepts, coverage, summary, source} via the rubric pipeline.

    `source` is 'study_set' when grading was grounded in chunks from the
    user's uploaded material, 'generic' when we fell back to the LLM's
    general knowledge of the topic, or 'none' when neither path produced
    a concept list.

    `coverage` is shaped exactly as FeynmanSession.coverage expects:
    `[{ id, label, status }]` — drop the importance field for the FE.
    """
    model_name = (model or '') if isinstance(model, str) else ''

    # 1. Topic-grounded retrieval. Embed the topic and only keep chunks
    #    tightly clustered with the best hit (see _topic_relevant_chunks).
    #    A topic that has no real match in the user's library produces an
    #    empty list here — we deliberately do NOT fall back to col.get()
    #    arbitrary sampling, since grading against unrelated chunks
    #    surfaces wrong concepts (audit issue B).
    chunks: list[str] = []
    if topic:
        try:
            from app.llm.embeddings import get_embedding_model
            topic_emb = get_embedding_model().get_query_embedding(topic.strip())
            results = query_chunks(
                topic_emb, user_id, study_set_id,
                top_k=12, document_id=document_id,
            )
            chunks = _topic_relevant_chunks(results)
        except Exception as exc:
            logging.warning('rubric: topic-embedding fetch failed: %s', exc)
            chunks = []
    else:
        # No topic available (legacy/non-Feynman callers). Sample chunks
        # from the set so the rubric still has something to grade against.
        try:
            results = query_chunks(
                None, user_id, study_set_id,
                top_k=12, document_id=document_id,
            )
            chunks = _topic_relevant_chunks(results)
        except Exception as exc:
            logging.warning('rubric: chroma fetch failed: %s', exc)
            chunks = []

    # 2. Source-grounded path: chunks exist → extract grounded concepts.
    if chunks:
        source_text = _truncate_for_concepts(chunks)
        cache_key = _cache_key(source_text, model_name)[0]
        concepts = await _extract_concepts(
            source_text, cache_key, model_name, provider, model,
        )
        if concepts:
            return await _judge_and_compose(
                concepts, explanation, source_text,
                provider, model, difficulty, source='study_set',
            )
        # Concept extraction failed even though we had chunks. Fall through
        # to generic if we have a topic; otherwise return empty.

    # 3. Generic fallback: no usable chunks (or extraction failed) but the
    #    caller gave us a topic — grade against the LLM's general concept
    #    list for that topic, with an empty passage.
    if topic:
        topic_concepts = await _extract_concepts_from_topic(
            topic, model_name, provider, model,
        )
        if topic_concepts:
            return await _judge_and_compose(
                topic_concepts, explanation, '',
                provider, model, difficulty, source='generic',
            )

    return {
        'score':    0.0,
        'concepts': [],
        'coverage': [],
        'summary':  'No source material found — could not grade accuracy.',
        'source':   'none',
    }


async def topic_fit_check(
    *,
    topic: str,
    user_id: str,
    current_study_set_id: str | None = None,
    top_k: int = 20,
    advantage_margin: float = 0.15,
    max_candidates: int = 3,
) -> dict | None:
    """Search the user's chunks across ALL study sets for fit to `topic`.
    Returns the ordered list of candidate sets (each with its mean
    top-3 distance), the winner, and whether the FE should suggest a switch.

    Candidate filtering:
      - chunks beyond `_TOPIC_RELEVANCE_ABSOLUTE_MAX` are dropped before
        aggregation (clearly unrelated material)
      - sets whose mean is more than `_TOPIC_RELEVANCE_MULTIPLIER × best_mean`
        away from the winner are dropped (weakly-related dilution)
      - kept candidates are returned in ascending-distance order, capped at
        `max_candidates`

    When >1 set has relevant material, the FE surfaces a chooser instead of
    a single-set suggestion. `suggest_switch` is True iff the winning set is
    different from the chosen one and beats it by `advantage_margin`.
    """
    topic_text = topic.strip()
    if not topic_text:
        return None

    try:
        from app.llm.embeddings import get_embedding_model
        emb = get_embedding_model().get_query_embedding(topic_text)
    except Exception as exc:
        logging.warning('topic-fit: embedding failed: %s', exc)
        return None

    try:
        results = query_chunks(emb, user_id, None, top_k=top_k)
    except Exception as exc:
        logging.warning('topic-fit: chroma fetch failed: %s', exc)
        return None

    metas = (results.get('metadatas') or [[]])[0]
    dists = (results.get('distances') or [[]])[0]
    if not metas or not dists:
        return None

    # Aggregate per study set: drop chunks beyond the absolute relevance bar
    # first so a set isn't credited for a far-away near-miss, then take the
    # mean of its top-3 closest chunks.
    per_set: dict[str, list[float]] = {}
    for m, d in zip(metas, dists):
        if not isinstance(m, dict):
            continue
        sid = m.get('study_set_id')
        if not isinstance(sid, str) or not sid:
            continue
        try:
            dist_val = float(d)
        except (TypeError, ValueError):
            continue
        if dist_val > _TOPIC_RELEVANCE_ABSOLUTE_MAX:
            continue
        per_set.setdefault(sid, []).append(dist_val)

    if not per_set:
        return None

    def _agg(distances: list[float]) -> float:
        sorted_d = sorted(distances)[:3]
        return sum(sorted_d) / len(sorted_d) if sorted_d else float('inf')

    scored = [(sid, _agg(ds)) for sid, ds in per_set.items()]
    scored.sort(key=lambda x: x[1])
    best_sid, best_dist = scored[0]

    # Relative cap: keep only sets clustered around the winner. A set whose
    # mean is, say, 0.45 isn't really a "match" if the winner is at 0.25.
    relative_cap = best_dist * _TOPIC_RELEVANCE_MULTIPLIER
    candidates = [
        {'study_set_id': sid, 'mean_distance': round(d, 4)}
        for sid, d in scored
        if d <= relative_cap
    ][:max_candidates]

    current_dist = None
    if current_study_set_id:
        for sid, d in scored:
            if sid == current_study_set_id:
                current_dist = d
                break

    suggest_switch = (
        best_sid != current_study_set_id
        and (current_dist is None or (current_dist - best_dist) >= advantage_margin)
    )

    return {
        'best_study_set_id': best_sid,
        'best_distance':     round(best_dist, 4),
        'current_distance':  round(current_dist, 4) if current_dist is not None else None,
        'suggest_switch':    suggest_switch,
        'candidates':        candidates,
    }


async def _judge_and_compose(
    concepts: list[dict],
    explanation: str,
    source_text: str,
    provider: str | None,
    model: str | None,
    difficulty: str,
    *,
    source: str,
) -> dict:
    """Fan-out concept judgement + compose final score. Shared between the
    source-grounded and generic paths so they format results identically."""
    statuses = await asyncio.gather(*[
        _judge_concept(c, explanation, source_text, provider, model, difficulty)
        for c in concepts
    ])
    judged: list[dict] = [{**c, 'status': s} for c, s in zip(concepts, statuses)]

    score = _compose_score(judged, difficulty)
    covered = sum(1 for j in judged if j['status'] == 'covered')
    partial = sum(1 for j in judged if j['status'] == 'partial')
    missing = sum(1 for j in judged if j['status'] == 'missing')
    summary = (
        f'{covered} covered · {partial} partial · {missing} missing '
        f'(weighted accuracy {round(score * 100)}%).'
    )
    if source == 'generic':
        summary = 'Generic concepts (no source attached). ' + summary

    coverage = [
        {'id': j['id'], 'label': j['label'], 'status': j['status']}
        for j in judged
    ]

    return {
        'score':    score,
        'concepts': judged,
        'coverage': coverage,
        'summary':  summary,
        'source':   source,
    }
