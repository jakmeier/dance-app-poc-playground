import { RendererCanvas2d } from "./renderer_canvas2d";
import { Chart } from 'chart.js/auto';
import { leg_indx } from "./util";
import { isMirrored } from "./index";

const ENABLE_COMBO_RENDERER = false;
const ENABLE_SKELETON_RENDERER = true;
const POSITION_IMAGE_WIDTH = 40;
const POSITION_MARKER_WIDTH = 5;

const PERFECT_THRESHOLD = 0.5;
const GOOD_THRESHOLD = 1.0;

let POSITIONS_BANNER_W = Math.min(document.documentElement.clientWidth, 960) - POSITION_IMAGE_WIDTH / 2;

const videoOutput = document.getElementById('replay-raw');
const combinedOutput = document.getElementById('replay-combined');
const skeletonOutput = document.getElementById('replay-skeleton');
const reviewPositions = document.getElementById('review-positions');
const reviewPositionsMarker = document.getElementById('review-positions-marker');

let reviewChart;

combinedOutput.width = 640;
combinedOutput.height = 480;
skeletonOutput.width = 640;
skeletonOutput.height = 480;
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

function recordedTracker() {
    return RECORDING.tracker;
}

export function drawReview() {
    const offsetMs = videoOutput.currentTime * 1000;
    if (lastRenderedOffset === offsetMs) {
        return;
    }
    lastRenderedOffset = offsetMs;
    if (RECORDING.src) {
        const { frame, targetBodyPos } = currentFrameData(offsetMs);
        if (frame) {
            const pose = { keypoints: frame.keypoints, keypoints3D: frame.keypoints };
            if (ENABLE_SKELETON_RENDERER) {
                skeletonRenderer.flipSkeleton = !isMirrored;
                skeletonRenderer.draw([videoOutput, [pose]], renderVideo = false);
                if (targetBodyPos) {
                    skeletonRenderer.drawBodyPos(targetBodyPos, frame.keypoints);
                }
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
                reviewChart.data.datasets[4].data[i] = errorScore.leftFullLeg;
                reviewChart.data.datasets[5].data[i] = errorScore.rightFullLeg;
            }
            reviewChart.update();

            if (isMirrored) {
                document.getElementById('arrow-indicator').innerHTML =
                    frame.bodyPos.facingDirection === 'left' ? '←'
                        : frame.bodyPos.facingDirection === 'right' ? '→'
                            : '↕';
            } else {
                document.getElementById('arrow-indicator').innerHTML =
                    frame.bodyPos.facingDirection === 'right' ? '←'
                        : frame.bodyPos.facingDirection === 'left' ? '→'
                            : '↕';
            }
            document.getElementById('confidence-indicator').innerHTML =
                "confidence: " + confidenceString(frame);

            reviewPositionsMarker.style.left = timestampToBannerX(frame.timestamp, POSITION_MARKER_WIDTH) + 'px';
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
    let frame = null;
    let targetBodyPos = null;
    if (RECORDING.history === null) {
        console.warn("no pose recorded");
        return { frame, targetBodyPos };
    }

    const start = RECORDING.videoStart;
    // the two loops below could be checked if binary search is faster, if I really wanted to optimize like that
    for (let i = 0; i < RECORDING.history.length; i++) {
        if (RECORDING.history[i].timestamp >= start + offsetMs) {
            if (i == 0) {
                frame = RECORDING.history[i];
                break;
            } else {
                const diffBefore = (start + offsetMs) - RECORDING.history[i - 1].timestamp;
                const diffAfter = RECORDING.history[i].timestamp - (start + offsetMs);
                frame = diffBefore < diffAfter ? RECORDING.history[i - 1] : RECORDING.history[i];
                break;
            }
        }
    }
    if (RECORDING.positions) {
        const ps = RECORDING.positions;
        for (let i = 0; i < ps.length; i++) {
            const p = ps[i];
            if (RECORDING.history[p.index].timestamp >= start + offsetMs) {
                if (i == 0) {
                    targetBodyPos = p.position;
                    break;
                } else {
                    const diffBefore = (start + offsetMs) - ps[i - 1].start;
                    const diffAfter = p.timestamp - (start + offsetMs);
                    targetBodyPos = diffBefore < diffAfter ? ps[i - 1].position : p.position;
                    break;
                }

            }
        }
    }
    return { frame, targetBodyPos };
}

function createReviewChart(numPositions) {
    const chartCanvas = document.getElementById('replay-chart');
    // show a stacked bar chart
    // one dataset =^= one body part position error
    // labels on x-axis are positions 0 - (numPositions-1)
    const xLabels = [];
    const data = [];
    for (let i = 0; i < numPositions; i++) {
        xLabels.push(`pos${i}`);
        data.push(1);
    }
    const datasets =
        ["leftThigh", "rightThigh", "leftShin", "rightShin", "leftLeg", "rightLeg"]
            .map(
                (label) => ({ label, data: data.slice() })
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
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                },
                y: {
                    stacked: true,
                    suggestedMax: 25_000,
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

function timestampToBannerX(t, imageSize) {
    return (t - RECORDING.history[0].timestamp)
        / (RECORDING.history[RECORDING.history.length - 1].timestamp - RECORDING.history[0].timestamp)
        * POSITIONS_BANNER_W
        - imageSize / 2;
}

export function displayPositions(positions) {
    POSITIONS_BANNER_W = Math.max(POSITIONS_BANNER_W, positions.length * POSITION_IMAGE_WIDTH * 1.5);
    reviewPositions.innerHTML = '';
    reviewPositions.appendChild(reviewPositionsMarker);
    let prev = 0;
    for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        const img = p.position.img;
        const x = timestampToBannerX(p.start, POSITION_IMAGE_WIDTH);
        const newImg = document.createElement('img');
        newImg.src = img.src;
        newImg.style.left = x + 'px';
        newImg.classList.add('review-position');
        if (isMirrored ? p.position.facingDirection === 'left' : p.position.facingDirection === 'right') {
            newImg.classList.add('flipped');
        }
        if (p.error >= GOOD_THRESHOLD) {
            newImg.classList.add('weak');
        } else if (p.error >= PERFECT_THRESHOLD) {
            newImg.classList.add('ok');
        }
        const frameTime = RECORDING.videoIntroMs + RECORDING.history[p.index].timestamp - RECORDING.history[0].timestamp;
        const delta = prev ? p.start - prev : 0.0;
        prev = p.start;
        newImg.onclick = () => setReviewCursor(i, frameTime, delta, p.error);
        reviewPositions.appendChild(newImg);
    }
    RECORDING.positions = positions;
}

export function displaySteps(steps) {
    const totalStars = annotateStepsWithStars(steps);
    let starString = "";
    for (let i = 0; i < 5; i++) {
        if (i < totalStars) {
            starString += "★";
        } else {
            starString += "☆";
        }
    }
    document.getElementById("stars").innerText = starString;

    for (step of steps) {
        const left = timestampToBannerX(step.start, 0);
        const right = timestampToBannerX(step.end, 0);
        const div = document.createElement('div');
        div.classList.add('review-step');
        div.style.left = left + 'px';
        div.style.width = right - left + 'px';
        div.innerText = step.name;
        // native mouse-over
        div.title = step.name;
        // stars as inner node
        const stars = document.createElement('p');
        stars.classList.add('step-stars');
        stars.innerText = (new Array(step.stars + 1)).join('★');
        div.appendChild(stars);
        reviewPositions.appendChild(div);
    }
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


function computeAndShowAnyMatches(tracker, minDt, maxDt, minDtRepeat, freestyle = true) {
    const positions = computePositions(tracker, minDt, maxDt, minDtRepeat, freestyle);
    console.log("positions", positions);
    if (positions) {
        console.log("directions", positions.map((p) => p.position.facingDirection));

        displayPositions(positions);
        const steps = detectSteps(positions);

        displaySteps(steps);
    }
};

function annotateStepsWithStars(steps) {
    if (!steps || steps.length === 0) {
        return 0;
    }

    let totalStars = 0;
    for (step of steps) {
        let ok = 0;
        let perfect = 0;
        for (e of step.errors) {
            if (e < PERFECT_THRESHOLD) {
                perfect++;
            }
            if (e < GOOD_THRESHOLD) {
                ok++;
            }
        }
        step.stars = 0;
        const M = step.errors.length;
        // 1st star: 50% ok
        if (ok >= M * 0.5) {
            step.stars++;
        }
        // 2nd star: 75% ok
        if (ok >= M * 0.75) {
            step.stars++;
        }
        // 3rd star: 100% ok
        if (ok >= M) {
            step.stars++;
        }
        // 4th star: 50% perfect
        if (ok >= M && perfect >= 0.5 * M) {
            step.stars++;
        }
        // 5th star: 100% perfect
        if (perfect >= M) {
            step.stars++;
        }
        totalStars += step.stars;
    }
    return Math.round(totalStars / steps.length);
}

document.onload = function () {

    document.getElementById('action-generate-any-matches-slow').onclick =
        () => computeAndShowAnyMatches(recordedTracker(), 400, 900, 1000);
    document.getElementById(recordedTracker(), 'action-generate-any-matches-fast').onclick =
        () => computeAndShowAnyMatches(10, 200, 500);
}
