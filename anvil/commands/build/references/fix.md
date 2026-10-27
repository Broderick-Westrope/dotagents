The code review's findings have been audited. Every finding below is a candidate for change, whatever its severity: severity orders the work, and a minor finding gets fixed like any other. For each one, either fix it or record under **Decisions** in the build note at `{{note}}` the concrete reason a fix would make the change worse, so the next review sees your reasoning. Make the smallest fix that resolves it, preferring one that deletes code. Keep tests green, and commit each fix separately (don't amend earlier commits). Update the build note if a fix changes what it says. If a finding needs the user, report `blocked` with your question.

<findings>
{{findings}}
</findings>
