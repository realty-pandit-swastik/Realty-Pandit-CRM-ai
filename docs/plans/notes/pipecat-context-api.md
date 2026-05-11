# Pipecat 1.0.0 Context Aggregator — API findings

Source investigated live on prod (`/var/www/realty-pandit/agents/pipecat/venv/lib/python3.12/site-packages/pipecat/`). No internet Pipecat docs consulted — everything below comes from the installed source.

## Context class to use

- **Import:** `from pipecat.processors.aggregators.llm_context import LLMContext`
- **There is NO `GeminiLiveLLMContext` class.** Gemini Live uses the universal `LLMContext`. Confirmed: the only `*LLMContext` class in the package is `LLMContext` at `pipecat/processors/aggregators/llm_context.py:63`. `pipecat/services/google/gemini_live/llm.py` imports `LLMContext` directly.
- **Constructor:**
  ```python
  LLMContext(
      messages: Optional[List[LLMContextMessage]] = None,
      tools: ToolsSchema | NotGiven = NOT_GIVEN,
      tool_choice: LLMContextToolChoice | NotGiven = NOT_GIVEN,
  )
  ```
- **No `system_instruction` kwarg on the context.** System prompt stays on the `GeminiLiveLLMService(...)` constructor via `system_instruction=...`, OR is passed as a `{"role": "system", "content": ...}` message in `messages`. The Gemini Live service auto-uses the init-provided `system_instruction` and will even inject it into the context to trigger an initial response when `messages` is empty (see `llm.py` line 809-818).

## `create_context_aggregator`

- **This method does NOT exist in Pipecat 1.0.0.** `grep -rn "def create_context_aggregator"` across the entire installed package returns zero results. This API was removed.
- **Replacement:** Instantiate `LLMContextAggregatorPair` directly.
  - **Source:** `pipecat/processors/aggregators/llm_response_universal.py:1471`
  - **Import:** `from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair`
  - Has `.user()` → `LLMUserAggregator` and `.assistant()` → `LLMAssistantAggregator`. Also iterable: `user, assistant = LLMContextAggregatorPair(context)`.
- **Usage pattern** (mirrors the canonical voicemail_detector example at `pipecat/extensions/voicemail/voicemail_detector.py:520-560,630-661`):
  ```python
  from pipecat.processors.aggregators.llm_context import LLMContext
  from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair

  context = LLMContext(messages=[...], tools=tools_schema)
  context_aggregator = LLMContextAggregatorPair(context)

  pipeline = Pipeline([
      transport.input(),
      context_aggregator.user(),
      llm,                       # GeminiLiveLLMService
      transport.output(),
      context_aggregator.assistant(),
  ])
  ```

## Tools placement

- **Pass tools via the `LLMContext` constructor (preferred), OR via `GeminiLiveLLMService(tools=...)`.**
- **If both are set, context wins** and Pipecat logs a warning. Direct from source (`gemini_live/llm.py:788-791`):
  ```
  if tools and self._tools_from_init:
      logger.warning(
          "Tools provided both at init time and in context; using context-provided value."
      )
  ```
- Context-provided tools also trigger a WebSocket reconnect on first `LLMContextFrame` (line 795 `if system_instruction_changed or tools: await self._reconnect()`), so prefer putting tools in the context from the start and avoid passing them to the LLM constructor too.
- **`register_function(name, handler)`** is orthogonal: it just registers Python-side handlers in `self._functions`. `ToolsSchema` in the context is what Gemini needs to emit the call; `register_function` is what Pipecat needs to route the call back. **You need both.** Source: `pipecat/services/llm_service.py:581`.
- **Root cause of the current bug** — `Function calls are not supported without a context object` fires at `gemini_live/llm.py:1465` when `self._context` is None. `self._context` is only populated inside `_handle_context(...)` which is called from the `LLMContextFrame` branch of `process_frame` (line 731). Without a context aggregator upstream pushing an `LLMContextFrame`, `self._context` stays `None` forever, and any function call from Gemini dies. This matches the symptom exactly.

## Greeting seed pattern

- **Correct approach:** Put the seed message into `LLMContext` at construction time, e.g. `LLMContext(messages=[{"role": "user", "content": "Namaste, start the call..."}], tools=...)`. The user aggregator will push an `LLMContextFrame` into the pipeline on `StartFrame`, which triggers `_handle_context` → `_create_initial_response` → `self._session.send_client_content(turns=messages, turn_complete=True)` → Gemini speaks first. (`gemini_live/llm.py:1267-1304`.)
- Alternatively, if `messages` is empty but `system_instruction` is set on the LLM constructor, Pipecat auto-injects the system message to trigger the opening turn (line 809-818). So setting `system_instruction=...` on `GeminiLiveLLMService` and leaving `context.messages=[]` also produces a greeting.
- **Is `LLMMessagesAppendFrame` still OK?** It still works (`llm.py:758` — branch labelled "legacy") but the source explicitly calls it "unusual" and warns it's for "legacy user code that uses this frame *without* a user context aggregator." Drop it once the aggregator is wired.
- **Is the `llm._ready_for_realtime_input = True` hack obsolete?** Yes. `_create_initial_response()` sets it to `True` at line 1304 at the end of its normal flow (and also at line 1280 early-exit when there are no messages). Once `LLMContextFrame` flows through, that flag flips itself. The manual poke is only needed today because we never send an `LLMContextFrame`.

## Canonical example (from installed Pipecat source)

From `pipecat/extensions/voicemail/voicemail_detector.py` (lines 536-543, 630-661) — this is shipped as Pipecat's own working example of the pattern:

```python
self._messages = [
    {"role": "system", "content": self._prompt},
]
self._context = LLMContext(self._messages)
self._context_aggregator = LLMContextAggregatorPair(
    self._context,
    user_params=LLMUserAggregatorParams(user_turn_strategies=ExternalUserTurnStrategies()),
)
# ...
# pipeline branch:
[
    self._classifier_gate,
    self._context_aggregator.user(),
    self._classifier_llm,
    self._classification_processor,
    self._context_aggregator.assistant(),
],
```

And from the class docstring example (lines ~525):
```python
pipeline = Pipeline([
    transport.input(),
    stt,
    detector.detector(),
    context_aggregator.user(),
    llm,
    tts,
    detector.gate(),
    transport.output(),
    context_aggregator.assistant(),
])
```

## Unknowns / risks for Task 2

1. **Opening greeting in Hindi, dynamically** — if we want the bot to say a specific crafted line (not just LLM-generated from a system prompt), we need to seed it as an `assistant` message? Unclear if Gemini Live's `send_client_content(turns=...)` will speak back an assistant-role message or only treat it as history. Fallback: seed as a `user` turn like `"<system> Greet the user in Hindi now. </system>"`.
2. **`inference_on_context_initialization`** — defaults to `True` but if ever flipped off, Gemini 3 needs `send_realtime_input(text=" ")` kicker (line 1292). Worth leaving at default.
3. **Reconnect on first LLMContextFrame** — if tools are in the context, there's a WebSocket reconnect (`llm.py:795`). That will add ~500ms-1s latency to the first turn. Can avoid by matching init-time tools to context tools exactly, but the source still triggers reconnect on `tools` presence alone (not a diff check). Probably unavoidable; just be aware of the timing.
4. **`register_function` must still be called** for every tool in the schema. Silent failure mode: schema present in context, no Python handler → Pipecat will log the call but not execute it.
5. **ToolsSchema normalization** — `LLMContext` calls `_normalize_and_validate_tools(tools)` in its constructor (line 82). Worth a quick check that our current `tools_schema` object passes validation; if it's a raw dict list it may need to be wrapped as `ToolsSchema(standard_tools=[...])`.
6. **Pipecat version not confirmed via pip** — the venv's pip binary was missing/broken on prod (`venv/bin/pip: cannot execute: required file not found`). We inferred 1.0.0 from the code layout and the presence of `LLMContext` / `LLMContextAggregatorPair`. Not critical but worth noting if API shape surprises us.
