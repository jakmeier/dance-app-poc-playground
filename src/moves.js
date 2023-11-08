import { leg_indx, shoulder_indx } from "./util";
import { signedPolarAngle, polarAngle, azimuth, assert } from './util';
import { IMAGES, loadImage } from "./images";

export class Move {
    constructor() {
        // positions to hit on each beat
        this.onBeat = []
        // TODO: in-between beat positions for more accuracy
    }

    // Good for calibration.
    static StandingStraight() {
        return new Move().then(new BodyPosition());
    }

    // The classic.
    static RunningMan() {
        return new Move()
            .then(new BodyPosition().rightLeg(40, 40).leftLeg(-20, 0))
            .then(new BodyPosition().leftLeg(70, 120))
            .then(new BodyPosition().rightLeg(-20, 0).leftLeg(40, 40))
            .then(new BodyPosition().rightLeg(70, 120))
            ;
    }

    static DoubleRunningMan() {
        return new Move()
            .then(new BodyPosition().rightLeg(40, 40).leftLeg(-20, 0))
            .then(new BodyPosition().leftLeg(70, 120))
            .then(new BodyPosition().rightLeg(40, 40).leftLeg(-20, 0))
            .then(new BodyPosition().leftLeg(70, 120))
            .then(new BodyPosition().rightLeg(-20, 0).leftLeg(40, 40))
            .then(new BodyPosition().rightLeg(70, 120))
            .then(new BodyPosition().rightLeg(-20, 0).leftLeg(40, 40))
            .then(new BodyPosition().rightLeg(70, 120))
            ;
    }

    static ReverseRunningMan() {
        return new Move()
            .then(new BodyPosition().rightLeg(40, 40).leftLeg(-20, 0))
            .then(new BodyPosition().rightLeg(70, 120))
            .then(new BodyPosition().rightLeg(-20, 0).leftLeg(40, 40))
            .then(new BodyPosition().leftLeg(70, 120))
            ;
    }

    static DoubleTurnRunningMan() {
        return new Move()
            // normal
            .then(new BodyPosition().rightLeg(40, 40).leftLeg(-20, 0))
            .then(new BodyPosition().leftLeg(70, 120))
            .then(new BodyPosition().rightLeg(-20, 0).leftLeg(40, 40))
            .then(new BodyPosition().rightLeg(70, 120))
            // double
            .then(new BodyPosition().rightLeg(-20, 0).leftLeg(40, 40))
            .then(new BodyPosition().rightLeg(70, 120))
            // turn
            .then(new BodyPosition().rightLeg(40, 40).leftLeg(-20, 0))
            .then(new BodyPosition().leftLeg(70, 120))
            // normal  (starting left)
            .then(new BodyPosition().rightLeg(-20, 0).leftLeg(40, 40))
            .then(new BodyPosition().rightLeg(70, 120))
            // double
            .then(new BodyPosition().rightLeg(40, 40).leftLeg(-20, 0))
            .then(new BodyPosition().leftLeg(70, 120))
            .then(new BodyPosition().rightLeg(40, 40).leftLeg(-20, 0))
            .then(new BodyPosition().leftLeg(70, 120))
            // turn
            .then(new BodyPosition().rightLeg(-20, 0).leftLeg(40, 40))
            .then(new BodyPosition().rightLeg(70, 120))
            ;
    }

    then(pos) {
        this.onBeat.push(pos);
        return this;
    }

    errorScore(pos, i) {
        const targetPos = this.onBeat[i % this.onBeat.length];
        return targetPos.errorScore(pos) / 1000;
    }

    errorScores(pos, i) {
        const targetPos = this.onBeat[i % this.onBeat.length];
        return targetPos.errorScores(pos);
    }

    diff(pos, i) {
        const targetPos = this.onBeat[i % this.onBeat.length];
        return targetPos.diff(pos);
    }

    /**
     * Try to find and match the move's positions with the recorded positions.
     * Return an offset and a list of error scores and time deltas.
     */
    matchToRecording(history, minDt = 190, maxDt = 1350) {
        if (history.length == 0) {
            console.warn("no positions to match to move");
            return;
        }
        if (this.onBeat.length == 0) {
            console.warn("no moves to match to positions");
            return;
        }

        // hack to make code work with `stepAnalysis`
        const hack = [];

        // First move can have an offset between zero and a full cycle time.
        // TODO: what if the dance starts later? We shouldn't match garbage from
        // here on out, which probably happens if the first match is essentially
        // random.
        let first = null;
        const totalTime = history[history.length - 1].timestamp - history[0].timestamp;
        let firstMaxDt = maxDt * this.onBeat.length;
        while (first === null && firstMaxDt < totalTime) {
            first = this.bestFit(history, 0, 0, 0, firstMaxDt);
            firstMaxDt *= 1.2;
        }

        const firstPosition = this.onBeat[0].namedPosition();
        firstPosition.bodyPos.facingDirection = history[first.index].bodyPos.facingDirection;
        hack.push(
            {
                start: first.start,
                index: first.index,
                error: first.error,
                position: firstPosition,
                delta: 0,
            }
        );


        const errors = [first.error];
        const frames = [history[first.index]];
        const deltas = [];
        let prev = first.start;

        // Now loop through the remainder of the history to find matching moves
        let i = first.index;
        const endOfHistory = history[history.length - 1].timestamp;
        for (let beat = 1; history[i].timestamp + minDt < endOfHistory; beat++) {
            let next = null;
            while (next === null) {
                next = this.bestFit(history, i, beat, minDt, maxDt);
                i++;
            }

            errors.push(next.error);
            deltas.push(next.start - prev);
            frames.push(history[next.index]);

            const position = this.onBeat[beat % this.onBeat.length].namedPosition();
            // the bodyPos from above is the synthetic one, set the real direction for presentation purposes
            position.bodyPos.facingDirection = history[next.index].bodyPos.facingDirection;
            hack.push(
                {
                    start: next.start,
                    index: next.index,
                    error: next.error,
                    delta: next.start - prev,
                    position: position,
                }
            );

            prev = next.start;
            i = next.index;
        }

        const averageError = errors.reduce((a, b) => a + b) / errors.length;


        return {
            offset: first.start - history[0].timestamp,
            start: first.start,
            numMoves: frames.length,
            averageError,
            frames,
            errors,
            deltas,
            positions: hack,
        }
    }

    /**
     * Find the best fit of a position in a given history range.
     * 
     * @param {[*]} history: list of recorded positions
     * @param {number} start: index in recorded positions to start search
     * @param {number} beat: index to decide which position of the move to search for
     * @param {number} minDt: smallest time interval between start and match
     * @param {number} maxDt: largest time interval between start and match
     */
    bestFit(history, start, beat, minDt, maxDt) {
        return this.onBeat[beat % this.onBeat.length].bestFit(history, start, minDt, maxDt);
    }
}

const LEGS = leg_indx();
const SHOULDER = shoulder_indx();

export class BodyPosition {
    constructor(facingDirection = 'unknown') {
        // all zero means standing straight
        this.leftThigh = 0;
        this.rightThigh = 0;
        this.leftShin = 0;
        this.rightShin = 0;
        this.facingDirection = facingDirection;
    }

    static fromKeypoints(p) {
        // First, we need to know which direction the dancer is facing.
        //
        // Using the hip azimuth works for ~95% of typical frames, but exactly
        // on the extreme points of a running man, the angle is right at the
        // infliction point. In other words, the range of hip azimuths during a
        // straight running man is about 180°.
        // Instead, let's try the shoulder. It seems more stable so far.
        let { directionCorrection, facingDirection } = BodyPosition.keypointsToDirection(p);
        // Thighs are at zero when standing straight, positive when moving forward.
        const leftThigh = directionCorrection * signedPolarAngle(p[LEGS.left.hip], p[LEGS.left.knee]);
        const rightThigh = directionCorrection * signedPolarAngle(p[LEGS.right.hip], p[LEGS.right.knee]);
        // Shins are relative to thighs, at zero when stretched, positive when contracted.
        const leftShin = leftThigh - directionCorrection * polarAngle(p[LEGS.left.knee], p[LEGS.left.ankle]);
        const rightShin = rightThigh - directionCorrection * polarAngle(p[LEGS.right.knee], p[LEGS.right.ankle]);
        return new BodyPosition(facingDirection)
            .rightLeg(rightThigh, rightShin)
            .leftLeg(leftThigh, leftShin);
    }

    static keypointsToDirection(p) {
        const shoulderAngle = azimuth(p[SHOULDER.left], p[SHOULDER.right]);
        let directionCorrection = 1;
        let facingDirection = 'unknown';
        if (shoulderAngle <= 45 && shoulderAngle >= -45) {
            facingDirection = 'left';
            directionCorrection = -1;
        } else if (shoulderAngle < 135 && shoulderAngle > 45) {
            facingDirection = 'back';
        } else if (shoulderAngle <= -135 || shoulderAngle >= 135) {
            facingDirection = 'right';
        } else if (shoulderAngle < -45 && shoulderAngle > -135) {
            facingDirection = 'front';
        }
        return { directionCorrection, facingDirection };
    }

    leftLeg(thigh, shin) {
        this.leftThigh = thigh;
        this.leftShin = shin;
        return this;
    }

    rightLeg(thigh, shin) {
        this.rightThigh = thigh;
        this.rightShin = shin;
        return this;
    }

    errorScore(other) {
        return Math.pow(this.leftThigh - other.leftThigh, 2)
            + Math.pow(this.rightThigh - other.rightThigh, 2)
            + Math.pow(this.leftShin - other.leftShin, 2)
            + Math.pow(this.rightShin - other.rightShin, 2);
    }

    errorScores(other) {
        return {
            leftThigh: Math.pow(this.leftThigh - other.leftThigh, 2),
            rightThigh: Math.pow(this.rightThigh - other.rightThigh, 2),
            leftShin: Math.pow(this.leftShin - other.leftShin, 2),
            rightShin: Math.pow(this.rightShin - other.rightShin, 2)
        };
    }

    diff(other) {
        const out = new BodyPosition();
        out.leftThigh = this.leftThigh - other.leftThigh;
        out.rightThigh = this.rightThigh - other.rightThigh;
        out.leftShin = this.leftShin - other.leftShin;
        out.rightShin = this.rightShin - other.rightShin;
        return out;
    }

    interpolate(other, ratio) {
        const out = new BodyPosition(this.facingDirection);
        out.leftThigh = interpolate(this.leftThigh, other.leftThigh, ratio);
        out.rightThigh = interpolate(this.rightThigh, other.rightThigh, ratio);
        out.leftShin = interpolate(this.leftShin, other.leftShin, ratio);
        out.rightShin = interpolate(this.rightShin, other.rightShin, ratio);
        return out;
    }

    bestFit(history, start, minDt, maxDt) {
        assert(minDt <= maxDt, `${minDt} <= ${maxDt}`);
        assert(start < history.length, `${start} < ${history.length}`);
        if (history[start].timestamp + minDt > history[history.length - 1].timestamp) {
            assert(false, "no frames after start + minDt");
        }
        let smallestError = Infinity;
        let smallestErrorIndex = null;
        const startTime = history[start].timestamp + minDt;
        const endTime = history[start].timestamp + maxDt;
        for (let i = start; i < history.length && history[i].timestamp <= endTime; i++) {
            if (history[i].timestamp < startTime) {
                continue;
            }
            const error = this.errorScore(history[i].bodyPos) / 1000;
            if (error < smallestError) {
                smallestError = error;
                smallestErrorIndex = i;
            }
        }
        if (smallestErrorIndex === null) {
            return null;
        }
        return {
            index: smallestErrorIndex,
            start: history[smallestErrorIndex].timestamp,
            error: smallestError,
        };
    }

    /**
     * Hack to avoid merging moves_db::STEPS with how steps were defined for the tracker
     */
    namedPosition() {
        if (this.rightThigh === 70 && this.rightShin === 120 && this.leftThigh === 0 && this.leftShin === 0) {
            return POSITIONS[0].clone();
        }
        if (this.rightThigh === 40 && this.rightShin === 40 && this.leftThigh === -20 && this.leftShin === 0) {
            return POSITIONS[1].clone();
        }
        if (this.leftThigh === 70 && this.leftShin === 120 && this.rightThigh === 0 && this.rightShin === 0) {
            return POSITIONS[2].clone();
        }
        if (this.leftThigh === 40 && this.leftShin === 40 && this.rightThigh === -20 && this.rightShin === 0) {
            return POSITIONS[3].clone();
        }
        console.error("body position unknown", position);
        return null;
    }
}

function interpolate(a, b, ratio) {
    return a * ratio + b * (1 - ratio);
}

class NamedPosition {
    constructor(id, name, img, bodyPos) {
        this.id = id;
        this.name = name;
        this.img = img;
        this.bodyPos = bodyPos;
    }

    /// mostly shallow copy, for example because of the included image, but bodyPos is copied one layer deeper
    clone() {
        return new NamedPosition(
            this.id,
            this.name,
            this.img,
            Object.assign({}, this.bodyPos),
        );
    }
}

export const POSITIONS = [
    pos("right-up", "Right Leg Up", IMAGES.between_steps, new BodyPosition().rightLeg(70, 120)),
    pos("right-forward", "Right Leg Forward", IMAGES.step_wide, new BodyPosition().rightLeg(40, 40).leftLeg(-20, 0)),
    pos("left-up", "Left Leg Up", IMAGES.between_steps, new BodyPosition().leftLeg(70, 120)),
    pos("left-forward", "Left Leg Forward", IMAGES.step_wide, new BodyPosition().rightLeg(-20, 0).leftLeg(40, 40)),
];

function pos(id, name, img, bodyPos) {
    return new NamedPosition(id, name, loadImage(img), bodyPos);
}