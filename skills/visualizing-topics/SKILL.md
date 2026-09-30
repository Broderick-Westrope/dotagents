---
name: visualizing-topics
description: Builds self-contained interactive HTML visualizations with animation, step-through controls, and live interaction to teach complex concepts. Outputs a standalone HTML file opened in the browser — not a Mermaid diagram or code block. Use when the user wants an animated explainer, interactive demo, step-by-step walkthrough, or any visualization that benefits from state changes, user controls (play/pause, sliders, click-to-explore), or animation. Examples include distributed consensus visualizers, data structure animations, state machine walkthroughs, or system simulations. If the concept can be fully understood from a static diagram with a few labeled boxes and arrows, use visualizing-with-mermaid instead.
---

# Visualizing Topics

Turn complex concepts into self-contained HTML visualizations that teach through interaction and animation.

## When to Visualize vs When Not To

| Good fit for this skill | Better handled elsewhere |
|------------------------|------------------------|
| Multi-step processes with state changes | Simple static diagrams (use Mermaid) |
| Concepts that benefit from animation/interaction | Data dashboards with real data |
| Systems with multiple interacting components | Charts from CSV/JSON datasets |
| Abstract ideas that are hard to explain in text | UI prototypes or app mockups |

If the concept can be fully understood from a 7-node Mermaid diagram, suggest that instead.

## Output Format

Every visualization is a **single self-contained HTML file**:
- All CSS and JS inline (no external dependencies except CDN libraries)
- Written to `/tmp/viz-<topic-slug>.html`
- Auto-opened in the default browser after creation: `open /tmp/viz-<topic-slug>.html` (macOS) or `xdg-open` (Linux)

## Choosing the Right Approach

Think about what aspect of the topic makes it hard to understand, then pick the visualization approach that addresses that specific difficulty.

| What makes it hard | Visualization approach | Example |
|--------------------|-----------------------|---------|
| Too many steps to hold in your head | Animated step-through with play/pause | Raft consensus election |
| Hard to see how parts interact | Interactive system diagram with live data flow | Microservice request routing |
| Need to understand how parameters affect behavior | Controls (sliders, toggles) that change the visualization in real time | Hash table load factor vs collision rate |
| Spatial/structural relationships are key | Zoomable or pannable layout | B-tree insertion |
| Temporal sequence matters | Timeline or sequence animation | TCP three-way handshake |
| State transitions are the core concept | State machine with highlighted current state | Order fulfillment lifecycle |

## Building the Visualization

### 1. Identify the Core Insight

Before writing any code, state in one sentence what the user should understand after interacting with this visualization. Everything else serves this insight.

Bad: "This shows how Kafka works"
Good: "This shows why consumer group rebalancing causes temporary processing pauses, and how partition assignment changes when consumers join or leave"

### 2. Pick Libraries (or Don't)

Choose the lightest tool that achieves the goal. Load libraries from CDN when needed.

| Need | Tool | CDN |
|------|------|-----|
| Basic shapes, flow arrows | Vanilla SVG + CSS animations | None |
| Data-driven layouts, force graphs | D3.js | `https://cdn.jsdelivr.net/npm/d3@7` |
| 3D structures, spatial concepts | Three.js | `https://cdn.jsdelivr.net/npm/three@0.160` |
| Charts with axes and legends | Chart.js | `https://cdn.jsdelivr.net/npm/chart.js@4` |
| Simple animations, transitions | CSS animations + requestAnimationFrame | None |

Default to vanilla SVG/Canvas + CSS. Reach for a library only when vanilla would mean significantly more code or a worse result.

### 3. Structure the HTML

Controls, step explanations, and navigation buttons go **above** the visualization. The dynamic content (canvas, SVG, animation area) goes last. This prevents the page from shifting what the user is reading or clicking when the visualization changes size between steps.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Topic] — Interactive Visualization</title>
  <style>
    /* All styles inline */
  </style>
</head>
<body>
  <div id="app">
    <header><!-- Title + one-line description + intro paragraph --></header>
    <nav><!-- Step controls: prev/play/pause/next/reset + speed slider --></nav>
    <section id="explanation"><!-- Step explanation text, updates each step --></section>
    <main><!-- Visualization canvas/SVG (dynamic content, goes last) --></main>
    <aside><!-- Legend, secondary controls, hover detail panel --></aside>
  </div>
  <script>
    // All JS inline
  </script>
</body>
</html>
```

The reason for this order: when the visualization area resizes (e.g., nodes appear, a tree grows taller, a timeline extends), everything the user reads and clicks stays pinned at the top. The dynamic area absorbs size changes downward, off-screen if needed, rather than pushing controls and explanations around.

### 4. Visual Style

Dark theme by default. The goal is to look clean and modern — somewhere between a polished conference talk slide and a technical blog post.

**Color palette:**
- Background: `#0f1117` (near-black)
- Surface/cards: `#1a1d27`
- Primary accent: `#6366f1` (indigo)
- Secondary accent: `#22d3ee` (cyan)
- Success/active: `#34d399` (emerald)
- Warning/attention: `#fbbf24` (amber)
- Error/critical: `#f87171` (red)
- Text primary: `#e2e8f0`
- Text secondary: `#94a3b8`
- Borders: `#2d3348`

**Typography:**
- Use system font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Monospace for code/data: `'SF Mono', 'Fira Code', 'Cascadia Code', monospace`
- Title: 1.5rem, semibold
- Body/annotations: 0.875rem, regular
- Labels on diagram elements: 0.75rem

**Spacing and layout:**
- Visualization area gets 60-70% of viewport height
- Controls and annotations share the remaining space
- Minimum padding: 1.5rem around edges
- Use CSS Grid or Flexbox for layout — no hardcoded pixel positions for the overall structure

### 5. Interactivity Guidelines

Add controls when they help the user explore and understand. Skip them when animation alone tells the story.

**Good interactive controls:**
- **Step through**: Play/pause/step buttons for sequential processes
- **Speed control**: Slider to slow down or speed up animations
- **Parameter tweaking**: Sliders that change inputs and show the effect in real time
- **Hover/click for detail**: Show additional context on elements without cluttering the default view
- **Reset**: Always provide a way to restart

**Control design:**
- Place step navigation (prev/next/play/pause) and step explanation text **above** the visualization area — never below it. When the visualization resizes between steps, controls and descriptions that sit below it will jump around, which is disorienting
- Label every control clearly — no unlabeled sliders
- Show the current value next to sliders
- Use `<input type="range">` for continuous values, `<button>` for discrete actions
- Style controls to match the dark theme
- Secondary controls (legend, parameter sliders that affect the visualization globally) can go in a sidebar or below the visualization if they don't need frequent interaction

### 6. Educational Annotations

The visualization should teach, not just display. Include:

- **A title** that names the concept
- **A subtitle or one-liner** that states the core insight
- **An introductory paragraph** (2-4 sentences) that gives context on the topic before the user starts interacting. Someone landing on the page cold — maybe it was shared via a link — should be able to read this and understand what the concept is, why it matters, and what they're about to explore. Write it in plain language, not as a textbook definition. For example: "In a distributed system, when you spread data across multiple servers, you need a way to decide which server holds which piece of data. Consistent hashing solves this by arranging servers on a virtual ring, so that adding or removing a server only moves a small fraction of the data — unlike naive approaches where almost everything has to shuffle."
- **Step explanations** that update as the visualization progresses, placed **above** the visualization so they don't jump when the visualization resizes (a text panel that says "Now consumer C2 has joined the group. The coordinator pauses all consumers while it reassigns partitions...")
- **Labels on diagram elements** so nothing is ambiguous
- **A legend** if colors/shapes carry meaning
- **Hover tooltips** for secondary detail that would clutter the main view

The introductory paragraph and the step explanations serve different purposes. The intro gives you enough context to understand what you're looking at. The step explanations narrate what's happening as you interact. Both are important — skip either and the visualization becomes a pretty animation that doesn't actually teach.

Write both conversationally, as if explaining to a colleague.

### 7. Robustness

- Visualizations should work at viewport widths from 900px to 1920px
- Use relative units (`%`, `vh`, `vw`, `rem`) for layout, not fixed pixels
- Test that animations don't break when window is resized
- If using requestAnimationFrame, clean up on page unload
- Handle edge cases in interactive controls (min/max values, rapid clicking)

## Delivery

After writing the HTML file:

1. Write to `/tmp/viz-<topic-slug>.html` (e.g., `/tmp/viz-raft-consensus.html`)
2. Open it: `open /tmp/viz-<topic-slug>.html`
3. Tell the user what they're looking at and suggest what to try first ("Try clicking the 'Fail Leader' button to see what triggers an election")

If the user wants to keep the file, they can copy it out of `/tmp/` — mention this.

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Visualization tries to show everything about the topic | Focus on one core insight; link to further reading if needed |
| Animation runs once with no way to replay | Always include reset/replay controls |
| Labels overlap or are unreadable | Use collision detection or manual positioning; test at different sizes |
| Too many colors without meaning | Limit to 4-5 semantic colors; use the palette above |
| Controls exist but don't obviously affect anything | Make cause-and-effect immediate and visible |
| No explanation of what's happening | Always include the step explanation text panel |
| Controls/explanations below the visualization jump around when content resizes | Put all controls, step navigation, and explanation text above the visualization area |
| Loads a massive library for a simple animation | Start vanilla; add libraries only when they earn their weight |
