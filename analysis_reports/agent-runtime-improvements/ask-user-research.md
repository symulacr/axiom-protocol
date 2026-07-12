# Ask-User Tool: Design Patterns & Research Note

Research performed with the **Tavily MCP** web-search tool (`tavily__tavily_search`,
`search_depth: advanced`) on 2026-07-12. Sources cited inline. This note informs
the `ask_user` tool implemented in the Axiom chat-runtime.

## 1. What an "ask-user" tool is

An ask-user tool lets an agent **yield control to the human mid-execution** to collect
a clarifying answer before taking an (often irreversible) action. It is the inverse of
autonomous tool calling: instead of the model emitting a tool call that touches the
world, it emits a structured question that the harness renders and the user answers.

> "The AskUserQuestionTool allows the AI agent to ask clarifying questions before
> answering, gathers requirements interactively, and creates a specification aligned
> with your actual needs from the start." — Spring AI blog
> (https://spring.io/blog/2026/01/16/spring-ai-ask-user-question-tool)

Spring AI's `AskUserQuestionTool` is described as "a portable, Spring AI implementation
of **Claude Code's AskUserQuestion tool**" — the dominant reference design.

## 2. The canonical schema (Claude Code AskUserQuestion)

Per the Spring AI analysis of the Claude Code tool, each question carries:

- `question` — the actual question text.
- `header` — a short one-line label (max ~12 chars) shown above the options.
- `options` — **2–4** selectable choices, each `{ label, description }`.
- `multiSelect` — boolean; whether the user may pick more than one.

Workflow (from the same source):
1. Agent decides it needs input, builds one or more questions, and calls the tool.
2. A custom handler receives the questions, **presents them through the UI**, collects
   answers, and **returns them to the agent**.
3. The agent may ask additional questions (repeat) before continuing.
4. The agent continues execution using the answers as context.

Key portability note: "define your question handlers once and use them with OpenAI,
Anthropic, Google Gemini, or any other supported model" — the tool is a *model-agnostic*
contract, not tied to one vendor.

## 3. Why it matters (agent reliability)

- **Tools are a contract between deterministic systems and non-deterministic agents.**
  Anthropic's engineering guide stresses designing tools *for agents*, not like ordinary
  APIs (https://www.anthropic.com/engineering/writing-tools-for-agents). Ambiguous
  parameters are the failure mode: "an agent might hallucinate or even fail to grasp how
  to use a tool."
- **Active questioning beats guessing.** Research on agentic AI ("When agents learn to
  ask", https://medium.com/@milesk_33/when-agents-learn-to-ask-active-questioning-in-agentic-ai-f9088e249cf7)
  shows agents can learn a *decision rule* for asking when instructions are unclear rather
  than taking an unsafe action. Benchmarks like NoisyToolBench expose "how often agents
  should ask instead of guessing." The recommendation: treat a clarifying question as a
  **step in gathering information** before acting.
- **Friction framing.** The same piece frames the user's extra effort (clarifying missing
  details, correcting wrong assumptions) as *friction* to be minimized — keep questions
  concise and the option set small (2–4) so answering is one tap.

## 4. How it fits the agentic loop

A reliable agentic system is "perceive → reason → act → observe → repeat" and must decide
"which tools to use, what order to call them in, when to ask for clarification, and when to
stop" (SAP tech blog, https://community.sap.com/t5/technology-blog-posts-by-sap/tame-your-agents-10-design-patterns-for-reliable-agentic-ai/ba-p/14424874).
The ask-user tool is the "ask for clarification" branch; an autonomous-continue signal is
the "when to stop / when to keep going" branch. Both keep stochastic control flow
predictable while letting the model drive.

## 5. Design decisions applied to Axiom

| Pattern (source)                       | Axiom implementation                                  |
|----------------------------------------|-------------------------------------------------------|
| question + 2–4 options + multiSelect (Claude/Spring) | `ask_user` tool spec with `question`, `options[]`, `multiSelect` |
| Handler presents UI, returns answer    | `runAskTool` returns a structured `{ ask:true, question, options, multiSelect, selectable:true }`; frontend `AskUserCard` renders options and feeds the chosen answer back as a user message |
| Minimal friction (2–4 options)         | `buildAskUserPrompt` caps options at 4 and truncates labels to keep one-tap answers |
| Tool = model-agnostic contract          | `ask_user` is a first-class `ChatToolClass` ("ask") in `CHAT_TOOL_CATALOG`; dispatcher returns it without I/O |
| Ask instead of guess (active questioning) | System prompt advertises `ask_user` so the model yields on ambiguous params rather than inventing values |
| When to stop / continue                | `evaluateContinue()` emits a structured `continue` signal when the per-turn tool-step budget is exceeded; `shouldAutoContinue()` lets a harness auto-continue when there is no critical request |

## 6. Tavily MCP query log (evidence)

- Query: "AI agent ask user tool design pattern - how agents request clarifying
  questions with selectable options during tool use" — `search_depth: advanced`,
  `max_results: 8`.
- Returned: Spring AI `AskUserQuestionTool` post, Anthropic tool-writing guide,
  Microsoft ai-agents-for-beginners (tool-use), Google Cloud agentic design-pattern
  docs, SAP "10 design patterns", and active-questioning research. All cited above.
