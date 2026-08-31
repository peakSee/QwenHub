# System Prompt Engineering for Coding Agents

Comprehensive research report — June 2026

## Contents

1. [Official Documentation Sources](#1-official-documentation-sources)
2. [Core Principles](#2-core-principles)
3. [Anatomy of a Production System Prompt](#3-anatomy-of-a-production-system-prompt)
4. [Tool-Use Agent Techniques](#4-tool-use-agent-techniques)
5. [Common Anti-Patterns](#5-common-anti-patterns)
6. [Synthesis: Top Recommendations](#6-synthesis-top-recommendations)

---

## 1. Official Documentation Sources

| Source | URL | What It Covers |
|--------|-----|----------------|
| Anthropic Prompting Best Practices | https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/claude-prompting-best-practices | Clarity, XML tagging, tool use, thinking, agentic systems |
| Anthropic Context Engineering | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents | System prompt as part of broader context engineering |
| Anthropic Tool Use Docs | https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview | Tool call lifecycle, tool_use/tool_result loop |
| Anthropic Build Effective Agents | https://www.anthropic.com/engineering/building-effective-agents | Agent design: simplicity, transparency, ACI |
| OpenAI Prompt Guidance | https://platform.openai.com/docs/guides/prompt-guidance | Outcome-first prompts, retrieval budgets, preamble patterns |
| OpenAI Prompt Engineering | https://platform.openai.com/docs/guides/prompt-engineering | Six strategies, message roles, structured outputs |
| Google Gemini System Instructions | https://ai.google.dev/gemini-api/docs/system-instructions | System instruction API, safety filters, example patterns |

## 2. Core Principles

### 2.1 The Golden Rule (Anthropic)
> "Show your prompt to a colleague with minimal context on the task and ask them to follow it. If they'd be confused, Claude will be too."

### 2.2 System vs. User
| Belongs in SYSTEM | Belongs in USER |
|-------------------|-----------------|
| Identity & role | The specific task |
| Capability description | Per-turn input/context |
| Constraints & safety rules | Dynamic data |
| Output format (schema/voice) | Task-specific examples |

### 2.3 The Minimal Viable Prompt
Start minimal, test, add instructions incrementally based on observed failure modes. Most production agents converge on **200-800 tokens** for the custom system prompt.

### 2.4 Outcome-First, Not Process-Heavy
> "GPT-5.5 works best when prompts define the outcome and leave room for the model to choose an efficient solution path." — OpenAI

### 2.5 Tell What TO Do, Not What NOT to Do
- ❌ "Do not use markdown"
- ✅ "Your response should be composed of smoothly flowing prose paragraphs"

## 3. Anatomy of a Production System Prompt

All major production agents (Claude Code, Cursor, Codex) converge on this structure:

```
┌──────────────────────────────────────────┐
│ 1. IDENTITY FRAMING            ~100 tks  │
│ 2. BEHAVIORAL RULES           200-800 tks│
│ 3. TOOL USAGE POLICY          400-600 tks│
│ 4. SAFETY LAYERS               woven in  │
│ 5. CONDITIONAL SECTIONS        dynamic   │
├──────────────────────────────────────────┤
│ [TOOL DEFINITIONS]             4500+ tks │
└──────────────────────────────────────────┘
```

### Claude Code's Assembly Pipeline
The system prompt is a `string[]` — segments assembled at runtime:

```
Static Content (globally cacheable)
├── Simple Intro Section
├── Simple System Section
├── Doing Tasks Section
├── Actions Section
├── Using Your Tools Section
├── Tone & Style Section
└── Output Efficiency Section
═══════ BOUNDARY MARKER ═══════
Dynamic Content (session-scoped)
├── Enabled tools
├── Feature flags
├── Environment info
└── Session metadata
```

**CLAUDE.md injection**: Not in the system prompt — injected as `<system-reminder>` tags in messages.

## 4. Tool-Use Agent Techniques

### 4.1 Preventing Premature Responses Before Tool Results

The core problem: models generate text as if they already received tool results before they arrive.

**Strongest pattern found** — from OpenClaw GPT-5 prompt overlay:
```xml
<tool_discipline>
Prefer tool evidence over recall when action, state, or mutable facts matter.
Do not stop early when another tool call is likely to materially improve correctness.
Resolve prerequisite lookups before dependent or irreversible actions.
If a lookup is empty, partial, or suspiciously narrow, retry before concluding.
Do not narrate routine tool calls.
If more tool work would likely change the answer, do it before replying.
</tool_discipline>
```

**Key line**: *"If more tool work would likely change the answer, do it before replying."* — frames tool use as a correctness prerequisite, not an option.

**Anthropic's recommended approach**:
```xml
<tool_result_discipline>
When you call a tool, do NOT generate any text after the tool call.
Wait for the tool results to arrive, then process them.
Never fabricate or assume tool results.
Treat each tool call as a question you cannot answer until the environment responds.
</tool_result_discipline>
```

### 4.2 Tool Call Style (Anthropic's Approach)
```
## Tool Call Style
Default: do not narrate routine, low-risk tool calls (just call the tool).
Narrate only when it helps: multi-step work, complex problems, sensitive actions.
Keep narration brief and value-dense.
```

### 4.3 Plan → Execute → Observe → Repeat
All production agents use the same loop:
1. **PLAN** — Decide what to do next
2. **EXECUTE** — Call a tool (read, write, bash, search)
3. **OBSERVE** — Wait for and process tool results
4. **REPEAT** — Return to plan based on new information

### 4.4 Preamble/Postamble Prohibition
From Claude Code's system prompt:
> "You should NOT answer with unnecessary preamble or postamble (such as explaining your code or summarizing your action), unless the user asks you to."

### 4.5 Completion Contract Pattern
```xml
<completion_contract>
Treat the task as incomplete until every requested item is handled or marked [blocked].
Before finalizing check: requirements, grounding, format, and safety.
If no gate can run, state why.
</completion_contract>
```

### 4.6 Hook-Enforced Rules
Rules annotated with "Hook enforced" tell the model a mechanical check blocks violations:
```
## [Rule Name]
- [Correct approach]
- [Anti-pattern to avoid]
- **Hook enforced**: PreToolUse will block violations
```

### 4.7 Self-Assessment Bridge
> "Before providing a final answer, ask yourself: 'Could tool use improve the accuracy of this response?' If yes, call the tool before responding."

Research (arXiv 2605.14038) found this changes behavior on up to 50% of samples where the model otherwise skips tool use.

## 5. Common Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| No stop condition → agent keeps going forever | Always specify a concrete stop signal |
| Over-specified process | Start minimal, add only for observed failures |
| Absolute rules for everything | Reserve ALL CAPS for invariants; use "prefer" for judgment calls |
| Empty boilerplate | Every word should change behavior. If removing it doesn't change evals, cut it |
| Ignoring prompt caching | Static content first, dynamic in user messages |
| Re-prompting instead of diagnosing | Stop, look at last 3 actions, fix root cause |
| Over-prompting for tool use | Better models need less aggressive language. "CRITICAL: You MUST" → "Use when" |

## 6. Synthesis: Top Recommendations

1. **5-Layer Architecture**: Identity → Rules → Tool Policy → Safety → Conditional
2. **Keep under 800 tokens** for custom content; tool defs are system-managed
3. **One system, one user**: System = persistent behavior; User = per-turn task
4. **Outcome-first**: Describe what good looks like, not every step
5. **PIN output format**: "Max 5 bullets, 12 words each" is enforceable; "be concise" is not
6. **Mid-conversation reminders**: Use `<system-reminder>` tags at decision points
7. **Always a stop condition**: Without one, the agent keeps going
8. **Design for caching**: Static first, boundary marker, dynamic in user messages
9. **Tool descriptions > behavioral rules**: A good tool def prevents more errors than pages of rules
10. **Shrink as models improve**: What needed heavy prompting for Claude 3.5 needs less for Opus 4.8

### Minimal Template
```
You are [ROLE], built for [DOMAIN].

## Behavioral Rules
- [2-5 core principles]
- [Prefer X instead of Y]

## Constraints
- NEVER [safety-critical prohibitions]
- MUST [non-negotiable requirements]
- If you call a tool, wait for its result before generating any further text.

## Output Format
- [Expected shape and length]
- [Stop condition]

## Tool Usage
- [When to use each category]
- [Parallelism policy]
- [Fallback on error]
```
