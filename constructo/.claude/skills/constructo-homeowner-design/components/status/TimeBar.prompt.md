**TimeBar** — shows position in *time*, never a percentage or ring. Segmented Start → Handover bar with a warm "you-are-here" marker.

```jsx
<TimeBar
  phases={["Foundation", "Brickwork & walls", "Plaster", "Finishes", "Handover"]}
  current={1}
  startLabel="Start · Mar"
  endLabel="Handover · Dec"
/>
```

Completed phases render sage-green; the current phase carries the clay marker; future phases are a calm track. Pass `showPhase={false}` to hide the phase-name line.
