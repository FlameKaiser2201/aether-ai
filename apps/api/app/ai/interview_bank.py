"""Curated interview question bank used as a reliable baseline and fallback."""

from __future__ import annotations

from typing import Any

QUESTION_BANK: list[dict[str, Any]] = [
    {
        "role": "Software Engineer", "company": "General", "category": "hr", "difficulty": "easy",
        "question": "Tell me about yourself.",
        "hint": "Use a 60-90 second professional narrative, not your life story.",
        "answer_guide": "Present role, 2-3 relevant achievements with numbers, why this role, and what you want to build next.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "behavioral", "difficulty": "medium",
        "question": "Describe a time you disagreed with a teammate. How did you handle it?",
        "hint": "Show curiosity and evidence-seeking, not conflict avoidance.",
        "answer_guide": "Situation, the disagreement, how you separated facts from opinions, the decision, and the outcome.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "behavioral", "difficulty": "medium",
        "question": "Tell me about a production incident you owned.",
        "hint": "Emphasize detection, mitigation, communication, and prevention.",
        "answer_guide": "Impact, detection, immediate mitigation, root cause, follow-up actions, and what changed afterward.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "hr", "difficulty": "medium",
        "question": "Why are you leaving your current role?",
        "hint": "Stay future-focused and avoid blaming people.",
        "answer_guide": "Growth direction, scope you want, evidence this role provides it, and gratitude for what you learned.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "behavioral", "difficulty": "hard",
        "question": "Tell me about a time you had to make a decision with incomplete information.",
        "hint": "Show a reversible decision, explicit assumptions, and a feedback loop.",
        "answer_guide": "Decision, missing information, assumptions, risk mitigation, outcome, and what you would change.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "dsa", "difficulty": "easy",
        "question": "Given an array of integers, return the indices of two numbers that add up to a target.",
        "hint": "Trade space for time with a hash map.",
        "answer_guide": "One-pass hash map: store value→index; check target - value before inserting. O(n) time, O(n) space.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "dsa", "difficulty": "easy",
        "question": "Reverse a linked list iteratively and recursively.",
        "hint": "Track previous, current, and next pointers.",
        "answer_guide": "Iterative O(n)/O(1); recursive O(n)/O(n) stack. Handle empty and single-node lists.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "dsa", "difficulty": "medium",
        "question": "Find the longest substring without repeating characters.",
        "hint": "Sliding window with the last seen index.",
        "answer_guide": "Expand right, move left past the previous occurrence, track max. O(n) time, O(min(n, alphabet)) space.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "dsa", "difficulty": "medium",
        "question": "Given a binary tree, return its level-order traversal.",
        "hint": "BFS with a queue and level-size snapshot.",
        "answer_guide": "Queue starts with root; for each level process size nodes, collect values, enqueue children. O(n)/O(n).",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "dsa", "difficulty": "medium",
        "question": "Design an LRU cache with O(1) get and put.",
        "hint": "Hash map plus doubly linked list.",
        "answer_guide": "Map key→node; sentinel head/tail; move to front on access; evict tail. Discuss thread safety.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "dsa", "difficulty": "hard",
        "question": "Find the median of a data stream.",
        "hint": "Two heaps: max-heap for the lower half, min-heap for the upper half.",
        "answer_guide": "Rebalance sizes so they differ by at most one; median is top of larger heap or average of tops. O(log n) insert.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "dsa", "difficulty": "hard",
        "question": "Given a grid with obstacles, find the number of unique paths from top-left to bottom-right.",
        "hint": "DP with rolling row; discuss 1D optimization.",
        "answer_guide": "dp[j] = dp[j] + dp[j-1] when cell is open; initialize first row/column; O(mn) time, O(n) space.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "system_design", "difficulty": "medium",
        "question": "Design a URL shortener.",
        "hint": "Cover ID generation, storage, redirects, caching, analytics, and abuse.",
        "answer_guide": "Base62 IDs or hash+collision handling, key-value store, read-through cache, 301/302 choice, rate limits, custom aliases, expiry.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "system_design", "difficulty": "medium",
        "question": "Design a rate limiter for a public API.",
        "hint": "Compare token bucket, sliding window, and distributed counters.",
        "answer_guide": "Requirements, per-key limits, Redis Lua atomicity, clock skew, fallback behavior, 429 + Retry-After, observability.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "system_design", "difficulty": "hard",
        "question": "Design a real-time collaborative document editor.",
        "hint": "Discuss OT vs CRDT, presence, persistence, and offline mode.",
        "answer_guide": "WebSocket gateway, document rooms, CRDT/OT choice, operation log, snapshots, conflict handling, auth, backpressure.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "system_design", "difficulty": "hard",
        "question": "Design a notification service that sends email, SMS, and push.",
        "hint": "Think queues, retries, idempotency, preferences, and fan-out.",
        "answer_guide": "Ingest API, preference store, per-channel queues, workers, provider adapters, idempotency keys, retry with backoff, DLQ, metrics.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "system_design", "difficulty": "hard",
        "question": "Design a video streaming platform.",
        "hint": "Cover upload, transcoding, CDN, manifests, playback, and recommendations.",
        "answer_guide": "Object storage, transcoding pipeline, HLS/DASH, CDN, signed URLs, metadata DB, watch history, QoE metrics.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "technical", "difficulty": "medium",
        "question": "Explain the difference between SQL and NoSQL databases and when you would choose each.",
        "hint": "Discuss consistency, schema, access patterns, and scale.",
        "answer_guide": "Relational for transactions and evolving queries; document/KV for access-pattern-first scale; mention Postgres JSONB and hybrid choices.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "technical", "difficulty": "medium",
        "question": "How does HTTPS protect an API request?",
        "hint": "TLS handshake, certificates, symmetric encryption, integrity.",
        "answer_guide": "Certificate validation, key exchange, session keys, AEAD integrity, forward secrecy, HSTS, and what TLS does not protect (compromised client).",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "technical", "difficulty": "medium",
        "question": "What happens when you type a URL into a browser?",
        "hint": "DNS, TCP/TLS, HTTP, rendering, caching.",
        "answer_guide": "DNS resolution, connection, TLS, request, response, parsing, render tree, JS, layout/paint; mention caches and CDNs.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "technical", "difficulty": "hard",
        "question": "How would you debug a memory leak in a long-running Python service?",
        "hint": "Measure, isolate, and prove the fix.",
        "answer_guide": "Metrics/RSS, tracemalloc, objgraph, heap snapshots, reproduce load, check caches/global references, fix and add regression monitoring.",
    },
    {
        "role": "Software Engineer", "company": "General", "category": "technical", "difficulty": "hard",
        "question": "Explain database indexes and the trade-offs of adding one.",
        "hint": "B-tree, selectivity, covering indexes, write cost.",
        "answer_guide": "Read speed vs write/storage cost, selectivity, composite order, covering indexes, explain plans, maintenance.",
    },
    {
        "role": "Software Engineer", "company": "Google", "category": "technical", "difficulty": "hard",
        "question": "How would you design a system to detect duplicate web pages at scale?",
        "hint": "Hashing, shingling, MinHash/LSH, and false-positive trade-offs.",
        "answer_guide": "Normalize, shingle, MinHash signatures, LSH buckets, candidate verification, distributed processing, precision/recall evaluation.",
    },
    {
        "role": "Software Engineer", "company": "Amazon", "category": "behavioral", "difficulty": "medium",
        "question": "Tell me about a time you took ownership of a problem outside your scope.",
        "hint": "Amazon values Ownership and Bias for Action.",
        "answer_guide": "Situation, why it mattered, action you took, impact with metrics, and what you learned.",
    },
    {
        "role": "Software Engineer", "company": "Amazon", "category": "behavioral", "difficulty": "hard",
        "question": "Describe a time you had to deliver with an unrealistic deadline.",
        "hint": "Show prioritization and explicit trade-offs, not heroics.",
        "answer_guide": "Constraints, scope negotiation, risk ranking, incremental delivery, stakeholder communication, outcome.",
    },
    {
        "role": "Software Engineer", "company": "Microsoft", "category": "technical", "difficulty": "medium",
        "question": "Design a REST API for a task manager. What status codes and pagination would you use?",
        "hint": "Resources, idempotency, validation, pagination.",
        "answer_guide": "GET/POST/PATCH/DELETE resources, 201/204/400/401/403/404/409/422/429, cursor pagination, ETags, error envelope.",
    },
    {
        "role": "Data Analyst", "company": "General", "category": "technical", "difficulty": "medium",
        "question": "How would you investigate a sudden 20% drop in daily active users?",
        "hint": "Segment, validate data, then form hypotheses.",
        "answer_guide": "Check instrumentation, segment by platform/region/version, compare cohorts, inspect releases and external events, quantify and communicate.",
    },
    {
        "role": "Data Analyst", "company": "General", "category": "technical", "difficulty": "medium",
        "question": "Explain the difference between correlation and causation with an example.",
        "hint": "Confounders and study design.",
        "answer_guide": "Ice-cream sales and drowning; confounder is temperature; discuss randomization, controls, and causal inference methods.",
    },
]


def filter_questions(
    *,
    role: str | None = None,
    company: str | None = None,
    category: str | None = None,
    difficulty: str | None = None,
    limit: int = 30,
) -> list[dict[str, Any]]:
    def score(item: dict[str, Any]) -> int:
        value = 0
        if role and role.lower() in item["role"].lower():
            value += 3
        if company and company.lower() == item["company"].lower():
            value += 3
        elif company and item["company"] == "General":
            value += 1
        if category and category != "mixed" and item["category"] == category:
            value += 3
        if difficulty and item["difficulty"] == difficulty:
            value += 2
        return value

    ranked = sorted(QUESTION_BANK, key=score, reverse=True)
    if category and category != "mixed":
        filtered = [item for item in ranked if item["category"] == category]
        ranked = filtered + [item for item in ranked if item not in filtered]
    return ranked[:limit]


def fallback_questions(
    *, role: str, company: str, interview_type: str, difficulty: str, count: int
) -> list[dict[str, Any]]:
    selected = filter_questions(
        role=role, company=company, category=interview_type, difficulty=difficulty, limit=count
    )
    if len(selected) < count:
        selected += [
            item for item in QUESTION_BANK if item not in selected
        ][: count - len(selected)]
    result = []
    for index, item in enumerate(selected[:count]):
        result.append(
            {
                "index": index,
                "question": item["question"],
                "category": item["category"],
                "difficulty": item["difficulty"],
                "hint": item["hint"],
                "answer_guide": item["answer_guide"],
            }
        )
    return result
