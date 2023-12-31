import { BodyPosition, Move } from './moves';
import { onBeatScore } from './rhythm';
import { leg_indx } from './util';
import { Chart } from 'chart.js/auto';
import zoomPlugin from 'chartjs-plugin-zoom';
import { playBeat, playSound, playCounts } from './sound';

const CHART_ENABLED = false;
const timerElement = document.getElementById('timer');

export class Tracker {
    constructor(move, bpm, beats = 16, counts = 4) {
        this.move = move;
        this.moveIndex = 0;
        this.history = [];
        this.soundBpm = bpm;
        this.soundCounts = counts;
        this.beatsLeft = beats;
        this.onStart = () => { }
    }

    start(msBeforeAudio, song, songMeta, isVirtualReplay = false) {
        const dt = 60 / this.soundBpm;
        let countDownStart = msBeforeAudio;
        let countDownEnd = countDownStart + this.soundCounts * dt * 1000;
        if (song) {
            const delay = isVirtualReplay ? 0 : dt * songMeta.delay * 1000;
            countDownStart += delay;
            countDownEnd += delay;
            setTimeout(
                () => playCounts(1, this.soundCounts, dt),
                delay
            )
            playSound(song, true, songMeta.fastForward);
            this.scheduleBeatCalls(countDownEnd);
            // onStart called internally
        } else {
            setTimeout(
                () => {
                    playBeat(this.soundBpm, this.beatsLeft, this.soundCounts, this);
                    this.onStart();
                },
                msBeforeAudio
            );
        }
        const visualCountsNum = Math.round(countDownEnd / (dt * 1000));
        for (let t = 0; t < visualCountsNum; t++) {
            // const t = Math.round(countDownEnd / 1000) - i;
            setTimeout(
                () => timerElement.innerHTML = `Get Ready! (${visualCountsNum - t})`,
                t * dt * 1000,
            )
        }
    }

    // can also be done by metronome, but for songs without metronome sound, use this
    scheduleBeatCalls(initDelay = 0) {
        const ms = 60_000 / this.soundBpm;
        const cb = () => {
            this.beat(new Date().getTime());
            if (this.isDone()) {
                clearInterval(this.intervalHandle);
            }
        }
        setTimeout(
            () => {
                this.intervalHandle = setInterval(cb, ms);
                this.onStart();
            },
            initDelay,
        );
    }


    freezeForReview(analysisStart) {
        let tracker = new Tracker(this.move, this.soundBpm, 0, this.soundCounts);
        tracker.history = this.history.filter((item) => item.timestamp >= analysisStart);
        return tracker;
    }

    countTime() {
        return this.soundCounts * 60_000 / this.soundBpm;
    }

    track(keypoints, keypoints3D, timestamp) {
        const bodyPos = BodyPosition.fromKeypoints(keypoints3D);
        let movement = null;
        if (this.history.length > 0) {
            const timeDelta = (timestamp - this.history[this.history.length - 1].timestamp) / 1000;
            const prev = this.history[this.history.length - 1].keypoints3D;
            movement = keypoints3D.map((now, i) => pointDistance(now, prev[i]) / timeDelta);
        }
        // this.left.track(bodyPos.leftThigh);
        // this.right.track(bodyPos.rightThigh);
        this.history.push({ timestamp, bodyPos, movement, keypoints, keypoints3D });

        const chartedIndices = [23, 25, 27, 29, 31, 24, 26, 28, 30, 32];
        const chartableKeypoints = chartedIndices.map((i) => keypoints3D[i]);
        if (CHART_ENABLED && !this.chart) {
            this.chart = createLiveChart(chartableKeypoints);
            this.chart.show(1);
            this.chart.show(6);
        }
        if (movement && CHART_ENABLED) {
            this.chart.data.labels.push((timestamp - liveChartStart) / 1000);
            for (const i in chartedIndices) {
                this.chart.data.datasets[i].data.push(movement[chartedIndices[i]]);
            }
            this.addErrorScore(chartedIndices.length, 0, bodyPos);
            this.addErrorScore(chartedIndices.length, 1, bodyPos);
            this.addErrorScore(chartedIndices.length, 2, bodyPos);
            this.addErrorScore(chartedIndices.length, 3, bodyPos);
            if (this.isDone()) {
                this.chart.update();
            }
        }
        // if (this.history.length > 100 && timestamp - lastUpdate > 1000) {
        //     lastUpdate = timestamp;
        //     const bpms = [80, 90, 100, 110, 120, 130];
        //     for (const bpm of bpms) {
        //         const score = onBeatScore(this.history, bpm);
        //         // console.log(`rhythm score ${bpm} ${score.score} at offset ${score.offset}`);
        //     }
        //     let best = { score: 99999999 };
        //     for (let i = 0; i < bpms.length; i++) {
        //         const bpm = bpms[i];
        //         const score = this.bpmError(bpm);
        //         // console.log(`shape score ${bpm} ${score.score} at offset ${score.offset}`);
        //         if (score.score < best.score) {
        //             score.bpm = bpm;
        //             best = score;
        //         }
        //     }
        //     document.getElementById('bpm').innerText = best.bpm;
        //     document.getElementById('score').innerText = 25 - best.score;
        // }
    }

    addErrorScore(offset, i, bodyPos) {
        this.chart.data.datasets[offset + 5 * i].data.push(this.move.errorScore(bodyPos, i) * 1000);
        this.chart.data.datasets[offset + 5 * i + 1].data.push(this.move.errorScores(bodyPos, i).leftThigh);
        this.chart.data.datasets[offset + 5 * i + 2].data.push(this.move.errorScores(bodyPos, i).rightThigh);
        this.chart.data.datasets[offset + 5 * i + 3].data.push(this.move.errorScores(bodyPos, i).leftShin);
        this.chart.data.datasets[offset + 5 * i + 4].data.push(this.move.errorScores(bodyPos, i).rightShin);
    }

    beat(scheduledTime) {
        timerElement.innerHTML = `${this.beatsLeft} beats`;
        let oldCount = 0;
        for (const frame of this.history) {
            oldCount += 1;
            if (frame.timestamp >= scheduledTime) {
                // console.log(`${frame.timestamp} and ${scheduledTime}`);
                let err = this.move.errorScore(frame.bodyPos, this.moveIndex);
                let diff = this.move.diff(frame.bodyPos, this.moveIndex);
                // console.log(`time diff is ${frame.timestamp - scheduledTime}`);
                // console.log(`error is ${err}, diff is`, diff);
                if (frame.movement) {
                    // console.log(`movements are`, frame.movement);
                    // console.log(`recorded right foot`, frame.movement[leg_indx().right.ankle]);
                }
                // console.log(`${oldCount} frames for beat, position now:`, frame.bodyPos);
                break;
            }
        }
        if (oldCount > 0) {
            // this.history = this.history.slice(oldCount);
            // this.history = [];
        } else if (this.history.length > 0) {
            console.warn(`no frame available for ${scheduledTime}, latest was ${this.history[0].timestamp}`);
        }
        this.moveIndex += 1;
        this.beatsLeft -= 1;
    }

    // The start is estimated such that the errors is smallest.
    bpmError(targetBpm) {
        const samples = this.history;
        if (samples.length == 0) {
            return 0;
        }
        const beatDuration = 60_000 / targetBpm;
        const start = samples[0].timestamp;

        let best = { score: 9999999999 };
        let i = 0;
        while (samples[i].timestamp < start + this.move.onBeat.length * beatDuration) {
            let total = this.move.errorScore(samples[i].bodyPos, 0);
            let numBeats = 1;
            let left = i;
            let j = i + 1;
            while (j < samples.length) {
                const nextBeat = samples[left].timestamp + beatDuration;
                if (samples[j].timestamp >= nextBeat) {
                    const tooEarly = nextBeat - samples[j - 1].timestamp;
                    const tooLate = samples[j].timestamp - nextBeat;
                    const before = samples[j - 1].bodyPos;
                    const after = samples[j].bodyPos;
                    const between = before.interpolate(after, tooLate / (tooEarly + tooLate));
                    total += this.move.errorScore(between, numBeats);

                    numBeats += 1;
                    left = j;
                }
                j += 1;
            }
            const candidate = {
                offset: samples[i].timestamp - start,
                score: total / numBeats,
            };
            if (candidate.score < best.score) {
                best = candidate;
            }
            i += 1;
        }
        return best;
    }

    bpmErrorFixedOffset(targetBpm, offset) {
        const samples = this.history;
        if (samples.length == 0) {
            return 0;
        }
        const beatDuration = 60_000 / targetBpm;
        const start = samples[0].timestamp + offset;

        let left = 0;
        while (samples[left].timestamp < start) {
            left++;
        }

        let total = this.move.errorScore(samples[left].bodyPos, 0);
        let numBeats = 1;
        let j = left + 1;
        while (j < samples.length) {
            const nextBeat = samples[left].timestamp + beatDuration;
            if (samples[j].timestamp >= nextBeat) {
                const tooEarly = nextBeat - samples[j - 1].timestamp;
                const tooLate = samples[j].timestamp - nextBeat;
                const before = samples[j - 1].bodyPos;
                const after = samples[j].bodyPos;
                const between = before.interpolate(after, tooLate / (tooEarly + tooLate));
                total += this.move.errorScore(between, numBeats);

                numBeats += 1;
                left = j;
            }
            j += 1;
        }
        const candidate = {
            offset,
            score: total / numBeats,
        };
        return candidate;
    }

    isDone() {
        return this.beatsLeft <= 0;
    }

    computeBestFits() {
        const slow = this.move.matchToRecording(this.history, 600, 1350);
        const mid = this.move.matchToRecording(this.history, 300, 800);
        const fast = this.move.matchToRecording(this.history, 150, 400);
        if (1.25 * slow.averageError < mid.averageError && 1.5 * slow.averageError < fast.averageError) {
            return slow;
        } else if (1.25 * mid.averageError < fast.averageError) {
            return mid;
        } else {
            return fast;
        }
    }
}

function pointDistance(p0, p1) {
    return Math.hypot(p0.x - p1.x, p0.y - p1.y);
}

//*  charting  **/

let liveChartStart;
Chart.register(zoomPlugin);
function createLiveChart(keypoints) {
    const chartCanvas = document.getElementById('chart');
    liveChartStart = new Date().getTime();
    const datasets = keypoints.map((p) => ({ label: p.name, data: [] }))
        .concat([
            { label: 'pos0', data: [] },
            { label: 'pos0.leftThigh', data: [] },
            { label: 'pos0.rightThigh', data: [] },
            { label: 'pos0.leftShin', data: [] },
            { label: 'pos0.rightShin', data: [] },
            { label: 'pos1', data: [] },
            { label: 'pos1.leftThigh', data: [] },
            { label: 'pos1.rightThigh', data: [] },
            { label: 'pos1.leftShin', data: [] },
            { label: 'pos1.rightShin', data: [] },
            { label: 'pos2', data: [] },
            { label: 'pos2.leftThigh', data: [] },
            { label: 'pos2.rightThigh', data: [] },
            { label: 'pos2.leftShin', data: [] },
            { label: 'pos2.rightShin', data: [] },
            { label: 'pos3', data: [] },
            { label: 'pos3.leftThigh', data: [] },
            { label: 'pos3.rightThigh', data: [] },
            { label: 'pos3.leftShin', data: [] },
            { label: 'pos3.rightShin', data: [] }
        ]);
    const chart = new Chart(chartCanvas, {
        type: 'line',
        data: {
            labels: [],
            datasets
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
                    text: 'Live Analysis'
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
    for (i in chart.data.datasets) {
        chart.hide(i);
    }

    var button = document.createElement("button");
    button.onclick = () => { chart.resetZoom(); };
    button.innerText = "Reset Zoom";
    chartCanvas.insertAdjacentElement('afterend', button);
    return chart;
}
