---
name: Pipecat 1.0.0 VAD guard — PipelineParams is immutable
description: Critical gotcha: PipelineParams has no allow_interruptions field in Pipecat 1.0.0. Use llm.broadcast_interruption monkey-patch instead.
type: feedback
---

Never use `pt.params.allow_interruptions = False/True` to suppress VAD interrupts in Pipecat 1.0.0.

**Why:** `PipelineParams` is a Pydantic `BaseModel` with no `allow_interruptions` field. Setting it raises `"PipelineParams" object has no field "allow_interruptions"` on every function call — the guard never activates.

**How to apply:** To suppress Gemini VAD interrupts for N seconds after a function call result, monkey-patch the LLM service directly:
```python
_orig = llm.broadcast_interruption
async def _suppressed(*a, **kw):
    pass
llm.broadcast_interruption = _suppressed
await asyncio.sleep(0.7)
llm.broadcast_interruption = _orig
```
`llm` must be in the handler's enclosing scope (it is in `run_pipeline_for_connection`).
