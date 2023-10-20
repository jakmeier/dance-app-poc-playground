import { BodyPosition, Move } from './moves';

export class Tracker {
    constructor() {
        this.left = new Leg("left");
        this.right = new Leg("right");
        this.move = Move.RunningMan();
        // this.move = Move.StandingStraight();
        this.moveIndex = 0;
        this.history = [];

        playSound();
        setTimeout(() => metronome(90, 10, this), 3000);
    }

    track(bodyPos, timestamp) {
        this.left.track(bodyPos.leftThigh);
        this.right.track(bodyPos.rightThigh);
        this.history.push({ timestamp, bodyPos });
    }

    beat(scheduledTime) {
        let oldCount = 0;
        for (const frame of this.history) {
            oldCount += 1;
            if (frame.timestamp >= scheduledTime) {
                // console.log(`${frame.timestamp} and ${scheduledTime}`);
                let err = this.move.errorScore(frame.bodyPos, this.moveIndex);
                let diff = this.move.diff(frame.bodyPos, this.moveIndex);
                console.log(`time diff is ${frame.timestamp - scheduledTime}`);
                console.log(`error is ${err} and diff is`, diff);
                console.log(frame.bodyPos);
                break;
            }
        }
        if (oldCount > 0) {
            this.history = this.history.slice(oldCount);
            // this.history = [];
        } else if (this.history.length > 0) {
            console.warn(`no frame available for ${scheduledTime}, latest was ${this.history[0].timestamp}`);

        }
        this.moveIndex += 1;
    }
}

export class Leg {
    constructor(name) {
        this.name = name;
        this.currentAngle = 90;
        this.isIncreasing = true;
        this.previousChange = new Date();
    }

    checkForDirectionChange(newAngle) {
        if (this.isIncreasing && newAngle < this.currentAngle) {
            const timeElapsed = updateTime(this.previousChange);
            const a = this.currentAngle - newAngle;
            console.log(`${timeElapsed}, ${this.name} going back ${a}`);
        }
        else if (!this.isIncreasing && newAngle > this.currentAngle) {
            const timeElapsed = updateTime(this.previousChange);
            const a = newAngle - this.currentAngle;
            console.log(`${timeElapsed}, ${this.name} going forward ${a}`);
        }
    }

    update(newAngle) {
        this.isIncreasing = newAngle > this.currentAngle;
        this.currentAngle = newAngle;
    }

    isSignificantChange(newAngle) {
        const significance = Math.abs(this.currentAngle - newAngle);
        return significance > 5;
    }

    track(newAngle) {
        if (this.isSignificantChange(newAngle)) {
            // this.checkForDirectionChange(newAngle);
            this.update(newAngle);
        }
    }
}

function updateTime(time) {
    const currentTime = new Date();
    const timeElapsed = currentTime.getTime() - time.getTime();
    time.setTime(currentTime);
    return timeElapsed;
}

var playSound = () => { };
var metronome = (_bpm, _seconds, _tracker) => { };
const context = new AudioContext();

function loadSound(url) {
    fetch(url)
        .then(data => data.arrayBuffer())
        .then(arrayBuffer => context.decodeAudioData(arrayBuffer))
        .then(decodedAudio => {
            playSound = () => {
                source = context.createBufferSource();
                source.buffer = decodedAudio;
                source.connect(context.destination);
                source.start();
            }
            metronome = (bpm, seconds, tracker) => {
                const dt = 60 / bpm;
                // in seconds, usually zero
                const startAudioTime = context.currentTime;
                // the time now in ms, for syncing with camera
                const startAbsoluteTime = new Date().getTime();
                for (let i = 0; i * dt < seconds; i++) {
                    const source = context.createBufferSource();
                    source.buffer = decodedAudio;
                    source.connect(context.destination);
                    const delay = i * dt;
                    source.onended = () => { tracker.beat(startAbsoluteTime + delay * 1000); };
                    source.start(startAudioTime + delay);
                }
            }
        }).catch(onError)

    var request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
}

function onError(e) {
    console.error(e);
}


loadSound(require('url:../beep.mp3'));