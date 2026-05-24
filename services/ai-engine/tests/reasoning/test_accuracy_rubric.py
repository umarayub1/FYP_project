"""Deterministic-math tests for the Feynman accuracy rubric (Plan G.4).

These tests cover the parts of `accuracy_rubric.py` that are pure
functions — composition, parsing, weight math — so they catch the most
common regressions without needing an LLM in the loop. The LLM-bound
paths (concept extraction, per-concept judgement) are exercised
end-to-end in the running stack instead.

Run with:
    cd services/ai-engine && python -m unittest tests.reasoning.test_accuracy_rubric
"""
from __future__ import annotations

import unittest

from app.reasoning.accuracy_rubric import (
    _CONCEPT_CACHE, _STATUS_WEIGHTS_BY_DIFFICULTY, _VERDICT_CACHE,
    _compose_score, _parse_json, _parse_judge_response, _topic_relevant_chunks,
)


class ComposeScoreTests(unittest.TestCase):
    def test_empty_returns_zero(self):
        self.assertEqual(_compose_score([]), 0.0)

    def test_all_covered_is_one(self):
        judged = [
            {'id': 'a', 'label': 'x', 'importance': 1, 'status': 'covered'},
            {'id': 'b', 'label': 'y', 'importance': 3, 'status': 'covered'},
        ]
        self.assertEqual(_compose_score(judged), 1.0)

    def test_all_missing_is_zero(self):
        judged = [
            {'id': 'a', 'label': 'x', 'importance': 2, 'status': 'missing'},
            {'id': 'b', 'label': 'y', 'importance': 1, 'status': 'missing'},
        ]
        self.assertEqual(_compose_score(judged), 0.0)

    def test_importance_weighting(self):
        # partial(0.5)*3 + missing(0)*1 = 1.5 / (3+1) = 0.375
        judged = [
            {'id': 'a', 'label': 'x', 'importance': 3, 'status': 'partial'},
            {'id': 'b', 'label': 'y', 'importance': 1, 'status': 'missing'},
        ]
        self.assertEqual(_compose_score(judged), 0.375)

    def test_matches_lecture1_pdf_hand_calc(self):
        # Reproduces the live verification: 11/18 = 0.6111.
        # covered(c1=3), covered(c2=3), missing(c3=2), missing(c4=2),
        # missing(c5=2), missing(c6=1), covered(c7=2), covered(c8=3)
        judged = [
            {'id': 'c1', 'importance': 3, 'status': 'covered'},
            {'id': 'c2', 'importance': 3, 'status': 'covered'},
            {'id': 'c3', 'importance': 2, 'status': 'missing'},
            {'id': 'c4', 'importance': 2, 'status': 'missing'},
            {'id': 'c5', 'importance': 2, 'status': 'missing'},
            {'id': 'c6', 'importance': 1, 'status': 'missing'},
            {'id': 'c7', 'importance': 2, 'status': 'covered'},
            {'id': 'c8', 'importance': 3, 'status': 'covered'},
        ]
        self.assertEqual(_compose_score(judged), 0.6111)

    def test_unknown_status_treated_as_missing(self):
        judged = [{'id': 'a', 'importance': 2, 'status': 'gibberish'}]
        self.assertEqual(_compose_score(judged), 0.0)

    def test_weights_are_canonical(self):
        # Documenting the rubric — flag any silent change to the weights.
        # Per-difficulty partial credit: 0.7 / 0.5 / 0.3 across easy/medium/hard.
        self.assertEqual(
            _STATUS_WEIGHTS_BY_DIFFICULTY,
            {
                'easy':   {'covered': 1.0, 'partial': 0.7, 'missing': 0.0},
                'medium': {'covered': 1.0, 'partial': 0.5, 'missing': 0.0},
                'hard':   {'covered': 1.0, 'partial': 0.3, 'missing': 0.0},
            },
        )

    def test_difficulty_scales_partial_credit(self):
        # Same verdicts, different difficulty → different score.
        # 1 covered + 1 partial across equal importance: easy 0.85, medium 0.75, hard 0.65.
        judged = [
            {'id': 'a', 'importance': 1, 'status': 'covered'},
            {'id': 'b', 'importance': 1, 'status': 'partial'},
        ]
        self.assertEqual(_compose_score(judged, 'easy'),   0.85)
        self.assertEqual(_compose_score(judged, 'medium'), 0.75)
        self.assertEqual(_compose_score(judged, 'hard'),   0.65)

    def test_unknown_difficulty_falls_back_to_medium(self):
        judged = [{'id': 'a', 'importance': 1, 'status': 'partial'}]
        self.assertEqual(_compose_score(judged, 'sideways'), 0.5)


class JudgeResponseParserTests(unittest.TestCase):
    """Audit fix D: the LLM may prepend qualifiers; the parser must pick the
    intended verdict, not a substring."""

    def test_single_word_each(self):
        self.assertEqual(_parse_judge_response('covered'), 'covered')
        self.assertEqual(_parse_judge_response('partial'), 'partial')
        self.assertEqual(_parse_judge_response('missing'), 'missing')

    def test_trailing_punctuation_or_whitespace(self):
        self.assertEqual(_parse_judge_response('Covered.'),  'covered')
        self.assertEqual(_parse_judge_response('  partial\n'), 'partial')
        self.assertEqual(_parse_judge_response('MISSING!'), 'missing')

    def test_partial_wins_over_covered_substring(self):
        # Regression: old set-iteration matched 'covered' inside 'partially
        # covered' because 'covered' is a substring.
        self.assertEqual(_parse_judge_response('partially covered'), 'partial')
        self.assertEqual(_parse_judge_response("I'd say partial coverage"), 'partial')

    def test_missing_wins_over_covered_substring(self):
        self.assertEqual(_parse_judge_response('almost missing the point'), 'missing')

    def test_unparseable_defaults_to_missing(self):
        self.assertEqual(_parse_judge_response(''),       'missing')
        self.assertEqual(_parse_judge_response('unsure'), 'missing')
        self.assertEqual(_parse_judge_response(None),     'missing')  # type: ignore[arg-type]


class TopicRelevantChunksTests(unittest.TestCase):
    """Audit fix C: relative distance bar — keeps chunks tightly clustered
    with the best hit, drops weakly-related dilution.

    Tests pass explicit `multiplier` and `absolute_max` so they don't
    depend on the production constants, which get recalibrated against
    real embedding-model distance distributions.
    """

    def test_returns_empty_when_no_documents(self):
        self.assertEqual(_topic_relevant_chunks({'documents': [[]]}), [])
        self.assertEqual(_topic_relevant_chunks({}), [])

    def test_absolute_cap_drops_far_chunks(self):
        results = {
            'documents': [['close', 'far']],
            'distances': [[0.3, 1.5]],
        }
        self.assertEqual(
            _topic_relevant_chunks(results, multiplier=1.5, absolute_max=1.2),
            ['close'],
        )

    def test_relative_cap_drops_diluting_chunks(self):
        # Best is 0.80; multiplier 1.5 → bar 1.20. Chunks at 1.5 are out.
        results = {
            'documents': [['a', 'b', 'c', 'd']],
            'distances': [[0.80, 0.95, 1.10, 1.50]],
        }
        self.assertEqual(
            _topic_relevant_chunks(results, multiplier=1.5, absolute_max=2.0),
            ['a', 'b', 'c'],
        )

    def test_all_above_absolute_returns_empty(self):
        results = {
            'documents': [['x', 'y']],
            'distances': [[1.6, 1.7]],
        }
        self.assertEqual(
            _topic_relevant_chunks(results, multiplier=1.5, absolute_max=1.2),
            [],
        )


class VerdictCacheTests(unittest.TestCase):
    """Same (label, explanation, model) triple → memoised verdict.

    The cache exists because OpenAI at temperature=0 is not bit-exact across
    runs (GPU non-determinism); the cache pins whatever the first call
    returned so the composite score doesn't jitter.
    """

    def setUp(self):
        # Disable Redis L2 so these tests only exercise the in-process L1.
        # Redis-specific behaviour is covered in RedisCacheTests below.
        from app.reasoning import accuracy_rubric as ar
        self._prev_redis_enabled = ar._REDIS_ENABLED
        ar._REDIS_ENABLED = False

    def tearDown(self):
        from app.reasoning import accuracy_rubric as ar
        ar._REDIS_ENABLED = self._prev_redis_enabled

    def test_cache_pins_verdict_across_calls(self):
        import asyncio

        from app.reasoning import accuracy_rubric as ar

        _VERDICT_CACHE.clear()

        # Counter so we can assert the LLM is only called once.
        calls = {'n': 0}

        class StubResp:
            def __init__(self, content):
                self.content = content

        class StubLLM:
            async def ainvoke(self, _msgs):
                calls['n'] += 1
                # Alternate verdicts — if the cache works, the second call's
                # value should never be observed.
                return StubResp('covered' if calls['n'] == 1 else 'missing')

        original_get_llm = ar.get_llm
        ar.get_llm = lambda *a, **kw: StubLLM()
        try:
            concept = {'id': 'c1', 'label': 'Test Concept', 'importance': 2}
            v1 = asyncio.run(ar._judge_concept(concept, 'an explanation', 'src', None, 'm'))
            v2 = asyncio.run(ar._judge_concept(concept, 'an explanation', 'src', None, 'm'))
            v3 = asyncio.run(ar._judge_concept(concept, 'an explanation', 'src', None, 'm'))
        finally:
            ar.get_llm = original_get_llm

        self.assertEqual(v1, 'covered')
        self.assertEqual(v2, 'covered', 'cache should have returned the first verdict')
        self.assertEqual(v3, 'covered')
        self.assertEqual(calls['n'], 1, 'LLM should only be invoked once for identical inputs')


class _FakeRedis:
    """Minimal stand-in for redis.asyncio.Redis — supports just get/set/ping."""
    def __init__(self, seed: dict[str, str] | None = None):
        self.store: dict[str, str] = dict(seed or {})
        self.gets = 0
        self.sets = 0
        self.last_ex: int | None = None

    async def ping(self):
        return True

    async def get(self, key: str):
        self.gets += 1
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None):
        self.sets += 1
        self.last_ex = ex
        self.store[key] = value


class RedisCacheTests(unittest.TestCase):
    """Two-tier cache: L1 dict → L2 Redis. Redis hits short-circuit the LLM,
    Redis misses write through after the LLM call. Survives ai-engine restart."""

    def setUp(self):
        from app.reasoning import accuracy_rubric as ar
        # Force the lazy singleton to "succeed" with our fake.
        self._prev_client = ar._REDIS_CLIENT
        self._prev_tried = ar._REDIS_INIT_TRIED
        self._prev_get_llm = ar.get_llm
        self._prev_enabled = ar._REDIS_ENABLED
        ar._REDIS_ENABLED = True
        ar._REDIS_INIT_TRIED = True  # skip the real connect attempt
        _VERDICT_CACHE.clear()
        _CONCEPT_CACHE.clear()

    def tearDown(self):
        from app.reasoning import accuracy_rubric as ar
        ar._REDIS_CLIENT = self._prev_client
        ar._REDIS_INIT_TRIED = self._prev_tried
        ar.get_llm = self._prev_get_llm
        ar._REDIS_ENABLED = self._prev_enabled

    def test_redis_hit_short_circuits_llm(self):
        """Simulates a fresh ai-engine restart: L1 empty, Redis pre-populated.
        The LLM must NOT be invoked."""
        import asyncio
        from app.reasoning import accuracy_rubric as ar

        rkey = ar._verdict_redis_key('Concept A', 'student explanation', 'm')
        ar._REDIS_CLIENT = _FakeRedis(seed={rkey: 'partial'})

        class ExplodingLLM:
            async def ainvoke(self, _msgs):
                raise AssertionError('LLM must not be invoked on a Redis hit')

        ar.get_llm = lambda *a, **kw: ExplodingLLM()

        concept = {'id': 'c1', 'label': 'Concept A', 'importance': 2}
        verdict = asyncio.run(ar._judge_concept(
            concept, 'student explanation', 'src', None, 'm'
        ))
        self.assertEqual(verdict, 'partial')
        # L1 should now be warm too.
        expl_key = ar._stable_hash('student explanation'[:4000])
        self.assertEqual(_VERDICT_CACHE.get(('Concept A', expl_key, 'm')), 'partial')

    def test_redis_miss_writes_through_with_ttl(self):
        """L1 empty, Redis empty → LLM called once → verdict written to BOTH
        layers with the configured TTL."""
        import asyncio
        from app.reasoning import accuracy_rubric as ar

        fake = _FakeRedis()
        ar._REDIS_CLIENT = fake

        llm_calls = {'n': 0}

        class StubResp:
            def __init__(self, content): self.content = content

        class StubLLM:
            async def ainvoke(self, _msgs):
                llm_calls['n'] += 1
                return StubResp('covered')

        ar.get_llm = lambda *a, **kw: StubLLM()

        concept = {'id': 'c1', 'label': 'L', 'importance': 3}
        verdict = asyncio.run(ar._judge_concept(concept, 'expl', 'src', None, 'm'))

        self.assertEqual(verdict, 'covered')
        self.assertEqual(llm_calls['n'], 1)
        rkey = ar._verdict_redis_key('L', 'expl', 'm')
        self.assertEqual(fake.store.get(rkey), 'covered', 'verdict should be in Redis')
        self.assertEqual(fake.last_ex, ar._REDIS_TTL_SECONDS, 'TTL should be set')

    def test_concept_cache_survives_via_redis(self):
        """Simulate restart: L1 wiped but Redis has concepts. Extraction must
        return the cached list without invoking the LLM."""
        import asyncio
        from app.reasoning import accuracy_rubric as ar

        seeded = [
            {'id': 'c1', 'label': 'Newton 1', 'importance': 3},
            {'id': 'c2', 'label': 'Newton 2', 'importance': 2},
        ]
        rkey = ar._concepts_redis_key('SOURCE', 'm')
        ar._REDIS_CLIENT = _FakeRedis(seed={rkey: __import__('json').dumps(seeded)})

        class ExplodingLLM:
            async def ainvoke(self, _msgs):
                raise AssertionError('LLM must not be invoked on a Redis hit')

        ar.get_llm = lambda *a, **kw: ExplodingLLM()

        ck = ar._stable_hash('SOURCE'[:8000])
        result = asyncio.run(ar._extract_concepts('SOURCE', ck, 'm', None, None))
        self.assertEqual(result, seeded)

    def test_redis_unreachable_falls_through_to_llm(self):
        """If Redis raises on get(), the LLM is still called and grading works.
        Redis errors must never break the rubric."""
        import asyncio
        from app.reasoning import accuracy_rubric as ar

        class BrokenRedis:
            async def get(self, _k):
                raise ConnectionError('redis is down')
            async def set(self, *a, **kw):
                raise ConnectionError('redis is down')

        ar._REDIS_CLIENT = BrokenRedis()

        class StubResp:
            def __init__(self, content): self.content = content

        class StubLLM:
            async def ainvoke(self, _msgs):
                return StubResp('covered')

        ar.get_llm = lambda *a, **kw: StubLLM()

        concept = {'id': 'c1', 'label': 'L', 'importance': 2}
        verdict = asyncio.run(ar._judge_concept(concept, 'expl', 'src', None, 'm'))
        self.assertEqual(verdict, 'covered', 'grading must still work when Redis is broken')


class ScaffoldingFilterTests(unittest.TestCase):
    """`_normalise_concepts` drops textbook scaffolding labels even if the
    LLM ignores the instruction in the prompt."""

    def test_drops_sample_problems(self):
        from app.reasoning.accuracy_rubric import _normalise_concepts
        raw = [
            {'id': 'c1', 'label': "Coulomb's Law", 'importance': 3},
            {'id': 'c2', 'label': 'Sample Problems', 'importance': 1},
            {'id': 'c3', 'label': 'Exercises', 'importance': 1},
            {'id': 'c4', 'label': 'Worked Examples', 'importance': 2},
            {'id': 'c5', 'label': 'Electric Charge', 'importance': 3},
        ]
        out = _normalise_concepts(raw)
        labels = [c['label'] for c in out]
        self.assertEqual(labels, ["Coulomb's Law", 'Electric Charge'],
                         'scaffolding entries should be stripped')

    def test_case_insensitive(self):
        from app.reasoning.accuracy_rubric import _normalise_concepts
        out = _normalise_concepts([
            {'id': 'c1', 'label': 'SUMMARY', 'importance': 1},
            {'id': 'c2', 'label': 'Further Reading', 'importance': 1},
            {'id': 'c3', 'label': 'Newton First Law', 'importance': 3},
        ])
        self.assertEqual([c['label'] for c in out], ['Newton First Law'])


class ParseJsonTests(unittest.TestCase):
    def test_plain_array(self):
        self.assertEqual(_parse_json('[{"a": 1}]'), [{'a': 1}])

    def test_fenced_array(self):
        raw = '```json\n[{"a":1}]\n```'
        self.assertEqual(_parse_json(raw), [{'a': 1}])

    def test_prefix_prose_then_array(self):
        raw = 'Here is the JSON:\n[{"a":1}]\nthanks.'
        self.assertEqual(_parse_json(raw), [{'a': 1}])

    def test_garbage_returns_none(self):
        self.assertIsNone(_parse_json('not even close to json'))


if __name__ == '__main__':
    unittest.main()
