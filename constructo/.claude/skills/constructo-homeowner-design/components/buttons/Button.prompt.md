**Button** — the primary calm action. Green is the locked primary; use `celebrate` (clay) only for milestone moments. Never red (red = delay status only).

```jsx
<Button onClick={save}>Choose Matte</Button>
<Button variant="secondary" icon="message-circle">Ask first</Button>
<Button variant="ghost" iconRight="arrow-right">Read full letter</Button>
<Button variant="celebrate" icon="sparkles">See the milestone</Button>
```

Variants: `primary` (green) · `celebrate` (clay) · `secondary` (sand surface + hairline) · `ghost` (text-only). Sizes `sm | md | lg` (md = 48px). Props: `icon`, `iconRight`, `fullWidth`, `disabled`. Press gives a subtle scale; no bounce.
