import { BodyPosition, Move } from './moves';
import { leg_indx } from './util';
import { Chart } from 'chart.js/auto';
import zoomPlugin from 'chartjs-plugin-zoom';

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

    track(keypoints, timestamp) {
        const bodyPos = BodyPosition.fromKeypoints(keypoints);
        let movement = null;
        if (this.history.length > 0) {
            const timeDelta = (timestamp - this.history[this.history.length - 1].timestamp) / 1000;
            const prev = this.history[this.history.length - 1].keypoints;
            movement = keypoints.map((now, i) => pointDistance(now, prev[i]) / timeDelta);
            // console.log(`movements recorded`, movement);
            console.log(`movement right foot`, movement[leg_indx().right.ankle], timeDelta);
        }
        this.left.track(bodyPos.leftThigh);
        this.right.track(bodyPos.rightThigh);
        this.history.push({ timestamp, bodyPos, movement, keypoints });

        const chartedIndices = [23, 25, 27, 29, 31, 24, 26, 28, 30, 32];
        const chartableKeypoints = chartedIndices.map((i) => keypoints[i]);
        if (!this.chart) {
            this.chart = createChart(chartableKeypoints);
            this.chart.show(1);
            this.chart.show(6);
        }
        if (movement) {
            this.chart.data.labels.push((timestamp - chartStart) / 1000);
            for (const i in chartedIndices) {
                this.chart.data.datasets[i].data.push(movement[chartedIndices[i]]);
            }
            this.chart.update();
        }
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
                console.log(`error is ${err}, diff is`, diff);
                if (frame.movement) {
                    // console.log(`movements are`, frame.movement);
                    console.log(`recorded right foot`, frame.movement[leg_indx().right.ankle]);
                }
                console.log(`${oldCount} frames for beat, position now:`, frame.bodyPos);
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

function pointDistance(p0, p1) {
    return Math.hypot(p0.x - p1.x, p0.y - p1.y);
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



//*  charting  **/

let chartStart;
function createChart(keypoints) {
    Chart.register(zoomPlugin);
    const chartCanvas = document.getElementById('chart');
    chartStart = new Date().getTime();
    const chart = new Chart(chartCanvas, {
        type: 'line',
        data: {
            labels: [],
            datasets: keypoints.map((p) => ({ label: p.name, data: [] }))
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    type: 'linear',
                },
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Chart.js Line Chart'
                },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        modifierKey: 'ctrl',
                    },
                    zoom: {
                        drag: {
                            enabled: true,
                        },
                        mode: 'x',
                    }
                }
            }
        }
    });
    for (i in keypoints) {
        chart.hide(i);
    }

    var button2 = document.createElement("button");
    button2.onclick = () => { playSound(); };
    button2.innerText = "Play sound";
    chartCanvas.insertAdjacentElement('afterend', button2);

    var button = document.createElement("button");
    button.onclick = () => { chart.resetZoom(); };
    button.innerText = "Reset Zoom";
    chartCanvas.insertAdjacentElement('afterend', button);
    return chart;
}
