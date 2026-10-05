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

- Preserve the imported Table Wars game in `src/game` as the playable experience; keep gameplay state in `state.ts`, frame-based simulation in `World.tsx`, and HUD/menu presentation in `Game.tsx` so simulation and UI remain independently maintainable.
- Derive rotated window-frame collision volumes from the same dimensions and transforms used to render the window geometry; this keeps visible trim and physical boundaries aligned.
- Training-mode overrides live in state.ts (TRAIN + cfg getters); simulation reads cfg.* instead of raw constants so game and tutorial values stay untouched.
