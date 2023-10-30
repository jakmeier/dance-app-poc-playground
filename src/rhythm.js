// Gives a higher score for feet not moving on the beats.

import { leg_indx } from "./util";

// Score for not moving on the beat.
// The start is estimated such that the score is best.
export function onBeatScore(samples, targetBpm) {
    if (samples.length == 0) {
        return 0;
    }
    const beatDuration = 60_000 / targetBpm;
    const start = samples[0].timestamp;

    let best = { score: 0 };
    let i = 0;
    while (samples[i].timestamp < start + beatDuration) {
        let total = stillnessScore(samples[i].movement);
        let numBeats = 1;
        let left = i;
        let j = i + 1;
        while (j < samples.length) {
            const nextBeat = samples[left].timestamp + beatDuration;
            if (samples[j].timestamp >= nextBeat) {
                const before = stillnessScore(samples[j - 1].movement);
                const after = stillnessScore(samples[j].movement);
                const earlyOffset = nextBeat - samples[j - 1].timestamp;
                const lateOffset = samples[j].timestamp - nextBeat;
                total += interpolate(before, after, lateOffset / (earlyOffset + lateOffset))
                numBeats += 1;
                left = j;
            }
            j += 1;
        }
        const candidate = {
            offset: samples[i].timestamp - start,
            score: total / numBeats,
        };
        if (candidate.score > best.score) {
            best = candidate;
        }
        i += 1;
    }
    return best;
}

const LEGS = leg_indx();
const PERFECTLY_STILL = 0.1;
const MAX_MOVEMENT = 0.75;

// 100 points for being below stillness threshold, 0 points for moving fast
function stillnessScore(movements) {
    if (movements === null) {
        return 0;
    }

    const left = perFeetScore(movements[LEGS.left.ankle]);
    const right = perFeetScore(movements[LEGS.right.ankle]);
    const better = Math.max(left, right);
    return (left + right + 2 * better) / 2;

    function perFeetScore(m) {
        if (m < PERFECTLY_STILL) {
            return 50;
        }
        else if (m > MAX_MOVEMENT) {
            return 0;
        }
        else {
            return 50 * (1 - (m - PERFECTLY_STILL) / (MAX_MOVEMENT - PERFECTLY_STILL));
        }
    }
}

function interpolate(a, b, ratio) {
    return a * ratio + b * (1 - ratio);
}