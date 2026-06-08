**PhotoTile** — real photos only (never AI/3D renders). Pass a `src` a human took.

```jsx
<PhotoTile src="/uploads/roof.jpg" alt="Roof slab" count="+6" />
<PhotoTile src="/uploads/site.jpg" caption="Site update · 2 days ago" height={180} />
<PhotoTile />  {/* labelled placeholder for mockups — never a fake render */}
```

`count` shows a corner badge; `caption` sits on a bottom protection gradient. Tap via `onClick`.
