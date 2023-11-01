import { leg_indx } from "./util";
import { signedPolarAngle, polarAngle, azimuth } from './util';

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
            .then(new BodyPosition().rightLeg(70, 120))
            .then(new BodyPosition().rightLeg(40, 40).leftLeg(-20, 0))
            .then(new BodyPosition().leftLeg(70, 120))
            .then(new BodyPosition().rightLeg(-20, 0).leftLeg(40, 40))
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
}

const LEGS = leg_indx();

export class BodyPosition {
    constructor() {
        // all zero means standing straight
        this.leftThigh = 0;
        this.rightThigh = 0;
        this.leftShin = 0;
        this.rightShin = 0;
    }

    static fromKeypoints(p) {
        // First, we need to know which direction the dancer is facing.
        const hipAngle = azimuth(p[LEGS.left.hip], p[LEGS.right.hip]);
        let directionCorrection = 1;
        if (hipAngle < 45 && hipAngle > -45) {
            directionCorrection = -1;
        }
        // Thighs are at zero when standing straight, positive when moving forward.
        const leftThigh = directionCorrection * signedPolarAngle(p[LEGS.left.hip], p[LEGS.left.knee]);
        const rightThigh = directionCorrection * signedPolarAngle(p[LEGS.right.hip], p[LEGS.right.knee]);
        // Shins are relative to thighs, at zero when stretched, positive when contracted.
        const leftShin = leftThigh - directionCorrection * polarAngle(p[LEGS.left.knee], p[LEGS.left.ankle]);
        const rightShin = rightThigh - directionCorrection * polarAngle(p[LEGS.right.knee], p[LEGS.right.ankle]);
        return new BodyPosition()
            .rightLeg(rightThigh, rightShin)
            .leftLeg(leftThigh, leftShin);
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
        const out = new BodyPosition();
        out.leftThigh = interpolate(this.leftThigh, other.leftThigh, ratio);
        out.rightThigh = interpolate(this.rightThigh, other.rightThigh, ratio);
        out.leftShin = interpolate(this.leftShin, other.leftShin, ratio);
        out.rightShin = interpolate(this.rightShin, other.rightShin, ratio);
        return out;
    }
}

function interpolate(a, b, ratio) {
    return a * ratio + b * (1 - ratio);
}