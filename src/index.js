import * as poseDetection from '@tensorflow-models/pose-detection';
import * as mpPose from '@mediapipe/pose';
import { STATE } from './params'
import { Camera } from './camera'
import { RendererCanvas2d } from './renderer_canvas2d';
import { I, leg_indx } from './util';
import { Tracker as DanceTacker } from './dance';
import { BodyPosition } from './moves';

let camera;
let detector;
let renderer;
let danceTacker = new DanceTacker();

async function main() {
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

    loop();
}

async function loop() {
    if (camera.video.readyState < 2) {
        await new Promise((resolve) => {
            camera.video.onloadeddata = () => {
                resolve(video);
            };
        });
    }

    // start next frame already, don't wait for calculations
    requestAnimationFrame(loop);

    const frameTimestamp = new Date().getTime();
    // fix frame to allow async computations (or even put it in a web worker thread)
    const image = camera.captureFrame();

    // blocks animation frame
    // const poses = await pose(image);
    // if (poses && poses.length > 0) {
    //     for (const pose of poses) {
    //         analyzePose(pose, frameTimestamp);
    //     }
    //     renderSkeletons(poses);
    // }

    // releases animation frame
    pose(image).then(
        (poses) => {
            if (poses && poses.length > 0) {
                for (const pose of poses) {
                    analyzePose(pose, frameTimestamp);
                }
                renderSkeletons(poses);
            }
        }
    );
}

function analyzePose(pose, timestamp) {

    const scoreThreshold = STATE.modelConfig.scoreThreshold || 0;


    const p = pose.keypoints;
    const legs = leg_indx();
    if (
        p[legs.left.hip].score < scoreThreshold
        || p[legs.left.knee].score < scoreThreshold
        || p[legs.left.hip].score < scoreThreshold
        || p[legs.right.knee].score < scoreThreshold
        || p[legs.left.ankle].score < scoreThreshold
        || p[legs.right.ankle].score < scoreThreshold
    ) { return }

    danceTacker.track(pose.keypoints, timestamp);
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
                { maxPoses: STATE.modelConfig.maxPoses, flipHorizontal: false });

        } catch (error) {
            detector.dispose();
            detector = null;
            alert(error);
        }
    }
    return null;
}

function renderSkeletons(poses) {
    const rendererParams = [camera.video, poses, STATE.isModelChanged];
    renderer.draw(rendererParams);
    // console.log(poses);
}

main()
