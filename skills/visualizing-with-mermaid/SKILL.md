---
name: visualizing-with-mermaid
description: Creates static Mermaid diagram code blocks with semantic styling and visual hierarchy. Use when the user needs a flowchart, sequence diagram, state machine, class diagram, or ERD rendered as a Mermaid code block in markdown. This skill produces text-based diagram markup, not interactive or animated visualizations. If the user wants animation, interaction, step-through controls, or a standalone HTML page, use visualizing-topics instead.
---

# Mermaid Diagrams

**Default: Dark mode colors** from [references/color-palettes.md](references/color-palettes.md).

## Choosing Diagram Type

| Concept | Diagram Type |
|---------|--------------|
| Process flows, decisions | Flowchart (TB direction) |
| API calls, message passing | Sequence diagram |
| Lifecycle states | State diagram |
| Data models, relationships | Class diagram or ERD |
| System architecture | Flowchart with subgraphs (LR direction) |

## Core Principles

1. **Visual hierarchy over decoration** - Color/size guide the eye to what matters
2. **Semantic color** - Colors have meaning (grouping, state, criticality)
3. **Simplicity over completeness** - 80% clearly beats 100% confusingly
4. **7-12 nodes max** - Human working memory limit; break larger systems into drill-downs

## Quick Styling Guide

**Do:**
- Use fills to group related components
- Highlight critical paths with stroke width
- Different shapes = different component types (cylinders for DBs, diamonds for decisions)
- Keep labels to 1-4 words; use `<br/>` for longer

**Don't:**
- Pure black (`#000000`) - too harsh, use dark gray
- Saturated background colors - tire the eyes
- More than 5 colors per diagram
- Low-contrast combinations

## Shape Semantics

- **Rectangles**: Services, processes
- **Rounded rectangles**: APIs, interfaces
- **Circles**: Start/end points, external systems
- **Diamonds**: Decision points
- **Cylinders**: Databases
- **Hexagons**: Queues, message brokers

## Layout

**LR (left-to-right)**: Pipelines, architecture diagrams
**TB (top-to-bottom)**: Hierarchies, decision flows

Use **subgraphs** for: deployment boundaries, logical layers, team ownership, trust boundaries.

## Resources

- **Color palettes**: See [references/color-palettes.md](references/color-palettes.md)
- **Pattern examples**: See [references/examples.md](references/examples.md) for architecture, state machines, data flows, ERDs

## When to Use Something Else

If the concept needs animation, user interaction (sliders, play/pause, click-to-explore), or step-through state changes to be understood, use `Skill(ce:visualizing-topics)` instead. That skill produces self-contained interactive HTML files. This skill produces static Mermaid code blocks.

## Workflow

1. **Purpose** - What decision/understanding should this enable?
2. **Type** - Choose based on what you're showing
3. **Structure** - Identify components, relationships, groupings
4. **Style** - Apply semantic colors, highlight critical paths
5. **Review** - Can someone understand it in 10 seconds?
