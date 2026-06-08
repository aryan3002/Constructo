**StatusPill** — the system's enforcement of *status = color + icon + word* (never colour alone). Pick a status; icon, word and calm tint come from the locked palette.

```jsx
<StatusPill status="ontrack" />                 {/* green · On track */}
<StatusPill status="milestone">Roof done</StatusPill>  {/* clay */}
<StatusPill status="needsyou" />                {/* amber · Needs you */}
<StatusPill status="delay">Plastering delayed</StatusPill> {/* RED — only here */}
<StatusPill status="quiet" size="sm" />         {/* neutral grey */}
```

`status`: `ontrack | milestone | needsyou | delay | progress | quiet`. Override the word via children, the icon via `icon`. Red appears only for `delay`.
