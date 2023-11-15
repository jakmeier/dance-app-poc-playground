import * as poseDetection from '@tensorflow-models/pose-detection';
import * as mpPose from '@mediapipe/pose';
import { STATE } from './params'
import { Camera } from './camera'
import { RendererCanvas2d } from './renderer_canvas2d';
import { I, leg_indx } from './util';
import { Tracker } from './dance';
import { displayPositions, displaySteps, drawReview, setReviewVideo } from './review';
import { Move } from './moves';
import { listSongs } from './musiclib';
import { loadSong, playBadStep, playSuccess, stopSong } from './sound';
import { computePositions, detectSteps } from './analyze';

let camera;
let detector;
let renderer;
let danceTracker;
let recordedPositions = [];
let recordedSteps = [];
let done = false;
let reviewStart;
let analyzedUpTo = Infinity;
let metronomeDelay = 3000;
let isVirtualCamera = false;


const selectElement = document.getElementById('step-select');
const songSelect = document.getElementById('song-select');
const inputView = document.getElementById('input-container');
const liveRecording = document.getElementById('live-recording-container');
const halfSpeedInput = document.getElementById('half-speed-input');
export let isMirrored = document.getElementById('is-mirrored').checked;
let showAngles = document.getElementById('show-angles').checked;

document.getElementById('is-mirrored').onchange = () => { isMirrored = document.getElementById('is-mirrored').checked; };
document.getElementById('show-angles').onchange = () => { showAngles = document.getElementById('show-angles').checked; };

async function main() {
    const songs = listSongs();
    for (let i = 0; i < songs.length; i++) {
        const option = document.createElement('option');
        option.value = i + 1;
        option.innerText = songs[i].name;
        songSelect.appendChild(option);
    }

    selectTab('record')
    const model = poseDetection.SupportedModels.BlazePose;
    const runtime = 'mediapipe';
    const config = {
        runtime, modelType: STATE.modelConfig.type, solutionPath:
            `https://cdn.jsdelivr.net/npm/@mediapipe/pose@${mpPose.VERSION}`
    };
    detector = await poseDetection.createDetector(model, config);
}

async function startCameraAndLoop() {
    camera = await Camera.setup(STATE.camera);
    startRenderLoop();
}

async function renderFromVideo(videoUrl) {
    camera = await Camera.setupVirtual(videoUrl, 0);
    startRenderLoop();
}

function startRenderLoop() {
    const canvas = document.getElementById('output');
    canvas.width = video.width;
    canvas.height = video.height;

    document.getElementById("start-camera").classList.add("hidden");
    document.getElementById("camera-canvas-wrapper").classList.remove("hidden");

    renderer = new RendererCanvas2d(document.getElementById('output'));
    renderer.flipSkeleton = true;
    loop();
}

let lastCheck = 0;
async function loop() {
    const now = new Date().getTime();
    const minCheckDelay = 100;
    if (!done && danceTracker) {
        if (danceTracker.isDone()) {
            done = true;
            const video = await camera.stopRecording();
            setReviewVideo(video, danceTracker.freezeForReview(reviewStart + danceTracker.countTime()), reviewStart);
            showInputView();
            // TODO: would be nice to stop camera while reviewing
            // camera.stopCamera();
        } else if (now > analyzedUpTo + 60_000 / danceTracker.soundBpm * 0.9 && now > lastCheck + minCheckDelay) {
            lastCheck = now;
            const { positions, steps } = updatePositionsAndSteps();
            // play a sound if adding something
            if (steps.length > 0) {
                let error = 0;
                positions.forEach((p) => error += p.error);
                let score = error / positions.length;
                // good sound if average is low
                // TODO: the average can be confusing because it's not the same statistic as used to display stars
                if (score < 1) {
                    console.log("good", score);
                    playSuccess();
                } else {
                    console.log("bad", score);
                    playBadStep();
                }
            }
        }
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

function startTracker(move, bpm, beats) {
    done = false;
    const i = Number(songSelect.value);
    const isMetronome = i === 0;
    const counts = isVirtualCamera ? 0 : 4;

    danceTracker = new Tracker(move, bpm, beats, counts);
    danceTracker.onStart =
        () => {
            reviewStart = new Date().getTime();
            analyzedUpTo = reviewStart + danceTracker.countTime();
            if (camera.video.srcObject) {
                camera.startRecording(camera.video.srcObject);
            } else {
                // camera.startRecording(camera.video.captureStream())
                camera.startRecording(document.getElementById('output').captureStream())
            }
        }
    // () => camera.startRecording(canvas.captureStream());

    if (isMetronome) {
        danceTracker.start(metronomeDelay, isVirtualCamera);
    } else {
        const songMeta = listSongs()[i - 1];
        loadSong(songMeta.fullName).then(
            (song) => {
                danceTracker.start(0, song, songMeta, isVirtualCamera);
            }
        );
    }
}

let missedFrames = 0;
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
    ) {
        missedFrames++;
        if ((missedFrames % 5 === 0 && missedFrames <= 10) || missedFrames % 25 === 0 && missedFrames <= 100) {
            console.log(`missed ${missedFrames} frames`);
        }
        return;
    }
    missedFrames = 0;

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
        const bpm = Number(document.getElementById("play-bpm-input").value || "90") || 90;
        const beats = Number(document.getElementById("num-beats-input").value || "16") || 16;
        startTracker(move, bpm, beats);
        showLiveRecording();
    };
document.getElementById('show-results').onclick =
    function () {
        if (!danceTracker) {
            alert("Must record first!");
            return;
        }

        displayPositions(recordedPositions);
        displaySteps(recordedSteps);

        selectTab('review');
        // document.getElementById('action-generate-hits').onclick();
        // hack
        // document.getElementById('generated-buttons').children[0].onclick();
        selectElement.readOnly = false;
    };
document.getElementById('go-to-home').onclick = () => selectTab('record');
document.getElementById('go-to-review').onclick = () => selectTab('review');
document.getElementById('go-to-nerd').onclick = () => selectTab('nerd');

document.getElementById('start-camera').onclick = () => startCameraAndLoop();

document.getElementById('stop-recording').onclick = function () {
    stopSong();
    showInputView();
};

songSelect.onchange = function () {
    const i = Number(songSelect.value);
    if (i === 0) {
        document.getElementById("play-bpm-input").readOnly = false;
    } else {
        const bpmInput = document.getElementById("play-bpm-input");
        bpmInput.value = listSongs()[i - 1].bpm;
        bpmInput.readOnly = true;
    }
};

/** 
 * Attempts to find steps in the tracked information that has not been recorded as steps, yet.
 * The newly found steps and their positions are recorded in `recordedPositions` and `recordedSteps`.
 * Returns the positions and steps that were added in this step.
 */
function updatePositionsAndSteps() {
    const { positions, steps } = evaluateTrackedDance(analyzedUpTo);

    if (steps.length > 0) {
        // We got some positions and some steps, but what if the last step will improve in the next couple frames?
        // Heuristic: if we have a perfect score already, accept it immediately, otherwise wait for some time
        // The downside of waiting is that feedback is delayed, so we should not make it too large.
        const minLookahead = 200;
        const perfectScoreThreshold = 0.4;
        const lastStep = steps[steps.length - 1];
        const stepEnd = lastStep.end;
        const historyEnd = danceTracker.history[danceTracker.history.length - 1].timestamp;
        const lastError = lastStep.errors[lastStep.errors.length - 1];
        if (lastError > perfectScoreThreshold && historyEnd < stepEnd + minLookahead) {
            // reject the last step
            steps.pop();
        }
    }
    if (steps.length > 0) {
        // we have at least one step we want to add
        analyzedUpTo = steps[steps.length - 1].end;
        recordedSteps.push(...steps);
        const stepPositions = positions.filter((pos) => pos.start <= analyzedUpTo);
        recordedPositions.push(...stepPositions);
    }
    return { positions, steps };
}

function evaluateTrackedDance(analysisStart) {
    const freestyle = "4" === selectElement.value;
    const targetBpm = danceTracker.soundBpm;
    // bpm counts full beats, which corresponds to half speed, at full speed
    // we track two moves per beat
    const factor = halfSpeedInput.checked ? 1 : 0.5;
    const dt = factor * 60000 / targetBpm;

    const snapshot = danceTracker.freezeForReview(analysisStart);
    if (snapshot.history.length > 0) {
        const positions = computePositions(snapshot, 0.66 * dt, 1.5 * dt, dt, freestyle);
        const stepsFilter = freestyle ? undefined : danceTracker.move.steps;
        if (positions) {
            const steps = detectSteps(positions, stepsFilter);

            // hack: ad-hock fix the indices in the positions which are relative to
            // frozen review history, while we need it relative to when tracking
            // starts
            const start = reviewStart + danceTracker.countTime();
            const end = analysisStart;
            const historyIndexOffset = danceTracker.history.filter((el) => el.timestamp >= start && el.timestamp <= end).length;
            positions.forEach((pos) => pos.index += historyIndexOffset);

            return { positions, steps };
        }
    }
    return { positions: [], steps: [] };
}

function showLiveRecording() {
    inputView.classList.add('hidden');
    liveRecording.classList.remove('hidden');
}

function showInputView() {
    liveRecording.classList.add('hidden');
    inputView.classList.remove('hidden');
}


document.getElementById('video-upload').onchange = function (event) {
    if (event.target.files && event.target.files[0]) {
        var reader = new FileReader();

        reader.onload = function (e) {
            metronomeDelay = 0;
            isVirtualCamera = true;
            renderFromVideo(e.target.result).then(
                () => document.getElementById('start-recording').onclick()
            )
            selectTab('record');
        }.bind(this)

        reader.readAsDataURL(event.target.files[0]);

    }
}

main()
