**EvidenceCard** — the "show proof" card: a curated published update backed by real photos.

```jsx
<EvidenceCard
  title="Roof slab complete"
  date="8 Jun"
  photoCount={6}
  thumbSrc="/uploads/roof.jpg"
  onShowProof={openGallery}
/>
```

Carries a green "Published update" tag, a real-photo thumb (with "+N"), plain title + date/count, and a "Show proof" link. Pass a real `thumbSrc` in product.
