**DecisionCard** — the signature pre-briefed choice. Calm amber (never red); the primary action stays green.

```jsx
<DecisionCard
  title="A choice for you — bathroom tile"
  whenLabel="Tiling begins in ~4 days"
  onReview={openDecision}
/>
```

Use in-thread or on Home to surface "a choice for you". The why-now line (`whenLabel`) keeps it from feeling sudden. Opens the full two-option decision screen via `onReview`.
