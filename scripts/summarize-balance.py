"""Aggregate reproducible bot trials; optionally plot with matplotlib.
Run: PYTHONNOUSERSITE=1 python3 scripts/summarize-balance.py
"""
from pathlib import Path
import csv
import json
import statistics

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'analysis' / 'balance'
PHASES = ['screening', 'deeper', 'deepest', 'followup', 'confirmation', 'holdout', 'wider']
rows = []
total = 0
controls = []
for phase in PHASES:
    meta = json.loads((OUT / f'{phase}.meta.json').read_text())
    results = [json.loads(line) for line in (OUT / f'{phase}.jsonl').read_text().splitlines()]
    assert len(results) == meta['jobs'], f'{phase} incomplete: {len(results)}/{meta["jobs"]}'
    assert len({r['id'] for r in results}) == len(results)
    total += len(results)
    by_id = {(r['variant'], r['white'], r['black'], r['seed'], r['mirror']): r for r in results}
    for r in results:
        counterpart = {'blackFirstControl': 'kings5', 'fixedWhite5': 'blackPawn5'}.get(r['variant'])
        if not counterpart:
            continue
        s = by_id.get((counterpart, r['black'], r['white'], r['seed'], r['mirror']))
        if s:
            assert r['winner'] == {'w': 'b', 'b': 'w', None: None}[s['winner']]
            assert r['reason'] == s['reason'] and r['plies'] == s['plies']
            controls.append((phase, r['id']))
    for variant, definition in meta['variants'].items():
        games = [r for r in results if r['variant'] == variant]
        wins = [r for r in games if r['winner']]
        white = sum(r['winner'] == 'w' for r in games)
        black = sum(r['winner'] == 'b' for r in games)
        rows.append(dict(phase=phase, variant=variant, label=definition['label'], depth=meta['depth'], width=meta['width'], n=len(games), white=white, black=black,
            repetition=sum(r['reason']=='repetition' for r in games), limit=sum(r['reason']=='limit' for r in games), no_action=sum(r['reason']=='no-action' for r in games),
            white_decisive_pct=round(100*white/len(wins),1) if wins else None, finish_pct=round(100*len(wins)/len(games),1),
            king_wins=sum(r['reason']=='king' for r in games), line_wins=sum(r['reason']=='line' for r in games),
            median_finished_plies=statistics.median(r['plies'] for r in wins) if wins else None,
            unique_first_actions=len({r['moves'][0] for r in games}),
            self_play=[dict(profile=p,white=sum(r['winner']=='w' for r in games if r['white']==r['black']==p),black=sum(r['winner']=='b' for r in games if r['white']==r['black']==p),n=sum(r['white']==r['black']==p for r in games)) for p in meta['profiles']]))
with (OUT/'comparison.csv').open('w',newline='') as f:
    fields=[k for k in rows[0] if k!='self_play']
    w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(rows)
(OUT/'comparison.json').write_text(json.dumps(dict(total_games=total,color_reflection_pairs_verified=len(controls),rows=rows),ensure_ascii=False,indent=2)+'\n')
print(f'{total} games; {len(controls)} exact color-reflection pairs verified.')
for r in rows:
    print(r['phase'],r['variant'],f"{r['white']}/{r['black']}/{r['n']-r['white']-r['black']}",r['white_decisive_pct'],r['median_finished_plies'])

# Paired cluster bootstrap over seeds (nine profile matchups share each seed).
# This measures seed variability within these bots, not uncertainty about humans.
import random
holdout = [json.loads(line) for line in (OUT/'holdout.jsonl').read_text().splitlines()]
seed_ids = sorted({r['seed'] for r in holdout})
counts = {v: {seed: [sum(r['winner']=='w' for r in holdout if r['variant']==v and r['seed']==seed), sum(r['winner']=='b' for r in holdout if r['variant']==v and r['seed']==seed)] for seed in seed_ids} for v in ['kings5','bothHome5']}
rng = random.Random(19811)
bootstrap = {'kings5': [], 'bothHome5': [], 'difference_pp': [], 'absolute_bias_change_pp': []}
for _ in range(10000):
    sample = rng.choices(seed_ids,k=len(seed_ids))
    rates = {}
    for v in counts:
        white = sum(counts[v][seed][0] for seed in sample)
        black = sum(counts[v][seed][1] for seed in sample)
        rates[v] = 100*white/(white+black)
        bootstrap[v].append(rates[v])
    bootstrap['difference_pp'].append(rates['bothHome5']-rates['kings5'])
    bootstrap['absolute_bias_change_pp'].append(abs(rates['bothHome5']-50)-abs(rates['kings5']-50))
intervals = {k: [round(sorted(v)[250],2),round(sorted(v)[9749],2)] for k,v in bootstrap.items()}
(OUT/'holdout-intervals.json').write_text(json.dumps({'method':'10,000 paired seed-cluster bootstrap samples, central 95%; conditional on the bots and settings, not human balance', 'intervals':intervals},indent=2)+'\n')
print('Holdout paired bootstrap:',intervals)

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib import font_manager
except ImportError:
    print('CSV/JSON complete. Install matplotlib to render the optional chart.')
    raise SystemExit(0)
font_manager.fontManager.addfont(str(ROOT/'public/assets/fonts/NanumGothic-Regular.ttf'))
plt.rcParams['font.family']='NanumGothic'
plt.rcParams['axes.unicode_minus']=False
variants=['kings5','whitePawnHome5','whiteHome5','blackPawn5','blackCenterPawn5','blackTwoPawns5','whiteKingFirst5','fixedWhite5','bothHome5','homeDrops5','kings4','whitePawnHome4','blackPawnE6','blackPawnD7','whitePawnRank2']
labels={r['variant']:r['label'] for r in rows}
colors={1:'#b7b7b7',2:'#387ba8',3:'#c17e19',4:'#151515'}
markers={1:'o',2:'s',3:'^',4:'D'}
fig,ax=plt.subplots(figsize=(12,9))
for depth in [1,2,3,4]:
    group=[r for r in rows if r['depth']==depth and r['variant'] in variants and r['phase'] not in ['holdout','wider']]
    ax.scatter([r['white_decisive_pct'] for r in group],[variants.index(r['variant'])+(depth-2.5)*.12 for r in group],s=45,color=colors[depth],marker=markers[depth],label=f'{depth}수 탐색')
ax.axvline(50,color='#555',linewidth=1,linestyle='--')
ax.set_xlim(-2,102);ax.set_xticks(range(0,101,10));ax.set_yticks(range(len(variants)),[labels[v] for v in variants]);ax.invert_yaxis()
ax.set_xlabel('승패가 결정된 대국 중 백 승률 (%) — 반복·수 제한 중단 제외')
ax.set_title('킹 선배치 밸런스 실험: 탐색 설정에 따른 결과 변화',loc='left',pad=56)
ax.grid(axis='x',alpha=.15);ax.spines[['top','right']].set_visible(False)
ax.legend(loc='lower left',bbox_to_anchor=(0,1.015),ncol=4,frameon=False)
fig.text(.02,.01,'개발 단계 실험. 사람 승률의 증명이 아님. 별도 시드의 holdout·wider 결과는 comparison.csv 참조.',fontsize=10)
fig.tight_layout(rect=(0,.04,1,1));fig.savefig(OUT/'comparison.svg');fig.savefig(OUT/'comparison.png',dpi=160)

# Independent-seed comparison with seed-cluster bootstrap intervals.
held = [r for r in rows if r['phase']=='holdout']
fig,ax=plt.subplots(figsize=(9,4.5))
for i,r in enumerate(held):
    lo,hi=intervals[r['variant']]
    p=r['white_decisive_pct']
    ax.errorbar(p,i,xerr=[[max(0,p-lo)],[max(0,hi-p)]],fmt='o',color='#111',capsize=5,markersize=8)
    ax.text(99,i,f"백 {r['white']} / 흑 {r['black']} / 중단 {r['n']-r['white']-r['black']}",ha='right',va='bottom',fontsize=10)
ax.set_yticks(range(len(held)),[r['label'] for r in held]);ax.set_ylim(-.8,len(held)-.2);ax.invert_yaxis();ax.set_xlim(0,100)
ax.axvline(50,color='#999',linestyle='--',linewidth=1)
ax.set_xlabel('승패가 난 대국 중 백 승률 (%)')
ax.set_title('새 시드 검증 · 4수 탐색 · 후보 8개',loc='left',pad=20)
ax.spines[['top','right']].set_visible(False)
fig.text(.02,.02,'오차 막대: 시드 단위 부트스트랩 95% 구간. 해당 봇 내 변동성이며 사람의 밸런스를 보장하지 않음.',fontsize=9)
fig.tight_layout(rect=(0,.07,1,1));fig.savefig(OUT/'holdout.svg');fig.savefig(OUT/'holdout.png',dpi=160)
