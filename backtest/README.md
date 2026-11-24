# Trend-rule backtest

Buy & hold vs monthly DCA vs a 50/100/150/200-day moving-average trend rule (0.5% fee per trade, act the next day) for BTC, ETH, SOL, XRP, STX40, STXNDQ, SPY, QQQ, GLD, USO and USD/ZAR, daily since 2016.

Not part of the Pump Check site (the deploy workflow only publishes the site files).

```
pip install yfinance pandas matplotlib reportlab
python backtest.py    # writes results.csv, summary.txt, equity_curves.png
python make_pdf.py    # writes backtest_summary.pdf
```

Results in this folder are from data up to 24 Nov 2026. Historical backtest only, not investment advice.
