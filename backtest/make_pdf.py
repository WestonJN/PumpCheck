import pandas as pd
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether

df = pd.read_csv("results.csv", index_col=0)
MAS=[50,100,150,200]
ss=getSampleStyleSheet()
H1=ParagraphStyle("h1",parent=ss["Title"],fontSize=20,spaceAfter=4,alignment=0)
H2=ParagraphStyle("h2",parent=ss["Heading2"],fontSize=13,spaceBefore=8,spaceAfter=4,textColor=colors.HexColor("#1f3a5f"))
B=ParagraphStyle("b",parent=ss["Normal"],fontSize=9.5,leading=13)
SM=ParagraphStyle("sm",parent=B,fontSize=8,leading=10,textColor=colors.HexColor("#555555"))
BL=ParagraphStyle("bl",parent=B,leftIndent=10,bulletIndent=0)
INK=colors.HexColor("#1f3a5f"); GOOD=colors.HexColor("#d9f0de"); BAD=colors.HexColor("#f6dcdc"); GRID=colors.HexColor("#c8ced6")

def p(x): return f"{x*100:.1f}%"
def bullet(t): return Paragraph(t,BL,bulletText="•")

def footer(c,d):
    c.saveState(); c.setFont("Helvetica",7.5); c.setFillColor(colors.grey)
    c.drawString(15*mm,8*mm,"Historical backtest only, not investment advice. Data: Yahoo Finance via yfinance, to 24 Nov 2026.")
    c.drawRightString(d.pagesize[0]-15*mm,8*mm,f"Page {d.page}"); c.restoreState()

doc=SimpleDocTemplate("backtest_summary.pdf",pagesize=landscape(A4),leftMargin=15*mm,rightMargin=15*mm,topMargin=13*mm,bottomMargin=15*mm,
                      title="Trend rule vs buy & hold vs DCA backtest",author="Backtest")
s=[]
s.append(Paragraph("Buy &amp; hold vs monthly DCA vs moving-average trend rule",H1))
s.append(Paragraph("11 assets, daily prices from 2016 to 24 Nov 2026, 0.5% fee per trade",SM))
s.append(Spacer(1,6))
s.append(Paragraph("Key findings",H2))
for t in [
 "<b>The trend rule beat buy &amp; hold only on BTC (3 of 4 averages) and ETH (4 of 4).</b> On those two it also cut the worst drop to about -65%, from -83% to -86%. ETH's yearly return rose from 13.4% to as much as 43.4% (50-day average).",
 "<b>On SPY, QQQ, STXNDQ, STX40, GLD, USO and ZAR=X, every average lost to buy &amp; hold</b>, often by a lot. Over the period the rule traded 44 to 225 times. At 0.5% a trade, 200 trades cost about 63% of the money in fees alone, and the rule mostly failed to reduce drawdowns on these assets.",
 "<b>XRP was the worst case for the trend rule.</b> It was out of the market for the big jump in late 2024, and every average ended with a loss. SOL's 50-day average did best of all (104%/yr) but the other three averages lagged buy &amp; hold.",
 "<b>Monthly DCA gave returns close to buy &amp; hold with far milder losses against money put in.</b> STXNDQ was never more than 1.7% under water and QQQ 2.9%. DCA did better than buy &amp; hold on ETH, XRP, GLD and USO, and worse on BTC and SOL.",
 "<b>Only USO (+4.4%) and ZAR=X (+6.6%) are above their 200-day average today.</b> All four cryptos are 17% to 26% below theirs, GLD is 19.5% below, and SPY and STXNDQ are just under.",
]: s.append(bullet(t)); s.append(Spacer(1,3))

s.append(Paragraph("Method",H2))
for t in [
 "<b>Period:</b> each asset starts once its 200-day average exists, so all six methods cover the same dates. That is mid or late 2016 for most; ETH and XRP start in 2018, STXNDQ in 2019 and SOL in 2020 because Yahoo's history starts later.",
 "<b>Buy &amp; hold:</b> buy once on the first day, 0.5% fee. <b>Yearly return</b> is the compound annual return; <b>max drawdown</b> is the largest fall from a previous peak.",
 "<b>Monthly DCA:</b> the same amount on the first trading day of each month, 0.5% fee per buy. Yearly return is the annual return on the money actually put in (IRR). \"Worst\" is the deepest loss against total money put in so far, because a normal drawdown is not meaningful while new money keeps arriving.",
 "<b>Trend rule:</b> hold when the close is above its 50, 100, 150 or 200-day average, else cash (no interest). The signal is read at the close and the trade is made at the next day's close. 0.5% fee on every buy and every sell.",
 "<b>Data fixes:</b> 4 bad Yahoo prices were removed: STX40.JO 84.39 instead of about 8,400 on 25 Apr 2025 (a cents-to-rand mix-up), and three fake one-day drops in ZAR=X (15 Nov 2024, 15 and 17 Jan 2025). ZAR=X is the USD/ZAR rate, so holding it means holding dollars against rand. The .JO funds are priced in rand.",
]: s.append(bullet(t)); s.append(Spacer(1,2))
s.append(PageBreak())

# Summary table
s.append(Paragraph("Summary table",H2))
s.append(Paragraph("Yearly return / max drawdown. Green: the trend rule's yearly return beat buy &amp; hold. Red: it did worse. For DCA the second number is the worst loss against money put in.",SM))
s.append(Spacer(1,5))
hdr=["Asset","Start","Buy & hold","Monthly DCA"]+[f"MA{n}" for n in MAS]+["Beat\nB&H","vs 200d\naverage","Above\n200d?"]
data=[hdr]; st=[]
for i,(tk,r) in enumerate(df.iterrows(),start=1):
    row=[tk,str(r["Start"])[:7],f"{p(r['B&H CAGR'])} / {p(r['B&H MaxDD'])}",f"{p(r['DCA IRR'])} / {p(r['DCA worst vs cost'])}"]
    for j,n in enumerate(MAS):
        row.append(f"{p(r[f'MA{n} CAGR'])} / {p(r[f'MA{n} MaxDD'])}")
        st.append(("BACKGROUND",(4+j,i),(4+j,i),GOOD if r[f"MA{n} CAGR"]>r["B&H CAGR"] else BAD))
    above=r["Above 200d?"]=="YES"
    row+= [r["MAs beating B&H"], f"{r['vs 200d MA']*100:+.1f}%", "YES" if above else "no"]
    if above: st.append(("FONTNAME",(10,i),(10,i),"Helvetica-Bold")); st.append(("TEXTCOLOR",(10,i),(10,i),colors.HexColor("#1a7f37")))
    data.append(row)
t=Table(data,colWidths=[22*mm,16*mm,30*mm,30*mm,28*mm,28*mm,28*mm,28*mm,15*mm,19*mm,16*mm],repeatRows=1)
t.setStyle(TableStyle([
 ("FONT",(0,0),(-1,-1),"Helvetica",8.2),("FONT",(0,0),(-1,0),"Helvetica-Bold",8.2),("FONT",(0,1),(0,-1),"Helvetica-Bold",8.2),
 ("BACKGROUND",(0,0),(-1,0),INK),("TEXTCOLOR",(0,0),(-1,0),colors.white),
 ("ALIGN",(1,0),(-1,-1),"CENTER"),("VALIGN",(0,0),(-1,-1),"MIDDLE"),
 ("GRID",(0,0),(-1,-1),0.4,GRID),("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),
]+st))
s.append(t)
s.append(Spacer(1,8))
tr=Table([["Trades over the period"]+[f"MA{n}" for n in MAS]]+[[tk]+[int(r[f"MA{n} trades"]) for n in MAS] for tk,r in df.iterrows()],colWidths=[40*mm]+[18*mm]*4)
tr.setStyle(TableStyle([("FONT",(0,0),(-1,-1),"Helvetica",7.8),("FONT",(0,0),(-1,0),"Helvetica-Bold",7.8),("BACKGROUND",(0,0),(-1,0),colors.HexColor("#e8ecf1")),
 ("ALIGN",(1,0),(-1,-1),"CENTER"),("GRID",(0,0),(-1,-1),0.3,GRID),("TOPPADDING",(0,0),(-1,-1),1.5),("BOTTOMPADDING",(0,0),(-1,-1),1.5)]))
s.append(KeepTogether([Paragraph("Number of trend-rule trades (each one costs 0.5%)",SM),Spacer(1,2),tr]))
s.append(PageBreak())

s.append(Paragraph("Growth of 1 (log scale): buy &amp; hold (black) vs the four trend rules",H2))
s.append(Image("equity_curves.png",width=262*mm,height=150.7*mm))
doc.build(s,onFirstPage=footer,onLaterPages=footer)
