**BottomNav** — the calm app shell. Icon + label (never icon-only); active item is sage-green.

```jsx
<BottomNav
  active="home"
  onChange={setTab}
  items={[
    { key: "home", icon: "house", label: "Home" },
    { key: "journey", icon: "route", label: "Journey" },
    { key: "photos", icon: "images", label: "Photos" },
    { key: "money", icon: "wallet", label: "Money" },
  ]}
/>
```

Every target is ≥48px. Sits fixed at the bottom of the phone frame.
