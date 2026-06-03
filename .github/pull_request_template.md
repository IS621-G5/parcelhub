## What

<!-- One or two sentences. Reference the Jira issue, e.g. `IS-204`. -->

## Why

<!-- Context / problem this solves. Skip if obvious from the title. -->

## How

<!-- Approach. Anything reviewers should know before reading the diff. -->

## Test plan

- [ ] `cd backend && npm test` — all suites pass
- [ ] `cd frontend && npm run build` — clean build
- [ ] Manually exercised the new behavior in dev (note the steps)

## DevSecOps gates

- [ ] CI workflow passes (Jest + Vite build)
- [ ] Semgrep SAST passes (or new findings triaged / suppressed with reason)
- [ ] Trivy passes (or CVE has an allowlist entry with expiry)
- [ ] No new secrets in the diff (gitleaks pre-commit clean)

## Screenshots (UI changes only)

<!-- Before / after -->
