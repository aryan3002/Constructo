**Icon** — Constructo's bundled line-icon set (Lucide path data, embedded — no CDN). Use it anywhere an icon is needed so every status reads as color + icon + word.

```jsx
<Icon name="circle-check" />
<Icon name="hand" size={20} color="var(--amber-700)" />
<Icon name="triangle-alert" size={18} color="var(--red-600)" title="Delay" />
```

- `name` — one of the bundled names (see `iconNames`): check, circle-check, hand, clock, camera, mic, image, images, house, route, wallet, arrows, chevrons, shield-check, badge-check, sparkles, message-circle, circle-help, calendar-check, flag, triangle-alert, volume-2, heart, wifi, battery-full, signal-high, sun, etc.
- Inherits `currentColor` by default — set the parent's `color` or pass `color`.
- Default stroke is a calm `1.85`. Pass `title` to make it an accessible labelled image; omit for decorative icons (auto `aria-hidden`).
