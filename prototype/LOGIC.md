# Logic Prototype

Use a logic prototype when the uncertainty is in rules, state, transitions, or data shape rather than presentation.

## Shape

Prefer a single self-contained HTML file that a non-developer can open and drive. Keep the logic separate from the page as one small pure unit:

- a reducer for discrete actions over one state;
- a state machine when action legality depends on the current state;
- pure functions for independent transformations;
- a stateful module only when ongoing internal state is itself part of the question.

The page is a disposable harness. The logic must not import the DOM or reach into event handlers.

## Build it

1. Put the exact question in the visible introduction.
2. Render the complete relevant state with domain labels, not a raw implementation dump.
3. Provide free-play actions so the model can be exercised in unexpected orders.
4. Add a few repeatable walkthroughs covering the happy path, the hardest edge case, and an invalid or disputed transition.
5. Reset each walkthrough to a known state and explain what the user should watch.
6. Re-render after every action and make rejection or state change visible.

Keep it dependency-free where practical and runnable by opening the file. Add a focused automated check only when the repository already has a suitable seam and it helps verify the experiment; tests do not determine the design.

The prototype answers its question when the walkthroughs expose whether the model represents the disputed cases truthfully.
