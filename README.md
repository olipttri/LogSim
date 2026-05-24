# 🥚 Eggonomy — Supply Chain Simulation Game

> *Which came first — the chicken or the profit?*

**Eggonomy** is a browser-based serious game built around Supply Chain Management (SCM) concepts, using the classic "chicken or the egg" paradox as its core theme. Players take on the role of a supply chain manager responsible for sourcing, producing, storing, and distributing chicken-based products.

---

## 🎮 Play Online

**[▶ Play Eggonomy](https://YOUR-USERNAME.github.io/eggonomy/)**

*(Replace with your actual GitHub Pages URL after deployment)*

---

## 📦 Gameplay Overview

Each round progresses through 4 phases:

| Phase | Description |
|-------|-------------|
| **1. Source** | Buy eggs from Local, Regional, or Global suppliers — each with different costs, delays, and risks |
| **2. Produce** | Sell eggs directly, hatch into chickens, pack into cartons, or process chickens into meat |
| **3. Distribute** | Choose delivery speed and preferred sourcing route for the next round |
| **4. Result** | See your revenue, fulfillment rate, satisfaction change, and score |

### 🏆 Win Condition
Complete **10 rounds** with:
- Final score **≥ 2,000 points**
- Customer satisfaction **≥ 60%**

---

## ⚙️ Features

- **3 Difficulty Modes** — Easy ($500), Normal ($350), Hard ($200) starting capital
- **Dynamic Demand** — Customer demand changes every round with configurable variance
- **Egg Spoilage System** — Eggs age every round and spoil based on difficulty setting
- **Chicken Production Loop** — Hatch eggs → get chickens → chickens lay eggs each round
- **Random Events** — Bird flu, demand surges, supply disruptions, market price spikes, and more
- **Save / Continue** — Game auto-saves after each round using `localStorage`
- **Supply Chain Risk** — Global suppliers are cheap but carry disruption risks and delays
- **Delivery Tradeoffs** — Fast delivery costs more but satisfies more customers

---

## 🛠 Tech Stack

- **Pure HTML5 + CSS3 + Vanilla JavaScript** — no frameworks, no dependencies
- **Google Fonts** — Syne (display) + Space Mono (body)
- **localStorage** for save/load persistence

---

## 🚀 Deploy to GitHub Pages

1. **Fork or clone** this repository
2. Go to your repo **Settings → Pages**
3. Set source to **`main` branch, `/ (root)`**
4. Visit `https://YOUR-USERNAME.github.io/eggonomy/`

---

## 📁 File Structure

```
eggonomy/
├── index.html          # Game HTML (screens, UI elements)
├── css/
│   └── style.css       # All styles, animations, responsive layout
├── js/
│   └── game.js         # Full game logic, state management, save/load
└── README.md
```

---

## 🔧 Local Development

No build step needed. Just open `index.html` in a browser:

```bash
# Option 1: Direct open
open index.html

# Option 2: Local server (recommended for localStorage)
python3 -m http.server 8080
# Then visit http://localhost:8080
```

---

## 📚 Educational Context

Eggonomy is designed as a **serious game** to teach:
- **Supply Chain Management (SCM)** fundamentals
- **Inventory management** tradeoffs (spoilage vs. stockout)
- **Demand forecasting** and fulfillment rates
- **Supplier selection** (cost vs. speed vs. risk)
- **Production planning** (make vs. sell decisions)
- **Distribution strategy** (delivery cost vs. customer satisfaction)

---

## 🤝 Contributing

Pull requests welcome! Ideas for future features:
- [ ] Leaderboard / high score system
- [ ] More random events
- [ ] Seasonal demand cycles
- [ ] Competitor AI
- [ ] Market price fluctuations over time

---

## 📄 License

MIT License — free to use, modify, and distribute.
