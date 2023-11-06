/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */
import * as params from './params';
import { isMobile } from './util';

export class Camera {
  constructor() {
    this.video = document.getElementById('video');
    this.hiddenCanvas = document.createElement('canvas');
    this.hiddenCanvasContext = this.hiddenCanvas.getContext('2d');
  }

  /**
   * Initiate a Camera instance and wait for the camera stream to be ready.
   * @param cameraParam From app `STATE.camera`.
   */
  static async setup(cameraParam) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'Browser API navigator.mediaDevices.getUserMedia not available');
    }

    const { targetFPS, sizeOption } = cameraParam;
    const $size = params.VIDEO_SIZE[sizeOption];
    const videoConfig = {
      'audio': false,
      'video': {
        facingMode: 'user',
        // Only setting the video to a specified size for large screen, on
        // mobile devices accept the default size.
        width: isMobile() ? params.VIDEO_SIZE['360 X 270'].width : $size.width,
        height: isMobile() ? params.VIDEO_SIZE['360 X 270'].height :
          $size.height,
        frameRate: {
          ideal: targetFPS,
        }
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(videoConfig);

    const camera = new Camera();
    camera.video.srcObject = stream;

    await new Promise((resolve) => {
      camera.video.onloadedmetadata = () => {
        resolve(video);
      };
    });

    camera.video.play();

    const videoWidth = camera.video.videoWidth;
    const videoHeight = camera.video.videoHeight;
    // Must set below two lines, otherwise video element doesn't show.
    camera.video.width = videoWidth;
    camera.video.height = videoHeight;
    camera.hiddenCanvas.width = videoWidth;
    camera.hiddenCanvas.height = videoHeight;

    const canvasContainer = document.querySelector('.canvas-wrapper');
    canvasContainer.style = `width: ${videoWidth}px; height: ${videoHeight}px`;

    return camera;
  }

  captureFrame(isMirrored = true) {
    this.hiddenCanvasContext.save();
    if (isMirrored) {
      this.hiddenCanvasContext.translate(this.hiddenCanvas.width, 0);
      this.hiddenCanvasContext.scale(-1, 1);
    }
    this.hiddenCanvasContext.drawImage(this.video, 0, 0);
    this.hiddenCanvasContext.restore();

    return this.hiddenCanvasContext.getImageData(0, 0, this.video.width, this.video.height);
  }

  // starts recording the camera displayed stream
  startRecording(stream) {
    this.recorder = new MediaRecorder(stream);
    this.recordedBlobs = [];

    this.recorder.ondataavailable = (event) => {
      this.recordedBlobs.push(event.data);
    };
    this.recorder.onerror = onRecorderError();
    this.recorder.start();
  }

  // stops recording and output a blob with the video
  async stopRecording() {
    let stopped = new Promise((resolve, reject) => {
      this.recorder.onstop = resolve;
      this.recorder.onerror = (event) => reject(event.name);
    });
    this.recorder.stop();
    await stopped.catch(onRecorderError);

    return new Blob(this.recordedBlobs, { type: "video/webm" });
  }

  // ends the webcam, will need to setup again to resume
  stopCamera() {
    this.video.srcObject.getTracks().forEach(track => {
      if (track.readyState === 'live') {
        track.stop();
      }
    });
  }
}

function onRecorderError() {
  return (e) => console.log(`recorder error: ${e}`);
}
