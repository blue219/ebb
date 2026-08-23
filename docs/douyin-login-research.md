# Douyin QR sign-in and verification research

**Research date:** 2026-08-24 (Pacific/Auckland)

**Scope:** public, first-party Douyin/Open Platform material only. No account, QR token, cookie, or authenticated request was collected or used.

## Question

Can Ebb keep its custom QR-only panel and still complete every Douyin sign-in, including a post-scan security verification, without displaying an official Douyin page? What does the observed `sso.douyin.com` response `{ "error_code": 3, "description": "缺少参数" }` mean?

## Findings

1. Douyin's documented third-party web sign-in is an OAuth 2.0 authorization flow, not a general API for creating a consumer web-browser session. It supports PC QR authorization, but the authorization URL is explicitly a page that must be **shown to the user**. After the user authorizes, Douyin redirects to the third party with a one-time `code`; the third party then exchanges it for an access token. The documented flow requires an approved application, `client_key`, approved scopes, callback handling, and server-side handling of secrets/tokens. [WEB authorization guide](https://open.douyin.com/platform/resource/docs/develop/permission/web/permission), [overall authorization guide](https://open.douyin.com/platform/resource/docs/develop/permission/overall-permission).

2. The documented OAuth flow cannot be substituted for Ebb's current local browser-session integration without a product and architecture change. Ebb currently operates a persistent Electron browser partition and calls private web endpoints; its session cookies are not an Open Platform OAuth access token. The official material describes the OAuth token as a credential for authorised Open Platform APIs, and warns that client secrets and user tokens should be kept server-side. It does not document an API that logs an arbitrary Electron browser partition into a personal Douyin web session. [WEB authorization guide](https://open.douyin.com/platform/resource/docs/develop/permission/web/permission), [overall authorization guide](https://open.douyin.com/platform/resource/docs/develop/permission/overall-permission).

3. No public, first-party documented mechanism to suppress, automate, or bypass a security challenge after a QR scan was found in the reviewed material. Douyin's privacy policy says it may request information or, when necessary, real-identity information to verify an account for security. The documented OAuth flow similarly treats authorization as a user-completed action in the official surface. Therefore, when Douyin chooses additional verification, a QR image alone cannot be treated as a supported completion path. [Douyin privacy policy](https://www.douyin.com/privacy/), [WEB authorization guide](https://open.douyin.com/platform/resource/docs/develop/permission/web/permission).

4. The public Open Platform documentation does **not** define `https://sso.douyin.com/`, an `error_code` of `3`, or the required parameters for that endpoint. Its published OAuth error table instead defines missing parameters as `10005`. The observed response text `description: "缺少参数"` establishes only the human-readable reason for that particular response; it does not make `3` equivalent to documented OAuth code `10005`. Treat `sso.douyin.com` and code `3` as an undocumented private contract. Do not guess or add parameters to work around it. [Open Platform status-code table](https://open.douyin.com/platform/resource/docs/develop/common-tools/status-code).

5. If Ebb is ever redesigned as an Open Platform application, the Open Platform developer agreement prohibits developers from requesting Douyin account credentials or supplying proxy identity credentials to log a user in automatically. That rules out a workaround that collects or reuses account authentication material to defeat the verification step. This agreement governs Open Platform use; it is cited here as a constraint on a future OAuth implementation, not as a conclusion about the current private-web integration. [Douyin Open Platform developer service agreement](https://open.douyin.com/platform/resource/docs/operation-standard/agreement-protocol).

## Implications for Ebb

- A custom QR presentation can remain a best-effort convenience when an officially rendered Douyin page provides a QR image. It is not a documented guarantee that the image-only flow will work for every risk decision.
- The requirement to never show any Douyin page conflicts with handling a security verification through the documented, user-operated route. No supported invisible alternative was found in the material reviewed.
- The safe UX choices when verification is requested are: (a) explain that verification must be completed in an official Douyin surface, then show that restricted surface only on demand; or (b) keep the QR-only policy and stop the sign-in attempt, asking the user to refresh/retry later. Option (b) preserves the original look but cannot promise successful login for risk-triggered scans.
- Moving to official OAuth would require a separately registered and approved Open Platform application, a secure backend, redirect handling, and confirmation that the required account-management operations are available under approved scopes. It is not a drop-in repair for the present browser-session flow.

## Source notes

All links above were accessed on 2026-08-24. They are Douyin/Open Platform first-party pages. The conclusion about the absence of a documented `sso.douyin.com` code-`3` contract is limited to those public sources; it is not a claim about Douyin's internal implementation.
