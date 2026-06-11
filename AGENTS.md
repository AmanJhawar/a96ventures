<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Design Engineering & Aesthetic Rules

When creating new components or pages, you **MUST** follow the Emil Kowalski design engineering principles and maintain an elegant, minimalist aesthetic:

1. **Elegant & Premium Aesthetics:** Use the global `Outfit` font. Keep UI elements minimalist (e.g., square checkboxes, pill buttons). Avoid generic Tailwind defaults. Use subtle borders, lots of whitespace, and a monochromatic/grayscale palette with sharp contrasts.
2. **Tactile Feedback:** All buttons and interactive elements must have an active state that scales down `transform: scale(0.97)` to feel instantly responsive.
3. **Speed & Intentional Transitions:** Never use `transition-all`. Specify exact properties (e.g., `transition: background-color 160ms var(--ease-out), transform 160ms var(--ease-out)`). Standard UI animations should complete in under 200ms.
4. **Origin-Aware Popovers:** All dropdowns and popovers must originate from their trigger (e.g., `origin-top`), not from their center.
5. **No `scale(0)` Entrances:** When elements enter the DOM via animation, start from a minimum of `scale(0.95)` with `opacity: 0` so they appear to inflate naturally rather than popping out of nowhere.
