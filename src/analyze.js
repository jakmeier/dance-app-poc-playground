import { POSITIONS } from './moves';
import { STEPS, CHOREOS } from './moves_db';

// returned value `positions` has { start, index, error, position { id, name, bodyPos, img } }
export function computePositions(tracker, minDt, maxDt, minDtRepeat, freestyle = true) {
    if (freestyle) {
        const positions = detectPositions(tracker.history, minDt, maxDt);

        const numBefore = positions.length;
        for (let i = positions.length - 1; i > 0; i--) {
            if (positions[i].position.id === positions[i - 1].position.id) {
                if (positions[i - 1].start - positions[i].start < minDtRepeat) {
                    if (positions[i].error > positions[i - 1].error) {
                        positions.splice(i, 1);
                    } else {
                        positions.splice(i - 1, 1);
                    }
                }
            }
        }
        const numAfter = positions.length;
        console.log(`found ${numBefore} positions, de-deduplicated to ${numAfter}`);

        return positions;
    } else {
        // TODO: fix facing direction
        const estimate = tracker.move.matchToRecording(tracker.history, minDt, maxDt);
        // added the `positions` field just to make this work... spaghetti prototype, yay
        return estimate.positions;
    }
}

export function detectPositions(history, minDt, maxDt, errorThreshold = Infinity) {
    const positions = [];
    const end = history[history.length - 1].timestamp - minDt;
    for (let i = 0; i < history.length && history[i].timestamp <= end;) {
        let best = { error: Infinity, index: -1 };
        for (const id in POSITIONS) {
            const position = POSITIONS[id];
            const candidate = position.bestFit(history, i, minDt, maxDt);
            if (candidate && candidate.error < best.error) {
                best = candidate;
                best.position = position.clone();
                best.position.facingDirection = history[best.index].bodyPos.facingDirection;
            }
        }
        if (best.index >= 0) {
            i = best.index;
            if (best.error <= errorThreshold) {
                positions.push(best);
            }
        } else {
            // not enough samples to find anything in the given interval
            const fastForwardTo = history[i].timestamp + maxDt - minDt;
            while (i < history.length && history[i].timestamp < fastForwardTo) {
                i++;
            }
        }
    }
    return positions;
}

export function detectSteps(positions) {
    const steps = [];
    outer_loop:
    for (let i = 0; i < positions.length;) {
        steps_loop:
        for (const key in STEPS) {
            const step_positions = STEPS[key];
            if (i + step_positions.length >= positions.length) {
                continue;
            }
            for (let j = 0; j < step_positions.length; j++) {
                if (step_positions[j] !== positions[i + j].position.id) {
                    // one position is wrong, try next step
                    continue steps_loop;
                }
            }
            // All positions match! Add it to result and move the pointer.
            steps.push({
                name: key,
                start: positions[i].start,
                end: positions[i + step_positions.length].start,
            });
            i += step_positions.length;
            continue outer_loop;
        }
        // nothing matching found, move pointer by one
        i++;
    }
    return steps;
}