# Troubleshooting

## No issue comment appears

Confirm the action ran on an `issues` event and the workflow permissions include `issues: write`. Workflow dispatch runs can still validate, but there may be no issue context to comment on.

## Account is reported unfunded

Horizon returns `404` for accounts that have not been activated. Send the account at least the Stellar minimum balance before adding trustlines.

## Trustline is missing

Check both the asset code and issuer. A USDC trustline for a different issuer is not considered ready.

## XLM reserve too low

The account exists but its native XLM balance is below `min_xlm_reserve`. Send additional XLM so the balance meets the configured minimum (default `1.5` XLM). Remember that each trustline also consumes base reserve.

## Horizon availability failed

Retry later or switch `horizon_url` to a trusted endpoint for the target network.

## Comment posting fails with 404 on GitHub Enterprise Server (GHES)

TrustBridge builds its Octokit client from `context.apiUrl` (backed by the runner's `GITHUB_API_URL`), so it should target your GHES instance automatically. A 404 or "resource not accessible" error usually means either the runner isn't actually GHES-registered (so `GITHUB_API_URL` never got set) or the token lacks `issues: write`. See [docs/USAGE.md — GitHub Enterprise Server (GHES) support](USAGE.md#github-enterprise-server-ghes-support) for the full verification checklist.

## Preflight permission probe fails (403 / 401)

Before making any Horizon calls, TrustBridge issues a read-only `GET /repos/{owner}/{repo}/issues/{number}/comments?per_page=1` probe to verify the token has at minimum `issues: read`. A 403 here means the workflow job is missing the required permission block:

```yaml
permissions:
  issues: write
  contents: read
```

A 401 means the token itself is invalid or expired — check that `github_token: ${{ secrets.GITHUB_TOKEN }}` is set correctly.

The preflight probe is **skipped entirely** when `comment_mode` is `dry-run` or `off`, because those modes never post a comment and therefore do not need `issues: write`. Use `comment_mode: dry-run` to validate Horizon checks without requiring write permission.

## Using preflight_only to diagnose permission issues

Set `preflight_only: true` to run only the permission probe and exit immediately — no Horizon calls are made. This is useful for verifying token permissions in a new repository without spending API quota:

```yaml
- uses: Stellar-TrustBridge/trustbridge-action@v1
  with:
    stellar_address_input: ${{ steps.address.outputs.address }}
    github_token: ${{ secrets.GITHUB_TOKEN }}
    preflight_only: true
```

The step succeeds when the probe passes (200) and fails with a clear error when the token lacks permission (403/401) or the issue is not found (404).
