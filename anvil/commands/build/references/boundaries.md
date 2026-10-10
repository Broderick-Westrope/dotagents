Boundaries for this build, whatever else you're asked to do:

- Work on the branch only. Don't push, merge or open a pull request; the user does that after reviewing.
- Don't apply database migrations to a shared environment, and don't publish protobuf or public API contracts. Build them on the branch for the user to approve.
- Subagents you delegate to work under the same boundaries; tell them.
