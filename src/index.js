import * as poseDetection from '@tensorflow-models/pose-detection';
import * as mpPose from '@mediapipe/pose';
import { STATE } from './params'
import { Camera } from './camera'
import { RendererCanvas2d } from './renderer_canvas2d';
import { I, leg_indx } from './util';
import { Tracker } from './dance';
import { computeAndShowAnyMatches, drawReview, setReviewCursor, setReviewMove, setReviewVideo } from './review';
import { Move } from './moves';

let camera;
let detector;
let renderer;
let danceTracker;
let done = false;
let reviewStart;

const selectElement = document.getElementById('step-select');
const halfSpeedInput = document.getElementById('half-speed-input');
export let isMirrored = document.getElementById('is-mirrored').checked;
let showAngles = document.getElementById('show-angles').checked;

document.getElementById('is-mirrored').onchange = () => { isMirrored = document.getElementById('is-mirrored').checked; };
document.getElementById('show-angles').onchange = () => { showAngles = document.getElementById('show-angles').checked; };

async function main() {
    selectTab('record')
    const model = poseDetection.SupportedModels.BlazePose;
    const runtime = 'mediapipe';
    const config = {
        runtime, modelType: STATE.modelConfig.type, solutionPath:
            `https://cdn.jsdelivr.net/npm/@mediapipe/pose@${mpPose.VERSION}`
    };
    detector = await poseDetection.createDetector(model, config);


    camera = await Camera.setup(STATE.camera);
    const canvas = document.getElementById('output');
    canvas.width = camera.video.width;
    canvas.height = camera.video.height;
    renderer = new RendererCanvas2d(canvas);
    renderer.flipSkeleton = true;

    loop();
}

async function loop() {
    if (!done && danceTracker && danceTracker.isDone()) {
        done = true;
        const video = await camera.stopRecording();
        setReviewVideo(video, danceTracker.freezeForReview(reviewStart), reviewStart);
        // TODO: would be nice to stop camera while reviewing
        // camera.stopCamera();
    }

    if (camera.video.readyState < 2) {
        await new Promise((resolve) => {
            camera.video.onloadeddata = () => {
                resolve(video);
            };
        });
    }

    // draw the review video, but only once the recording is done, not to slow down the FPS
    if (done) {
        drawReview();
    }

    // start next frame already, don't wait for calculations
    requestAnimationFrame(loop);

    const frameTimestamp = new Date().getTime();
    // fix frame to allow async computations (or even put it in a web worker thread)
    const image = camera.captureFrame(isMirrored);

    // releases animation frame
    pose(image).then(
        (poses) => {
            if (poses && poses.length > 1) {
                console.warn("more than 1 person detected");
            }
            if (poses && poses.length > 0) {
                for (const pose of poses) {
                    analyzePose(pose, frameTimestamp);
                }
                renderSkeletons(poses, image);
            }
        }
    );
}

function selectTab(id) {
    const sections = document.querySelectorAll('section');
    for (let i = 0; i < sections.length; i++) {
        sections[i].classList.add('hidden');
    }
    document.getElementById(`${id}-section`).classList.remove('hidden');
}

function startTracker(move) {
    const bpm = Number(document.getElementById("play-bpm-input").value || "90") || 90;
    danceTracker = new Tracker(move, bpm);
    danceTracker.onStart =
        () => {
            reviewStart = new Date().getTime();
            camera.startRecording(camera.video.srcObject);
        }
    // () => camera.startRecording(canvas.captureStream());
    danceTracker.start(3000);
}

function analyzePose(pose, timestamp) {

    const scoreThreshold = STATE.modelConfig.scoreThreshold || 0;

    const p = pose.keypoints3D;
    const legs = leg_indx();
    if (
        p[legs.left.hip].score < scoreThreshold
        || p[legs.left.knee].score < scoreThreshold
        || p[legs.left.hip].score < scoreThreshold
        || p[legs.right.knee].score < scoreThreshold
        || p[legs.left.ankle].score < scoreThreshold
        || p[legs.right.ankle].score < scoreThreshold
    ) { return }

    if (danceTracker) {
        danceTracker.track(pose.keypoints, pose.keypoints3D, timestamp);
    }
}

async function pose(image) {
    // Detector can be null if initialization failed (for example when loading
    // from a URL that does not exist).
    if (detector != null) {
        // Detectors can throw errors, for example when using custom URLs that
        // contain a model that doesn't provide the expected output.
        try {
            return await detector.estimatePoses(
                image,
                { maxPoses: STATE.modelConfig.maxPoses, flipHorizontal: true });

        } catch (error) {
            detector.dispose();
            detector = null;
            alert(error);
        }
    }
    return null;
}

function renderSkeletons(poses, image) {
    const rendererParams = [image, poses, STATE.isModelChanged];
    renderer.showAngles = showAngles;
    renderer.draw(rendererParams);
}


document.getElementById('start-recording').onclick =
    function () {
        if (danceTracker && !danceTracker.isDone()) {
            console.log("already in progress");
            return;
        }
        let move;
        switch (selectElement.value) {
            case "0":
                move = Move.RunningMan();
                break;
            case "1":
                move = Move.DoubleRunningMan();
                break;
            case "2":
                move = Move.ReverseRunningMan();
                break;
            case "3":
                move = Move.DoubleTurnRunningMan();
                break;
            case "4":
                // doesn't really matter which move we track, it's ignored in results
                move = Move.RunningMan();
                break;
            default:
                alert("invalid selection");
                return;
        }
        selectElement.readOnly = true;
        startTracker(move);
    };
document.getElementById('show-results').onclick =
    function () {
        if (!danceTracker) {
            alert("Must record first!");
            return;
        }
        const freestyle = "4" === selectElement.value;
        const targetBpm = danceTracker.soundBpm;
        // bpm counts full beats, which corresponds to half speed, at full speed
        // we track two moves per beat
        const factor = halfSpeedInput.checked ? 1 : 0.5;
        const dt = factor * 60_000 / targetBpm;
        computeAndShowAnyMatches(0.75 * dt, 1.25 * dt, dt, freestyle);
        selectTab('review');
        // document.getElementById('action-generate-hits').onclick();
        // hack
        // document.getElementById('generated-buttons').children[0].onclick();
        selectElement.readOnly = false;
    };
document.getElementById('go-to-home').onclick = () => selectTab('record');
document.getElementById('go-to-review').onclick = () => selectTab('review');
document.getElementById('go-to-nerd').onclick = () => selectTab('nerd');


main()
