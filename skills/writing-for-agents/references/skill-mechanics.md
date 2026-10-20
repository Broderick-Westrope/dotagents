# Skill Mechanics

The Anvil-specific branch of **writing-for-agents**: what changes when the document is a skill, command or agent file. Which type to pick and the frontmatter for each live in the **choosing-extension-types** skill; load it alongside this file. This file covers how that choice trades the two loads.

## Invocation

Each type sits at a different point between context load and cognitive load:

- A **listed skill** keeps a `description`, so the agent fires it on its own and other skills, commands and agents can reach it. The user can still pick it by hand: a description only ever adds agent discovery. The description is the skill's top-level context pointer, loaded every turn: permanent context load in exchange for discoverability. Write it model-facing, carrying the trigger branches; the pointer rules in `SKILL.md` apply in full. A listed skill that is all reference is also one home for shared reference: anything can load it, so reference several documents need lives in one place.
- An **unlisted skill** (`unlisted: true`) drops out of the catalog: zero context load. The agent never fires it on its own, but anything that names it by bare name can load it: a command's `skills:`, an agent body, another skill. The naming site is now its context pointer, so word that line with the same care as a description. Its `description` becomes human-facing: say what it does, trigger lists stripped. An unlisted skill nothing names is dead, or rides entirely on cognitive load.
- A **command** is user-only: zero context load, all cognitive load. The model never runs one, so anything an agent might need from a command belongs in a skill the command lists.
- An **agent**'s `role`, `delegate_when` and `dont_delegate_when` are its context pointer, loaded into the orchestrator every turn. Its body runs in a fresh context window, which makes delegation the one real context boundary for hiding post-completion steps.

Pick a listed skill only when the agent must reach the material on its own. If something else always asks for it, make it unlisted and pay no context load. If only the human ever asks, a command (or an unlisted skill the user picks by hand) costs nothing per turn.

Reference shared by several commands or unlisted skills belongs in an unlisted skill they all name, rather than duplicated in each.

## Splitting by invocation

The invocation cut of splitting (the sequence cut lives in `SKILL.md`): split off a listed skill when you have a distinct leading word that should trigger it on its own (a trigger word you actually use in your prompts). If only other documents need to reach it, split it off as an unlisted skill instead: independent reach by name costs no context load, so only autonomous discovery has to earn the new description.

## Router skills

When commands and unlisted skills multiply past what you can remember, that piled-up cognitive load is cured by a **router**: one command or unlisted skill that names the others and when to reach for each, so the human has one entry point to remember instead of many. Because Anvil loads unlisted skills by bare name, a router can do more than hint: once invoked, it can load the skill the situation needs. It still cannot run commands, so route to skills, and keep commands as thin wrappers over them.
