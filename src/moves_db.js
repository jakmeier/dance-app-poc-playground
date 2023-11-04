module.exports = { detectPositions, detectSteps };

const { BodyPosition } = require('./moves');

const IMAGES = {
    between_steps: require("url:../assets/image/between_steps.png"),
    step_wide: require("url:../assets/image/step_wide.png"),
};

const POSITIONS = [
    pos("right-up", "Right Leg Up", IMAGES.between_steps, new BodyPosition().rightLeg(70, 120)),
    pos("right-forward", "Right Leg Forward", IMAGES.step_wide, new BodyPosition().rightLeg(40, 40).leftLeg(-20, 0)),
    pos("left-up", "Left Leg Up", IMAGES.between_steps, new BodyPosition().leftLeg(70, 120)),
    pos("left-forward", "Left Leg Forward", IMAGES.step_wide, new BodyPosition().rightLeg(-20, 0).leftLeg(40, 40)),
];

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
        let best = { error: Infinity };
        for (const position of POSITIONS) {
            const candidate = position.bodyPos.bestFit(history, i, minDt, maxDt);
            if (candidate.error < best.error) {
                best = candidate;
                best.position = position;
            }
        }
        if (i !== best.index) {
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
            for (let j = 0; j < step_positions.length && i + j < positions.length; j++) {
                if (step_positions[j] !== positions[i + j].position.id) {
                    // one position is wrong, try next step
                    continue steps_loop;
                }
            }
            // All positions match! Add it to result and move the pointer.
            steps.push(key);
            i += step_positions.length;
            continue outer_loop;
        }
        // nothing matching found, move pointer by one
        i++;
    }
    return steps;
}

function pos(id, name, img, bodyPos) {
    return {
        id,
        name,
        img: loadImage(img),
        bodyPos,
    };
}

function loadImage(url) {
    const img = new window.Image();
    img.src = url;
    return img;
}
