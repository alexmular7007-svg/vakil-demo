# Vaakil AI design system ("court navy and brass")

Live reference: open **`/dev/ui`** while running in development (it shows every token and component, in light and dark mode).

## Change the look in one place
All colours, radii and shadows are CSS variables in `src/app/globals.css`:
- `:root { … }` = light mode, `.dark { … }` = dark mode. Every component reads these tokens, so changing a value there re-skins the whole app (workspace, admin, public site).
- Brand: `--brand`, `--brand-2` (navy surfaces), `--gold`, `--gold-bright` (brass), `--on-brand*` (text on navy).
- Actions and text: `--primary*`, `--ink`, `--ink-2`, `--muted`, `--border*`, `--bg`, `--surface*`.
- Status: `--success`, `--warning`, `--danger`, `--info` and their `-soft` backgrounds (every pair meets WCAG AA).
- Icon tiles: `--tile-<tone>` / `--tile-<tone>-fg` for navy, gold, green, maroon, teal, slate.
- Glass: `--glass-bg`, `--glass-border`, `--glass-edge`, `--glass-highlight`; ambient light `--ambient-1/2`.
- Fonts are set in `src/app/layout.tsx` (Newsreader for headings, Inter for UI, Noto Devanagari for Hindi).
- The logo mark's colours and paths are in `MARK` (`src/components/brand.tsx`); app icons and the share image reuse them.

## Components (`src/components/ui`)
| Need | Use |
|---|---|
| Buttons (pills) | `Button` with `variant` primary, gold, secondary, outline, ghost, danger, link |
| Page title | `PageHeader` with `eyebrow`, `icon`, `title`, `description`, `actions` |
| Section title | `SectionHeader` with an optional "See all" action |
| Card | `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter` |
| Banking-style rows | `ListRow` inside `<Card><ul className="divide-y divide-border">` |
| Status chip | `Badge tone="info|warning|success|danger|neutral|accent" dot` |
| Icon tile | `IconTile icon tone size` |
| Empty state | `EmptyState icon title description action` |
| Messages | `Alert tone title` |
| Forms | `Field` (label, hint, error) with `Input`, `Select`, `Textarea`, `Checkbox` |
| Dialog / sheet | `Dialog` (bottom sheet on phones), `Sheet side="bottom"` |
| Confirm before deleting | `useConfirm()` from `ui/confirm` (never `window.confirm`) |
| Menus, tabs, switches | `Menu`/`MenuItem`, `Tabs`, `Switch` |

Utilities: `brand-surface` (navy hero with guilloché), `glass` and `glass-on-brand` (floating UI only), `ambient-bg`, `tabular` (figures), `pressable` (tap feedback), `prose-legal` (long legal text), `gold-rule`, `scrollbar-none`, `safe-top`/`safe-bottom`.

## Rules
- Tokens only, never hex colours in components. Lucide icons only, no emoji.
- Mobile first: 375px with no horizontal scroll; 44px touch targets; 16px inputs on phones.
- One `brand-surface` per screen. Glass never behind long reading text.
- Client names and amounts on overview screens get `data-private` (privacy mode blurs them).
- Grids that switch columns start from `grid-cols-1` so long text cannot widen the page.
