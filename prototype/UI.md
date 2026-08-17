# UI Prototype

Use a UI prototype when the uncertainty is layout, hierarchy, interaction, density, or visual direction.

## Shape

Default to three materially different variants and cap the set at five. Variants should disagree about structure, information hierarchy, or primary interaction, not merely colour or wording.

Prefer mounting variants inside the existing page so they use real navigation, data shape, density, and surrounding chrome. Create a clearly named throwaway route only when no natural host exists.

## Build it

1. State the design question and the dimensions on which variants should differ.
2. Keep existing data loading and page context stable; switch only the rendered prototype subtree.
3. Select variants through a shareable URL parameter such as `?variant=a`.
4. Add a visually separate switcher with the current variant and previous/next controls. Support keyboard navigation without intercepting input, textarea, select, or editable content events.
5. Use the project's component and styling systems, real labels, and representative data.
6. Make every variant responsive and accessible enough to compare on desktop and mobile. Respect reduced motion and preserve semantic controls and focus visibility.
7. Stub mutations unless backend behaviour is part of the question.

Do not over-share layout code between variants; they need freedom to diverge. Once a direction wins, implement it under production constraints rather than promoting the prototype unchanged.

The prototype answers its question when the user can compare the real trade-offs between distinct directions in the target context.
