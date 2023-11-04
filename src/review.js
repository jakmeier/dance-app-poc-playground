import { RendererCanvas2d } from "./renderer_canvas2d";
import { Chart } from 'chart.js/auto';
import { leg_indx } from "./util";
import { detectPositions, detectSteps } from "./moves_db";

const ENABLE_COMBO_RENDERER = false;
const ENABLE_SKELETON_RENDERER = true;
const POSITIONS_BANNER_W = 960;

const videoOutput = document.getElementById('replay-raw');
const combinedOutput = document.getElementById('replay-combined');
const skeletonOutput = document.getElementById('replay-skeleton');
const reviewPositionsCanvas = document.getElementById('review-positions-canvas');
const reviewPositionsCanvasCtx = reviewPositionsCanvas.getContext('2d');

let reviewChart;

combinedOutput.width = 640;
combinedOutput.height = 480;
skeletonOutput.width = 640;
skeletonOutput.height = 480;
reviewPositionsCanvas.width = POSITIONS_BANNER_W;
reviewPositionsCanvas.height = 35;
const comboRenderer = new RendererCanvas2d(combinedOutput);
const skeletonRenderer = new RendererCanvas2d(skeletonOutput);

let lastRenderedOffset = 0;

const RECORDING = {
    // URL with raw video
    src: null,
    // when the source video starts, in ms timestamp
    videoStart: null,
    // time in video before measured footage starts
    videoIntroMs: null,
    // per-frame tracked positions
    tracker: null,
    history: null,
    // (estimated) offset between first frame and beat 0
    offset: 0,
}


export function setReviewVideo(videoBlob, tracker, reviewStart) {
    RECORDING.tracker = tracker;
    RECORDING.history = tracker.history;
    RECORDING.videoStart = reviewStart;
    RECORDING.videoIntroMs = tracker.countTime();
    RECORDING.src = videoBlob;
    reviewChart = createReviewChart(tracker.move.onBeat.length);
    refresh();

    const n = RECORDING.history.length;
    const t = RECORDING.history[n - 1].timestamp - RECORDING.videoStart - RECORDING.videoIntroMs;
    console.log(`${n / (t / 1000)} FPS (${n} samples in ${t}ms)`);
}

export function drawReview() {
    const offsetMs = videoOutput.currentTime * 1000;
    if (lastRenderedOffset === offsetMs) {
        return;
    }
    lastRenderedOffset = offsetMs;
    if (RECORDING.src) {
        const frame = currentFrameData(offsetMs);
        if (frame) {
            const pose = { keypoints: frame.keypoints, keypoints3D: frame.keypoints };
            if (ENABLE_SKELETON_RENDERER) {
                skeletonRenderer.draw([videoOutput, [pose]], renderVideo = false);
            } else {
                skeletonOutput.classList.add('hidden');
            }
            if (ENABLE_COMBO_RENDERER) {
                comboRenderer.draw([videoOutput, [pose]]);
            } else {
                combinedOutput.classList.add('hidden');
            }

            for (let i = 0; i < RECORDING.tracker.move.onBeat.length; i++) {
                const errorScore = RECORDING.tracker.move.errorScores(frame.bodyPos, i);
                reviewChart.data.datasets[0].data[i] = errorScore.leftThigh;
                reviewChart.data.datasets[1].data[i] = errorScore.rightThigh;
                reviewChart.data.datasets[2].data[i] = errorScore.leftShin;
                reviewChart.data.datasets[3].data[i] = errorScore.rightShin;
            }
            reviewChart.update();

            document.getElementById('arrow-indicator').innerHTML =
                frame.bodyPos.facingDirection === 'left' ? '←'
                    : frame.bodyPos.facingDirection === 'right' ? '→'
                        : '↕';
            document.getElementById('confidence-indicator').innerHTML =
                "confidence: " + confidenceString(frame);

            reviewPositionsCanvasCtx.clearRect(0, 25, reviewPositionsCanvasCtx.canvas.width, 10);
            reviewPositionsCanvasCtx.fillStyle = "#FFA500";
            reviewPositionsCanvasCtx.fillRect(timestampToBannerX(frame.timestamp), 25, 10, 10);
        }

    }
}

function confidenceString(frame) {
    const LEGS = leg_indx();

    const leftHip = frame.keypoints[LEGS.left.hip].score.toPrecision(2);
    const leftKnee = frame.keypoints[LEGS.left.knee].score.toPrecision(2);
    const leftAnkle = frame.keypoints[LEGS.left.ankle].score.toPrecision(2);
    const rightHip = frame.keypoints[LEGS.right.hip].score.toPrecision(2);
    const rightKnee = frame.keypoints[LEGS.right.knee].score.toPrecision(2);
    const rightAnkle = frame.keypoints[LEGS.right.ankle].score.toPrecision(2);

    return `${leftHip}/${leftKnee}/${leftAnkle} | ${rightHip}/${rightKnee}/${rightAnkle} - (hip/knee/ankle)`;
}

async function refresh() {
    videoOutput.src = URL.createObjectURL(RECORDING.src);

    await new Promise((resolve) => {
        videoOutput.onloadedmetadata = () => {
            resolve();
        };
    });

    const w = videoOutput.videoWidth;
    const h = videoOutput.videoHeight;
    combinedOutput.width = w;
    combinedOutput.height = h;
    skeletonOutput.width = w;
    skeletonOutput.height = h;


}

function currentFrameData(offsetMs) {
    if (RECORDING.history === null) {
        console.warn("no pose recorded");
        return null;
    }

    const start = RECORDING.videoStart;
    for (let i = 0; i < RECORDING.history.length; i++) {
        if (RECORDING.history[i].timestamp >= start + offsetMs) {
            if (i == 0) {
                return RECORDING.history[i];
            } else {
                const diffBefore = (start + offsetMs) - RECORDING.history[i - 1].timestamp;
                const afterBefore = RECORDING.history[i].timestamp - (start + offsetMs);
                return diffBefore < afterBefore ? RECORDING.history[i - 1] : RECORDING.history[i];
            }
        }
    }
    console.warn("no pose found");
    return null;
}

function createReviewChart(numPositions) {
    const chartCanvas = document.getElementById('replay-chart');
    // show a stacked bar chart
    // one dataset =^= one body part position error
    // labels on x-axis are positions 0 - (numPositions-1)
    const xLabels = [];
    for (let i = 0; i < numPositions; i++) {
        xLabels.push(`pos${i}`);
    }
    const datasets =
        ["leftThigh", "rightThigh", "leftShin", "rightShin"]
            .map(
                (label) => ({ label, data: [1, 1, 1, 1] })
            );

    const config = {
        type: 'bar',
        data: {
            labels: xLabels,
            datasets,
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: 'Error of selected frame'
                },
            },
            responsive: true,
            scales: {
                x: {
                    stacked: true,
                },
                y: {
                    stacked: true,
                    suggestedMax: 40_000,
                }
            }
        }
    };

    const chart = new Chart(chartCanvas, config);
    return chart;
}

document.getElementById('action-rhythm').onclick =
    function () {
        const bpms = [...Array(71).keys()].map((i) => 2 * i + 60);
        let best = { score: 99999999 };
        for (let i = 0; i < bpms.length; i++) {
            const bpm = bpms[i];
            const score = RECORDING.tracker.bpmError(bpm);
            console.log(`${bpm} shape score:   ${score.score}       (offset ${score.offset}ms)`);
            if (score.score < best.score) {
                score.bpm = bpm;
                best = score;
            }
        }
        document.getElementById('bpm').innerText = `bpm: ${best.bpm}`;
        document.getElementById('score').innerText = `error: ${best.score}`;
        document.getElementById('offset').innerText = `offset: ${best.offset}ms`;

        document.getElementById('bpm-input').value = `${best.bpm}`;
        document.getElementById('offset-input').value = `${best.offset}`;
        document.getElementById('score-output').innerText = `${best.score}`;

        RECORDING.offset = best.offset;
        RECORDING.bpm = best.bpm;
    };

document.getElementById('action-generate-beats').onclick =
    function () {
        const parent = document.getElementById('generated-buttons');
        parent.innerHTML = '';

        const offset = Number(document.getElementById("offset-input").value) || RECORDING.offset;
        const bpm = Number(document.getElementById("bpm-input").value) || RECORDING.bpm;

        const estimate = RECORDING.tracker.bpmErrorFixedOffset(bpm, offset);
        document.getElementById('score-output').innerText = `${estimate.score}`;

        const dt = 60000 / bpm;
        const start = RECORDING.history[0].timestamp + offset;
        const end = RECORDING.history[RECORDING.history.length - 1].timestamp;
        for (let i = 0; start + i * dt <= end; i++) {
            const button = document.createElement("button");
            const frameTime = RECORDING.videoIntroMs + offset + i * dt;
            button.onclick = () => setReviewCursor(i, frameTime, dt, '');
            button.innerText = `${i + 1}`;
            button.classList.add("beat-button");
            parent.appendChild(button);
        }
    };

document.getElementById('action-generate-hits').onclick =
    function () {
        const parent = document.getElementById('generated-buttons');
        parent.innerHTML = '';

        const estimate = RECORDING.tracker.computeBestFits();
        const averageDelta = estimate.deltas.reduce((a, b) => a + b) / estimate.deltas.length;
        console.log(`average ${averageDelta.toPrecision(4)}ms =^= ${Math.round(60_000 / averageDelta)} bpm`);

        for (let i = 0; i < estimate.numMoves; i++) {
            const button = document.createElement("button");
            const frameTime = RECORDING.videoIntroMs + estimate.frames[i].timestamp - RECORDING.history[0].timestamp;
            const delta = i == 0 ? 0.0 : estimate.deltas[i - 1];
            button.onclick = () => setReviewCursor(i, frameTime, delta, estimate.errors[i]);
            button.innerText = `${i + 1}`;
            button.classList.add("fit-button");
            parent.appendChild(button);
        }
    };

document.getElementById('action-generate-any-matches-slow').onclick =
    () => computeAndShowAnyMatches(400, 900, 1000);
document.getElementById('action-generate-any-matches-fast').onclick =
    () => computeAndShowAnyMatches(10, 200, 500);

export function computeAndShowAnyMatches(minDt, maxDt, minDtRepeat) {
    const positions = detectPositions(RECORDING.history, minDt, maxDt);
    console.log("positions", positions);

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

    stepAnalysis(positions);
};

function timestampToBannerX(t) {
    return (t - RECORDING.history[0].timestamp)
        / (RECORDING.history[RECORDING.history.length - 1].timestamp - RECORDING.history[0].timestamp)
        * POSITIONS_BANNER_W;
}

function stepAnalysis(positions) {
    console.log("Positions", positions);
    reviewPositionsCanvasCtx.clearRect(0, 0, reviewPositionsCanvasCtx.canvas.width, 25);
    for (p of positions) {
        const img = p.position.img;
        const x = timestampToBannerX(p.start);
        console.log("direction is", p.position.bodyPos.facingDirection);
        if (p.position.bodyPos.facingDirection === 'left') {
            reviewPositionsCanvasCtx.translate(x + 15, 0);
            reviewPositionsCanvasCtx.scale(-1, 1);
            reviewPositionsCanvasCtx.drawImage(img, 0, 0, 15, 25);
            reviewPositionsCanvasCtx.setTransform(1, 0, 0, 1, 0, 0);
        } else {
            reviewPositionsCanvasCtx.drawImage(img, x, 0, 15, 25);
        }
    }
    const steps = detectSteps(positions);
    console.log("Steps", steps);
}

export function setReviewCursor(beat, ms, delta, error) {
    document.getElementById('delta-indicator').innerHTML = `${delta.toPrecision(4)}ms`;
    document.getElementById('error-indicator').innerHTML = `error score: ${error}`;
    videoOutput.currentTime = ms / 1000;
    const numColumns = reviewChart.data.datasets[0].data.length;
    const numSeries = reviewChart.data.datasets.length;
    const highlighted = beat % numColumns;
    const borderWidth = [...Array(numColumns).keys()].map((i) => i === highlighted ? 4 : 0);
    for (let i = 0; i < numSeries; i++) {
        reviewChart.data.datasets[i].borderWidth = borderWidth;
    }
}
