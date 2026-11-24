"""Buy & hold vs monthly DCA vs moving-average trend rule, daily data since 2016."""
import sys, numpy as np, pandas as pd, yfinance as yf
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt

TICKERS = ["BTC-USD","ETH-USD","SOL-USD","XRP-USD","STX40.JO","STXNDQ.JO","SPY","QQQ","GLD","USO","ZAR=X"]
MAS, FEE, START = [50,100,150,200], 0.005, "2016-01-01"

def clean(p, tk):
    """Drop bad ticks: a single day >10% off the centered 7-day median while its neighbours sit within 4% (non-crypto only; crypto moves are real)."""
    if tk.endswith("-USD"): return p
    med = p.rolling(7, center=True, min_periods=3).median()
    dev = (p/med-1).abs()
    bad = (dev > 0.10) & (dev.shift(1) < 0.04) & (dev.shift(-1) < 0.04)   # isolated spike that reverts
    for d in p.index[bad]: print(f"  cleaned {tk} {d.date()}: {p[d]:.3f} (median {med[d]:.3f})")
    return p[~bad]

def cagr(v, days): return (v.iloc[-1]/v.iloc[0])**(365.25/days)-1
def maxdd(v): return (v/v.cummax()-1).min()

def trend(px, n):
    sig = (px > px.rolling(n).mean()).astype(float)
    pos = sig.shift(2).fillna(0)          # signal at close t, trade at close t+1, earn from t+1->t+2
    ret = px.pct_change().fillna(0)
    trades = pos.diff().abs().fillna(pos.iloc[0])
    eq = (1 + pos*ret).cumprod() * (1-FEE)**trades.cumsum()
    return eq, int(trades.sum())

def dca(px):
    buys = px.groupby([px.index.year, px.index.month]).head(1).index   # first trading day each month
    units = pd.Series(0.0, index=px.index); cash = pd.Series(0.0, index=px.index)
    units[buys] = (1-FEE)/px[buys]; cash[buys] = 1.0
    val = units.cumsum()*px; inv = cash.cumsum()
    # money-weighted annual return (IRR) via bisection
    t = (px.index - px.index[0]).days/365.25
    flows = pd.Series(-cash[buys].values, index=t[px.index.get_indexer(buys)])
    T, final = t[-1], val.iloc[-1]
    f = lambda r: (flows*(1+r)**(T-flows.index)).sum() + final
    lo, hi = -0.99, 10.0
    for _ in range(200):
        mid=(lo+hi)/2; (lo,hi) = (mid,hi) if f(mid)>0 else (lo,mid)
    worst = (val/inv-1).min()                                    # worst loss vs money put in
    return val, inv, mid, worst

rows, curves = [], {}
for tk in TICKERS:
    raw = yf.download(tk, start=START, auto_adjust=True, progress=False)["Close"].squeeze().dropna()
    raw = clean(raw[raw > 0], tk)
    if len(raw) < 260: print("skip", tk); continue
    px = raw.iloc[max(MAS)-1:]           # common start once the 200-day MA exists
    days = (px.index[-1]-px.index[0]).days
    bh = px/px.iloc[0]*(1-FEE)
    r = {"Asset":tk, "Start":px.index[0].date(), "B&H CAGR":bh.iloc[-1]**(365.25/days)-1, "B&H MaxDD":maxdd(bh)}
    _,_,irr,worst = dca(px); r["DCA IRR"]=irr; r["DCA worst vs cost"]=worst
    beat=0; curves[tk]={"Buy & hold":bh}
    for n in MAS:
        eq,nt = trend(px,n); c = eq.iloc[-1]**(365.25/days)-1
        r[f"MA{n} CAGR"]=c; r[f"MA{n} MaxDD"]=maxdd(eq); r[f"MA{n} trades"]=nt
        beat += c > r["B&H CAGR"]; curves[tk][f"MA{n}"]=eq
    ma200 = raw.rolling(200).mean().iloc[-1]
    r["MAs beating B&H"]=f"{beat}/4"; r["Last price"]=raw.iloc[-1]; r["vs 200d MA"]=raw.iloc[-1]/ma200-1
    r["Above 200d?"]="YES" if raw.iloc[-1]>ma200 else "no"; r["As of"]=raw.index[-1].date()
    rows.append(r); print(f"  {tk}: trades per MA {[r[f'MA{n} trades'] for n in MAS]}")

df = pd.DataFrame(rows).set_index("Asset")
df.to_csv("results.csv")
pct = lambda x: f"{x*100:7.1f}%"
cols = ["Start","B&H CAGR","B&H MaxDD","DCA IRR","DCA worst vs cost"]+[f"MA{n} {k}" for n in MAS for k in ("CAGR","MaxDD")]+["MAs beating B&H","vs 200d MA","Above 200d?","As of"]
out = df[cols].copy()
for c in out.columns:
    if out[c].dtype.kind=="f": out[c]=out[c].map(pct)
pd.set_option("display.width",400); pd.set_option("display.max_columns",50)
print(out.to_string())
open("summary.txt","w").write(out.to_string())

fig, axes = plt.subplots(3,4, figsize=(20,11.5)); axes=axes.ravel()
for ax,(tk,cv) in zip(axes,curves.items()):
    for name,s in cv.items(): ax.plot(s.index, s, lw=1.4 if name=="Buy & hold" else 0.9, label=name, color="black" if name=="Buy & hold" else None)
    ax.set_yscale("log"); ax.set_title(tk); ax.grid(alpha=.3)
axes[0].legend(fontsize=8)
for ax in axes[len(curves):]: ax.axis("off")
fig.tight_layout()
fig.savefig("equity_curves.png", dpi=110)
