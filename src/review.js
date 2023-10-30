import { RendererCanvas2d } from "./renderer_canvas2d";

const videoOutput = document.getElementById('replay-raw');
const combinedOutput = document.getElementById('replay-combined');
const skeletonOutput = document.getElementById('replay-skeleton');

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
    // per-frame tracked positions
    history: null,
}


export function setReviewVideo(videoBlob, history, reviewStart) {
    RECORDING.history = history;
    RECORDING.videoStart = reviewStart;
    RECORDING.src = videoBlob;
    refresh();
}

export function drawReview() {
    const offsetMs = videoOutput.currentTime * 1000;
    if (lastRenderedOffset === offsetMs) {
        return;
    }
    lastRenderedOffset = offsetMs;
    if (RECORDING.src) {
        const pose = currentPose(offsetMs);
        if (pose) {
            comboRenderer.draw([videoOutput, [pose]]);
            skeletonRenderer.draw([videoOutput, [pose]], renderVideo = false);
        }
    }
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

function currentPose(offsetMs) {
    if (RECORDING.history === null) {
        console.warn("no pose recorded");
        return null;
    }

    const start = RECORDING.videoStart;
    for (let i = 0; i < RECORDING.history.length; i++) {
        if (RECORDING.history[i].timestamp >= start + offsetMs) {
            const keypoints = RECORDING.history[i].keypoints;
            return { keypoints: keypoints, keypoints3D: keypoints };
        }
    }
    console.warn("no pose found");
    return null;
}