export class Tracker {
    constructor() {
        this.left = new Leg("left");
        this.right = new Leg("right");
    }

    track(leftAngle, rightAngle) {
        this.left.track(leftAngle);
        this.right.track(rightAngle);
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
        if (significance > 10 && this.name === "right") {
            playSound();
        }
        return significance > 5;
    }

    track(newAngle) {
        if (this.isSignificantChange(newAngle)) {
            this.checkForDirectionChange(newAngle);
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
        }).catch(onError)

    var request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
}

function onError(e) {
    console.error(e);
}


loadSound(require('url:../beep.mp3'));