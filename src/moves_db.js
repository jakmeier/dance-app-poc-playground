import { POSITIONS } from './moves';

module.exports = { detectPositions, detectSteps };


const STEPS =
{
    "running man right": ["right-forward", "left-up"],
    "running man left": ["left-forward", "right-up"],
    "reverse running man right": ["right-forward", "right-up"],
    "reverse running man left": ["left-forward", "left-up"],
};

const CHOREOS = {
    "Running One": {
        steps: ["running man right", "running man left",],
        turns: [],
        // alt_steps: ["running man left", "running man right"],
    },
    "Turn and Run": {
        steps: ["running man right", "running man left", "running man right", "running man right"],
        turns: [6],
        // alt_steps: 
    }
};

function detectPositions(history, minDt, maxDt, errorThreshold = Infinity) {
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

function detectSteps(positions) {
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
