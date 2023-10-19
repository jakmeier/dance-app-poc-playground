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
import * as tf from '@tensorflow/tfjs-core';
import { showBackendConfigs } from './option_panel';
import { STATE, TUNABLE_FLAG_VALUE_RANGE_MAP } from './params';

export function isiOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

export function isMobile() {
  return isAndroid() || isiOS();
}

// Without face
// https://github.com/tensorflow/tfjs-models/tree/master/pose-detection
export function getKeypointIndexBySide() {
  return {
    left: [11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31],
    right: [12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32],
    middle: [0],
  };
}

// hip, knee, ankle, heel, toe
export function leg_indx() {
  return {
    left: {
      hip: 23,
      knee: 25,
      ankle: 27,
      heel: 29,
      toe: 31
    },
    right: {
      hip: 24,
      knee: 26,
      ankle: 28,
      heel: 30,
      toe: 32
    }
  };
}

export function angle(p0, p1) {
  var dy = p1.y - p0.y;
  var dx = p1.x - p0.x;
  var theta = Math.atan2(dy, dx); // (-PI, PI]
  theta *= 180 / Math.PI; // (-180, 180]
  if (theta < 0) {
    theta += 360; // [0, 360)
  }
  return theta;
}

/**
 * Reset the target backend.
 *
 * @param backendName The name of the backend to be reset.
 */
async function resetBackend(backendName) {
  const ENGINE = tf.engine();
  if (!(backendName in ENGINE.registryFactory)) {
    if (backendName === 'webgpu') {
      alert('webgpu backend is not registered. Your browser may not support WebGPU yet. To test this backend, please use a supported browser, e.g. Chrome canary with --enable-unsafe-webgpu flag');
      STATE.backend = !!STATE.lastTFJSBackend ? STATE.lastTFJSBackend : 'tfjs-webgl';
      showBackendConfigs();
      return;
    } else {
      throw new Error(`${backendName} backend is not registered.`);
    }
  }

  if (backendName in ENGINE.registry) {
    const backendFactory = tf.findBackendFactory(backendName);
    tf.removeBackend(backendName);
    tf.registerBackend(backendName, backendFactory);
  }

  await tf.setBackend(backendName);
  STATE.lastTFJSBackend = `tfjs-${backendName}`;
}

/**
 * Set environment flags.
 *
 * This is a wrapper function of `tf.env().setFlags()` to constrain users to
 * only set tunable flags (the keys of `TUNABLE_FLAG_TYPE_MAP`).
 *
 * ```js
 * const flagConfig = {
 *        WEBGL_PACK: false,
 *      };
 * await setEnvFlags(flagConfig);
 *
 * console.log(tf.env().getBool('WEBGL_PACK')); // false
 * console.log(tf.env().getBool('WEBGL_PACK_BINARY_OPERATIONS')); // false
 * ```
 *
 * @param flagConfig An object to store flag-value pairs.
 */
export async function setBackendAndEnvFlags(flagConfig, backend) {
  if (flagConfig == null) {
    return;
  } else if (typeof flagConfig !== 'object') {
    throw new Error(
      `An object is expected, while a(n) ${typeof flagConfig} is found.`);
  }

  // Check the validation of flags and values.
  for (const flag in flagConfig) {
    // TODO: check whether flag can be set as flagConfig[flag].
    if (!(flag in TUNABLE_FLAG_VALUE_RANGE_MAP)) {
      throw new Error(`${flag} is not a tunable or valid environment flag.`);
    }
    if (TUNABLE_FLAG_VALUE_RANGE_MAP[flag].indexOf(flagConfig[flag]) === -1) {
      throw new Error(
        `${flag} value is expected to be in the range [${TUNABLE_FLAG_VALUE_RANGE_MAP[flag]}], while ${flagConfig[flag]}` +
        ' is found.');
    }
  }

  tf.env().setFlags(flagConfig);

  const [runtime, $backend] = backend.split('-');

  if (runtime === 'tfjs') {
    await resetBackend($backend);
  }
}

export const I = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
  BODYCENTER: 33,
  FOREHEAD: 34,
  LEFTTHUMB: 35,
  LEFTHAND: 36,
  RIGHTTHUMB: 37,
  RIGHTHAND: 38,
};