/**
 * @license
 * Copyright 2023 Google LLC.
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
import * as posedetection from '@tensorflow-models/pose-detection';
import * as scatter from 'scatter-gl';

import * as params from './params';
import { polarAngle, getKeypointIndexBySide, leg_indx, distance2d } from './util';
import { BodyPosition } from './moves';

// These anchor points allow the pose pointcloud to resize according to its
// position in the input.
const ANCHOR_POINTS = [[0, 0, 0], [0, 1, 0], [-1, 0, 0], [-1, -1, 0]];
const I = leg_indx();

// #ffffff - White
// #800000 - Maroon
// #469990 - Malachite
// #e6194b - Crimson
// #42d4f4 - Picton Blue
// #fabed4 - Cupid
// #aaffc3 - Mint Green
// #9a6324 - Kumera
// #000075 - Navy Blue
// #f58231 - Jaffa
// #4363d8 - Royal Blue
// #ffd8b1 - Caramel
// #dcbeff - Mauve
// #808000 - Olive
// #ffe119 - Candlelight
// #911eb4 - Seance
// #bfef45 - Inchworm
// #f032e6 - Razzle Dazzle Rose
// #3cb44b - Chateau Green
// #a9a9a9 - Silver Chalice
const COLOR_PALETTE = [
  '#ffffff', '#800000', '#469990', '#e6194b', '#42d4f4', '#fabed4', '#aaffc3',
  '#9a6324', '#000075', '#f58231', '#4363d8', '#ffd8b1', '#dcbeff', '#808000',
  '#ffe119', '#911eb4', '#bfef45', '#f032e6', '#3cb44b', '#a9a9a9'
];
export class RendererCanvas2d {
  constructor(canvas) {
    this.ctx = canvas.getContext('2d');
    this.videoWidth = canvas.width;
    this.videoHeight = canvas.height;
    this.flipSkeleton = false;
    this.showAngles = false;
  }

  flip() {
    // Because the image from camera is mirrored, need to flip horizontally.
    this.ctx.translate(this.videoWidth, 0);
    this.ctx.scale(-1, 1);
  }

  draw(rendererParams, renderVideo = true, renderSkeleton = true) {
    this.ctx.save();
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.videoWidth, this.videoHeight);
    this.ctx.restore();

    const [video, poses, isModelChanged] = rendererParams;
    if (renderVideo) {
      this.drawCtx(video);
    }

    if (renderSkeleton) {
      // The null check makes sure the UI is not in the middle of changing to a
      // different model. If during model change, the result is from an old model,
      // which shouldn't be rendered.
      if (poses && poses.length > 0 && !isModelChanged) {
        this.drawResults(poses);
      }
    }
  }

  drawCtx(video) {
    if (video instanceof ImageData) {
      this.ctx.putImageData(video, 0, 0);
    } else {
      this.ctx.drawImage(video, 0, 0, this.videoWidth, this.videoHeight);
    }
  }

  clearCtx() {
    this.ctx.clearRect(0, 0, this.videoWidth, this.videoHeight);
  }

  /**
   * Draw the keypoints and skeleton on the video.
   * @param poses A list of poses to render.
   */
  drawResults(poses) {
    this.ctx.save();
    if (this.flipSkeleton) {
      this.flip();
    }
    for (const pose of poses) {
      this.drawResult(pose);
    }
    this.ctx.restore();
  }

  /**
   * Draw the keypoints and skeleton on the video.
   * @param pose A pose with keypoints to render.
   */
  drawResult(pose) {
    if (pose.keypoints != null) {
      this.drawKeypoints(pose.keypoints);
      this.drawSkeleton(pose.keypoints, pose.id, pose.keypoints3D);
    }
  }

  /**
   * Draw the keypoints on the video.
   * @param keypoints A list of keypoints.
   */
  drawKeypoints(keypoints) {
    const keypointInd =
      getKeypointIndexBySide();
    this.ctx.fillStyle = 'Red';
    this.ctx.strokeStyle = 'White';
    this.ctx.lineWidth = params.DEFAULT_LINE_WIDTH;

    for (const i of keypointInd.middle) {
      this.drawKeypoint(keypoints[i]);
    }

    this.ctx.fillStyle = 'Green';
    for (const i of keypointInd.left) {
      this.drawKeypoint(keypoints[i]);
    }

    this.ctx.fillStyle = 'Orange';
    for (const i of keypointInd.right) {
      this.drawKeypoint(keypoints[i]);
    }
  }

  drawKeypoint(keypoint) {
    // If score is null, just show the keypoint.
    const score = keypoint.score != null ? keypoint.score : 1;
    const scoreThreshold = params.STATE.modelConfig.scoreThreshold || 0;

    if (score >= scoreThreshold) {
      const circle = new Path2D();
      circle.arc(keypoint.x, keypoint.y, params.DEFAULT_RADIUS, 0, 2 * Math.PI);
      this.ctx.fill(circle);
      if (score < params.STATE.modelConfig.colorThreshold) {
        this.ctx.strokeStyle = "red";
      } else {
        this.ctx.strokeStyle = "White";
      }
      this.ctx.stroke(circle);
    }
  }

  /**
   * Draw the skeleton of a body on the video.
   * @param keypoints A list of keypoints.
   */
  drawSkeleton(keypoints, poseId, keypoints3D) {
    // Each poseId is mapped to a color in the color palette.
    const color = params.STATE.modelConfig.enableTracking && poseId != null ?
      COLOR_PALETTE[poseId % 20] :
      'White';
    this.ctx.fillStyle = color;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = params.DEFAULT_LINE_WIDTH;

    posedetection.util.getAdjacentPairs(params.STATE.model).forEach(([
      i, j
    ]) => {
      const kp1 = keypoints[i];
      const kp2 = keypoints[j];

      // If score is null, just show the keypoint.
      const score1 = kp1.score != null ? kp1.score : 1;
      const score2 = kp2.score != null ? kp2.score : 1;
      const scoreThreshold = params.STATE.modelConfig.scoreThreshold || 0;

      if (score1 >= scoreThreshold && score2 >= scoreThreshold) {
        this.drawLine(kp1, kp2);

        if (this.showAngles) {
          const alpha = Math.round(polarAngle(keypoints3D[i], keypoints3D[j]));
          this.ctx.font = "20px serif";
          this.ctx.fillText(`${alpha}`, (kp1.x + kp2.x) / 2, (kp1.y + kp2.y) / 2);
        }
      }
    });
  }

  /**
   * Draw a skelton from given bodyPos instead of from keypoints, the keypoints
   * argument is used to find hips and figure out the body part lengths
   **/
  drawBodyPos(bodyPos, helperKeypoints) {
    this.ctx.save();
    if (this.flipSkeleton) {
      this.flip();
    }
    const leftHip = helperKeypoints[I.left.hip];
    const rightHip = helperKeypoints[I.right.hip];
    const leftThighLength = distance2d(leftHip, helperKeypoints[I.left.knee]);
    const leftShinLength = distance2d(helperKeypoints[I.left.knee], helperKeypoints[I.left.ankle]);
    const rightThighLength = distance2d(rightHip, helperKeypoints[I.right.knee]);
    const rightShinLength = distance2d(helperKeypoints[I.right.knee], helperKeypoints[I.right.ankle]);
    let { directionCorrection, facingDirection } = BodyPosition.keypointsToDirection(helperKeypoints);
    const { left, right } = bodyPos.toKeypoints(leftHip, rightHip, leftThighLength, leftShinLength, rightThighLength, rightShinLength, directionCorrection);

    this.ctx.strokeStyle = "Green";
    this.ctx.lineWidth = params.DEFAULT_LINE_WIDTH;

    this.drawLine(left.hip, left.knee);
    this.drawLine(left.knee, left.ankle);
    this.drawLine(right.hip, right.knee);
    this.drawLine(right.knee, right.ankle);

    this.ctx.restore();
  }

  drawLine(a, b) {
    this.ctx.beginPath();
    this.ctx.moveTo(a.x, a.y);
    this.ctx.lineTo(b.x, b.y);
    this.ctx.stroke();
  }
}
