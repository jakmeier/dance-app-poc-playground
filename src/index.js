import * as poseDetection from '@tensorflow-models/pose-detection';
import * as mpPose from '@mediapipe/pose';
import { STATE } from './params'
import { Camera } from './camera'
import { RendererCanvas2d } from './renderer_canvas2d';
import { I } from './util';

let camera;
let detector;
let renderer;

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

    const poses = await pose();

    if (poses && poses.length > 0) {
        for (const pose of poses) {
            analyzePose(pose);
        }
        renderSkeletons(poses);
    }

    requestAnimationFrame(loop);
}

function analyzePose(pose) {

    const delta = pose.keypoints[I.LEFT_HIP].x - pose.keypoints[I.RIGHT_HIP].x;
    if (delta < -30) {
        console.log("left");
    } else if (delta > 30) {
        console.log("right");
    } else {
        console.log("center");
    }
}

async function pose() {
    // Detector can be null if initialization failed (for example when loading
    // from a URL that does not exist).
    if (detector != null) {
        // Detectors can throw errors, for example when using custom URLs that
        // contain a model that doesn't provide the expected output.
        try {
            return await detector.estimatePoses(
                camera.video,
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
