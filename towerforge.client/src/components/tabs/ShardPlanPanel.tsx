// ============================================================
//  TowerForge Companion — Shard plan (Modules page)
//  For each type's saved shards: the main and assist levels that add the
//  most to the type's main effect per shard (engine/shardPlan.ts), then
//  the next level worth saving for and which slot gives more per shard
//  from there — and the best main and assist levels for every shard of
//  the type (in its levels and saved), since Restore gives them back. Which type to pick when the game lets you choose
//  (Event Shop trades, the Vault's daily missions) depends on the goal,
//  so the Optimizer ranks that.
// ============================================================

import { useMemo } from 'react';
import { MAIN_EFFECT_LABELS } from '../../constants/moduleData';
import { RARITIES } from '../../constants/moduleRarities';
import { formatGameNumber } from '../../engine/gameNumbers';
import { planTypeShards } from '../../engine/shardPlan';
import type { BestSplit, ShardPlanSlot, SlotPos, TypeShardPlan } from '../../engine/shardPlan';
import ShardIcon from '../common/ShardIcon';
import type { Currencies, LabData, ModuleState, ModuleType } from '../../types/gameTypes';

const TYPES: ModuleType[] = ['cannon', 'armor', 'generator', 'core'];
const NAME: Record<ModuleType, string> = { cannon: 'Cannon', armor: 'Armor', generator: 'Generator', core: 'Core' };
const POS: Record<SlotPos, string> = { main: 'Main', assist: 'Assist' };

const n = (v: number) => Math.round(v).toLocaleString();
const x = (v: number) => `×${v.toFixed(v < 10 ? 3 : 2)}`;
const pct = (v: number) => `+${v.toFixed(v < 0.1 ? 3 : 2)}%`;
const rarityName = (s: ShardPlanSlot) => RARITIES.find(r => r.k === s.module?.rarity)?.label ?? 'its rarity';

// A slot's line: where the plan takes it, or why it stays.
function SlotLine({ pos, slot }: { pos: SlotPos; slot: ShardPlanSlot | null }) {
    let what: React.ReactNode;
    if (!slot) what = <span className="shardp-dim">locked</span>;
    else if (!slot.module) what = <span className="shardp-dim">Lv {slot.from} · no module</span>;
    else if (slot.fixed) what = <span className="shardp-dim">×value typed on the module — levels don&apos;t change it here</span>;
    else if (slot.to > slot.from) what = <>Lv {slot.from} → <strong>{slot.to}</strong></>;
    else if (slot.from >= slot.cap) what = <>Lv {slot.from} <span className="shardp-dim">· {rarityName(slot)} cap ({slot.cap})</span></>;
    else what = <>Lv {slot.from}</>;
    return (
        <div className="shardp-slot">
            <span className="shardp-pos">{POS[pos]}</span>
            <span>{what}</span>
        </div>
    );
}

// All the type's shards split the best way, and how to get there in game:
// Restore puts a slot back to Lv 0 and gives every shard and coin back.
function BestLevels({ best, effect }: { best: BestSplit; effect: string }) {
    const done = best.vsPlanPct < 0.05;
    const restore = best.restore.map(p => POS[p]).join(' and ');
    return (
        <div className="shardp-best">
            <div className="shardp-best-head">Best levels for all {n(best.total)} shards</div>
            {done ? (
                <div className="shardp-dim">Your levels are already the best split of them.</div>
            ) : (
                <>
                    <div className="shardp-slot">
                        <span className="shardp-pos">Main</span><span>Lv <strong>{best.main}</strong></span>
                    </div>
                    <div className="shardp-slot">
                        <span className="shardp-pos">Assist</span><span>Lv <strong>{best.assist}</strong></span>
                    </div>
                    <div className="shardp-effect">
                        {effect} <strong>{x(best.mult)}</strong> <span className="shardp-gain">{pct(best.vsPlanPct)}</span>
                        <span className="shardp-dim"> on the plan above</span>
                    </div>
                    <div className="shardp-cost">
                        {restore
                            ? <>In game: Restore the {restore} slot{best.restore.length > 1 ? 's' : ''} (every shard and coin comes
                                back), then level Main to {best.main} and Assist to {best.assist}.</>
                            : <>Level Main to {best.main} and Assist to {best.assist}.</>}
                        {best.coins >= 1 && <> Takes {formatGameNumber(best.coins)} more coins.</>}
                        {best.coins <= -1 && <> Gives {formatGameNumber(-best.coins)} coins back.</>}
                    </div>
                </>
            )}
        </div>
    );
}

function PlanCard({ plan }: { plan: TypeShardPlan }) {
    const { main, assist, next } = plan;
    const effect = MAIN_EFFECT_LABELS[plan.type];
    const open = (s: ShardPlanSlot | null): s is ShardPlanSlot => !!s?.module && !s.fixed;
    const usable = [main, assist].filter(open);
    const need = next ? Math.max(0, next.shards - plan.left) : 0;
    const rates = (['main', 'assist'] as const).filter(p => plan.per10k[p] !== null);
    return (
        <div className="shardp-card">
            <div className="shardp-head">
                <ShardIcon kind={plan.type} />
                <strong>{NAME[plan.type]}</strong>
                <span className="shardp-saved">{n(plan.saved)} shards</span>
            </div>
            <div className="shardp-effect">
                {effect} {x(plan.now)}
                {plan.shards > 0 && <> → <strong>{x(plan.after)}</strong> <span className="shardp-gain">{pct(plan.gainPct)}</span></>}
            </div>
            <SlotLine pos="main" slot={main} />
            <SlotLine pos="assist" slot={assist} />
            {plan.shards > 0 ? (
                <div className="shardp-cost">
                    Uses {n(plan.shards)} shards and {formatGameNumber(plan.coins)} coins
                    {plan.left >= 1 && <> · {n(plan.left)} left</>}
                </div>
            ) : usable.length > 0 && next ? (
                <div className="shardp-cost">Not enough yet for the next level worth buying.</div>
            ) : null}
            {next && (
                <div className="shardp-next">
                    Next: {POS[next.pos]} Lv {next.from} → {next.to} — {n(next.shards)} shards, {pct(next.gainPct)} {effect}
                    {need >= 1 && <span className="shardp-dim"> ({n(need)} more to save)</span>}
                </div>
            )}
            {rates.length > 1 && (
                <div className="shardp-rates">
                    Per 10,000 shards from there:{' '}
                    {rates.map((p, i) => (
                        <span key={p}>{i > 0 && ' · '}{POS[p]} {pct(plan.per10k[p]!)}</span>
                    ))}
                </div>
            )}
            {usable.length > 0 && !next && plan.shards === 0 && (
                <div className="shardp-cost">
                    {usable.length > 1
                        ? 'Both slots are at their modules’ caps — a higher rarity or star raises them.'
                        : 'At the module’s cap — a higher rarity or star raises it.'}
                </div>
            )}
            {plan.pastCap.map(c => {
                const other = c.pos === 'main' ? assist : main;
                return (
                    <p key={c.pos} className="shardp-note">
                        {POS[c.pos]} slot: {c.levels} level{c.levels === 1 ? '' : 's'} past the module&apos;s cap
                        ({n(c.shards)} shards) count for nothing until it ranks up.
                        {open(other) && other.to < other.cap
                            && ' Restore refunds every shard and coin, so they could go to the other slot meanwhile.'}
                    </p>
                );
            })}
            {plan.best && <BestLevels best={plan.best} effect={effect} />}
        </div>
    );
}

export default function ShardPlanPanel({ moduleState, labData, currencies }: {
    moduleState: ModuleState;
    labData: LabData;
    currencies: Currencies;
}) {
    const plans = useMemo(
        () => TYPES.map(t => planTypeShards(moduleState, labData, t, currencies[`${t}Shards` as keyof Currencies] ?? 0)),
        [moduleState, labData, currencies],
    );
    return (
        <div className="modg-panel">
            <p className="modg-hint shardp-intro">
                Each type&apos;s shards level only its own slots. The plan buys the main or assist levels that add the
                most per shard first; when the best next level is out of reach, it saves for it rather than spend on a
                weaker one. Restore gives a slot&apos;s shards back, so each card also works out the best main and assist
                levels for every shard of that type — the ones in your levels and the ones saved. After your Module
                Shard and Coin Cost labs.
            </p>
            <div className="modg-assist-grid">
                {plans.map(p => <PlanCard key={p.type} plan={p} />)}
            </div>
            <p className="modg-hint">
                Picking a shard type for Event Shop trades or the Vault&apos;s daily missions? The Optimizer&apos;s Module
                Shards section ranks the types for your goal.
            </p>
        </div>
    );
}
