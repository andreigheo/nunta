# Maintained braces security fix

This private workspace package preserves the MIT-licensed source and public API
of upstream `braces` 3.0.3. It is a local maintained fork, not an upstream release.
The upstream license is retained in LICENSE.

It fixes CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm by rejecting parser nesting beyond
128 levels (parentheses and braces) and iteratively validating AST depth before
compile, expand and stringify. This also covers raw caller-supplied ASTs and
the stringify path called internally during parsing. Cyclic/repeated AST nodes
are rejected; the accepted AST contract is a tree. Options cannot raise the
depth ceiling. Invalid deep input throws RangeError with ERR_BRACES_DEPTH.

The root pnpm override redirects every `braces` dependency to this package.
Fast-glob, micromatch and the Next ESLint plugin retain their existing APIs and
matching behavior. No advisory is ignored by audit or the security gate.
The registry cannot audit private fork code; regression tests and source review
provide evidence for this fix. Replace the fork with a verified upstream fix
when one becomes available, after running `pnpm test:security-globs`.
