# Release Verification Skill

Use this skill after meaningful implementation work and before declaring a task complete.

## Verification Workflow

1. Inspect the final diff and confirm only intended files changed.
2. Check for duplicate implementations, stale code paths, debug output, and temporary files.
3. Run the narrowest relevant checks or project verification scripts.
4. Run the production build for meaningful application-code changes.
5. Inspect build warnings rather than treating a zero exit code as the only signal.
6. Verify the reported behavior directly when the available environment allows it.
7. Summarize what changed, what passed, and what remains unverified.

## Required Checks

Depending on the task, consider:
- TypeScript and Vite build output
- existing project verification scripts
- route and import integrity
- Supabase migration and policy consistency
- responsive and visual states
- globe and map lifecycle behavior
- production versus development gating
- accidental secrets, credentials, or environment-specific paths
- generated assets or temporary files accidentally added to the change

## Completion Language

Do not claim:
- a visual bug is fixed solely because compilation succeeds
- a migration is safe without inspecting affected policies and consumers
- cross-browser compatibility without browser evidence
- performance improvement without measurement or clearly labeled inference
- device compatibility without testing or a disclosed code-based assessment

Use precise language such as:
- verified by production build
- verified through rendered comparison
- inspected at specified viewport sizes
- code-reviewed but not reproduced locally
- requires production data or hardware validation

## Failure Handling

If a check fails:
- report the failure clearly
- identify whether it was introduced by the change or appears pre-existing
- fix issues within scope when practical
- do not hide warnings or omit failed verification from the final summary

## Completion Criteria

- diff reviewed
- relevant checks run
- production build run for meaningful code changes
- no known temporary or debug artifacts remain
- verified and unverified claims are clearly separated
