# Accessibility skill — OpenCan project

Target standard: **WCAG 2.2 AA**. Baseline component library: **shadcn/ui**
(Radix UI primitives — keyboard nav and ARIA roles are built in; do not
override them without a documented reason).

These rules apply to **every UI component and page generated**. Do not wait to
be asked.

---

## Keyboard navigation

Every interactive element must be reachable and operable by keyboard alone.
Tab order must follow visual reading order — never use `tabIndex` values above
`0` to reorder focus artificially.

Custom interactive components must handle these keys:

| Pattern | Keys required |
|---------|--------------|
| Button / link | `Enter`, `Space` |
| Dialog | `Escape` closes; focus trapped inside while open |
| Listbox / menu | `Arrow Up/Down` to move, `Enter` to select, `Escape` to close |
| Tabs | `Arrow Left/Right` to switch, `Home`/`End` for first/last |
| Combobox | `Arrow Up/Down` to navigate options, `Escape` to close, `Enter` to select |

Keyboard traps are forbidden except inside intentional modal dialogs. Use
Radix `Dialog` (via shadcn) — it handles the focus trap and `Escape` key
correctly out of the box.

```tsx
// forbidden — breaks keyboard nav
<div onClick={handleClick}>Click me</div>

// correct
<button type="button" onClick={handleClick}>Click me</button>
```

---

## Focus management

**Modal open**: move focus to the first focusable element inside the modal (or
the modal's `aria-labelledby` heading if no input is present). Radix `Dialog`
does this automatically — do not suppress it.

**Modal close**: return focus to the element that triggered the modal open.
Store the trigger ref before opening:

```tsx
const triggerRef = useRef<HTMLButtonElement>(null);
// after close:
triggerRef.current?.focus();
```

**Route change**: on navigation, move focus to the `<h1>` of the incoming page
or to the skip-link target (`#main-content`). Implement this in the root
layout's `useEffect` listening to the pathname.

**Dynamic content**: status messages that appear without a page navigation
must be placed in an `aria-live` region so screen readers announce them without
the user needing to find them.

---

## ARIA

Prefer semantic HTML. Add ARIA only when native semantics are insufficient.

```tsx
// prefer semantic HTML
<button>Save</button>          // has implicit role="button"
<nav>…</nav>                   // has implicit role="navigation"

// ARIA only when no semantic element fits
<div role="status" aria-live="polite">{statusMessage}</div>
```

**Icon-only buttons** must have `aria-label`. Never leave icon buttons
unlabelled:

```tsx
<button type="button" aria-label="Close dialog">
  <XIcon aria-hidden="true" />
</button>
```

**Form inputs**: every input must have an associated `<label>`. Placeholder
text is not a label — it disappears on input and has insufficient contrast.

```tsx
// correct
<label htmlFor="email">Email address</label>
<input id="email" type="email" />

// forbidden
<input type="email" placeholder="Email address" />
```

**Error messages**: link to the input via `aria-describedby`:

```tsx
<input
  id="email"
  type="email"
  aria-invalid={!!error}
  aria-describedby={error ? 'email-error' : undefined}
/>
{error && <p id="email-error" role="alert">{error}</p>}
```

**Loading states**: use `aria-busy="true"` on the region being loaded, or
announce completion via an `aria-live` region:

```tsx
<div aria-busy={isLoading} aria-label="Loading results">
  {isLoading ? <Spinner /> : <ResultsList />}
</div>
```

---

## Colour and contrast

Minimum contrast ratios (WCAG 2.2 AA):

| Element | Ratio |
|---------|-------|
| Body text (< 18 pt / < 14 pt bold) | 4.5 : 1 |
| Large text (≥ 18 pt or ≥ 14 pt bold) | 3 : 1 |
| UI components (borders, icons) | 3 : 1 |
| Focus indicators | 3 : 1 against adjacent colour |

Never convey information by colour alone. Pair colour with a text label, icon,
or pattern:

```tsx
// forbidden — only colour distinguishes states
<span className="text-red-500">{message}</span>

// correct — colour + icon + text
<span className="text-red-600 flex items-center gap-1">
  <ErrorIcon aria-hidden="true" />
  {message}
</span>
```

Tailwind colour scale reference for 4.5 : 1 on white: `gray-700` and darker,
`red-700` and darker, `blue-700` and darker. Verify new colour combinations
with a contrast checker before committing.

---

## Images and media

**Meaningful images** — describe the content or function:

```tsx
<img src="/chart.png" alt="Monthly active users grew from 1 200 to 4 800 between January and June" />
```

**Decorative images** — empty alt, so screen readers skip them:

```tsx
<img src="/hero-pattern.svg" alt="" />
// or with Next.js Image:
<Image src="/hero-pattern.svg" alt="" aria-hidden="true" />
```

- No audio or video that plays automatically.
- No content that flashes more than 3 times per second (seizure risk — WCAG
  2.3.1 hard failure).
- Videos that convey information need captions; audio needs a transcript.

---

## Forms

Every form field must have a **visible label** (not just a placeholder, not
just an `aria-label` hidden from sighted users).

Required fields:

```tsx
<label htmlFor="name">
  Full name <span aria-hidden="true">*</span>
</label>
<input
  id="name"
  type="text"
  required
  aria-required="true"
  aria-describedby="name-error"
/>
<p id="name-error" role="alert" className="text-red-600 text-sm">
  {errors.name}
</p>
```

- Mark required fields with `aria-required="true"` **and** a visible indicator
  (conventionally `*` with a legend explaining the symbol).
- Show inline validation errors **below the field** as soon as the field is
  blurred, not only on final submit.
- On submit failure, move focus to the first invalid field or to an error
  summary at the top of the form.
- Success states (form submitted, item saved) must be announced via
  `role="status"` or `aria-live="polite"` so screen reader users know the
  action completed.

```tsx
{submitSuccess && (
  <p role="status" aria-live="polite" className="text-green-700">
    Your feedback has been submitted.
  </p>
)}
```
