import { add2dVector, leg_indx, shoulder_indx } from "./util";
import { signedPolarAngle, polarAngle, azimuth, assert } from './util';
import { IMAGES, loadImage } from "./images";

export class Move {
    constructor(name = "unknown step name") {
        // [NamedPosition]
        // positions to hit on each beat (actually beats and off-beats)
        this.onBeat = [];
        // str
        this.name = name;
        // { step-name: [str] }
        this.steps = {};
        this.steps[this.name] = [];
    }

    // Good for calibration.
    static StandingStraight() {
        return new Move().then(new BodyPosition());
    }

    // The classic.
    static RunningMan() {
        return new Move("Running Man")
            .then("right-forward")
            .then("left-up")
            .then("left-forward")
            .then("right-up")
            ;
    }

    static DoubleRunningMan() {
        return new Move("Double Running Man")
            .then("right-forward")
            .then("left-up")
            .then("right-forward")
            .then("left-up")
            .then("left-forward")
            .then("right-up")
            .then("left-forward")
            .then("right-up")
            ;
    }

    static ReverseRunningMan() {
        return new Move("Double Running Man")
            .then("right-forward")
            .then("right-up")
            .then("left-forward")
            .then("left-up")
            ;
    }

    static DoubleTurnRunningMan() {
        return new Move("Double Turn Running Man")
            // normal
            .then("right-forward")
            .then("left-up")
            .then("left-forward")
            .then("right-up")
            // double
            .then("left-forward")
            .then("right-up")
            // turn
            .then("right-forward")
            .then("left-up")
            // normal  (starting left)
            .then("left-forward")
            .then("right-up")
            // double
            .then("right-forward")
            .then("left-up")
            .then("right-forward")
            .then("left-up")
            // turn
            .then("left-forward")
            .then("right-up")
            ;
    }

    then(bodyPosId) {
        const bodyPos = POSITIONS[bodyPosId];
        this.onBeat.push(bodyPos);
        this.steps[this.name].push(bodyPosId);
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
            return null;
        }
        if (this.onBeat.length == 0) {
            console.warn("no moves to match to positions");
            return null;
        }

        // hack to make code work with `detectSteps`
        const hack = [];

        // First move can have an offset between zero and a full cycle time.
        // TODO: what if the dance starts later? We shouldn't match garbage from
        // here on out, which probably happens if the first match is essentially
        // random.
        let first = null;
        const totalTime = history[history.length - 1].timestamp - history[0].timestamp;
        let firstMaxDt = maxDt * this.onBeat.length;
        while (first === null) {
            first = this.bestFit(history, 0, 0, 0, firstMaxDt);
            // We'll leave the loop if we found `first`, otherwise we want to increase the search window.
            // However, if the search window already spans the entire history, we should give up the search.
            if (firstMaxDt > totalTime && first === null) {
                return null;
            }
            firstMaxDt *= 1.2;
        }

        const firstPosition = this.onBeat[0].clone();
        firstPosition.facingDirection = history[first.index].bodyPos.facingDirection;
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
            while (next === null && history[i].timestamp + minDt < endOfHistory) {
                next = this.bestFit(history, i, beat, minDt, maxDt);
                i++;
            }
            if (next === null) {
                break;
            }

            errors.push(next.error);
            deltas.push(next.start - prev);
            frames.push(history[next.index]);

            const position = this.onBeat[beat % this.onBeat.length].clone();
            // the bodyPos from above is the synthetic one, set the real direction for presentation purposes
            position.facingDirection = history[next.index].bodyPos.facingDirection;
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

/**
 * An actual position of a person
 */
export class BodyPosition {
    constructor(facingDirection = 'unknown') {
        // all zero means standing straight
        this.leftThigh = 0;
        this.rightThigh = 0;
        this.leftShin = 0;
        this.rightShin = 0;
        this.leftFullLeg = 0;
        this.rightFullLeg = 0;
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
        // Full legs are the same as thigh but measured all the way down to the ankle
        const leftLeg = directionCorrection * signedPolarAngle(p[LEGS.left.hip], p[LEGS.left.ankle]);
        const rightLeg = directionCorrection * signedPolarAngle(p[LEGS.right.hip], p[LEGS.right.ankle]);
        // Shins are relative to thighs, at zero when stretched, positive when contracted.
        const leftShin = leftThigh - directionCorrection * polarAngle(p[LEGS.left.knee], p[LEGS.left.ankle]);
        const rightShin = rightThigh - directionCorrection * polarAngle(p[LEGS.right.knee], p[LEGS.right.ankle]);
        return new BodyPosition(facingDirection)
            .rightLeg(rightThigh, rightShin, rightLeg)
            .leftLeg(leftThigh, leftShin, leftLeg);
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

    leftLeg(thigh, shin, leg) {
        this.leftThigh = thigh;
        this.leftShin = shin;
        this.leftFullLeg = leg;
        return this;
    }

    rightLeg(thigh, shin, leg) {
        this.rightThigh = thigh;
        this.rightShin = shin;
        this.rightFullLeg = leg;
        return this;
    }

    interpolate(other, ratio) {
        const out = new BodyPosition(this.facingDirection);
        out.leftThigh = interpolate(this.leftThigh, other.leftThigh, ratio);
        out.rightThigh = interpolate(this.rightThigh, other.rightThigh, ratio);
        out.leftShin = interpolate(this.leftShin, other.leftShin, ratio);
        out.rightShin = interpolate(this.rightShin, other.rightShin, ratio);
        out.leftFullLeg = interpolate(this.leftFullLeg, other.leftFullLeg, ratio);
        out.rightFullLeg = interpolate(this.rightFullLeg, other.rightFullLeg, ratio);
        return out;
    }

    diff(other) {
        const out = new BodyPosition();
        out.leftThigh = this.leftThigh - other.leftThigh;
        out.rightThigh = this.rightThigh - other.rightThigh;
        out.leftShin = this.leftShin - other.leftShin;
        out.rightShin = this.rightShin - other.rightShin;
        out.leftFullLeg = this.leftFullLeg - other.leftFullLeg;
        out.rightFullLeg = this.rightFullLeg - other.rightFullLeg;
        return out;
    }
}

function interpolate(a, b, ratio) {
    return a * ratio + b * (1 - ratio);
}

/** 
 * Description of how a position *should* be.
 *
 * This includes range definitions, and more angles than strictly necessary to
 * fully define a body position.
 **/
class NamedPosition {
    constructor(id, name, img, leftThigh, rightThigh, leftShin, rightShin, leftFullLeg, rightFullLeg) {
        this.id = id;
        this.name = name;
        this.img = img;

        this.leftThigh = leftThigh;
        this.rightThigh = rightThigh;
        this.leftShin = leftShin;
        this.rightShin = rightShin;
        this.leftFullLeg = leftFullLeg;
        this.rightFullLeg = rightFullLeg;
    }


    leftLeg(thigh, shin, leg, tolerance, thighWeight, shinWeight, legWeight) {
        this.leftThigh = Range.WithTolerance(thigh, tolerance, thighWeight);
        this.leftShin = Range.WithTolerance(shin, tolerance, shinWeight);
        this.leftFullLeg = Range.WithTolerance(leg, tolerance, legWeight);
        return this;
    }

    rightLeg(thigh, shin, leg, tolerance, thighWeight, shinWeight, legWeight) {
        this.rightThigh = Range.WithTolerance(thigh, tolerance, thighWeight);
        this.rightShin = Range.WithTolerance(shin, tolerance, shinWeight);
        this.rightFullLeg = Range.WithTolerance(leg, tolerance, legWeight);
        return this;
    }

    /// mostly shallow copy, for example because of the included image, but ranges are copied one layer deeper
    clone() {
        return new NamedPosition(
            this.id,
            this.name,
            this.img,
            this.leftThigh.clone(),
            this.rightThigh.clone(),
            this.leftShin.clone(),
            this.rightShin.clone(),
            this.leftFullLeg.clone(),
            this.rightFullLeg.clone(),
        );
    }

    errorScore(bodyPos) {
        let sum = 0;
        const scores = this.errorScores(bodyPos);
        for (const key in scores) {
            sum += scores[key];
        }
        return sum;
    }

    errorScores(bodyPos) {
        return {
            leftThigh: this.leftThigh.errorScore(bodyPos.leftThigh),
            rightThigh: this.rightThigh.errorScore(bodyPos.rightThigh),
            leftShin: this.leftShin.errorScore(bodyPos.leftShin),
            rightShin: this.rightShin.errorScore(bodyPos.rightShin),
            rightFullLeg: this.rightFullLeg.errorScore(bodyPos.rightFullLeg),
            leftFullLeg: this.leftFullLeg.errorScore(bodyPos.leftFullLeg),
        };
    }

    diff(bodyPos) {
        let out = new BodyPosition();
        out.leftThigh = this.leftThigh.diff(bodyPos.leftThigh);
        out.rightThigh = this.rightThigh.diff(bodyPos.rightThigh);
        out.leftShin = this.leftShin.diff(bodyPos.leftShin);
        out.rightShin = this.rightShin.diff(bodyPos.rightShin);
        out.leftFullLeg = this.leftFullLeg.diff(bodyPos.leftFullLeg);
        out.rightFullLeg = this.rightFullLeg.diff(bodyPos.rightFullLeg);
        return out;
    }

    bestFit(history, start, minDt, maxDt) {
        assert(minDt <= maxDt, `${minDt} <= ${maxDt}`);
        assert(start < history.length, `${start} < ${history.length}`);
        if (history[start].timestamp + minDt > history[history.length - 1].timestamp) {
            console.log("start", start, "history.length", history.length);
            assert(
                false,
                `no frames after start + minDt (${history[start].timestamp} + ${minDt} > ${history[history.length - 1].timestamp})`
            );
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

    toKeypoints(leftHip, rightHip, leftThighLength, leftShinLength, rightThighLength, rightShinLength, directionCorrection) {
        const leftThighAngle = this.leftThigh.center() * -directionCorrection;
        const rightThighAngle = this.rightThigh.center() * -directionCorrection;
        let leftShinAngle = (this.leftShin.center() + leftThighAngle) * directionCorrection;
        let rightShinAngle = (this.rightShin.center() + rightThighAngle) * directionCorrection;

        const leftKnee = add2dVector(leftHip, leftThighAngle, leftThighLength);
        const rightKnee = add2dVector(rightHip, rightThighAngle, rightThighLength);
        const leftAnkle = add2dVector(leftKnee, leftShinAngle, leftShinLength);
        const rightAnkle = add2dVector(rightKnee, rightShinAngle, rightShinLength);

        return {
            left: {
                hip: leftHip,
                knee: leftKnee,
                ankle: leftAnkle,
            },
            right: {
                hip: rightHip,
                knee: rightKnee,
                ankle: rightAnkle,
            }
        };
    }
}

/** Defines in what range a certain body part should be */
class Range {
    constructor(min, max, weight = 1.0) {
        this.weight = weight;
        this.min = min;
        this.max = max;
    }

    static WithTolerance(perfect, tolerance, weight = 1.0) {
        return new Range(perfect - tolerance, perfect + tolerance, weight);
    }

    clone() {
        return new Range(this.min, this.max, this.weight);
    }

    errorScore(actual) {
        if (this.min <= actual && this.max >= actual) {
            return 0;
        }
        return this.weight * Math.min(Math.pow(this.min - actual, 2), Math.pow(this.max - actual, 2));
    }

    diff(actual) {
        const smaller = this.min - actual;
        const greater = this.max - actual;

        return Math.abs(smaller) < Math.abs(greater) ? smaller : greater;
    }

    center() {
        return (this.min + this.max) / 2;
    }
}

const TINY_TOLERANCE = 2.5;
const SMALL_TOLERANCE = 5;
const MEDIUM_TOLERANCE = 10;
const BIG_TOLERANCE = 15;
const HUGE_TOLERANCE = 20;

// notes on angles:
// For a perfect shape, thighs should go up to almost 90° in the *-up position and the shin around 130°. (The shin really depends on the thigh, though)
// But more chill positions should also be accepted in the base RM, as I'm trying to keep this beginner friendly.
// The tricky bit is, how to make both the "perfect" and the "chill" version work in one? For now, I'm using high tolerance and reduced wieghts for that matter.
export const POSITIONS = {
    "right-up": pos("right-up", "Right Leg Up", IMAGES.between_steps).rightLeg(70, 100, 0, HUGE_TOLERANCE, 1, 0.2, 1).leftLeg(0, 0, 0, SMALL_TOLERANCE, 0, 0, 1),
    "right-forward": pos("right-forward", "Right Leg Forward", IMAGES.step_wide).rightLeg(40, 40, 10, TINY_TOLERANCE).leftLeg(-20, 5, -30, SMALL_TOLERANCE),
    "left-up": pos("left-up", "Left Leg Up", IMAGES.between_steps).leftLeg(70, 100, 0, HUGE_TOLERANCE, 1, 0.2, 1).rightLeg(0, 0, 0, SMALL_TOLERANCE, 0, 0, 1),
    "left-forward": pos("left-forward", "Left Leg Forward", IMAGES.step_wide).rightLeg(-20, 5, -30, SMALL_TOLERANCE).leftLeg(40, 40, 10, TINY_TOLERANCE),
}

function pos(id, name, img) {
    const zeroPos = Range.WithTolerance(0, BIG_TOLERANCE);
    return new NamedPosition(id, name, loadImage(img), zeroPos, zeroPos, zeroPos, zeroPos, zeroPos, zeroPos);
}