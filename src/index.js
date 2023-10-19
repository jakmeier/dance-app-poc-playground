import * as poseDetection from '@tensorflow-models/pose-detection';
import * as mpPose from '@mediapipe/pose';
import { STATE } from './params'
import { Camera } from './camera'
import { RendererCanvas2d } from './renderer_canvas2d';
import { I, angle, leg_indx } from './util';
import { Tracker as DanceTacker } from './dance';

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

    const scoreThreshold = STATE.modelConfig.scoreThreshold || 0;


    const p = pose.keypoints;
    const legs = leg_indx();
    if (
        p[legs.left.hip].score < scoreThreshold
        || p[legs.left.knee] < scoreThreshold
        || p[legs.left.hip] < scoreThreshold
        || p[legs.right.knee] < scoreThreshold
    ) { return }

    const left_leg_angle = angle(p[legs.left.hip], p[legs.left.knee]);
    const right_leg_angle = angle(p[legs.left.hip], p[legs.right.knee]);

    danceTacker.track(left_leg_angle, right_leg_angle);

    // const diff_legs_angle = left_leg_angle - right_leg_angle;

    // console.log({
    //     left_leg_angle,
    //     right_leg_angle,
    //     diff_legs_angle,
    // });
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
