<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Database
<!-- LOVABLE:BEGIN -->
The database already contains the full schema (profiles, pairs, messages, pair_controls, control_events, device_reports, device_status, stories, story_views, user_roles) copied from the original project, while drizzle/migrations is an empty rescaffolded set and drizzle.__drizzle_migrations has no recorded entries. New migrations must be additive-only against this existing schema — never re-create these tables.
<!-- LOVABLE:END -->
- Admin-wide partner rules live in `admin_settings.config` and are copied into every `pair_controls` row via `src/lib/policy.ts`; partner devices read rules only from `pair_controls` (why: partners cannot read admin_settings under RLS).
- Account profile/role rows are created in app code (`ensureAccount` in `src/lib/login.functions.ts`, self-repaired from `fetchMe`), never only by the auth.users trigger (why: remixes drop that trigger, leaving owners treated as partners).
- Web device commands must pass the shared capability allowlist before queuing; unsupported commands show an unavailable state rather than pretending a native companion exists.
- Standard interface typography uses the semantic `text-ui` token; emoji, branding and story content retain their own display sizes.
- Partner control time rules live in pair_controls.settings `t_<key>` and are applied on read via `applyTiming` (src/lib/timing.ts); why: no background job is needed to switch controls off when time ends.
- Family Corner items live in feed_items; only the server decency check (feed.functions.ts) may set status, and partners read only safe items unless pair_controls settings g_feed_relax is active (why: the filter must hold even if the partner's app is tampered with).
